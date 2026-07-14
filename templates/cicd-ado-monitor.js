#!/usr/bin/env node
/**
 * ADO Build Monitor — 工作区 CI/CD 监控脚本模板(跨平台,零依赖,node 内置模块)
 * 用途:查询 / 取消 / 等待 ADO Self-hosted Server build,供 Claude 自主操作 + 手动用
 *
 * 来源:engineering-standards/templates/cicd-ado-monitor.js(ADR-022 / ADR-029 bootstrap)
 * 用法(先 cd 到工作区根目录):
 *   node docs/ops/cicd-ado-monitor.js status <repo> [--top N] [--state all|inProgress|completed|notStarted]
 *   node docs/ops/cicd-ado-monitor.js logs <repo> <buildId> [--failed] [--content]
 *   node docs/ops/cicd-ado-monitor.js cancel-old <repo>
 *   node docs/ops/cicd-ado-monitor.js wait <repo> <buildId> [--timeout 1800]
 *   node docs/ops/cicd-ado-monitor.js watch <repo> [--timeout 1800]
 *   node docs/ops/cicd-ado-monitor.js background <repo> --build-id <id> [--branch <branch>] [--timeout 1800] [--log-dir docs/ops/ci-watch]
 *
 * Repo 名:工作区各 nested 仓名,按 ADO 项目实际填。
 * 配置:ADO_BASE / PAT 文件可按 org 与工作区调整(下方常量,支持环境变量覆盖)。
 * 凭据:PAT 文件默认 ~/.claude/ado-pat(单行 token,无引号);同 org 多工作区通常共用一份。
 * 关联 ADR:ADR-022(CI/CD Monitor & Feedback)、ADR-029(工作区 bootstrap)
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// 同 org ADO 通常一致;不同 org 改这里或用 ADO_BASE 环境变量覆盖
const ADO_BASE = process.env.ADO_BASE || 'http://172.21.10.30:8090/JYDevOps/JYPrdCollection';
// PAT 文件:默认全局 ~/.claude/ado-pat;可用 ADO_PAT_FILE 环境变量覆盖为工作区专属
const PAT_FILE = process.env.ADO_PAT_FILE || path.join(os.homedir(), '.claude', 'ado-pat');
const POLL_SEC = Number(process.env.CI_MONITOR_POLL_SEC || 15);        // wait(已知 buildId)轮询间隔
const WATCH_POLL_SEC = Number(process.env.CI_MONITOR_WATCH_POLL_SEC || 30);  // watch(盯最新 build)轮询间隔
const DEFAULT_LOG_DIR = path.join('docs', 'ops', 'ci-watch');
const REQUEST_TIMEOUT_MS = Number(process.env.CI_MONITOR_REQUEST_TIMEOUT_MS || 15000);
const REQUEST_RETRIES = Number(process.env.CI_MONITOR_REQUEST_RETRIES || 3);
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TASK_LOG_BYTES = Number(process.env.CI_MONITOR_MAX_TASK_LOG_BYTES || 2 * 1024 * 1024);
const MAX_BUNDLE_BYTES = Number(process.env.CI_MONITOR_MAX_BUNDLE_BYTES || 8 * 1024 * 1024);

// 读 PAT 文件生成 Basic 认证头
function authHeader() {
  if (!fs.existsSync(PAT_FILE)) {
    throw new Error(`ADO PAT 未找到:${PAT_FILE} — 见 docs/ops/cicd-agent-vm-setup.md`);
  }
  const pat = fs.readFileSync(PAT_FILE, 'utf8').trim();
  const token = Buffer.from(':' + pat).toString('base64');
  return 'Basic ' + token;
}

// 发 HTTP 请求,返回正文；设置超时和大小上限，避免后台 watcher 永久挂死或吃满内存。
function requestText(method, url, body, limits = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'http:' ? http : u.protocol === 'https:' ? https : null;
    if (!client) return reject(new Error(`不支持的 URL 协议: ${u.protocol}`));
    const maxBytes = limits.maxBytes || MAX_RESPONSE_BYTES;
    const allowTruncate = Boolean(limits.truncate);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    };
    const req = client.request(opts, (res) => {
      let data = '';
      let bytes = 0;
      let truncated = false;
      res.on('data', (c) => {
        bytes += c.length;
        data += c;
        if (bytes > maxBytes) {
          if (!allowTruncate) {
            req.destroy(new Error(`响应超过 ${maxBytes} bytes`));
            return;
          }
          truncated = true;
          data = Buffer.from(data).subarray(-maxBytes).toString('utf8');
          bytes = Buffer.byteLength(data);
        }
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`);
          error.statusCode = res.statusCode;
          error.retryAfter = res.headers['retry-after'] || null;
          return reject(error);
        }
        resolve(truncated ? `[日志前部已截断，仅保留末尾 ${maxBytes} bytes]\n${data}` : data);
      });
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`请求超时 ${REQUEST_TIMEOUT_MS}ms: ${u.hostname}:${u.port || 80}`));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransientError(error) {
  if ([408, 425, 429, 500, 502, 503, 504].includes(Number(error?.statusCode))) return true;
  return /ECONNRESET|ECONNREFUSED|ECONNABORTED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|请求超时|socket hang up/i.test(error?.message || '');
}

async function withRetry(operation, attempts = REQUEST_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === attempts) throw error;
      const retryAfterMs = Number(lastError?.retryAfter) * 1000;
      await sleep(Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : attempt * 1000);
    }
  }
  throw lastError;
}

async function request(method, url, body) {
  const data = await withRetry(() => requestText(method, url, body));
  try { return JSON.parse(data || '{}'); }
  catch (_) { throw new Error('响应非 JSON: ' + data.slice(0, 200)); }
}

const apiGet = (url) => request('GET', url);

async function apiGetText(url) {
  return withRetry(() => requestText('GET', url, null, { maxBytes: MAX_TASK_LOG_BYTES, truncate: true }));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFilePart(value) {
  return String(value || '-').replace(/[^A-Za-z0-9._-]/g, '_');
}

function appendJsonLine(file, value) {
  fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...value })}\n`);
}

function currentBranch(repo) {
  try {
    const { execFileSync } = require('child_process');
    if (repo && fs.existsSync(path.join(repo, '.git'))) {
      return execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    }
    // repo 参数通常是 ADO repo 名而不是本地目录，不能误用当前 workspace 根仓分支。
    if (repo) return null;
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch (_) {
    return null;
  }
}

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

function redactSecrets(text) {
  const secretKey = '(?:password|passwd|pwd|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|connection[_-]?string|secret|token|account[_-]?key|shared[_-]?access[_-]?key|private[_-]?key)';
  const quotedKeyValue = new RegExp(`(\\b${secretKey}\\b["']?\\s*[:=]\\s*)(["'])([^\\r\\n]*?)\\2`, 'gi');
  const unquotedKeyValue = new RegExp(`(\\b${secretKey}\\b["']?\\s*[:=]\\s*)([^"'\\r\\n,;}&\\]\\s]+)`, 'gi');
  let redacted = String(text || '')
    .replace(/(Authorization\s*:\s*)([^\r\n]+)/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1***')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, '***JWT***')
    .replace(quotedKeyValue, (_match, prefix, quote) => `${prefix}${quote}***${quote}`)
    .replace(unquotedKeyValue, '$1***')
    .replace(/-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----[\s\S]*?-----END (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/g, '***PRIVATE_KEY***');
  try {
    const pat = fs.readFileSync(PAT_FILE, 'utf8').trim();
    if (pat) redacted = redacted.split(pat).join('***');
  } catch (_) {
    // PAT 不存在时由请求层给出明确错误；日志脱敏不应覆盖原始异常。
  }
  return redacted;
}

function truncateUtf8Tail(text, maxBytes, marker) {
  const value = String(text || '');
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const prefix = `${marker}\n`;
  const budget = Math.max(0, maxBytes - Buffer.byteLength(prefix));
  return prefix + Buffer.from(value).subarray(-budget).toString('utf8');
}

async function loadTaskLogs(repo, buildId, failedOnly, includeContent = true) {
  const url = `${ADO_BASE}/${repo}/_apis/build/builds/${buildId}/timeline?api-version=7.0`;
  let records = ((await apiGet(url)).records || []).filter((r) => r.type === 'Task');
  if (failedOnly) records = records.filter((r) => r.result === 'failed');
  const tasks = [];
  for (const record of records) {
    let content = '';
    let captureError = null;
    if (includeContent && record.log?.url) {
      try {
        content = redactSecrets(await apiGetText(record.log.url));
      } catch (error) {
        captureError = redactSecrets(error.message);
      }
    }
    tasks.push({
      name: record.name,
      result: record.result || null,
      logUrl: record.log?.url ? redactSecrets(record.log.url) : null,
      content,
      captureError,
    });
  }
  return tasks;
}

function writeTaskLogBundle(file, repo, buildId, tasks) {
  if (!tasks.length) throw new Error('未找到失败 Task，无法生成失败日志正文');
  if (!tasks.some((task) => task.content.trim())) {
    throw new Error('失败 Task 日志正文为空，检查日志 API 权限或 captureError');
  }
  const prefix = `repo: ${repo}\nbuildId: ${buildId}\ncapturedAt: ${new Date().toISOString()}\n\n`;
  const perTaskBudget = Math.max(1024, Math.floor((MAX_BUNDLE_BYTES - Buffer.byteLength(prefix)) / tasks.length));
  const sections = tasks.map((task) => {
    const header = `===== [${task.result || '-'}] ${task.name} =====\nlogUrl: ${task.logUrl || '-'}\n`;
    const body = task.captureError ? `captureError: ${task.captureError}\n` : task.content;
    return header + truncateUtf8Tail(body, Math.max(256, perTaskBudget - Buffer.byteLength(header)), '[该 Task 日志已截断，保留末尾]');
  });
  const bundle = prefix + sections.join('\n\n');
  fs.writeFileSync(file, truncateUtf8Tail(bundle, MAX_BUNDLE_BYTES, '[失败日志 bundle 已截断，保留末尾]'));
}

// 查 build task；--content 同时下载实际日志正文。
async function cmdLogs(repo, buildId, opts) {
  const tasks = await loadTaskLogs(repo, buildId, Boolean(opts.failed), Boolean(opts.content));
  if (!tasks.length) { console.log('(无匹配 task 记录)'); return; }
  for (const task of tasks) {
    console.log(`[${task.result || '-'}] ${task.name}`);
    if (task.logUrl) console.log(`  logUrl: ${task.logUrl}`);
    if (opts.content) {
      if (task.captureError) console.log(`  captureError: ${task.captureError}`);
      else console.log(task.content);
    }
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
    const el = Math.round((Date.now() - start) / 1000);
    let b;
    try {
      b = await apiGet(`${ADO_BASE}/${repo}/_apis/build/builds/${buildId}?api-version=7.0`);
    } catch (error) {
      if (!isTransientError(error)) throw error;
      console.error(`[${el}s] MONITOR_WARNING: ${error.message}; 下轮继续`);
      if (el > timeout) throw new Error(`等待超时 ${timeout}s — 最后错误: ${error.message}`);
      await sleep(POLL_SEC * 1000);
      continue;
    }
    console.log(`[${el}s] #${b.id} status=${b.status} result=${b.result || '-'}`);
    if (b.status === 'completed') {
      process.exitCode = b.result === 'succeeded' ? 0 : 1;
      return b;
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
    const el = Math.round((Date.now() - start) / 1000);
    let builds;
    try {
      builds = (await apiGet(url)).value || [];
    } catch (error) {
      if (!isTransientError(error)) throw error;
      console.error(`[${el}s] MONITOR_WARNING: ${error.message}; 下轮继续`);
      if (el > timeout) throw new Error(`监控超时 ${timeout}s — 最后错误: ${error.message}`);
      await sleep(WATCH_POLL_SEC * 1000);
      continue;
    }
    if (!builds.length) {
      console.log(`[${el}s] (暂无 build)`);
    } else {
      const b = builds[0];
      console.log(`[${el}s] #${b.id} ${b.buildNumber} status=${b.status} result=${b.result || '-'}`);
      if (b.status === 'completed') {
        console.log(`FINAL: ${b.result}`);
        process.exitCode = b.result === 'succeeded' ? 0 : 1;
        return b;
      }
    }
    if (el > timeout) throw new Error(`监控超时 ${timeout}s`);
    await sleep(WATCH_POLL_SEC * 1000);
  }
}

function cmdBackground(repo, opts) {
  if (!repo || !opts.buildId) throw new Error('用法: background <repo> --build-id <id> [--branch <branch>] [--timeout N] [--log-dir DIR]');
  const logDir = opts.logDir || DEFAULT_LOG_DIR;
  ensureDir(logDir);
  const target = opts.buildId;
  const baseName = `${sanitizeFilePart(repo)}-${sanitizeFilePart(target)}`;
  const stdoutPath = path.join(logDir, `${baseName}.out`);
  const pidPath = path.join(logDir, `${baseName}.pid`);
  const metaPath = path.join(logDir, `${baseName}.json`);
  const readyPath = path.join(logDir, `${baseName}.ready.json`);
  const alertPath = path.join(logDir, `${baseName}.alert.json`);
  const currentPath = path.join(logDir, 'ci-watch-current.json');
  const eventPath = path.join(logDir, `ci-watch-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`);
  const runId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;

  if (fs.existsSync(pidPath)) {
    const existingPid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    try {
      process.kill(existingPid, 0);
      console.log(`BACKGROUND_EXISTS: repo=${repo} pid=${existingPid} meta=${metaPath}`);
      return;
    } catch (_) {
      try { fs.unlinkSync(pidPath); } catch (_) { /* 清理陈旧 pid */ }
    }
  }
  try { fs.unlinkSync(alertPath); } catch (_) { /* 新 attempt 解除旧 active alert */ }
  try { fs.unlinkSync(readyPath); } catch (_) { /* 清理旧 ready 握手 */ }

  const childArgs = [path.resolve(__filename), 'background-child', repo, '--log-dir', logDir];
  childArgs.push('--build-id', String(opts.buildId));
  childArgs.push('--run-id', runId);
  if (opts.branch) childArgs.push('--branch', String(opts.branch));
  if (opts.timeout) childArgs.push('--timeout', String(opts.timeout));

  const startMeta = {
    type: 'background-start',
    runId,
    repo,
    branch: opts.branch || currentBranch(repo),
    buildId: opts.buildId || null,
    pid: null,
    logPath: stdoutPath,
    pidPath,
    readyPath,
    metaPath,
    command: [process.execPath, ...childArgs].join(' '),
  };
  fs.writeFileSync(metaPath, JSON.stringify({ ts: new Date().toISOString(), ...startMeta }, null, 2));
  fs.writeFileSync(currentPath, JSON.stringify({ ts: new Date().toISOString(), ...startMeta }, null, 2));
  appendJsonLine(eventPath, startMeta);

  const outFd = fs.openSync(stdoutPath, 'a');
  const child = spawn(process.execPath, childArgs, {
    cwd: process.cwd(),
    detached: true,
    env: process.env,
    stdio: ['ignore', outFd, outFd],
  });
  child.unref();
  fs.closeSync(outFd);

  const meta = { ...startMeta, pid: child.pid };
  try {
    const latest = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (latest.type === 'background-start' && latest.runId === runId) {
      fs.writeFileSync(metaPath, JSON.stringify({ ts: new Date().toISOString(), ...meta }, null, 2));
    }
  } catch (_) { /* child 已落终态时不回写 start，避免覆盖 */ }
  console.log(`BACKGROUND: repo=${repo} pid=${child.pid} log=${stdoutPath}`);
}

