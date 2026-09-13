#!/usr/bin/env node
// 常规 CI E2E 影响面计算：只输出本次提交命中的 @module 标签。
// 共享文件和菜单路由必须在 tier-config.json 显式声明消费者；未知影响直接失败，禁止回退全菜单。

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = {
  impactMap: [],
  routeImpactMap: [],
  requireImpactMap: [
    '^src/components/', '^src/layouts/', '^src/locales/',
    '(^|/)routes?[./]', '(^|/)router[./]', 'src/services/(request|http|axios)',
    '^package\\.json$', '^pnpm-lock', '^vite\\.config',
    '(^|/)App\\.(jsx?|tsx?)$', '(^|/)main\\.(jsx?|tsx?)$',
  ],
  moduleRoots: ['src/views/', 'src/pages/'],
  appCodeRoot: ['src/', 'public/'],
};

function tagPattern(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `@module:${escaped}(?=$|[^A-Za-z0-9_-])`;
}

function loadConfig(path) {
  const configPath = path || join(scriptDir, 'tier-config.json');
  if (!existsSync(configPath)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(configPath, 'utf8')) };
}

function changedFiles(args) {
  if (args.files != null) {
    return args.files.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  const base = args.base || 'HEAD~1';
  const head = args.head || 'HEAD';
  return execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
    .split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function modulesForRoutePaths(paths, config) {
  const modules = new Set();
  const unmapped = [];
  for (const path of paths) {
    const impact = config.routeImpactMap.find((item) => new RegExp(item.pattern).test(path));
    if (!impact) {
      unmapped.push(path);
      continue;
    }
    (impact.modules || []).forEach((module) => modules.add(module));
  }
  return { modules: [...modules], unmapped };
}

export function parseChangedRoutes(diff) {
  return [...new Set(
    [...diff.matchAll(/^[+-](?![+-]).*manifestPath:\s*['"]([^'"]+)['"]/gm)].map((match) => match[1]),
  )];
}

function changedRouteImpact(files, args, config) {
  const routeFile = 'src/routes.config.mjs';
  if (!files.includes(routeFile) || args.files != null || !args.base || !args.head) {
    return { modules: [], unmapped: [] };
  }
  const diff = execFileSync('git', ['diff', '--unified=0', args.base, args.head, '--', routeFile], { encoding: 'utf8' });
  return modulesForRoutePaths(parseChangedRoutes(diff), config);
}

export function decide(files, config = DEFAULT_CONFIG) {
  const appFiles = files.filter((file) => config.appCodeRoot.some((root) => file.startsWith(root)));
  const modules = new Set();
  const unmapped = [];

  for (const file of appFiles) {
    const impact = config.impactMap.find((item) => new RegExp(item.pattern).test(file));
    if (impact) {
      (impact.modules || []).forEach((module) => modules.add(module));
      continue;
    }
    if (config.requireImpactMap.some((pattern) => new RegExp(pattern).test(file))) {
      unmapped.push(file);
      continue;
    }
    const root = config.moduleRoots.find((item) => file.startsWith(item));
    const module = root ? file.slice(root.length).split('/')[0] : '';
    if (module) modules.add(module);
    else unmapped.push(file);
  }

  const list = [...modules].sort((a, b) => a.localeCompare(b));
  return {
    modules: list,
    grep: list.map(tagPattern).join('|'),
    unmapped,
    reason: appFiles.length === 0
      ? '无业务代码改动，仅跑 @floor'
      : `定向模块:${list.join(', ') || '(无)'}${unmapped.length ? `；未映射:${unmapped.join(', ')}` : ''}`,
  };
}

function explicitModules(value) {
  const modules = [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  return { modules, grep: modules.map(tagPattern).join('|'), unmapped: [], reason: `上游指定模块:${modules.join(', ')}` };
}

function testSourceText(dir) {
  if (!existsSync(dir)) return '';
  let source = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) source += testSourceText(path);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) source += `\n${readFileSync(path, 'utf8')}`;
  }
  return source;
}

