#!/usr/bin/env node
// 部署后 E2E 分层定级引擎(ADR-045 P1)
// 输入改动文件清单 → 判定 tier(L0/L1/L2)+ playwright --grep 过滤 + 定级理由
//
// 用法:
//   node tier-decide.mjs --base <ref> --head <ref> [--first-publish] [--config <path>]
//   node tier-decide.mjs --files "a.ts\nb.ts" [--first-publish]
//   node tier-decide.mjs --self-test
//
// 输出:JSON { tier, modules, grep, reason } + ADO setvariable(E2E_TIER / E2E_GREP)
//
// 两个保险(ADR-045,强制):① L0 永远跑(本引擎只决定 L0 之上加什么)② 判不准默认 L2。
// 仓内可放 pipeline-e2e/tier-config.json 覆盖默认(sharedLayer / moduleRoots / appCodeRoot)。

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_CONFIG = {
  // 命中即 L2(blast radius 宽,跨切面回归源)
  sharedLayer: [
    '^src/components/', '^src/v2/', '^src/layouts/', '^src/locales/',
    '(^|/)routes?[./]', '(^|/)router[./]', 'src/services/(request|http|axios)',
    '^package\\.json$', '^pnpm-lock', '^vite\\.config', 'src/theme', 'tokens\\.css',
    '(^|/)App\\.(jsx?|tsx?)$', '(^|/)main\\.(jsx?|tsx?)$',
  ],
  // <module> 所在根:src/views/<module>/ | src/pages/<module>/
  moduleRoots: ['src/views/', 'src/pages/'],
  // 前端业务代码根(diff 全落此外 = 非业务改动,L0 即可)
  appCodeRoot: ['src/', 'public/'],
};

function loadConfig(path) {
  if (path && existsSync(path)) {
    try { return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(path, 'utf8')) }; }
    catch { /* 配置坏 → 用默认(保守) */ }
  }
  return DEFAULT_CONFIG;
}

function getChangedFiles(args) {
  if (args.files != null) {
    return args.files.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  const base = args.base || 'HEAD~1';
  const head = args.head || 'HEAD';
  const out = execSync(`git diff --name-only ${base} ${head}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// 核心定级
export function decide(files, cfg = DEFAULT_CONFIG, firstPublish = false) {
  if (firstPublish) {
    return { tier: 'L2', modules: [], grep: '', reason: '首发(强制全量逐页)' };
  }
  if (files.length === 0) {
    return { tier: 'L0', modules: [], grep: '', reason: '无改动文件(仅 floor)' };
  }
  const shared = files.filter((f) => cfg.sharedLayer.some((re) => new RegExp(re).test(f)));
  if (shared.length > 0) {
    return { tier: 'L2', modules: [], grep: '', reason: `命中共享层(blast radius 宽):${shared.slice(0, 5).join(', ')}` };
  }
  // 业务代码改动文件(落在 appCodeRoot)
  const appFiles = files.filter((f) => cfg.appCodeRoot.some((r) => f.startsWith(r)));
  if (appFiles.length === 0) {
    return { tier: 'L0', modules: [], grep: '', reason: '无业务代码改动(仅配置/文档,floor 兜底)' };
  }
  // 尝试把每个业务文件映射到模块
  const modules = new Set();
  let unmapped = false;
  for (const f of appFiles) {
    const root = cfg.moduleRoots.find((r) => f.startsWith(r));
    if (!root) { unmapped = true; continue; }
    const rest = f.slice(root.length);
    const mod = rest.split('/')[0];
    if (mod) modules.add(mod); else unmapped = true;
  }
  if (unmapped || modules.size === 0) {
    return { tier: 'L2', modules: [...modules], grep: '', reason: '业务改动无法映射到模块(判不准默认全量)' };
  }
  const mods = [...modules];
  const grep = mods.map((m) => `@module:${m}`).join('|');
  return { tier: 'L1', modules: mods, grep, reason: `定向模块:${mods.join(', ')}` };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--self-test') a.selfTest = true;
    else if (k === '--first-publish') a.firstPublish = true;
    else if (k.startsWith('--')) { a[k.slice(2)] = argv[i + 1]; i++; }
  }
  return a;
}

function selfTest() {
  const cases = [
    { f: ['src/views/org/list.tsx'], exp: 'L1' },
    { f: ['src/views/org/a.tsx', 'src/views/auth/b.tsx'], exp: 'L1' },
    { f: ['src/components/Table.tsx'], exp: 'L2' },
    { f: ['src/v2/AutoHeightProTable.tsx'], exp: 'L2' },
    { f: ['src/locales/zh-CN.json'], exp: 'L2' },
    { f: ['src/router/index.ts'], exp: 'L2' },
    { f: ['package.json'], exp: 'L2' },
    { f: ['vite.config.ts'], exp: 'L2' },
    { f: ['src/App.tsx'], exp: 'L2' },
    { f: ['src/services/request.ts'], exp: 'L2' },
    { f: ['src/views/org/x.tsx', 'src/utils/helper.ts'], exp: 'L2' }, // 含未映射业务文件 → 保守 L2
    { f: ['README.md'], exp: 'L0' },
    { f: ['docs/x.md'], exp: 'L0' },
    { f: [], exp: 'L0' },
    { f: ['anything'], exp: 'L2', fp: true }, // 首发强制
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const r = decide(c.f, DEFAULT_CONFIG, !!c.fp);
    const ok = r.tier === c.exp;
    ok ? pass++ : fail++;
    console.log(`${ok ? '✓' : '✗ FAIL'}  [${c.f.join(',') || '(空)'}]${c.fp ? ' +首发' : ''} → ${r.tier} (期望 ${c.exp}) — ${r.reason}`);
  }
  console.log(`\n结果: ${pass} 过 / ${fail} 挂`);
  process.exit(fail ? 1 : 0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  const cfg = loadConfig(args.config);
  const files = getChangedFiles(args);
  const r = decide(files, cfg, !!args.firstPublish);
  // 人读日志
  console.log(`[tier-decide] tier=${r.tier} | ${r.reason}`);
  if (r.modules.length) console.log(`[tier-decide] modules=${r.modules.join(', ')} grep="${r.grep}"`);
  console.log(JSON.stringify(r));
  // ADO 变量(下游 step 用:L1 跑 --grep "$E2E_GREP" + 核心 floor;L2 全量;L0 仅 floor)
  console.log(`##vso[task.setvariable variable=E2E_TIER]${r.tier}`);
  console.log(`##vso[task.setvariable variable=E2E_GREP]${r.grep}`);
}

main();