async function cmdBackgroundChild(repo, opts) {
  if (!opts.buildId) throw new Error('background-child 必须指定 --build-id，避免误认其他分支或历史 build');
  const logDir = opts.logDir || DEFAULT_LOG_DIR;
  const target = opts.buildId;
  const baseName = `${sanitizeFilePart(repo)}-${sanitizeFilePart(target)}`;
  const currentPath = path.join(logDir, 'ci-watch-current.json');
  const metaPath = path.join(logDir, `${baseName}.json`);
  const pidPath = path.join(logDir, `${baseName}.pid`);
  const readyPath = path.join(logDir, `${baseName}.ready.json`);
  const failedLogPath = path.join(logDir, `${baseName}.failed.log`);
  const alertPath = path.join(logDir, `${baseName}.alert.json`);
  const eventPath = path.join(logDir, `ci-watch-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`);
  const branch = opts.branch || currentBranch(repo);
  const runId = opts.runId || `${Date.now()}-${process.pid}`;
  const logPath = path.join(logDir, `${baseName}.out`);
  ensureDir(logDir);
  fs.writeFileSync(pidPath, `${process.pid}\n`);
  fs.writeFileSync(readyPath, JSON.stringify({ ts: new Date().toISOString(), type: 'background-ready', runId, repo, buildId: opts.buildId, pid: process.pid }, null, 2));
  try {
    const build = await cmdWait(repo, opts.buildId, opts);
    let failedTasks = [];
    let logCaptureError = null;
    if (build?.result !== 'succeeded') {
      try {
        failedTasks = await loadTaskLogs(repo, opts.buildId, true);
        writeTaskLogBundle(failedLogPath, repo, opts.buildId, failedTasks);
        console.error(`FAILED_LOG_CAPTURED: ${failedLogPath}`);
      } catch (error) {
        logCaptureError = redactSecrets(error.message);
        console.error(`FAILED_LOG_CAPTURE_ERROR: ${logCaptureError}`);
      }
    }
    const event = {
      type: 'build-status',
      runId,
      repo,
      branch,
      buildId: build?.id || opts.buildId || null,
      buildNumber: build?.buildNumber || null,
      status: build?.status || null,
      result: build?.result || null,
      pid: process.pid,
      logPath,
      failedLogPath: build?.result === 'succeeded' || logCaptureError ? null : failedLogPath,
      failedTasks: failedTasks.map((task) => ({ name: task.name, result: task.result, logUrl: task.logUrl, captureError: task.captureError })),
      logCaptureError,
    };
    fs.writeFileSync(metaPath, JSON.stringify({ ts: new Date().toISOString(), ...event }, null, 2));
    fs.writeFileSync(currentPath, JSON.stringify({ ts: new Date().toISOString(), ...event }, null, 2));
    appendJsonLine(eventPath, event);
    if (build?.result !== 'succeeded') {
      fs.writeFileSync(alertPath, JSON.stringify({ ts: new Date().toISOString(), ...event }, null, 2));
    } else {
      try { fs.unlinkSync(alertPath); } catch (_) { /* 成功终态解除旧告警 */ }
    }
  } catch (error) {
    const safeError = redactSecrets(error.message);
    const event = {
      type: 'build-status-error',
      runId,
      repo,
      branch,
      buildId: opts.buildId || null,
      status: 'error',
      result: 'monitor_error',
      pid: process.pid,
      error: safeError,
      logPath,
    };
    fs.writeFileSync(metaPath, JSON.stringify({ ts: new Date().toISOString(), ...event }, null, 2));
    fs.writeFileSync(currentPath, JSON.stringify({ ts: new Date().toISOString(), ...event }, null, 2));
    appendJsonLine(eventPath, event);
    fs.writeFileSync(alertPath, JSON.stringify({ ts: new Date().toISOString(), ...event }, null, 2));
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(pidPath); } catch (_) { /* watcher 已结束或 pid 文件不存在 */ }
    try { fs.unlinkSync(readyPath); } catch (_) { /* watcher 已结束或 ready 文件不存在 */ }
  }
}

