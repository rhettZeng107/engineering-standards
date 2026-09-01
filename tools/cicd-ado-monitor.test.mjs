import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const monitorPath = path.join(repoRoot, 'templates', 'cicd-ado-monitor.js');

function loadMonitor(tempDir, adoBase, patFile) {
  const source = fs.readFileSync(monitorPath, 'utf8').replace(
    /main\(\)\.catch\(\(e\) => \{[\s\S]*?\n\}\);\s*$/,
    'module.exports = { writeJsonCreateOnce, cmdWait, parseArgs };\n',
  );
  const modulePath = path.join(tempDir, `monitor-${Math.random().toString(16).slice(2)}.cjs`);
  fs.writeFileSync(modulePath, source);
  const previousBase = process.env.ADO_BASE;
  const previousPat = process.env.ADO_PAT_FILE;
  process.env.ADO_BASE = adoBase;
  process.env.ADO_PAT_FILE = patFile;
  try {
    return require(modulePath);
  } finally {
    if (previousBase === undefined) delete process.env.ADO_BASE;
    else process.env.ADO_BASE = previousBase;
    if (previousPat === undefined) delete process.env.ADO_PAT_FILE;
    else process.env.ADO_PAT_FILE = previousPat;
  }
}

function spawnCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function backgroundChildArgs(logDir, runId = 'run-1') {
  return [
    monitorPath,
    'background-child',
    'repo',
    '--build-id',
    '42',
    '--run-id',
    runId,
    '--interval-min',
    '1',
    '--timeout',
    '5',
    '--log-dir',
    logDir,
  ];
}

test('completed build survives auxiliary state callback failure', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-terminal-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const patFile = path.join(tempDir, 'pat');
  fs.writeFileSync(patFile, 'test-token\n');
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(requests === 1
      ? { id: 42, buildNumber: '42', status: 'inProgress', result: null }
      : { id: 42, buildNumber: '42', status: 'completed', result: 'succeeded' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const monitor = loadMonitor(tempDir, `http://127.0.0.1:${address.port}/base`, patFile);

  const build = await monitor.cmdWait('repo', '42', {
    pollSec: 0,
    timeout: 5,
    onState: () => { throw new Error('state path unavailable'); },
  });

  assert.equal(build.result, 'succeeded');
  assert.equal(requests, 2);
});

test('create-once terminal falls back when hard links are unsupported', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-link-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const patFile = path.join(tempDir, 'pat');
  fs.writeFileSync(patFile, 'test-token\n');
  const monitor = loadMonitor(tempDir, 'http://127.0.0.1', patFile);
  const terminalPath = path.join(tempDir, 'terminal.json');
  const originalLinkSync = fs.linkSync;
  fs.linkSync = () => {
    const error = new Error('hard links unsupported');
    error.code = 'ENOTSUP';
    throw error;
  };
  try {
    monitor.writeJsonCreateOnce(terminalPath, { result: 'succeeded' });
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.deepEqual(JSON.parse(fs.readFileSync(terminalPath, 'utf8')), { result: 'succeeded' });
  assert.throws(() => monitor.writeJsonCreateOnce(terminalPath, { result: 'failed' }), { code: 'EEXIST' });
});

test('consume rejects unsupported flags, missing values, and positional arguments without writing a ledger', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-args-'));
  const terminalPath = path.join(tempDir, 'run.terminal.json');
  fs.writeFileSync(terminalPath, JSON.stringify({ ts: '2026-09-02T00:00:00Z', result: 'failed' }));

  for (const args of [
    ['consume', '--peke', '--log-dir', tempDir],
    ['consume', 'unexpected', '--log-dir', tempDir],
    ['consume', '--failed', '--log-dir', tempDir],
    ['consume', '--log-dir'],
  ]) {
    const result = spawnSync(process.execPath, [monitorPath, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  }
  assert.equal(fs.existsSync(path.join(tempDir, 'ci-watch-consumed.json')), false);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('background child writes an immutable succeeded terminal event', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-green-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const patFile = path.join(tempDir, 'pat');
  fs.writeFileSync(patFile, 'test-token-1234567890\n');
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 42, buildNumber: '42', status: 'completed', result: 'succeeded' }));
  });
  const base = await listen(server);
  t.after(() => server.close());

  const result = await spawnCapture(process.execPath, backgroundChildArgs(tempDir, 'green-run'), {
    env: { ...process.env, ADO_BASE: `${base}/base`, ADO_PAT_FILE: patFile },
  });

  assert.equal(result.code, 0, result.stderr);
  const terminal = JSON.parse(fs.readFileSync(path.join(tempDir, 'repo-42-green-run.terminal.json'), 'utf8'));
  assert.equal(terminal.type, 'build-terminal');
  assert.equal(terminal.result, 'succeeded');
});

