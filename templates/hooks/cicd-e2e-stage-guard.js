#!/usr/bin/env node
/**
 * CICD E2E Stage Guard — 前端部署 pipeline 必含 E2E_Verify stage 机械自检
 *
 * 决策/标准:ADR-024(修订)+ standards/cicd-e2e-in-pipeline-standard.md
 * 沉淀来源:SRMV2 部署 10.8 踩坑 — 抄了无 E2E stage 的样板 pipeline,CI 绿 + dev render OK,
 *   但 prod build 上共享 Table 无数组守卫致 10 个菜单点开即崩(ErrorBoundary)。smoke(index 200)漏网。
 *
 * 两种模式:
 *  1. Hook 模式(PostToolUse Write/Edit/MultiEdit,stdin):
 *     编辑前端 azure-pipelines.yml 后,若是前端部署 pipeline 但缺 E2E_Verify stage → stderr 警告(不 deny)。
 *  2. CLI 模式(node cicd-e2e-stage-guard.js --check [repoDir]):
 *     扫仓内前端 azure-pipelines.yml;缺 E2E_Verify stage 或缺 pipeline-e2e/ → FAIL 退出码非 0(挂 CI/验收前)。
 *
 * 仅对「前端部署 pipeline」生效(判定:yaml 含 vite/npm run build/pnpm build + 部署动作 msdeploy/DeployTest);
 * 后端(dotnet publish)/ 非部署 pipeline / 非 yaml 静默跳过。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RE_FRONTEND_BUILD = /\b(vite build|npm run build|pnpm build|yarn build)\b/i;
const RE_DEPLOY = /\b(msdeploy|DeployTest|Web Deploy|deployment:)\b/i;
const RE_BACKEND = /\bdotnet (publish|build)\b/i;
const RE_HAS_E2E = /\b(E2EVerify|E2E_Verify|playwright)\b/i;

function isFrontendDeployPipeline(content) {
  if (!content) return false;
  if (RE_BACKEND.test(content) && !RE_FRONTEND_BUILD.test(content)) return false; // 纯后端
  return RE_FRONTEND_BUILD.test(content) && RE_DEPLOY.test(content);
}

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function evaluate(content, repoRoot) {
  const msgs = [];
  if (!isFrontendDeployPipeline(content)) return msgs; // 非前端部署 pipeline,跳过
  if (!RE_HAS_E2E.test(content)) {
    msgs.push('前端部署 pipeline 缺 E2E_Verify stage(违反 cicd-e2e-in-pipeline-standard)。');
    msgs.push('  smoke(index 200)不验 SPA 渲染;dev render OK ≠ prod 渲染 OK。');
    msgs.push('  修:拷 templates/pipeline-e2e/ 到仓根 + 接 templates/azure-pipelines-e2e-stage.snippet.yml 到 DeployTest 之后。');
  }
  if (repoRoot && !fs.existsSync(path.join(repoRoot, 'pipeline-e2e'))) {
    msgs.push('仓内无 pipeline-e2e/ 目录 — E2E_Verify stage 将无 spec 可跑。拷 templates/pipeline-e2e/。');
  }
  return msgs;
}

// ---------- Hook 模式 ----------
function runHook() {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }
    const ti = input.tool_input || {};
    const file = ti.file_path || ti.path || '';
    if (!/azure-pipelines.*\.ya?ml$/i.test(file)) process.exit(0); // 非 pipeline yaml
    let content = ti.content || '';
    if (!content && fs.existsSync(file)) { try { content = fs.readFileSync(file, 'utf8'); } catch (_) {} }
    const repoRoot = findRepoRoot(path.dirname(file));
    const msgs = evaluate(content, repoRoot);
    if (msgs.length) {
      process.stderr.write('\n[CICD E2E Stage Guard - 警告(cicd-e2e-in-pipeline-standard)]\n' +
        msgs.map((m) => '  ' + m).join('\n') + '\n\n');
    }
    process.exit(0);
  });
}

// ---------- CLI 模式 ----------
function runFullCheck(repoDir) {
  const root = findRepoRoot(repoDir) || path.resolve(repoDir || process.cwd());
  const candidates = ['azure-pipelines.yml', 'azure-pipelines.yaml'];
  let failed = false;
  for (const c of candidates) {
    const p = path.join(root, c);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const msgs = evaluate(content, root);
    if (msgs.length) {
      failed = true;
      process.stderr.write(`\n[FAIL] ${c}:\n` + msgs.map((m) => '  ' + m).join('\n') + '\n');
    } else if (isFrontendDeployPipeline(content)) {
      process.stdout.write(`[OK] ${c} — 含 E2E_Verify stage\n`);
    }
  }
  process.exit(failed ? 1 : 0);
}

// ---------- 入口 ----------
if (process.argv.includes('--check')) {
  const idx = process.argv.indexOf('--check');
  runFullCheck(process.argv[idx + 1] || process.cwd());
} else {
  runHook();
}

module.exports = { isFrontendDeployPipeline, evaluate };
