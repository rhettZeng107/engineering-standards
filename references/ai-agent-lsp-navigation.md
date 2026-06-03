# AI Agent C# 语义导航工具技术方案

> 文档版本：2.0
> 创建日期：2026-06-02
> 最后更新：2026-06-03
> 作者：Rhett
> 状态：已实现并验证通过(Windows 实测;macOS 经跨平台逻辑 + doctor 自检)
> 工具位置：`engineering-standards/tools/lsp-nav/`(跨平台,git 同步多机复用)

## 0. v2.0 重大更新(2026-06-03)

v1 在 Windows 单 sln 单文件场景可用,但实测发现致命缺陷与跨平台/多项目短板。v2 已修复并迁入工程标准目录,供 Windows / macOS 多项目(SRMV2、MES、HC 等)迁移改造复用。

| # | v1 问题 | v2 修复 |
|---|---|---|
| 1 | **从不发 `solution/open`** → Roslyn 未建立跨项目语义工作区,跨文件 references/definition/hover 全部失败(实测后端 `item.Approve()` 0 命中) | initialize 后显式发送 `solution/open`(.sln)或 `project/open`(.csproj);实测后端跨类引用精确(`SCMSupplierRectification.Approve` → 定义 + 2 调用点,逐类消歧) |
| 2 | 死等固定 10s,大项目没加载完 | 等待 `workspace/projectInitializationComplete` 事件 + 超时兜底(`LSP_LOAD_TIMEOUT` 可调,默认 180s) |
| 3 | 单实例(全局 `.state/bridge.port`),一次只能挂一个 sln | **多实例**:每 sln 独立状态目录 `.state/<key>/` + 独立端口;多项目可并存,按 `--file` 自动路由或 `--project` 指定 |
| 4 | 只能按 0-based 行/列查(AI agent 手算易错) | 新增**按符号名**命令 `find <name>` / `callers <name>`(支持 `类名.方法名`,基于 `workspace/symbol` + references) |
| 5 | 硬编码 Windows 路径(`%APPDATA%`、`dotnet.exe`、`x64`、`%USERPROFILE%`、`taskkill`) | **跨平台**:按 `process.platform` 自动发现(Win/macOS/Linux),arch 自适配(x64/arm64),进程与 file URI 跨平台 |
| 6 | 无环境自检,新机排障靠猜 | 新增 `doctor` 命令:检查 平台/Node/依赖/Roslyn DLL/.NET runtime 是否齐全 |
| 7 | 进程泄漏(实测残留 12 个僵尸 bridge) | per-instance PID/状态管理 + `stop --all` |

**新机/Mac 首次使用**:`cd tools/lsp-nav && npm install && node lsp-nav.js doctor` → 全绿即可用。详见同目录 `SKILL.md`。

## 1. 背景与目标

### 1.1 问题描述

AI 编程助手（如 Qwen Code、Claude Code）在分析 C# 项目时，传统方式依赖 `grep` + `read_file` 进行代码搜索：
- **优点**：简单直接，无需额外依赖
- **缺点**：无法进行精确的语义分析（跳转定义、查找引用、类型推断）

### 1.2 目标

构建一个 **通用的 LSP 导航工具**，让 AI Agent 能够：
- 精确跳转到符号定义（Go to Definition）
- 查找所有引用（Find All References）
- 获取类型信息和文档（Hover）
- 列出文件符号结构（Document Symbols）
- 查找接口实现（Find Implementations）

### 1.3 约束条件

- 必须支持 .NET 8 项目（当前主力技术栈）
- 必须跨 AI Agent 通用（Qwen Code、Claude Code 都能用）
- 尽量复用本机已有资源，避免重复安装

## 2. 技术选型历程

### 2.1 方案一：Python + OmniSharp（失败）

**尝试路径**：
1. 下载 OmniSharp 独立版本（v1.39.10）
2. 用 Python 实现 LSP Client（stdio 通信）
3. 遇到 Windows 下 stdio 编码边界问题，JSON 解析失败

**失败原因**：
- Windows 管道编码问题（Content-Length 按字符 vs 字节计算）
- OmniSharp 独立版对 .NET 8 项目加载不完整（symbols 返回空数组）

### 2.2 方案二：Node.js + OmniSharp（失败）

**改进措施**：
- 改用 Node.js + `vscode-jsonrpc`（LSP 协议参考实现）
- 解决了 JSON-RPC 通信问题
- 初始化成功（22 capabilities）