function missingModuleTags(modules) {
  const source = testSourceText(join(scriptDir, 'tests'));
  return modules.filter((module) => !new RegExp(tagPattern(module)).test(source));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--self-test') args.selfTest = true;
    else if (key === '--first-publish') args.firstPublish = true;
    else if (key.startsWith('--')) {
      const next = argv[index + 1];
      args[key.slice(2)] = next == null || next.startsWith('--') ? '' : argv[++index];
    }
  }
  return args;
}

function selfTest() {
  const config = {
    ...DEFAULT_CONFIG,
    impactMap: [{ pattern: '^src/services/request\\.ts$', modules: ['Login', 'Orders'] }],
    routeImpactMap: [{ pattern: '^/orders(?:/|$)', modules: ['Orders'] }],
  };
  const cases = [
    { files: ['src/views/orders/index.tsx'], modules: ['orders'], unmapped: 0 },
    { files: ['src/services/request.ts'], modules: ['Login', 'Orders'], unmapped: 0 },
    { files: ['src/components/Table.tsx'], modules: [], unmapped: 1 },
    { files: ['README.md'], modules: [], unmapped: 0 },
  ];
  let failed = 0;
  for (const item of cases) {
    const result = decide(item.files, config);
    const ok = JSON.stringify(result.modules) === JSON.stringify(item.modules)
      && result.unmapped.length === item.unmapped;
    console.log(`${ok ? '✓' : '✗'} ${item.files.join(', ')} -> ${JSON.stringify(result)}`);
    if (!ok) failed++;
  }
  const parsed = parseChangedRoutes("+ { manifestPath: '/orders' }\n- { manifestPath: '/orders/old' }");
  const routeResult = modulesForRoutePaths(parsed, config);
  const routeOk = routeResult.modules.length === 1 && routeResult.modules[0] === 'Orders' && routeResult.unmapped.length === 0;
  console.log(`${routeOk ? '✓' : '✗'} 路由差异 -> ${JSON.stringify(routeResult)}`);
  if (!routeOk) failed++;
  console.log(`结果:${cases.length + 1 - failed} 过 / ${failed} 挂`);
  process.exit(failed ? 1 : 0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  if (args.firstPublish) {
    console.error('[impact-decide] 首发全量必须走独立专项验收，不得混入常规提交 CI');
    process.exit(2);
  }

  const config = loadConfig(args.config);
  let files;
  try {
    files = changedFiles(args);
  } catch (error) {
    console.error(`[impact-decide] git diff 失败:${String(error.message).split('\n')[0]}`);
    process.exit(2);
  }

  const result = args.modules != null ? explicitModules(args.modules) : decide(files, config);
  const routeImpact = changedRouteImpact(files, args, config);
  result.modules = [...new Set([...result.modules, ...routeImpact.modules])].sort((a, b) => a.localeCompare(b));
  result.unmapped.push(...routeImpact.unmapped.map((path) => `route:${path}`));
  result.grep = result.modules.map(tagPattern).join('|');
  if (result.unmapped.length > 0) {
    console.error(`[impact-decide] 存在未映射影响面:${result.unmapped.join(', ')}`);
    process.exit(2);
  }
  if (args.modules != null && result.modules.length === 0) {
    console.error('[impact-decide] e2eOnly 必须提供至少一个 affectedModules');
    process.exit(2);
  }
  const missing = missingModuleTags(result.modules);
  if (missing.length > 0) {
    console.error(`[impact-decide] 缺少对应 E2E 标签:${missing.map((module) => `@module:${module}`).join(', ')}`);
    process.exit(2);
  }

  console.log(`[impact-decide] ${result.reason}`);
  console.log(JSON.stringify(result));
  console.log(`##vso[task.setvariable variable=E2E_GREP]${result.grep}`);
}

main();
