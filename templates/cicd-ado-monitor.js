#!/usr/bin/env node
/**
 * ADO Build Monitor — 工作区 CI/CD 监控脚本模板(跨平台,零依赖,node 内置模块)
 * 用途:查询 / 取消 / 等待 ADO Self-hosted Server build,供 Claude 自主操作 + 手动用
 *
 * 来源:engineering-standards/templates/cicd-ado-monitor.js(ADR-022 / ADR-029 bootstrap)
 * 用法(先 cd 到工作区根目录):
 *   node docs/ops/cicd-ado-monitor.js status <repo> [--top N] [--state all|inProgress|completed|notStarted]
 *   node docs/ops/cicd-ado-monitor.js logs <repo> <buildId> [--failed]
 *   node docs/ops/cicd-ado-monitor.js cancel-old <repo>
 *   node docs/ops/cicd-ado-monitor.js wait <repo> <buildId> [--timeout 1800]
 *
 * Repo 名:工作区各 nested 仓名,按 ADO 项目实际填。
 * 配置:ADO_BASE / PAT 文件可按 org 与工作区调整(下方常量,支持环境变量覆盖)。
 * 凭据:PAT 文件默认 ~/.claude/ado-pat(单行 token,无引号);同 org 多工作区通常共用一份。
 * 关联 ADR:ADR-022(CI/CD Monitor & Feedback)、ADR-029(工作区 bootstrap)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 同 org ADO 通常一致;不同 org 改这里或用 ADO_BASE 环境变量覆盖
const ADO_BASE = process.env.ADO_BASE || 'http://172.21.10.30:8090/JYDevOps/JYPrdCollection';
// PAT 文件:默认全局 ~/.claude/ado-pat;可用 ADO_PAT_FILE 环境变量覆盖为工作区专属
const PAT_FILE = process.env.ADO_PAT_FILE || path.join(os.homedir(), '.claude', 'ado-pat');
const POLL_SEC = 15;        // wait(已知 buildId)轮询间隔
const WATCH_POLL_SEC = 30;  // watch(盯最新 build)轮询间隔

// 读 PAT 文件生成 Basic 认证头
function authHeader() {
  if (!fs.existsSync(PAT_FILE)) {
    throw new Error(`ADO PAT 未找到:${PAT_FILE} — 见 docs/ops/cicd-agent-vm-setup.md`);
  }
  const pat = fs.readFileSync(PAT_FILE, 'utf8').trim();
  const token = Buffer.from(':' + pat).toString('base64');
  return 'Basic ' + token;
}

// 发 HTTP 请求,返回解析后的 JSON
function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(data || '{}')); }
        catch (e) { reject(new Error('响应非 JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const apiGet = (url) => request('GET', url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 打印 build 列表(含耗时)
function printBuilds(builds) {
  if (!builds.length) { console.log('(无 build)'); return; }
  for (const b of builds) {
    const dur = b.finishTime && b.startTime
      ? Math.round((new Date(b.finishTime) - new Date(b.startTime)) / 1000) + 's'
      : '-';
    console.log(`#${b.id}  ${b.buildNumber}  status=${b.status}  result=${b.result || '-'}  dur=${dur}  queued=${b.queueTime || '-'}`);
  }
}

// 查 build 状态
async function cmdStatus(repo, opts) {
  const top = opts.top || 5;
  const state = opts.state || 'all';
  const statusFilter = state === 'all' ? 'inProgress,completed,notStarted,cancelling' : state;
  const url = `${ADO_BASE}/${repo}/_apis/build/builds?$top=${top}&statusFilter=${statusFilter}&queryOrder=queueTimeDescending&api-version=7.0`;
  printBuilds((await apiGet(url)).value || []);
}

// 查 build 失败 task 日志链接
async function cmdLogs(repo, buildId, opts) {
  const url = `${ADO_BASE}/${repo}/_apis/build/builds/${buildId}/timeline?api-version=7.0`;
  let recs = ((await apiGet(url)).records || []).filter((r) => r.type === 'Task');
  if (opts.failed) recs = recs.filter((r) => r.result === 'failed');
  if (!recs.length) { console.log('(无匹配 task 记录)'); return; }
  for (const r of recs) {
    console.log(`[${r.result || '-'}] ${r.name}`);
    if (r.log && r.log.url) console.log(`  logUrl: ${r.log.url}`);
  }
}

// 留最新一个 inProgress/notStarted,cancel 其余冗余 build
async function cmdCancelOld(repo) {
  const url = `${ADO_BASE}/${repo}/_apis/build/builds?statusFilter=inProgress,notStarted&queryOrder=queueTimeDescending&api-version=7.0`;
  const queue = (await apiGet(url)).value || [];
  if (queue.length <= 1) { console.log(`队列 ${queue.length} 个 — 无需 cancel`); return; }
  const keep = queue[0];
  console.log(`保留最新:#${keep.id} (${keep.buildNumber})`);
  for (const b of queue.slice(1)) {
    const r = await request('PATCH', `${ADO_BASE}/${repo}/_apis/build/builds/${b.id}?api-version=7.0`, { status: 'cancelling' });
    console.log(`已取消:#${b.id} (${b.buildNumber}) → ${r.status}`);
  }
}

// 轮询等待 build 跑完;succeeded → exit 0,否则 exit 1
async function cmdWait(repo, buildId, opts) {
  const timeout = opts.timeout || 1800;
  const start = Date.now();
  while (true) {
    const b = await apiGet(`${ADO_BASE}/${repo}/_apis/build/builds/${buildId}?api-version=7.0`);
    const el = Math.round((Date.now() - start) / 1000);
    console.log(`[${el}s] #${b.id} status=${b.status} result=${b.result || '-'}`);
    if (b.status === 'completed') {
      process.exitCode = b.result === 'succeeded' ? 0 : 1;
      return;
    }
    if (el > timeout) throw new Error(`等待超时 ${timeout}s — build ${buildId} 仍 ${b.status}`);
    await sleep(POLL_SEC * 1000);
  }
}

// 轮询最新一个 build 直到跑完(双推后用,无需预知 buildId);succeeded → exit 0,否则 exit 1
async function cmdWatch(repo, opts) {
  const timeout = opts.timeout || 1800;
  const start = Date.now();
  while (true) {
    const url = `${ADO_BASE}/${repo}/_apis/build/builds?$top=1&queryOrder=queueTimeDescending&api-version=7.0`;
    const builds = (await apiGet(url)).value || [];
    const el = Math.round((Date.now() - start) / 1000);
    if (!builds.length) {
      console.log(`[${el}s] (暂无 build)`);
    } else {
      const b = builds[0];
      console.log(`[${el}s] #${b.id} ${b.buildNumber} status=${b.status} result=${b.result || '-'}`);
      if (b.status === 'completed') {
        console.log(`FINAL: ${b.result}`);
        process.exitCode = b.result === 'succeeded' ? 0 : 1;
        return;
      }
    }
    if (el > timeout) throw new Error(`监控超时 ${timeout}s`);
    await sleep(WATCH_POLL_SEC * 1000);
  }
}

// 解析 flag(--top / --state / --failed / --timeout)与位置参数
function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--failed') opts.failed = true;
    else if (a === '--top') opts.top = parseInt(args[++i], 10);
    else if (a === '--state') opts.state = args[++i];
    else if (a === '--timeout') opts.timeout = parseInt(args[++i], 10);
    else positional.push(a);
  }
  return { opts, positional };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { opts, positional } = parseArgs(rest);
  switch (cmd) {
    case 'status':
      if (!positional[0]) throw new Error('用法: status <repo> [--top N] [--state ...]');
      return cmdStatus(positional[0], opts);
    case 'logs':
      if (!positional[1]) throw new Error('用法: logs <repo> <buildId> [--failed]');
      return cmdLogs(positional[0], positional[1], opts);
    case 'cancel-old':
      if (!positional[0]) throw new Error('用法: cancel-old <repo>');
      return cmdCancelOld(positional[0]);
    case 'wait':
      if (!positional[1]) throw new Error('用法: wait <repo> <buildId> [--timeout N]');
      return cmdWait(positional[0], positional[1], opts);
    case 'watch':
      if (!positional[0]) throw new Error('用法: watch <repo> [--timeout N]');
      return cmdWatch(positional[0], opts);
    default:
      console.log('SYSV2 ADO Build Monitor (Node.js)');
      console.log('子命令: status | logs | cancel-old | wait | watch');
      console.log('详见 docs/ops/cicd-ado-monitor.md');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('错误: ' + e.message);
  process.exitCode = 1;
});
