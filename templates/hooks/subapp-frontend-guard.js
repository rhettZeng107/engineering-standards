#!/usr/bin/env node
/**
 * Subapp Frontend Guard — BP 子应用前端迁移/接入机械自检(ADR-012 SOP 修订段)
 *
 * 沉淀来源:SRMV2 Contract 迁移踩坑(每菜单同页 = 漏 postMessage 路由同步;
 * 执行/付款/模板网络异常 = service 漏 baseURL,dev proxy 兜底掩盖、production iframe 暴露)。
 *
 * 两种模式:
 *  1. Hook 模式(PostToolUse Edit/Write/MultiEdit,无参数 + stdin):
 *     编辑子应用前端关键文件(service / App / index / layout)后即时检查,缺失输出 stderr 警告(不 deny)。
 *  2. CLI 模式(node subapp-frontend-guard.js --check [repoDir]):
 *     全仓 4 项检查;有 FAIL 退出码非 0(可挂 CI / 验收前必跑)。
 *
 * 仅对「BP 子应用前端仓」生效(判定:仓内存在 public/menu-manifest*.json);非子应用仓静默跳过。
 *
 * 检查项:
 *   ① service baseURL 全覆盖(request.js 无默认 baseURL 时,每个 service 必须显式 baseURL/VITE_)
 *   ② postMessage 路由同步监听(addEventListener('message') + 'subapp-router-change')
 *   ③ 嵌入模式隐藏 chrome(层级感知:渲染外壳的 layout 必须同文件按 isEmbedded 门控,presence-only 不算)
 *   ④ E2E production-like(存在打 BP 8002 / 业务门户的验收脚本,非纯 localhost)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ---------- 工具 ----------
function findRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// menu-manifest 子应用(向 BP 发布菜单清单,如合同域)— ①②④ 契约检查的范围
function isSubAppRepo(repoRoot) {
  if (!repoRoot) return false;
  const pubDir = path.join(repoRoot, 'public');
  if (!fs.existsSync(pubDir)) return false;
  try {
    return fs.readdirSync(pubDir).some((f) => /^menu-manifest.*\.json$/i.test(f));
  } catch (_) { return false; }
}

// Wujie 子应用(src 入口处理 __POWERED_BY_WUJIE__ / window.$wujie)— ③ 嵌入外壳门控的范围。
// 采购域是 Wujie 子应用但不发布 menu-manifest,只靠 isSubAppRepo 会整体漏检(踩坑点)。
function isWujieSubApp(repoRoot) {
  if (!repoRoot) return false;
  if (isSubAppRepo(repoRoot)) return true;
  for (const p of ['src/index.jsx', 'src/index.js', 'src/index.tsx', 'src/main.jsx', 'src/main.js', 'src/main.tsx']) {
    const c = read(path.join(repoRoot, p));
    if (/__POWERED_BY_WUJIE__|window\.\$wujie/.test(c)) return true;
  }
  return false;
}

function listFiles(dir, exts, acc = [], depth = 0) {
  if (depth > 8 || !fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'build' || ent.name === 'dist' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, exts, acc, depth + 1);
    else if (exts.some((e) => ent.name.endsWith(e))) acc.push(full);
  }
  return acc;
}

function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; } }

// ---------- 检查逻辑 ----------
// request.js 的 axios 实例是否设了默认 baseURL(设了则 service 不必各自传)
function hasDefaultBaseURL(repoRoot) {
  for (const p of ['src/utils/request.js', 'src/utils/http.js', 'src/utils/request.ts']) {
    const c = read(path.join(repoRoot, p));
    if (!c) continue;
    // axios.create({ ... baseURL ... }) 或 instance.defaults.baseURL =
    if (/axios\.create\s*\(\s*\{[^}]*baseURL/s.test(c)) return true;
    if (/\.defaults\.baseURL\s*=/.test(c)) return true;
  }
  return false;
}

// 单个 service 文件是否每个 request 调用都有 baseURL(或文件级 VITE_/baseURL 前缀)
function serviceMissingBaseURL(content) {
  const hasRequestCall = /\brequest\s*\(/.test(content);
  if (!hasRequestCall) return false;
  const hasBaseURL = /baseURL\s*:/.test(content);
  const hasViteUrl = /import\.meta\.env\.VITE_|process\.env\.VITE_/.test(content);
  // 用字符串拼接 url(如 fixurl + 'xxx')也算指向后端
  const hasUrlConcat = /url\s*:\s*[`'"]?\s*\$\{|url\s*:\s*\w+\s*\+/.test(content);
  return !(hasBaseURL || hasViteUrl || hasUrlConcat);
}

function checkServices(repoRoot) {
  const svcDir = path.join(repoRoot, 'src', 'service');
  if (!fs.existsSync(svcDir)) return { skip: true, missing: [] };
  if (hasDefaultBaseURL(repoRoot)) return { skip: true, missing: [] }; // 有默认 baseURL,service 不必各自传
  const files = listFiles(svcDir, ['.js', '.ts']);
  const missing = files.filter((f) => serviceMissingBaseURL(read(f))).map((f) => path.relative(repoRoot, f));
  return { skip: false, missing };
}

function checkPostMessageRouter(repoRoot) {
  const files = listFiles(path.join(repoRoot, 'src'), ['.js', '.jsx', '.ts', '.tsx']);
  return files.some((f) => {
    const c = read(f);
    return /addEventListener\s*\(\s*['"]message['"]/.test(c) && /subapp-router-change/.test(c);
  });
}

// 文件是否渲染应用自带外壳(antd Header+Sider 或 退出登录组件)
function rendersChrome(content) {
  const hasHeaderSider = /<Header[\s>]/.test(content) && /<Sider[\s>]/.test(content);
  const hasLogout = /<Logout[\s/>]|退出登录|退出登陆/.test(content);
  return hasHeaderSider || hasLogout;
}

// 文件内是否有嵌入判断门控(__POWERED_BY_WUJIE__ / self!==top / isEmbedded)
function hasEmbeddedGate(content) {
  return /__POWERED_BY_WUJIE__|window\.self\s*!==\s*window\.top|isEmbedded/.test(content);
}

// 找 layout 文件(按路径/文件名含 layout 收敛,避免误伤业务卡片里的小 Header)
function findLayoutFiles(repoRoot) {
  const files = listFiles(path.join(repoRoot, 'src'), ['.js', '.jsx', '.ts', '.tsx']);
  return files.filter((f) => {
    const norm = f.replace(/\\/g, '/');
    return /\/layout[/.]/i.test(norm) || /layout/i.test(path.basename(f));
  });
}

// 检查 ③(层级感知):layout 层渲染了外壳(Header/Sider/退出登录),则该层必须有 embedded 门控。
// 判定到「层」而非「单文件」—— 父子拆分(index 门控 + HeaderContent/Sider 渲染)是常态,逐文件要求自带门控会误报。
// presence-only(token 仅在 index 入口出现)不算 —— 采购踩坑:index.jsx 有 token 但整个 layout 层无门控,误判通过。
// 例外:加注释 // embedded-gated-by-parent 视为已门控。
function checkEmbedChrome(repoRoot) {
  const chromeFiles = [];
  let layerGated = false;
  for (const f of findLayoutFiles(repoRoot)) {
    const c = read(f);
    if (/embedded-gated-by-parent/.test(c) || hasEmbeddedGate(c)) layerGated = true;
    if (rendersChrome(c)) chromeFiles.push(path.relative(repoRoot, f));
  }
  // 外壳存在但 layout 层无任何门控 → 漏
  const ok = chromeFiles.length === 0 || layerGated;
  return { ok, offenders: ok ? [] : chromeFiles };
}

function checkE2EProd(repoRoot) {
  const e2eDir = path.join(repoRoot, 'e2e');
  if (!fs.existsSync(e2eDir)) return { hasBpE2E: false, prodOk: false };
  const files = listFiles(e2eDir, ['.spec.js', '.spec.ts']);
  const bpFiles = files.filter((f) => /:8002|业务门户|BpApps|逐菜单|BP /.test(read(f)));
  if (bpFiles.length === 0) return { hasBpE2E: false, prodOk: false };
  // 有 BP 验收脚本且引用了非 localhost 的 IP/域名
  const prodOk = bpFiles.some((f) => /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(read(f)));
  return { hasBpE2E: true, prodOk };
}

// ---------- CLI 全仓检查 ----------
function runFullCheck(repoDir) {
  const repoRoot = findRepoRoot(repoDir);
  const menuSubApp = isSubAppRepo(repoRoot);
  const wujieSubApp = isWujieSubApp(repoRoot);
  if (!menuSubApp && !wujieSubApp) {
    console.log('[subapp-guard] 非 BP / 非 Wujie 子应用前端仓,跳过。');
    process.exit(0);
  }
  const fails = [];
  const warns = [];

  // ③ 嵌入外壳门控 —— 任何 Wujie 子应用都查(采购无 menu-manifest 但仍是 Wujie 子应用)
  const embed = checkEmbedChrome(repoRoot);
  if (!embed.ok) {
    fails.push('③ layout 渲染了自带外壳(Header/Sider/退出登录)却缺 embedded 门控 — BP 嵌入时双层外框 + 空 Sider 留白 + 多余退出登录:\n   - ' + embed.offenders.join('\n   - ') + '\n   修:照 AI.REACT.SRM.Contract.2/src/layout/index.jsx 的 isEmbedded 模式,嵌入时不渲染 Header/Sider/Logout');
  }

  // ①②④ service/router/E2E 契约 —— menu-manifest 子应用才查
  if (menuSubApp) {
    const svc = checkServices(repoRoot);
    if (!svc.skip && svc.missing.length) {
      fails.push(`① service 漏 baseURL(request.js 无默认 baseURL,以下 service 未显式指向后端):\n   - ${svc.missing.join('\n   - ')}`);
    }
    if (!checkPostMessageRouter(repoRoot)) {
      fails.push("② 缺 postMessage 路由同步监听(addEventListener('message') + 'subapp-router-change')— BP 点菜单将停在同一页");
    }
    const e2e = checkE2EProd(repoRoot);
    if (!e2e.hasBpE2E) warns.push('④ 无 BP 验收 E2E 脚本(应有真实 BP iframe 逐菜单验收)');
    else if (!e2e.prodOk) warns.push('④ BP 验收 E2E 只打 localhost(应 production-like,禁 dev proxy 假通过)');
  }

  console.log(`\n=== Subapp Frontend Guard: ${path.basename(repoRoot)} ===`);
  if (fails.length === 0 && warns.length === 0) { console.log('✅ 全部通过(① service baseURL ② postMessage 路由 ③ 嵌入 chrome ④ E2E production)'); process.exit(0); }
  fails.forEach((f) => console.log('❌ ' + f));
  warns.forEach((w) => console.log('⚠️  ' + w));
  console.log('\n参见 ADR-012 修订段 + standards/subapp-onboarding-guide.md v1.2 + subapp-migration-checklist.md');
  process.exit(fails.length ? 2 : 0);
}

// ---------- Hook 模式(即时 warn) ----------
function runHook() {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let data; try { data = JSON.parse(raw); } catch (_) { process.exit(0); }
    const tool = String(data.tool_name || '').toLowerCase();
    if (!['edit', 'write', 'multiedit'].includes(tool)) process.exit(0);
    const filePath = (data.tool_input || {}).file_path || '';
    const norm = filePath.replace(/\\/g, '/');
    if (/_template|_archive/.test(norm)) process.exit(0);

    const repoRoot = findRepoRoot(path.dirname(filePath));
    const menuSubApp = isSubAppRepo(repoRoot);
    if (!menuSubApp && !isWujieSubApp(repoRoot)) process.exit(0);

    const msgs = [];
    // ①② service/router 即时检查 —— menu-manifest 子应用才查
    if (menuSubApp && /\/src\/service\/[^/]+\.(js|ts)$/.test(norm) && !hasDefaultBaseURL(repoRoot)) {
      if (serviceMissingBaseURL(read(filePath))) {
        msgs.push(`service ${path.basename(filePath)} 的 request 调用疑似漏 baseURL(request.js 无默认 baseURL)。`);
        msgs.push('  dev proxy 会兜底掩盖,production iframe 必报「网络异常」。补 baseURL: import.meta.env.VITE_Url(参考 purchase.js)。');
      }
    }
    if (menuSubApp && (/\/src\/(App|index|main)\.(jsx?|tsx?)$/.test(norm) || /react-router/.test(norm))) {
      if (!checkPostMessageRouter(repoRoot)) {
        msgs.push("子应用缺 postMessage 路由同步监听('subapp-router-change')— BP 点菜单会停在同一页。");
        msgs.push('  在 React Router 内挂监听桥(参考 MDM App.jsx / SubAppRouterBridge.jsx)。');
      }
    }
    // 编辑 layout 文件 → 查是否渲染外壳却缺 embedded 门控
    if (/\/layout[/.]/i.test(norm) || /layout[^/]*\.(jsx?|tsx?)$/i.test(path.basename(filePath))) {
      const c = read(filePath);
      if (!/embedded-gated-by-parent/.test(c) && rendersChrome(c) && !hasEmbeddedGate(c)) {
        msgs.push('layout 渲染了自带外壳(Header/Sider/退出登录)却缺 embedded 门控 — BP 嵌入会双层外框 + 留白 + 多余退出登录。');
        msgs.push('  照 AI.REACT.SRM.Contract.2/src/layout/index.jsx 的 isEmbedded 模式:嵌入时不渲染 Header/Sider/Logout。');
      }
    }
    if (msgs.length) {
      process.stderr.write('\n[Subapp Frontend Guard - 警告(ADR-012 SOP)]\n' + msgs.map((m) => '  ' + m).join('\n') + '\n\n');
    }
    process.exit(0);
  });
}

// ---------- 入口 ----------
if (process.argv.includes('--check')) {
  const idx = process.argv.indexOf('--check');
  runFullCheck(process.argv[idx + 1] || process.cwd());
} else {
  runHook();
}

module.exports = { hasDefaultBaseURL, serviceMissingBaseURL, checkPostMessageRouter, checkEmbedChrome, rendersChrome, hasEmbeddedGate, isSubAppRepo };
