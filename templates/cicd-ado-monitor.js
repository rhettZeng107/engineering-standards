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
 *   node docs/ops/cicd-ado-monitor.js background <repo> --build-id <id> [--branch <branch>] [--interval-min 10] [--timeout 1800] [--quiet]
 *   node docs/ops/cicd-ado-monitor.js summary [--log-dir docs/ops/ci-watch]
 *   node docs/ops/cicd-ado-monitor.js consume [--peek] [--log-dir docs/ops/ci-watch]
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
const BACKGROUND_POLL_SEC = Number(process.env.CI_MONITOR_BACKGROUND_POLL_SEC || 10 * 60);
const DEFAULT_LOG_DIR = path.join('docs', 'ops', 'ci-watch');
const REQUEST_TIMEOUT_MS = Number(process.env.CI_MONITOR_REQUEST_TIMEOUT_MS || 15000);
const REQUEST_RETRIES = Number(process.env.CI_MONITOR_REQUEST_RETRIES || 3);
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TASK_LOG_BYTES = Number(process.env.CI_MONITOR_MAX_TASK_LOG_BYTES || 2 * 1024 * 1024);
const MAX_BUNDLE_BYTES = Number(process.env.CI_MONITOR_MAX_BUNDLE_BYTES || 8 * 1024 * 1024);
const MIN_BACKGROUND_POLL_SEC = 60;
const MAX_BACKGROUND_POLL_SEC = 24 * 60 * 60;
const CONSUME_LOCK_STALE_MS = 5 * 60 * 1000;

function resolveBackgroundPollSec(intervalMin) {
  const explicitlyProvided = intervalMin !== undefined;
  if (explicitlyProvided && !Number.isFinite(intervalMin)) {
    throw new Error(`后台轮询间隔必须是 1 至 1440 之间的数字，当前值: ${String(intervalMin)}`);
  }
  const seconds = explicitlyProvided ? intervalMin * 60 : BACKGROUND_POLL_SEC;
  if (!Number.isFinite(seconds) || seconds < MIN_BACKGROUND_POLL_SEC || seconds > MAX_BACKGROUND_POLL_SEC) {
    throw new Error(`后台轮询间隔必须在 1 至 1440 分钟之间，当前值: ${Number.isFinite(intervalMin) ? intervalMin : BACKGROUND_POLL_SEC / 60}`);
  }
  return seconds;
}

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

function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function writeJsonCreateOnce(file, value) {
  const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2, 10)}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx');
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    try {
      fs.linkSync(temp, file);
    } catch (error) {
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(error.code)) throw error;
      fs.copyFileSync(temp, file, fs.constants.COPYFILE_EXCL);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (_) { /* 临时文件未创建或已清理 */ }
  }
}

function writeAuxiliary(label, operation) {
  try {
    operation();
  } catch (error) {
    console.error(`MONITOR_WARNING: ${label} 写入失败: ${redactSecrets(error.message)}`);
  }
}