**仍然失败**：
- OmniSharp 无法正确解析 .NET 8 SDK 项目
- `textDocument/documentSymbol` 返回空数组

### 2.3 方案三：Node.js + Roslyn Language Server（成功）

**关键发现**：
- VS Code C# 扩展自带 Roslyn Language Server（`Microsoft.CodeAnalysis.LanguageServer.dll`）
- VS Code 的 `vscode-dotnet-runtime` 扩展自动下载了 .NET 10.0.7 Runtime
- Roslyn Server 需要 .NET 10，但本机已有

**验证结果**：
- 初始化成功（26 capabilities）
- symbols、hover、references 全部正常工作

## 3. 最终方案架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent Layer                         │
│  (Qwen Code / Claude Code / 其他支持 shell 的 AI)           │
└────────────────────┬────────────────────────────────────────┘
                     │ shell command
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    lsp-nav.js (CLI)                          │
│  - 解析命令行参数                                             │
│  - 连接 bridge（TCP）                                        │
│  - 格式化输出结果                                             │
└────────────────────┬────────────────────────────────────────┘
                     │ TCP (127.0.0.1:动态端口)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  lsp-bridge.js (服务器)                      │
│  - 管理 Roslyn Language Server 进程生命周期                   │
│  - 处理 LSP 协议（vscode-jsonrpc）                           │
│  - 维护文档打开状态                                           │
│  - 响应 CLI 命令                                              │
└────────────────────┬────────────────────────────────────────┘
                     │ stdio (JSON-RPC)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         Roslyn Language Server (.NET 10)                     │
│  - VS Code C# 扩展提供                                       │
│  - 通过 VS Code 下载的 .NET 10.0.7 Runtime 运行              │
│  - 加载 .sln/.csproj，提供语义分析                            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| CLI 入口 | `lsp-nav.js` | 命令行接口，连接 bridge，格式化输出 |
| Bridge 服务器 | `lsp-bridge.js` | 管理 LSP 进程，处理协议，维护状态 |
| LSP Server | `Microsoft.CodeAnalysis.LanguageServer.dll` | Roslyn 语义分析引擎 |
| Runtime | `dotnet.exe` (10.0.7) | .NET 10 运行时（VS Code 提供） |

### 3.3 通信协议

- **CLI ↔ Bridge**：TCP + JSON（自定义协议，一行一个命令）
- **Bridge ↔ Roslyn**：stdio + JSON-RPC（LSP 标准协议）

## 4. 关键实现细节

### 4.1 自动发现 LSP Server

```javascript
function findLSPServer() {
    // 1. 查找 VS Code 下载的 .NET 10 Runtime
    const vscodeStorage = path.join(
        process.env.APPDATA,
        'Code', 'User', 'globalStorage', 
        'ms-dotnettools.vscode-dotnet-runtime', '.dotnet'
    );
    
    // 2. 查找 VS Code C# 扩展的 Roslyn DLL
    const vscodeExt = path.join(
        process.env.USERPROFILE, '.vscode', 'extensions'
    );
    
    // 3. 返回 { dotnetExe, dllPath, type: 'roslyn' }
}
```

### 4.2 Bridge 生命周期管理

```javascript
// 启动
node lsp-nav.js start --project <sln路径>
  ↓
spawn dotnet.exe Microsoft.CodeAnalysis.LanguageServer.dll --stdio
  ↓
LSP initialize → initialized → 等待项目加载（10s）
  ↓
启动 TCP 服务器（动态端口）
  ↓
写入 .state/bridge.port 和 .state/bridge.pid

// 停止
node lsp-nav.js stop
  ↓
读取 PID，taskkill 强制结束
  ↓
删除 .state 文件
```

### 4.3 进程隐藏（Windows）

为避免 LSP Server 启动时弹出控制台窗口，spawn 子进程时设置 `windowsHide: true`：

```javascript
this.proc = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    windowsHide: true,  // 隐藏子进程窗口
});
```

这样 OmniSharp/Roslyn 进程会在后台静默运行，不会干扰用户操作。

### 4.4 文档状态管理

```javascript
class LSPBridge {
    openDocuments = new Set();  // 已打开的文档路径
    
    async openDocument(filePath) {
        if (this.openDocuments.has(filePath)) return;
        
        // 发送 textDocument/didOpen 通知
        this._notify('textDocument/didOpen', {
            textDocument: {
                uri: 'file:///' + absPath,
                languageId: 'csharp',
                version: 1,
                text: fs.readFileSync(filePath, 'utf-8')
            }
        });
        
        this.openDocuments.add(filePath);
        await sleep(500);  // 等待服务器处理
    }
}
```