// 解析 flag(--top / --state / --failed / --content / --timeout / --build-id / --run-id / --branch / --log-dir)与位置参数
function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--failed') opts.failed = true;
    else if (a === '--content') opts.content = true;
    else if (a === '--top') opts.top = parseInt(args[++i], 10);
    else if (a === '--state') opts.state = args[++i];
    else if (a === '--timeout') opts.timeout = parseInt(args[++i], 10);
    else if (a === '--build-id') opts.buildId = args[++i];
    else if (a === '--run-id') opts.runId = args[++i];
    else if (a === '--branch') opts.branch = args[++i];
    else if (a === '--log-dir') opts.logDir = args[++i];
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
      if (!positional[1]) throw new Error('用法: logs <repo> <buildId> [--failed] [--content]');
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
    case 'background':
      if (!positional[0] || !opts.buildId) throw new Error('用法: background <repo> --build-id <id> [--branch <branch>] [--timeout N] [--log-dir DIR]');
      return cmdBackground(positional[0], opts);
    case 'background-child':
      if (!positional[0] || !opts.buildId) throw new Error('用法: background-child <repo> --build-id <id> [--timeout N] [--log-dir DIR]');
      return cmdBackgroundChild(positional[0], opts);
    default:
      console.log('SYSV2 ADO Build Monitor (Node.js)');
      console.log('子命令: status | logs | cancel-old | wait | watch | background');
      console.log('详见 docs/ops/cicd-ado-monitor.md');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('错误: ' + e.message);
  process.exitCode = 1;
});