function processStartFingerprint(pid) {
  try {
    const { execFileSync } = require('child_process');
    if (process.platform === 'win32') {
      return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],
        { encoding: 'utf8', timeout: 3000, windowsHide: true },
      ).trim() || null;
    }
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).trim() || null;
  } catch (_) {
    return null;
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function inspectOwnedLock(file) {
  let record = null;
  let raw = null;
  let ageMs = Number.POSITIVE_INFINITY;
  try {
    raw = fs.readFileSync(file, 'utf8');
    record = JSON.parse(raw);
    const ts = Date.parse(record.ts);
    ageMs = Number.isFinite(ts) ? Date.now() - ts : Number.POSITIVE_INFINITY;
  } catch (_) {
    try { ageMs = Date.now() - fs.statSync(file).mtimeMs; } catch (_) { /* 文件可能刚被释放 */ }
  }
  const ownerKnown = Number.isInteger(record?.pid) && record.pid > 0;
  const ownerAlive = ownerKnown && processIsAlive(record.pid);
  const currentOwnerStart = ownerAlive && record?.processStart ? processStartFingerprint(record.pid) : null;
  const pidReused = ownerAlive && record?.processStart && currentOwnerStart && record.processStart !== currentOwnerStart;
  const unverifiableOwnerExpired = ownerAlive
    && (!record?.processStart || !currentOwnerStart)
    && ageMs > CONSUME_LOCK_STALE_MS;
  return {
    record,
    raw,
    reclaimable: ownerKnown ? !ownerAlive || pidReused || unverifiableOwnerExpired : ageMs > CONSUME_LOCK_STALE_MS,
  };
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
  const pollSec = Number.isFinite(opts.pollSec) ? opts.pollSec : POLL_SEC;
  const start = Date.now();
  const timeoutMs = timeout * 1000;
  while (true) {
    const elapsedMs = Date.now() - start;
    const el = Math.floor(elapsedMs / 1000);
    let b;
    try {
      b = await apiGet(`${ADO_BASE}/${repo}/_apis/build/builds/${buildId}?api-version=7.0`);
    } catch (error) {
      if (!isTransientError(error)) throw error;
      console.error(`[${el}s] MONITOR_WARNING: ${error.message}; 下轮继续`);
      if (typeof opts.onState === 'function') {
        writeAuxiliary('轮询警告状态', () => opts.onState({
          type: 'build-poll-warning',
          repo,
          buildId,
          status: 'monitor_warning',
          elapsedSeconds: el,
          error: redactSecrets(error.message),
        }));
      }
      const remainingMs = timeoutMs - (Date.now() - start);
      if (remainingMs <= 0) throw new Error(`等待超时 ${timeout}s — 最后错误: ${error.message}`);
      await sleep(Math.min(pollSec * 1000, remainingMs));
      continue;
    }
    console.log(`[${el}s] #${b.id} status=${b.status} result=${b.result || '-'}`);
    if (b.status === 'completed') {
      process.exitCode = b.result === 'succeeded' ? 0 : 1;
      return b;
    }
    if (typeof opts.onState === 'function') {
      writeAuxiliary('轮询状态', () => opts.onState({
        type: 'build-poll',
        repo,
        buildId: b.id || buildId,
        buildNumber: b.buildNumber || null,
        status: b.status || null,
        result: b.result || null,
        elapsedSeconds: el,
      }));
    }
    const remainingMs = timeoutMs - (Date.now() - start);
    if (remainingMs <= 0) throw new Error(`等待超时 ${timeout}s — build ${buildId} 仍 ${b.status}`);
    await sleep(Math.min(pollSec * 1000, remainingMs));
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
  if (!repo || !opts.buildId) throw new Error('用法: background <repo> --build-id <id> [--branch <branch>] [--interval-min 10] [--timeout N] [--quiet]');
  const pollSec = resolveBackgroundPollSec(opts.intervalMin);
  const logDir = opts.logDir || DEFAULT_LOG_DIR;
  ensureDir(logDir);
  const target = opts.buildId;
  const baseName = `${sanitizeFilePart(repo)}-${sanitizeFilePart(target)}`;
  const stdoutPath = path.join(logDir, `${baseName}.out`);
  const pidPath = path.join(logDir, `${baseName}.pid`);
  const metaPath = path.join(logDir, `${baseName}.json`);
  const readyPath = path.join(logDir, `${baseName}.ready.json`);
  const alertPath = path.join(logDir, `${baseName}.alert.json`);
  const statePath = path.join(logDir, `${baseName}.state.json`);
  const currentPath = path.join(logDir, 'ci-watch-current.json');
  const eventPath = path.join(logDir, `ci-watch-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`);
  const runId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;

  if (fs.existsSync(pidPath)) {
    const existingPid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    try {
      process.kill(existingPid, 0);
      if (!opts.quiet) console.log(`BACKGROUND_EXISTS: repo=${repo} pid=${existingPid} meta=${metaPath}`);
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
  childArgs.push('--interval-min', String(pollSec / 60));

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
  writeJsonAtomic(metaPath, { ts: new Date().toISOString(), ...startMeta });
  writeJsonAtomic(currentPath, { ts: new Date().toISOString(), ...startMeta });
  writeJsonAtomic(statePath, { ts: new Date().toISOString(), ...startMeta });
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
      writeJsonAtomic(metaPath, { ts: new Date().toISOString(), ...meta });
    }
  } catch (_) { /* child 已落终态时不回写 start，避免覆盖 */ }
  try {
    const latestState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (latestState.type === 'background-start' && latestState.runId === runId) {
      writeJsonAtomic(statePath, { ts: new Date().toISOString(), ...meta });
    }
  } catch (_) { /* child 已推进状态时不覆盖 */ }
  if (!opts.quiet) console.log(`BACKGROUND: repo=${repo} pid=${child.pid} log=${stdoutPath}`);
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
  const statePath = path.join(logDir, `${baseName}.state.json`);
  const eventPath = path.join(logDir, `ci-watch-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`);
  const branch = opts.branch || currentBranch(repo);
  const runId = opts.runId || `${Date.now()}-${process.pid}`;
  const terminalPath = path.join(logDir, `${baseName}-${sanitizeFilePart(runId)}.terminal.json`);
  const logPath = path.join(logDir, `${baseName}.out`);
  opts.pollSec = resolveBackgroundPollSec(opts.intervalMin);
  ensureDir(logDir);
  fs.writeFileSync(pidPath, `${process.pid}\n`);
  const ready = { ts: new Date().toISOString(), type: 'background-ready', runId, repo, branch, buildId: opts.buildId, pid: process.pid, logPath };
  writeJsonAtomic(readyPath, ready);
  writeJsonAtomic(statePath, ready);
  opts.onState = (event) => writeJsonAtomic(statePath, {
    ts: new Date().toISOString(),
    ...event,
    runId,
    branch,
    pid: process.pid,
    logPath,
  });
  let terminalCommitted = fs.existsSync(terminalPath);
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
      type: 'build-terminal',
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
    const terminal = { ts: new Date().toISOString(), ...event };
    if (!terminalCommitted) {
      writeJsonCreateOnce(terminalPath, terminal);
      terminalCommitted = true;
    }
    writeAuxiliary('终态元数据', () => writeJsonAtomic(metaPath, terminal));
    writeAuxiliary('共享当前状态', () => writeJsonAtomic(currentPath, terminal));
    writeAuxiliary('逐任务状态', () => writeJsonAtomic(statePath, terminal));
    writeAuxiliary('事件日志', () => appendJsonLine(eventPath, event));
    if (build?.result !== 'succeeded') {
      writeAuxiliary('失败告警', () => writeJsonAtomic(alertPath, terminal));
    } else {
      writeAuxiliary('旧告警清理', () => {
        try { fs.unlinkSync(alertPath); } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      });
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
    const terminal = { ts: new Date().toISOString(), ...event };
    if (!terminalCommitted && !fs.existsSync(terminalPath)) {
      writeJsonCreateOnce(terminalPath, terminal);
      terminalCommitted = true;
    }
    writeAuxiliary('监控异常元数据', () => writeJsonAtomic(metaPath, terminal));
    writeAuxiliary('监控异常当前状态', () => writeJsonAtomic(currentPath, terminal));
    writeAuxiliary('监控异常逐任务状态', () => writeJsonAtomic(statePath, terminal));
    writeAuxiliary('监控异常事件日志', () => appendJsonLine(eventPath, event));
    writeAuxiliary('监控异常告警', () => writeJsonAtomic(alertPath, terminal));
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(pidPath); } catch (_) { /* watcher 已结束或 pid 文件不存在 */ }
    try { fs.unlinkSync(readyPath); } catch (_) { /* watcher 已结束或 ready 文件不存在 */ }
  }
}

function cmdSummary(opts) {
  const logDir = opts.logDir || DEFAULT_LOG_DIR;
  if (!fs.existsSync(logDir)) { console.log('[]'); return; }
  const states = fs.readdirSync(logDir)
    .filter((name) => name.endsWith('.state.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(logDir, name), 'utf8')))
    .sort((left, right) => String(right.ts).localeCompare(String(left.ts)));
  console.log(JSON.stringify(states, null, 2));
}

function writeStdout(text) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => process.stdout.removeListener('error', onError);
    process.stdout.once('error', onError);
    process.stdout.write(text, (error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    });
  });
}

