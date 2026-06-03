#!/usr/bin/env node
/**
 * lsp-bridge.js — 常驻 Roslyn LSP 桥接服务(单实例 = 单 sln/csproj),跨平台(Win/macOS/Linux)。
 *
 * 关键设计:
 *  1. initialize 后显式发送 solution/open(或 project/open)。Roslyn 不会自动从
 *     rootUri 加载 .sln,不发这个通知就没有跨项目语义工作区,references/definition/
 *     hover 对跨文件符号全部失败。
 *  2. 等待 workspace/projectInitializationComplete 事件,而非死等固定时长。
 *  3. 状态目录由 CLI 传入(per-instance),支持多 sln 各自一个 bridge 并存。
 *
 * 复用 VS Code C# 扩展自带的 Roslyn DLL + dotnet-runtime 扩展下载的 .NET runtime,
 * 三大平台路径自动发现(见 findLSPServer)。
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { StreamMessageReader, StreamMessageWriter } = require('vscode-jsonrpc/node');

const BRIDGE_HOST = '127.0.0.1';
const LOAD_TIMEOUT = parseInt(process.env.LSP_LOAD_TIMEOUT || '180', 10); // 项目加载就绪最长等待(秒)

// VS Code 用户目录(globalStorage 的父级),跨平台
function vscodeUserDir() {
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
    }
    return path.join(os.homedir(), '.config', 'Code', 'User'); // linux
}

// 自动发现 Roslyn Language Server(VS Code C# 扩展)+ .NET runtime(dotnet-runtime 扩展)
// 返回 { dotnetExe, dllPath, type:'roslyn' } 或 { path, type:'omnisharp' } 或 null
function findLSPServer() {
    const envPath = process.env.CSHARP_LSP_SERVER;
    if (envPath && fs.existsSync(envPath)) {
        return { path: envPath, type: envPath.includes('omnisharp') ? 'omnisharp' : 'roslyn' };
    }

    const dotnetName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
    const dotnetStore = path.join(vscodeUserDir(), 'globalStorage', 'ms-dotnettools.vscode-dotnet-runtime', '.dotnet');
    let dotnetExe = null;
    if (fs.existsSync(dotnetStore)) {
        // 匹配任意 .NET 10.x 目录(arch 自适配:x64 / arm64 / osx-arm64 等),取最新
        const versions = fs.readdirSync(dotnetStore).filter(d => d.startsWith('10.')).sort().reverse();
        for (const ver of versions) {
            const exe = path.join(dotnetStore, ver, dotnetName);
            if (fs.existsSync(exe)) { dotnetExe = exe; break; }
        }
    }

    if (dotnetExe) {
        const extDir = path.join(os.homedir(), '.vscode', 'extensions');
        if (fs.existsSync(extDir)) {
            const exts = fs.readdirSync(extDir).filter(d => d.startsWith('ms-dotnettools.csharp-')).sort().reverse();
            for (const ext of exts) {
                const dll = path.join(extDir, ext, '.roslyn', 'Microsoft.CodeAnalysis.LanguageServer.dll');
                if (fs.existsSync(dll)) return { dotnetExe, dllPath: dll, type: 'roslyn' };
            }
        }
    }

    // 兜底:仅 Windows 自带 OmniSharp(对 .NET SDK 项目加载不全,不推荐)
    const bundled = path.join(__dirname, 'omnisharp', 'OmniSharp.exe');
    if (fs.existsSync(bundled)) return { path: bundled, type: 'omnisharp' };

    return null;
}

// 文件路径 → file URI(跨平台:Win C:\x → file:///C:/x;POSIX /x → file:///x)
function toUri(p) {
    let abs = path.resolve(p).replace(/\\/g, '/');
    if (!abs.startsWith('/')) abs = '/' + abs; // Windows 盘符:C:/x → /C:/x
    return 'file://' + abs;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class LSPBridge {
    constructor(projectPath, logFn) {
        this.projectPath = projectPath;
        this.projectDir = path.dirname(projectPath);
        this.log = logFn;
        const lspInfo = findLSPServer();
        if (!lspInfo) throw new Error('未找到 C# LSP server(需安装 VS Code C# 扩展)。');
        this.lspInfo = lspInfo;
        this.lspType = lspInfo.type;
        this.proc = null;
        this.reader = null;
        this.writer = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.initialized = false;
        this.projectLoaded = false;
        this.openDocuments = new Set();
    }

    async start() {
        let cmd, args, env;
        if (this.lspType === 'roslyn') {
            cmd = this.lspInfo.dotnetExe;
            args = [this.lspInfo.dllPath, '--stdio'];
            env = { ...process.env, DOTNET_ROOT: path.dirname(cmd) };
            this.log(`启动 Roslyn:${cmd}`);
            this.log(`Roslyn DLL:${this.lspInfo.dllPath}`);
        } else {
            cmd = this.lspInfo.path;
            args = ['-lsp', '-s', this.projectDir];
            env = { ...process.env };
            if (process.platform === 'win32') env.DOTNET_ROOT = 'C:\\Program Files\\dotnet';
            this.log(`启动 OmniSharp(兜底):${cmd}`);
        }
        this.log(`项目:${this.projectPath}`);

        this.proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true });
        this.proc.stderr.on('data', (d) => {
            const t = d.toString().trim();
            if (t) this.log(`[lsp-stderr] ${t.substring(0, 500)}`);
        });
        this.proc.on('exit', (code) => this.log(`LSP server 退出:${code}`));

        this.reader = new StreamMessageReader(this.proc.stdout);
        this.writer = new StreamMessageWriter(this.proc.stdin);
        this.reader.listen((msg) => this._handleMessage(msg));

        await this._initialize();
    }

    _handleMessage(msg) {
        if (msg.id !== undefined && msg.method === undefined && this.pendingRequests.has(msg.id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.id);
            this.pendingRequests.delete(msg.id);
            if (msg.error) reject(msg.error); else resolve(msg.result);
            return;
        }
        if (msg.id === undefined && msg.method) {
            if (msg.method === 'workspace/projectInitializationComplete') {
                this.projectLoaded = true;
                this.log('项目加载完成(projectInitializationComplete)。');
            }
            return;
        }
        if (msg.id !== undefined && msg.method) this._handleServerRequest(msg);
    }

    async _handleServerRequest(msg) {
        let result = null;
        if (msg.method === 'workspace/configuration') {
            result = (msg.params?.items || []).map(() => null);
        }
        try { await this.writer.write({ jsonrpc: '2.0', id: msg.id, result }); } catch {}
    }

    _request(method, params, timeout = 60000) {
        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`超时:${method}`));
            }, timeout);
            this.pendingRequests.set(id, {
                resolve: (r) => { clearTimeout(timer); resolve(r); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            this.writer.write({ jsonrpc: '2.0', id, method, params });
        });
    }

    _notify(method, params) {
        this.writer.write({ jsonrpc: '2.0', method, params });
    }

    async _initialize() {
        this.log('发送 initialize...');
        const rootUri = toUri(this.projectDir);
        const result = await this._request('initialize', {
            processId: process.pid,
            rootPath: this.projectDir,
            rootUri,
            capabilities: {
                textDocument: {
                    definition: { linkSupport: true },
                    references: {},
                    implementation: { linkSupport: true },
                    hover: { contentFormat: ['plaintext', 'markdown'] },
                    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                },
                workspace: { workspaceFolders: true, configuration: true, symbol: {} },
            },
            workspaceFolders: [{ uri: rootUri, name: path.basename(this.projectDir) }],
        }, 120000);

        const caps = Object.keys(result?.capabilities || {});
        this.log(`initialize OK(${caps.length} capabilities)。`);
        this._notify('initialized', {});
        this.initialized = true;

        // 关键:显式打开 solution/project,Roslyn 才会建立语义工作区
        if (this.lspType === 'roslyn') {
            const uri = toUri(this.projectPath);
            if (this.projectPath.toLowerCase().endsWith('.sln')) {
                this.log(`solution/open:${uri}`);
                this._notify('solution/open', { solution: uri });
            } else if (this.projectPath.toLowerCase().endsWith('.csproj')) {
                this.log(`project/open:${uri}`);
                this._notify('project/open', { projects: [uri] });
            } else {
                this.log('警告:项目路径非 .sln/.csproj,跳过 solution/open。');
                this.projectLoaded = true;
            }
        } else {
            this.projectLoaded = true;
        }

        this.log(`等待项目加载(最多 ${LOAD_TIMEOUT}s)...`);
        for (let i = 0; i < LOAD_TIMEOUT && !this.projectLoaded; i++) await sleep(1000);
        if (!this.projectLoaded) this.log('警告:加载超时,放行(结果可能不全)。');
        this.log('Bridge 就绪。');
    }

    async openDocument(filePath) {
        const absPath = path.resolve(filePath);
        if (this.openDocuments.has(absPath)) return;
        const text = fs.readFileSync(absPath, 'utf-8');
        this._notify('textDocument/didOpen', {
            textDocument: { uri: toUri(absPath), languageId: 'csharp', version: 1, text },
        });
        this.openDocuments.add(absPath);
        await sleep(500);
    }

    async definition(filePath, line, col) {
        await this.openDocument(filePath);
        return await this._request('textDocument/definition', {
            textDocument: { uri: toUri(filePath) }, position: { line, character: col },
        }) || [];
    }

    async references(filePath, line, col) {
        await this.openDocument(filePath);
        return await this._request('textDocument/references', {
            textDocument: { uri: toUri(filePath) }, position: { line, character: col },
            context: { includeDeclaration: true },
        }) || [];
    }

    async hover(filePath, line, col) {
        await this.openDocument(filePath);
        return await this._request('textDocument/hover', {
            textDocument: { uri: toUri(filePath) }, position: { line, character: col },
        });
    }

    async symbols(filePath) {
        await this.openDocument(filePath);
        return await this._request('textDocument/documentSymbol', {
            textDocument: { uri: toUri(filePath) },
        }) || [];
    }

    async workspaceSymbols(query) {
        return await this._request('workspace/symbol', { query }) || [];
    }

    async implementation(filePath, line, col) {
        await this.openDocument(filePath);
        return await this._request('textDocument/implementation', {
            textDocument: { uri: toUri(filePath) }, position: { line, character: col },
        }) || [];
    }

    async shutdown() {
        try { await this._request('shutdown', undefined, 5000); } catch {}
        this._notify('exit');
        if (this.proc) this.proc.kill();
    }
}

// --- TCP 命令服务 ---

async function handleCommand(bridge, req) {
    switch (req.command) {
        case 'definition': return bridge.definition(req.file, req.line, req.col);
        case 'references': return bridge.references(req.file, req.line, req.col);
        case 'hover': return bridge.hover(req.file, req.line, req.col);
        case 'symbols': return bridge.symbols(req.file);
        case 'workspace_symbols': return bridge.workspaceSymbols(req.query);
        case 'implementation': return bridge.implementation(req.file, req.line, req.col);
        case 'status': return {
            initialized: bridge.initialized, projectLoaded: bridge.projectLoaded, project: bridge.projectPath,
        };
        case 'shutdown': await bridge.shutdown(); return { status: 'shutdown' };
        default: throw new Error(`未知命令:${req.command}`);
    }
}

function startTCPServer(bridge, portFile, log) {
    const server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', async (data) => {
            buffer += data.toString();
            const idx = buffer.indexOf('\n');
            if (idx === -1) return;
            const line = buffer.substring(0, idx);
            try {
                const req = JSON.parse(line);
                const result = await handleCommand(bridge, req);
                socket.write(JSON.stringify({ ok: true, result }) + '\n');
            } catch (err) {
                socket.write(JSON.stringify({ ok: false, error: err.message }) + '\n');
            } finally { socket.end(); }
        });
    });
    server.listen(0, BRIDGE_HOST, () => {
        const port = server.address().port;
        fs.writeFileSync(portFile, String(port));
        log(`TCP 监听 ${BRIDGE_HOST}:${port}`);
    });
    return server;
}

// --- 入口:node lsp-bridge.js _bridge <project> <stateDir> ---

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 3 || args[0] !== '_bridge') {
        console.error('用法:node lsp-bridge.js _bridge <project-path> <state-dir>');
        process.exit(1);
    }
    const projectPath = args[1];
    const stateDir = args[2];
    if (!fs.existsSync(projectPath)) { console.error(`项目不存在:${projectPath}`); process.exit(1); }
    fs.mkdirSync(stateDir, { recursive: true });
    const PID_FILE = path.join(stateDir, 'bridge.pid');
    const PORT_FILE = path.join(stateDir, 'bridge.port');
    const LOG_FILE = path.join(stateDir, 'bridge.log');
    const META_FILE = path.join(stateDir, 'meta.json');
    fs.writeFileSync(LOG_FILE, '');

    const log = (msg) => {
        const line = `[bridge] ${new Date().toISOString()} ${msg}`;
        console.log(line);
        try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
    };
    fs.writeFileSync(META_FILE, JSON.stringify({ project: projectPath, pid: process.pid }));

    const bridge = new LSPBridge(projectPath, log);
    await bridge.start();
    const server = startTCPServer(bridge, PORT_FILE, log);

    const cleanup = async () => {
        server.close();
        await bridge.shutdown();
        for (const f of [PID_FILE, PORT_FILE, META_FILE]) { try { fs.unlinkSync(f); } catch {} }
        process.exit(0);
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
}

// 仅当作为脚本直接运行时启动 bridge;被 require 时只导出函数(供 CLI doctor 复用)
if (require.main === module) {
    main().catch((err) => { console.error(`Fatal: ${err.message}`); console.error(err); process.exit(1); });
}

module.exports = { findLSPServer, vscodeUserDir, toUri, LSPBridge };