### 4.5 命令实现示例

```javascript
// 跳转定义
async definition(filePath, line, col) {
    await this.openDocument(filePath);
    const result = await this._request('textDocument/definition', {
        textDocument: { uri: 'file:///' + absPath },
        position: { line, character: col }
    });
    return result || [];
}

// 查找引用
async references(filePath, line, col) {
    await this.openDocument(filePath);
    const result = await this._request('textDocument/references', {
        textDocument: { uri: 'file:///' + absPath },
        position: { line, character: col },
        context: { includeDeclaration: true }
    });
    return result || [];
}
```

## 5. 使用方法

> **v2 说明**:工具已迁至 `engineering-standards/tools/lsp-nav/`,且跨平台。下文示例为 v1 历史路径(`.qwen/tools/lsp-nav`,Windows),命令语义仍适用;**v2 完整命令(含 `doctor`/`find`/`callers`/`--project`/`--all`)以同目录 `SKILL.md` 为准**。新机首次:`cd tools/lsp-nav && npm install && node lsp-nav.js doctor`。

### 5.1 启动 Bridge

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js start --project C:\path\to\Your.sln
```

输出：
```
Bridge starting (PID: 12345)...
Project: C:\path\to\Your.sln
Log: C:\Users\Rhett\.qwen\tools\lsp-nav\.state\bridge.log
Bridge ready on port 5280.
```

### 5.2 查看状态

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js status
```

输出：
```
Bridge: running (port: 5280)
  Project: C:\path\to\Your.sln
  Initialized: true
```

### 5.3 列出文件符号

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js symbols --file C:\path\to\File.cs
```

输出：
```
YourNamespace [Namespace] (line 3)
  YourClass [Class] (line 8)
    Id : int [Property] (line 10)
    Name : string? [Property] (line 13)
    DoSomething() [Method] (line 20)
```

### 5.4 跳转定义

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js definition --file C:\path\to\File.cs --line 10 --col 15
```

输出：
```
C:\path\to\OtherFile.cs:25:8
```

### 5.5 查找引用

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js references --file C:\path\to\File.cs --line 10 --col 15
```

输出：
```
C:\path\to\File1.cs:25:8
C:\path\to\File2.cs:42:12
C:\path\to\File3.cs:100:20

(3 references)
```

### 5.6 悬停提示

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js hover --file C:\path\to\File.cs --line 10 --col 15
```

输出：
```
```csharp
class System.String
```

Represents text as a sequence of UTF-16 code units.
```

### 5.7 停止 Bridge

```bash
node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js stop
```

## 6. 文件结构

```
C:\Users\Rhett\.qwen\tools\lsp-nav\
├── lsp-nav.js              # CLI 入口
├── lsp-bridge.js           # Bridge 服务器
├── package.json            # Node.js 依赖
├── node_modules\           # vscode-jsonrpc 等依赖
├── SKILL.md                # AI Agent 使用文档
├── omnisharp\              # OmniSharp（备用，未使用）
│   └── OmniSharp.exe
└── .state\                 # 运行时状态（自动生成）
    ├── bridge.pid          # Bridge 进程 PID
    ├── bridge.port         # Bridge TCP 端口
    └── bridge.log          # 运行日志
```

## 7. 依赖关系

### 7.1 运行时依赖

| 依赖 | 来源 | 用途 |
|------|------|------|
| Node.js | 系统安装 | 运行 JS 脚本 |
| vscode-jsonrpc | npm install | LSP 协议处理 |
| .NET 10.0.7 Runtime | VS Code 自动下载 | 运行 Roslyn Server |
| Roslyn Language Server | VS Code C# 扩展 | 语义分析引擎 |

### 7.2 路径依赖

```javascript
// .NET 10 Runtime
C:\Users\Rhett\AppData\Roaming\Code\User\globalStorage\
  ms-dotnettools.vscode-dotnet-runtime\.dotnet\10.0.7~x64~aspnetcore\dotnet.exe

// Roslyn Language Server
C:\Users\Rhett\.vscode\extensions\
  ms-dotnettools.csharp-2.140.8-win32-x64\.roslyn\
  Microsoft.CodeAnalysis.LanguageServer.dll
```

## 8. 跨 Agent 复用

### 8.1 通用性设计

- **纯 CLI 接口**：任何能执行 shell 命令的 AI Agent 都能调用
- **无状态 CLI**：每次命令独立，通过 bridge 维持 LSP 状态
- **标准化输出**：纯文本格式，易于 AI 解析