async function cmdConsume(opts) {
  const logDir = opts.logDir || DEFAULT_LOG_DIR;
  ensureDir(logDir);
  const ledgerPath = path.join(logDir, 'ci-watch-consumed.json');
  const lockPath = path.join(logDir, 'ci-watch-consume.lock');
  const lockId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const processStart = processStartFingerprint(process.pid);
  let lockFd;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lockFd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(lockFd, JSON.stringify({ lockId, pid: process.pid, processStart, ts: new Date().toISOString() }));
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existingState = inspectOwnedLock(lockPath);
      const existing = existingState.record;
      const existingRaw = existingState.raw;
      if (!existingState.reclaimable) {
        throw new Error(`终态消费正在由其他进程执行: ${lockPath}`);
      }
      const reclaimGuardPath = `${lockPath}.reclaim`;
      let reclaimGuardFd;
      for (let guardAttempt = 0; guardAttempt < 2; guardAttempt++) {
        try {
          reclaimGuardFd = fs.openSync(reclaimGuardPath, 'wx');
          fs.writeFileSync(reclaimGuardFd, JSON.stringify({ lockId, pid: process.pid, processStart, ts: new Date().toISOString() }));
          break;
        } catch (guardError) {
          if (guardError.code !== 'EEXIST') throw guardError;
          const guardState = inspectOwnedLock(reclaimGuardPath);
          if (!guardState.reclaimable) throw new Error(`终态消费锁正在被其他进程回收: ${lockPath}`);
          let currentGuardRaw = null;
          try { currentGuardRaw = fs.readFileSync(reclaimGuardPath, 'utf8'); } catch (readError) {
            if (readError.code !== 'ENOENT') throw readError;
          }
          if (currentGuardRaw === null || currentGuardRaw !== guardState.raw) continue;
          try { fs.unlinkSync(reclaimGuardPath); } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') throw unlinkError;
          }
        }
      }
      if (reclaimGuardFd === undefined) throw new Error(`无法取得终态消费回收锁: ${lockPath}`);
      try {
        let current = null;
        let currentRaw = null;
        try {
          currentRaw = fs.readFileSync(lockPath, 'utf8');
          if (existing?.lockId) current = JSON.parse(currentRaw);
        } catch (readError) {
          if (readError.code !== 'ENOENT') throw readError;
        }
        if (currentRaw === null) continue;
        if (existing?.lockId && current?.lockId !== existing.lockId) continue;
        if (!existing?.lockId && currentRaw !== existingRaw) continue;
        try { fs.unlinkSync(lockPath); } catch (unlinkError) {
          if (unlinkError.code !== 'ENOENT') throw unlinkError;
        }
      } finally {
        fs.closeSync(reclaimGuardFd);
        try { fs.unlinkSync(reclaimGuardPath); } catch (_) { /* 回收门已释放 */ }
      }
    }
  }
  if (lockFd === undefined) throw new Error(`无法取得终态消费锁: ${lockPath}`);
  try {
    const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
    const terminals = [];
    const invalidTerminals = [];
    for (const name of fs.readdirSync(logDir).filter((entry) => entry.endsWith('.terminal.json'))) {
      try {
        const event = JSON.parse(fs.readFileSync(path.join(logDir, name), 'utf8'));
        if (ledger[name] !== event.ts) terminals.push({ name, event });
      } catch (error) {
        invalidTerminals.push({ name, error: redactSecrets(error.message) });
      }
    }
    terminals.sort((left, right) => String(left.event.ts).localeCompare(String(right.event.ts)));
    for (const invalid of invalidTerminals) {
      console.error(`MONITOR_WARNING: 无法解析终态文件 ${invalid.name}: ${invalid.error}`);
    }
    const output = `${JSON.stringify(terminals.map(({ event }) => event), null, 2)}\n`;
    await writeStdout(output);
    if (!opts.peek && terminals.length) {
      for (const { name, event } of terminals) ledger[name] = event.ts;
      writeJsonAtomic(ledgerPath, ledger);
    }
  } finally {
    fs.closeSync(lockFd);
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (current.lockId === lockId) fs.unlinkSync(lockPath);
    } catch (_) { /* 锁已被陈旧锁回收或文件已不存在 */ }
  }
}

