#!/usr/bin/env node
/**
 * Provider-neutral pre-commit E2E evidence guard for frontend repositories.
 *
 * The guard is intentionally evidence-based:
 *   1. It fingerprints staged frontend-impacting changes.
 *   2. `record` runs a local E2E/browser command and stores a passed stamp
 *      under the target repo's .git directory.
 *   3. `check` blocks commit when the staged fingerprint has no matching
 *      passed stamp.
 *
 * The evidence file is local and untracked:
 *   <repo>/.git/page-change-e2e-evidence.json
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const FRONTEND_PATTERNS = [
  /^src\//,
  /^app\//,
  /^pages\//,
  /^components\//,
  /^routes\//,
  /^e2e\//,
  /^tests\//,
  /^public\//,
  /^pipeline-e2e\//,
  /^playwright\.config\./,
  /^vite\.config\./,
  /^package(-lock)?\.json$/,
  /^index\.html$/,
  /^\.env\./,
];

function usage(exitCode = 1) {
  console.log(`Page Change E2E Pre-commit Guard

Usage:
  node page-change-e2e-guard.js check [--repo-path <path>]
  node page-change-e2e-guard.js record --repo-path <path> -- <local-e2e-command...>
  node page-change-e2e-guard.js status [--repo-path <path>]

Examples:
  node page-change-e2e-guard.js record --repo-path ./web -- npm run test:e2e -- --grep @module:changed-page
  node page-change-e2e-guard.js check --repo-path ./web
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { repoPath: process.cwd(), command: [] };
  const commandIndex = rest.indexOf('--');
  const flags = commandIndex >= 0 ? rest.slice(0, commandIndex) : rest;
  opts.command = commandIndex >= 0 ? rest.slice(commandIndex + 1) : [];
  for (let i = 0; i < flags.length; i += 1) {
    const arg = flags[i];
    if (arg === '--repo-path') opts.repoPath = flags[++i];
    else if (arg === '--help' || arg === '-h') usage(0);
    else opts.positional = [...(opts.positional || []), arg];
  }
  return { cmd, opts };
}

function runGit(repoPath, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoPath,
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
}

function gitDir(repoPath) {
  const out = runGit(repoPath, ['rev-parse', '--git-dir']).trim();
  return path.isAbsolute(out) ? out : path.join(repoPath, out);
}

function evidencePath(repoPath) {
  return path.join(gitDir(repoPath), 'page-change-e2e-evidence.json');
}

function stagedFiles(repoPath) {
  const out = runGit(repoPath, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function isFrontendImpact(file) {
  return FRONTEND_PATTERNS.some((pattern) => pattern.test(file));
}

function impactedFiles(repoPath) {
  return stagedFiles(repoPath).filter(isFrontendImpact);
}

function stagedFingerprint(repoPath, files) {
  if (!files.length) return null;
  const diff = runGit(repoPath, ['diff', '--cached', '--binary', '--', ...files], {
    encoding: 'buffer',
    maxBuffer: 200 * 1024 * 1024,
  });
  return crypto.createHash('sha256').update(diff).digest('hex');
}

function loadEvidence(repoPath) {
  const file = evidencePath(repoPath);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeEvidence(repoPath, evidence) {
  const file = evidencePath(repoPath);
  fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);
}

function repoName(repoPath) {
  return path.basename(path.resolve(repoPath));
}

function hasOnlySkippedPlaywrightTests(output) {
  const plain = output.replace(ANSI_ESCAPE, '');
  const skipped = /(?:^|\s)\d+\s+skipped(?:\s|$)/m.test(plain);
  const executed = /(?:^|\s)\d+\s+(?:passed|failed)(?:\s|$)/m.test(plain);
  return skipped && !executed;
}

function currentContext(repoPath) {
  const files = impactedFiles(repoPath);
  return {
    repoPath,
    repo: repoName(repoPath),
    files,
    fingerprint: stagedFingerprint(repoPath, files),
  };
}

function status(repoPath) {
  const ctx = currentContext(repoPath);
  const evidence = loadEvidence(repoPath);
  console.log(JSON.stringify({
    repo: ctx.repo,
    repoPath: path.resolve(repoPath),
    impactedFileCount: ctx.files.length,
    impactedFiles: ctx.files,
    fingerprint: ctx.fingerprint,
    evidence,
    matched: Boolean(ctx.fingerprint && evidence && evidence.status === 'passed' && evidence.fingerprint === ctx.fingerprint),
  }, null, 2));
}

function check(repoPath) {
  const ctx = currentContext(repoPath);
  if (!ctx.files.length) {
    console.log('PAGE_CHANGE_E2E_GUARD: no staged frontend-impacting files');
    return 0;
  }
  const evidence = loadEvidence(repoPath);
  if (evidence && evidence.status === 'passed' && evidence.fingerprint === ctx.fingerprint) {
    console.log(`PAGE_CHANGE_E2E_GUARD: matched local evidence repo=${ctx.repo} files=${ctx.files.length} ts=${evidence.ts}`);
    return 0;
  }

  console.error(`PAGE_CHANGE_E2E_GUARD_BLOCKED: repo=${ctx.repo} staged frontend-impacting files require local E2E evidence.`);
  console.error(`fingerprint=${ctx.fingerprint}`);
  console.error('Run the repository-approved impacted Playwright command through record, for example:');
  console.error(`  node page-change-e2e-guard.js record --repo-path ${path.relative(process.cwd(), path.resolve(repoPath)) || '.'} -- npm run test:e2e -- --grep @module:changed-page`);
  console.error('The command must cover every affected entry and direct sibling declared by the task record.');
  return 1;
}

function record(repoPath, command) {
  if (!command.length) {
    throw new Error('record requires a command after --');
  }
  const ctx = currentContext(repoPath);
  if (!ctx.files.length) {
    console.log('PAGE_CHANGE_E2E_GUARD: no staged frontend-impacting files; no evidence needed');
    return 0;
  }

  const startedAt = new Date().toISOString();
  console.log(`PAGE_CHANGE_E2E_GUARD: running local command for repo=${ctx.repo}`);
  console.log(`PAGE_CHANGE_E2E_GUARD_EXECUTABLE: ${command[0]} args=${command.length - 1}`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    shell: os.platform() === 'win32',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`PAGE_CHANGE_E2E_GUARD_FAILED: command exit=${result.status}`);
    return result.status || 1;
  }
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (hasOnlySkippedPlaywrightTests(output)) {
    console.error('PAGE_CHANGE_E2E_GUARD_FAILED: Playwright 未执行任何场景（仅 skipped），不得记录通过证据。');
    return 1;
  }

  writeEvidence(repoPath, {
    status: 'passed',
    repo: ctx.repo,
    repoPath: path.resolve(repoPath),
    fingerprint: ctx.fingerprint,
    impactedFiles: ctx.files,
    commandExecutable: command[0],
    commandArgumentCount: command.length - 1,
    startedAt,
    ts: new Date().toISOString(),
  });
  console.log(`PAGE_CHANGE_E2E_GUARD_RECORDED: repo=${ctx.repo} files=${ctx.files.length} fingerprint=${ctx.fingerprint}`);
  return 0;
}

function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  if (!cmd) usage();
  const repoPath = path.resolve(opts.repoPath);
  let exitCode;
  if (cmd === 'check') exitCode = check(repoPath);
  else if (cmd === 'record') exitCode = record(repoPath, opts.command);
  else if (cmd === 'status') { status(repoPath); exitCode = 0; }
  else usage();
  process.exitCode = exitCode;
}

try {
  main();
} catch (error) {
  console.error(`PAGE_CHANGE_E2E_GUARD_ERROR: ${error.message}`);
  process.exitCode = 1;
}