### 8.2 Qwen Code 集成

已在 `.qwen/skills/lsp-nav/SKILL.md` 中注册，Qwen Code 可自动识别并使用。

### 8.3 Claude Code 集成

在 `CLAUDE.md` 中添加：

```markdown
## C# 语义导航

使用 `node C:\Users\Rhett\.qwen\tools\lsp-nav\lsp-nav.js` 进行精确的 C# 代码导航：

- `start --project <sln>` — 启动 bridge
- `symbols --file <file>` — 列出文件符号
- `definition --file <file> --line <n> --col <n>` — 跳转定义
- `references --file <file> --line <n> --col <n>` — 查找引用
- `hover --file <file> --line <n> --col <n>` — 悬停提示
- `stop` — 停止 bridge

注意：line 和 col 使用 0-based 索引。
```

## 9. 性能与限制

### 9.1 性能指标

| 操作 | 耗时 |
|------|------|
| Bridge 启动（含项目加载） | 10-30 秒 |
| symbols（单文件） | < 1 秒 |
| hover | < 1 秒 |
| references | 1-3 秒 |
| definition | < 1 秒 |

### 9.2 已知限制

1. **首次加载慢**：含 WebAPI 的大 sln 需要 30-90 秒加载(等 `projectInitializationComplete`)
2. ~~单项目限制~~ **已解除(v2)**：支持多 sln 多实例并存,各自独立端口/状态
3. **只读操作**：当前仅支持查询，不支持代码修改
4. **.NET 10 依赖**：需要 VS Code C# 扩展已下载 .NET 10 Runtime(doctor 会校验)
5. **按名命令多实例需指定**:`find`/`callers` 无 `--file` 可路由,多实例时需 `--project`

### 9.3 优化建议

1. **持久化 Bridge**：项目不变时，可长期运行 bridge
2. **多项目支持**：可启动多个 bridge 实例（不同端口）
3. **缓存策略**：可对 symbols 结果做本地缓存

## 10. 故障排查

### 10.1 Bridge 启动失败

**症状**：`Bridge not responding`

**排查步骤**：
1. 检查日志：`type .state\bridge.log`
2. 检查端口：`netstat -ano | findstr <port>`
3. 检查进程：`tasklist | findstr node`

### 10.2 Symbols 返回空

**原因**：项目未完全加载

**解决**：等待 30 秒后重试

### 10.3 端口冲突

**症状**：`EADDRINUSE`

**解决**：
```bash
# 查找占用进程
netstat -ano | findstr <port>
# 强制结束
taskkill /F /PID <pid>
```

## 11. 总结

### 11.1 关键经验

1. **优先复用现有资源**：VS Code 已下载的 .NET 10 和 Roslyn Server 可直接使用
2. **选择成熟协议库**：`vscode-jsonrpc` 比手写 JSON-RPC 更可靠
3. **动态端口优于固定端口**：避免端口冲突问题
4. **Bridge 架构优于无状态**：LSP Server 启动慢，必须复用

### 11.2 技术亮点

- ✅ 自动发现 VS Code 的 .NET Runtime 和 Roslyn Server
- ✅ 基于 `vscode-jsonrpc` 的标准 LSP 协议实现
- ✅ TCP 动态端口 + PID 文件的进程管理
- ✅ `windowsHide: true` 实现后台静默运行，无弹窗干扰
- ✅ 跨 AI Agent 通用（纯 CLI 接口）
- ✅ 完整的命令覆盖（symbols/definition/references/hover/implementation）

### 11.3 后续规划

- [x] 支持多项目同时加载(v2 多实例)
- [x] 跨平台(Win/macOS/Linux,v2)
- [x] 按符号名查 + doctor 自检(v2)
- [ ] 添加代码补全（completion）
- [ ] 添加重命名符号（rename）
- [ ] 添加代码格式化（formatting）
- [ ] 支持 TypeScript/JavaScript 项目(tsserver,复用架构)
- [ ] 可选:MCP 封装(让 AI agent 原生调用,免 shell 解析)

## 12. 参考资料

- [Language Server Protocol 规范](https://microsoft.github.io/language-server-protocol/)
- [vscode-jsonrpc npm 包](https://www.npmjs.com/package/vscode-jsonrpc)
- [Roslyn Language Server](https://github.com/dotnet/roslyn)
- [OmniSharp](https://www.omnisharp.net/)

---

**文档维护**：如有问题或改进建议，请更新本文档并同步到 engineering-standards 仓库。
