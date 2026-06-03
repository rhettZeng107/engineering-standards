#!/usr/bin/env node
/**
 * lsp-nav — 基于 Roslyn LSP 的 C# 代码语义导航 CLI,跨平台(Win/macOS/Linux)。
 *
 *  - 多实例:每个 .sln 一个独立 bridge(独立端口+状态目录),多项目可并存。
 *  - 智能路由:查询命令按 --file 自动匹配所属 solution 实例,或用 --project 指定。
 *  - 按符号名查:find / callers 直接用符号名,免手算 0-based 行列。
 *  - doctor:跨平台环境自检(新机/Mac 首次用先跑它)。
 *  - 向后兼容:旧的 行/列 命令照常可用。
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TOOL_DIR = __dirname;
const STATE_DIR = path.join(TOOL_DIR, '.state');
const BRIDGE_HOST = '127.0.0.1';

// --- 路径/格式化工具(跨平台) ---

function uriToPath(uri) {
    if (!uri.startsWith('file://')) return uri;
    let p = decodeURIComponent(uri.replace(/^file:\/\//, '')); // 去掉 scheme,留 /C:/x 或 /Users/x
    if (process.platform === 'win32') {
        if (/^\/[A-Za-z]:/.test(p)) p = p.substring(1); // /C:/x → C:/x
        return p.replace(/\//g, '\\');
    }
    return p; // POSIX:/Users/x
}

function formatLocation(loc) {
    const uri = loc.targetUri || loc.uri || '';
    const range = loc.targetSelectionRange || loc.targetRange || loc.range || {};
    const line = (range.start?.line ?? 0) + 1;
    const col = (range.start?.character ?? 0) + 1;
    return `${uriToPath(uri)}:${line}:${col}`;
}

const KIND_NAMES = {
    1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class', 6: 'Method',
    7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum', 11: 'Interface', 12: 'Function',
    13: 'Variable', 14: 'Constant', 15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array',
    19: 'Object', 20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
    25: 'Operator', 26: 'TypeParameter',
};
const DEFINABLE_KINDS = new Set([5, 6, 7, 8, 9, 10, 11, 12, 23, 24]);

function formatSymbols(symbols, indent = 0) {
    const lines = [];
    for (const sym of symbols) {
        const kind = KIND_NAMES[sym.kind] || 'Unknown';
        const range = sym.range || sym.location?.range || {};
        const line = (range.start?.line ?? 0) + 1;
        lines.push(`${'  '.repeat(indent)}${sym.name || '?'} [${kind}] (line ${line})`);
        if (sym.children?.length) lines.push(formatSymbols(sym.children, indent + 1));
    }
    return lines.join('\n');
}

// --- 多实例注册表 ---

function instanceKey(projectPath) {
    const base = path.basename(projectPath).replace(/\.(sln|csproj)$/i, '');
    const hash = crypto.createHash('sha1').update(path.resolve(projectPath).toLowerCase()).digest('hex').substring(0, 6);
    return `${base}-${hash}`;
}
function instanceDir(key) { return path.join(STATE_DIR, key); }
function readPort(key) {
    try { return parseInt(fs.readFileSync(path.join(instanceDir(key), 'bridge.port'), 'utf-8').trim()); }
    catch { return null; }
}
function readMeta(key) {
    try { return JSON.parse(fs.readFileSync(path.join(instanceDir(key), 'meta.json'), 'utf-8')); }
    catch { return null; }
}

async function listInstances() {
    if (!fs.existsSync(STATE_DIR)) return [];
    const out = [];
    for (const key of fs.readdirSync(STATE_DIR)) {
        const dir = instanceDir(key);
        if (!fs.statSync(dir).isDirectory()) continue;
        const port = readPort(key);
        const meta = readMeta(key);
        out.push({ key, port, project: meta?.project || null, alive: port ? await ping(port) : false });
    }
    return out;
}

function ping(port) {
    return new Promise((resolve) => {
        if (!port) { resolve(false); return; }
        const socket = net.createConnection(port, BRIDGE_HOST);
        const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
        socket.on('connect', () => socket.write(JSON.stringify({ command: 'status' }) + '\n'));
        let buf = '';
        socket.on('data', (d) => { buf += d.toString(); if (buf.includes('"ok"')) { clearTimeout(timer); socket.end(); resolve(true); } });
        socket.on('error', () => { clearTimeout(timer); resolve(false); });
        socket.on('close', () => { clearTimeout(timer); resolve(false); });
    });
}

async function resolveInstance(args) {
    const instances = (await listInstances()).filter(i => i.alive);
    if (args.project) {
        const key = instanceKey(path.resolve(args.project));
        const found = instances.find(i => i.key === key);
        if (!found) throw new Error(`该项目无运行中的 bridge:${args.project}(先 start --project)`);
        return found;
    }
    if (instances.length === 0) throw new Error('无运行中的 bridge。先:node lsp-nav.js start --project <sln>');
    if (instances.length === 1) return instances[0];
    if (args.file) {
        const f = path.resolve(args.file).toLowerCase();
        const match = instances.find(i => i.project && f.startsWith(path.dirname(path.resolve(i.project)).toLowerCase()));
        if (match) return match;
    }
    throw new Error('有多个 bridge 运行,请用 --project 指定:\n' + instances.map(i => `  - ${i.project}`).join('\n'));
}

// --- bridge 生命周期 ---

async function startBridge(projectPath) {
    if (!fs.existsSync(projectPath)) throw new Error(`项目不存在:${projectPath}`);
    if (fs.statSync(projectPath).isDirectory()) {
        const sln = fs.readdirSync(projectPath).find(f => f.toLowerCase().endsWith('.sln'));
        if (!sln) throw new Error(`目录内未找到 .sln:${projectPath}`);
        projectPath = path.join(projectPath, sln);
    }
    const key = instanceKey(projectPath);
    const dir = instanceDir(key);
    fs.mkdirSync(dir, { recursive: true });

    if (await ping(readPort(key))) { console.log(`Bridge 已在运行:${projectPath}`); return; }

    const logStream = fs.openSync(path.join(dir, 'bridge.log'), 'w');
    const child = spawn(process.execPath, [path.join(TOOL_DIR, 'lsp-bridge.js'), '_bridge', projectPath, dir], {
        detached: true, stdio: ['ignore', logStream, logStream], windowsHide: true,
    });
    child.unref();
    fs.writeFileSync(path.join(dir, 'bridge.pid'), String(child.pid));
    console.log(`Bridge 启动中(PID ${child.pid})...`);
    console.log(`项目:${projectPath}`);
    console.log(`日志:${path.join(dir, 'bridge.log')}`);

    for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const port = readPort(key);
        if (port && await ping(port)) {
            try {
                const st = await sendCommand(port, { command: 'status' });
                if (st.projectLoaded) { console.log(`Bridge 就绪,端口 ${port}(项目已加载)。`); return; }
            } catch {}
            if (i > 5) { console.log(`Bridge 就绪,端口 ${port}(项目仍在后台加载)。`); return; }
        }
    }
    console.log('警告:bridge 未响应,请查日志。');
}

function stopOne(key, project) {
    const dir = instanceDir(key);
    let pid = 0;
    try { pid = parseInt(fs.readFileSync(path.join(dir, 'bridge.pid'), 'utf-8').trim() || '0'); } catch {}
    if (pid) {
        try {
            if (process.platform === 'win32') execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            else process.kill(pid, 'SIGTERM');
        } catch {}
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    console.log(`已停止:${project || key}(PID ${pid || '?'})`);
}

async function stopBridge(args) {
    const instances = await listInstances();
    if (args.all) {
        if (!instances.length) { console.log('无 bridge 运行。'); return; }
        for (const i of instances) stopOne(i.key, i.project);
        return;
    }
    if (args.project) { stopOne(instanceKey(path.resolve(args.project)), args.project); return; }
    const alive = instances.filter(i => i.alive);
    if (alive.length === 0) { console.log('无 bridge 运行。'); return; }
    if (alive.length === 1) { stopOne(alive[0].key, alive[0].project); return; }
    console.log('有多个 bridge,请用 --project <sln> 或 --all:');
    alive.forEach(i => console.log(`  - ${i.project}`));
}

async function bridgeStatus() {
    const instances = await listInstances();
    if (!instances.length) { console.log('无 bridge 实例。'); return; }
    for (const i of instances) {
        if (!i.alive) { console.log(`✗ ${i.project || i.key}(已停止/残留)`); continue; }
        let extra = '';
        try {
            const st = await sendCommand(i.port, { command: 'status' });
            extra = ` initialized=${st.initialized} loaded=${st.projectLoaded}`;
        } catch {}
        console.log(`✓ ${i.project}  [port ${i.port}]${extra}`);
    }
}

// --- 环境自检(跨平台,新机/Mac 首次先跑) ---

function cmdDoctor() {
    const { findLSPServer, vscodeUserDir } = require('./lsp-bridge');
    console.log('lsp-nav doctor — 环境自检\n');
    console.log(`平台:${process.platform}  架构:${process.arch}  Node:${process.version}`);
    console.log(`Home:${os.homedir()}`);
    console.log(`VS Code User 目录:${vscodeUserDir()}  ${fs.existsSync(vscodeUserDir()) ? '✓' : '✗ 未找到'}`);

    let dep = false;
    try { require.resolve('vscode-jsonrpc/node'); dep = true; } catch {}
    console.log(`依赖 vscode-jsonrpc:${dep ? '✓ 已安装' : '✗ 缺失 — 在本目录跑 npm install'}`);

    const info = findLSPServer();
    if (!info) {
        console.log('Roslyn LSP:✗ 未找到');
        console.log('  → 需安装 VS Code + C# / C# Dev Kit 扩展(自动下载 Roslyn DLL + .NET 10 runtime)');
        return;
    }
    if (info.type === 'roslyn') {
        console.log('Roslyn LSP:✓ 找到');
        console.log(`  dotnet runtime:${info.dotnetExe}`);
        console.log(`  Roslyn DLL    :${info.dllPath}`);
    } else {
        console.log(`LSP 类型:${info.type}(OmniSharp 兜底,不推荐;装 C# 扩展以用 Roslyn)`);
    }
    console.log(`\n结论:${dep && info.type === 'roslyn' ? '✓ 环境就绪,可直接 start --project <sln>' : '⚠ 见上面缺失项'}`);
}

// --- 命令发送 ---

function sendCommand(port, cmd) {
    return new Promise((resolve, reject) => {
        if (!port) { reject(new Error('bridge 端口未知(未运行?)')); return; }
        const socket = net.createConnection(port, BRIDGE_HOST, () => socket.write(JSON.stringify(cmd) + '\n'));
        let data = '';
        socket.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('\n')) {
                socket.end();
                try { const resp = JSON.parse(data.trim()); resp.ok ? resolve(resp.result) : reject(new Error(resp.error)); }
                catch (e) { reject(new Error(`解析失败:${data.substring(0, 200)}`)); }
            }
        });
        socket.on('error', (err) => reject(new Error(`连接 bridge 失败:${err.message}`)));
        socket.setTimeout(120000, () => { socket.destroy(); reject(new Error('命令超时(120s)')); });
    });
}

// --- 位置型命令(行/列,0-based,向后兼容) ---

async function cmdDefinition(args) {
    const inst = await resolveInstance(args);
    const r = await sendCommand(inst.port, { command: 'definition', file: path.resolve(args.file), line: args.line, col: args.col });
    const locs = Array.isArray(r) ? r : (r ? [r] : []);
    if (!locs.length) return console.log('未找到定义。');
    locs.forEach(l => console.log(formatLocation(l)));
}

async function cmdReferences(args) {
    const inst = await resolveInstance(args);
    const r = await sendCommand(inst.port, { command: 'references', file: path.resolve(args.file), line: args.line, col: args.col });
    printRefs(Array.isArray(r) ? r : [], args.json);
}

async function cmdHover(args) {
    const inst = await resolveInstance(args);
    const r = await sendCommand(inst.port, { command: 'hover', file: path.resolve(args.file), line: args.line, col: args.col });
    if (!r) return console.log('无悬停信息。');
    const c = r.contents;
    if (Array.isArray(c)) c.forEach(x => console.log(typeof x === 'object' ? (x.value || '') : x));
    else console.log(typeof c === 'object' ? (c.value || '') : c);
}

async function cmdSymbols(args) {
    const inst = await resolveInstance(args);
    const r = await sendCommand(inst.port, { command: 'symbols', file: path.resolve(args.file) });
    const syms = Array.isArray(r) ? r : [];
    console.log(syms.length ? formatSymbols(syms) : '无符号。');
}

async function cmdImplementation(args) {
    const inst = await resolveInstance(args);
    const r = await sendCommand(inst.port, { command: 'implementation', file: path.resolve(args.file), line: args.line, col: args.col });
    const locs = Array.isArray(r) ? r : (r ? [r] : []);
    if (!locs.length) return console.log('未找到实现。');
    locs.forEach(l => console.log(formatLocation(l)));
}

// --- 按符号名命令(免手算行列) ---

function splitName(raw) {
    const parts = raw.split('.');
    const bare = parts.pop();
    return { bare, container: parts.length ? parts.join('.') : null };
}

async function findSymbols(inst, name) {
    const r = await sendCommand(inst.port, { command: 'workspace_symbols', query: name });
    return (Array.isArray(r) ? r : []).filter(s => s.location?.uri);
}

async function cmdFind(args) {
    const raw = args._[0] || args.query;
    if (!raw) return console.log('用法:find <符号名>');
    const { bare, container } = splitName(raw);
    const inst = await resolveInstance(args);
    let syms = await findSymbols(inst, bare);
    if (container) syms = syms.filter(s => (s.containerName || '').includes(container)); // containerName 可能被本地化装饰
    if (!syms.length) return console.log('未找到符号。');
    syms.forEach(s => console.log(`${s.name} [${KIND_NAMES[s.kind] || s.kind}]${s.containerName ? ' in ' + s.containerName : ''} -> ${formatLocation(s.location)}`));
}

async function cmdCallers(args) {
    const raw = args._[0] || args.query;
    if (!raw) return console.log('用法:callers <符号名>(支持 类名.方法名)');
    const { bare, container } = splitName(raw);
    const inst = await resolveInstance(args);
    const syms = (await findSymbols(inst, bare))
        .filter(s => s.name === bare && DEFINABLE_KINDS.has(s.kind) && (!container || (s.containerName || '').includes(container)));
    if (!syms.length) return console.log(`未找到可解析的定义符号:${raw}(试试 find ${bare} 看候选)`);

    for (const s of syms) {
        const file = uriToPath(s.location.uri);
        const pos = s.location.range.start;
        const owner = s.containerName ? `${s.containerName}.` : '';
        console.log(`\n# ${owner}${s.name} [${KIND_NAMES[s.kind] || s.kind}] @ ${file}:${pos.line + 1}`);
        const r = await sendCommand(inst.port, { command: 'references', file, line: pos.line, col: pos.character });
        printRefs(Array.isArray(r) ? r : [], args.json);
    }
}

function printRefs(locs, asJson) {
    if (asJson) { console.log(JSON.stringify(locs.map(formatLocation), null, 2)); return; }
    if (!locs.length) return console.log('未找到引用。');
    locs.forEach(l => console.log(formatLocation(l)));
    console.log(`\n(${locs.length} 处引用)`);
}

// --- 参数解析 ---

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].substring(2);
            const next = argv[i + 1];
            if (key === 'json' || key === 'all') args[key] = true;
            else if (next !== undefined && !next.startsWith('--')) { args[key] = isNaN(next) ? next : Number(next); i++; }
            else args[key] = true;
        } else args._.push(argv[i]);
    }
    return args;
}

function printHelp() {
    console.log(`
lsp-nav — Roslyn LSP C# 代码语义导航(跨平台,支持多 sln 并存)

环境:
  doctor                        环境自检(新机/Mac 首次先跑)

bridge 管理:
  start --project <sln|dir>     为某 solution 启动 bridge
  stop [--project <sln>|--all]  停止某个/全部 bridge
  status                        列出所有 bridge 实例

按符号名(推荐,免算行列):
  find <name> [--project <sln>]      搜索符号(支持 类名.方法名)
  callers <name> [--project <sln>]   按名找定义并列出所有引用(多态精确消歧)

按 行/列(0-based,向后兼容):
  definition / references / hover / implementation --file <f> --line <n> --col <n>
  symbols --file <f>

通用选项:
  --project <sln>   多实例时指定目标(单实例或带 --file 可省略,自动路由)
  --json            references/callers 以 JSON 输出
`);
}

async function main() {
    const argv = process.argv.slice(2);
    if (!argv.length) return printHelp();
    const command = argv[0];
    const args = parseArgs(argv.slice(1));
    switch (command) {
        case 'doctor': cmdDoctor(); break;
        case 'start':
            if (!args.project) { console.error('需要 --project <sln|dir>'); process.exit(1); }
            await startBridge(path.resolve(args.project)); break;
        case 'stop': await stopBridge(args); break;
        case 'status': await bridgeStatus(); break;
        case 'definition': await cmdDefinition(args); break;
        case 'references': await cmdReferences(args); break;
        case 'hover': await cmdHover(args); break;
        case 'symbols': await cmdSymbols(args); break;
        case 'workspace-symbols': case 'find': await cmdFind(args); break;
        case 'callers': await cmdCallers(args); break;
        case 'implementation': await cmdImplementation(args); break;
        default: console.error(`未知命令:${command}`); printHelp(); process.exit(1);
    }
}

main().catch((err) => { console.error(`Error: ${err.message}`); process.exit(1); });