// 解析 flag(--top / --state / --failed / --content / --timeout / --build-id / --run-id / --branch / --interval-min / --quiet / --peek / --log-dir)与位置参数
function parseArgs(args) {
  const opts = {};
  const positional = [];
  const provided = new Set();
  const nextValue = (flag, index) => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${flag} 缺少值`);
    return value;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--failed') { opts.failed = true; provided.add(a); }
    else if (a === '--content') { opts.content = true; provided.add(a); }
    else if (a === '--quiet') { opts.quiet = true; provided.add(a); }
    else if (a === '--peek') { opts.peek = true; provided.add(a); }
    else if (a === '--top') { provided.add(a); opts.top = parseInt(nextValue(a, i), 10); i += 1; }
    else if (a === '--state') { provided.add(a); opts.state = nextValue(a, i); i += 1; }
    else if (a === '--timeout') { provided.add(a); opts.timeout = parseInt(nextValue(a, i), 10); i += 1; }
    else if (a === '--interval-min') { provided.add(a); opts.intervalMin = Number(nextValue(a, i)); i += 1; }
    else if (a === '--build-id') { provided.add(a); opts.buildId = nextValue(a, i); i += 1; }
    else if (a === '--run-id') { provided.add(a); opts.runId = nextValue(a, i); i += 1; }
    else if (a === '--branch') { provided.add(a); opts.branch = nextValue(a, i); i += 1; }
    else if (a === '--log-dir') { provided.add(a); opts.logDir = nextValue(a, i); i += 1; }
    else if (a.startsWith('--')) throw new Error(`未知参数: ${a}`);
    else positional.push(a);
  }
  return { opts, positional, provided };
}

function validateCommandArgs(command, positional, provided, expectedCount, allowedFlags, usage) {
  if (positional.length !== expectedCount) throw new Error(`用法: ${usage}`);
  for (const flag of provided) {
    if (!allowedFlags.includes(flag)) throw new Error(`${command} 不支持参数 ${flag}；用法: ${usage}`);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { opts, positional, provided } = parseArgs(rest);
  switch (cmd) {
    case 'status':
      validateCommandArgs(cmd, positional, provided, 1, ['--top', '--state'], 'status <repo> [--top N] [--state ...]');
      return cmdStatus(positional[0], opts);
    case 'logs':
      validateCommandArgs(cmd, positional, provided, 2, ['--failed', '--content'], 'logs <repo> <buildId> [--failed] [--content]');
      return cmdLogs(positional[0], positional[1], opts);
    case 'cancel-old':
      validateCommandArgs(cmd, positional, provided, 1, [], 'cancel-old <repo>');
      return cmdCancelOld(positional[0]);
    case 'wait':
      validateCommandArgs(cmd, positional, provided, 2, ['--timeout'], 'wait <repo> <buildId> [--timeout N]');
      return cmdWait(positional[0], positional[1], opts);
    case 'watch':
      validateCommandArgs(cmd, positional, provided, 1, ['--timeout'], 'watch <repo> [--timeout N]');
      return cmdWatch(positional[0], opts);
    case 'background':
      validateCommandArgs(cmd, positional, provided, 1, ['--build-id', '--branch', '--interval-min', '--timeout', '--quiet', '--log-dir'], 'background <repo> --build-id <id> [--branch <branch>] [--interval-min 10] [--timeout N] [--quiet] [--log-dir DIR]');
      if (!opts.buildId) throw new Error('用法: background <repo> --build-id <id> [--branch <branch>] [--interval-min 10] [--timeout N] [--quiet] [--log-dir DIR]');
      return cmdBackground(positional[0], opts);
    case 'background-child':
      validateCommandArgs(cmd, positional, provided, 1, ['--build-id', '--run-id', '--branch', '--interval-min', '--timeout', '--log-dir'], 'background-child <repo> --build-id <id> [--run-id <id>] [--branch <branch>] [--interval-min 10] [--timeout N] [--log-dir DIR]');
      if (!opts.buildId) throw new Error('用法: background-child <repo> --build-id <id> [--run-id <id>] [--branch <branch>] [--interval-min 10] [--timeout N] [--log-dir DIR]');
      return cmdBackgroundChild(positional[0], opts);
    case 'summary':
      validateCommandArgs(cmd, positional, provided, 0, ['--log-dir'], 'summary [--log-dir DIR]');
      return cmdSummary(opts);
    case 'consume':
      validateCommandArgs(cmd, positional, provided, 0, ['--peek', '--log-dir'], 'consume [--peek] [--log-dir DIR]');
      return cmdConsume(opts);
    default:
      console.log('SYSV2 ADO Build Monitor (Node.js)');
      console.log('子命令: status | logs | cancel-old | wait | watch | background | summary | consume');
      console.log('详见 docs/ops/cicd-ado-monitor.md');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('错误: ' + e.message);
  process.exitCode = 1;
});