test('background child captures and redacts failed task logs', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-red-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const patFile = path.join(tempDir, 'pat');
  fs.writeFileSync(patFile, 'test-token-1234567890\n');
  let base;
  const server = http.createServer((request, response) => {
    if (request.url.includes('/timeline?')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ records: [{ type: 'Task', result: 'failed', name: 'compile', log: { url: `${base}/log` } }] }));
      return;
    }
    if (request.url === '/log') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('compile failed password=secret-value token=test-token-1234567890');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 42, buildNumber: '42', status: 'completed', result: 'failed' }));
  });
  base = await listen(server);
  t.after(() => server.close());

  const result = await spawnCapture(process.execPath, backgroundChildArgs(tempDir, 'red-run'), {
    env: { ...process.env, ADO_BASE: `${base}/base`, ADO_PAT_FILE: patFile },
  });

  assert.equal(result.code, 1);
  const terminal = JSON.parse(fs.readFileSync(path.join(tempDir, 'repo-42-red-run.terminal.json'), 'utf8'));
  assert.equal(terminal.result, 'failed');
  const failedLog = fs.readFileSync(path.join(tempDir, 'repo-42.failed.log'), 'utf8');
  assert.match(failedLog, /password=\*\*\*/);
  assert.doesNotMatch(failedLog, /secret-value|test-token-1234567890/);
});

test('background child recovers from a transient build status failure', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-transient-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const patFile = path.join(tempDir, 'pat');
  fs.writeFileSync(patFile, 'test-token-1234567890\n');
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(503, { 'Content-Type': 'text/plain' });
      response.end('temporarily unavailable');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 42, buildNumber: '42', status: 'completed', result: 'succeeded' }));
  });
  const base = await listen(server);
  t.after(() => server.close());

  const result = await spawnCapture(process.execPath, backgroundChildArgs(tempDir, 'retry-run'), {
    env: {
      ...process.env,
      ADO_BASE: `${base}/base`,
      ADO_PAT_FILE: patFile,
      CI_MONITOR_REQUEST_RETRIES: '3',
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.ok(requests >= 2);
  const terminal = JSON.parse(fs.readFileSync(path.join(tempDir, 'repo-42-retry-run.terminal.json'), 'utf8'));
  assert.equal(terminal.result, 'succeeded');
});

test('concurrent consumers publish a terminal event only once', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-consume-race-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tempDir, 'run.terminal.json'), JSON.stringify({ ts: '2026-09-02T00:00:00Z', result: 'failed' }));

  const args = [monitorPath, 'consume', '--log-dir', tempDir];
  const results = await Promise.all([
    spawnCapture(process.execPath, args),
    spawnCapture(process.execPath, args),
  ]);
  const published = results
    .filter((result) => result.code === 0)
    .flatMap((result) => JSON.parse(result.stdout));

  assert.equal(published.length, 1);
  assert.equal(published[0].result, 'failed');
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(tempDir, 'ci-watch-consumed.json'), 'utf8'))).length, 1);
});

test('consume reclaims a stale lock whose PID fingerprint was reused', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-stale-lock-'));
  const terminalPath = path.join(tempDir, 'run.terminal.json');
  fs.writeFileSync(terminalPath, JSON.stringify({ ts: '2026-09-02T00:00:00Z', result: 'succeeded' }));
  fs.writeFileSync(path.join(tempDir, 'ci-watch-consume.lock'), JSON.stringify({
    lockId: 'stale-lock',
    pid: process.pid,
    processStart: 'stale-fingerprint',
    ts: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  }));

  const result = spawnSync(process.execPath, [monitorPath, 'consume', '--log-dir', tempDir], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout)[0].result, 'succeeded');
  assert.equal(fs.existsSync(path.join(tempDir, 'ci-watch-consume.lock')), false);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('consume reclaims an expired lock when the live PID fingerprint cannot be inspected', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-monitor-unverifiable-lock-'));
  const terminalPath = path.join(tempDir, 'run.terminal.json');
  fs.writeFileSync(terminalPath, JSON.stringify({ ts: '2026-09-02T00:00:00Z', result: 'succeeded' }));
  fs.writeFileSync(path.join(tempDir, 'ci-watch-consume.lock'), JSON.stringify({
    lockId: 'unverifiable-lock',
    pid: process.pid,
    processStart: 'known-prior-fingerprint',
    ts: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  }));

  const result = spawnSync(process.execPath, [monitorPath, 'consume', '--log-dir', tempDir], {
    encoding: 'utf8',
    env: { ...process.env, PATH: tempDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout)[0].result, 'succeeded');
  assert.equal(fs.existsSync(path.join(tempDir, 'ci-watch-consume.lock')), false);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
