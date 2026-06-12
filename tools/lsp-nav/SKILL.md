---
name: lsp-nav
description: 跨平台 C# 语义化代码导航工具(双后端:Roslyn LSP / csharp-ls)——跳转定义、查找引用、按符号名查调用、悬停、符号列表;支持多 sln 并存。用于 AI agent 在迁移改造中精确查跨项目调用关系。
version: 2.1.0
---

# LSP Nav — 跨平台 C# 语义化代码导航

精确语义分析,相比 grep / tree-sitter 能正确处理**多态、重载、接口、依赖注入**——
`item.Approve()` 会精确解析到 `item` 真实类型的那个方法,而不是按名糊成一团。
适合迁移改造中"改接口/砍代码前查影响面"。

**双后端自动发现**(v2.1,2026-06-10):
| 后端 | 来源 | 适用 | 实测 |
|---|---|---|---|
| **Roslyn LS**(优先) | VS Code C# 扩展 DLL + 其 .NET 10 runtime | 装了 VS Code 的机器,语义质量最高 | Windows |
| **csharp-ls**(次选) | `dotnet tool install -g csharp-ls` | 无 VS Code 的纯 CLI 机器 | macOS arm64 |

bridge 自实现 Claude Code 缺失的 3 个 LSP client 应答(claude-code#16360 缺口:
`workspace/configuration` / `client/registerCapability` / `window/workDoneProgress/create`),
故不受 CC 根 session LSP 静默返空问题影响(ADR-035)。

## 与 sub-Claude gateway 的分工(ADR-035 修订 2026-06-10)

- **lsp-nav**:同一 sln 内高频 symbol 导航(零 token、常驻后单查 <300ms)
- **gateway**:跨子项目并行契约 CR、需大 context 隔离的综合分析

## 前置条件(所有平台)

1. **Node.js** ≥ 18
2. **二选一**:VS Code + C# 扩展(Roslyn 路线)或 `dotnet tool install -g csharp-ls`(纯 CLI 路线,需 .NET 9+ runtime)
3. 首次使用先在本目录 `npm install`(安装 vscode-jsonrpc)

> 路径自动适配 Windows / macOS / Linux。新机首次务必先跑 `doctor` 自检。

## 安装与自检

```bash
cd <repo>/tools/lsp-nav
npm install
node lsp-nav.js doctor      # 检查 平台/Node/依赖/双后端 是否齐全(任一后端可用即绿)
```

## bridge 管理(支持多 sln 同时在线)

```bash
node lsp-nav.js start --project <sln 或目录>   # ~5s 返回,sln 后台加载(进度看 status)
node lsp-nav.js start --project <sln> --wait   # 阻塞到加载完成才返回(CI/脚本场景)
node lsp-nav.js status                          # 列出全部实例 + loaded 状态
node lsp-nav.js stop --project <sln>            # 停某个
node lsp-nav.js stop --all                      # 停全部
node lsp-nav.js cleanup [--quiet]               # 清残留:死实例目录/挂死 bridge/孤儿 LSP server(活实例不动)
```

### 会话自动预热 + 残留自动清理(SessionStart hook)

全局 hook `~/.claude/hooks/core-lsp-autostart.js` 在每次会话启动时:
1. 跑 `cleanup --quiet` 清上次会话残留(所有工作区生效,无需配置)
2. 读工作区 `<workspace>/.claude/lsp-autostart.json` 自动预热(无该文件则只清理不预热):

```json
{ "solutions": ["AI.Extend.SRM.Buyer.2/AL.Extend.SRM.Buyer.sln"] }
```

路径相对工作区根(绝对路径也支持);bridge 已在运行则幂等跳过。

多 bridge 运行时:**位置型命令**(带 --file)按文件所属目录自动路由;
**按名命令**(find/callers)需 `--project <sln>` 指定。

## 推荐:按符号名查(免手算行列)

```bash
node lsp-nav.js find <name> [--project <sln>]          # 搜索符号(支持 类名.方法名)
node lsp-nav.js callers <name> [--project <sln>] [--json]  # 按名找定义并列出所有引用
node lsp-nav.js callers SCMSupplierRectification.Approve --project <sln>
```

`callers` 会把同名不同类的方法分开列,各自精确引用 —— 这是相对 grep/图索引的核心优势。

## 位置型命令(0-based 行/列,向后兼容)

```bash
node lsp-nav.js definition     --file <f> --line <n> --col <n>
node lsp-nav.js references      --file <f> --line <n> --col <n> [--json]
node lsp-nav.js hover           --file <f> --line <n> --col <n>
node lsp-nav.js symbols         --file <f>
node lsp-nav.js implementation  --file <f> --line <n> --col <n>
```

## 注意事项

- `--line` / `--col` 为 **0-based**(LSP 标准);用 `find`/`callers` 可避免手算
- **加载耗时**(一次性,bridge 常驻后免):Roslyn 路线 30-90s(Windows 实测);csharp-ls 路线大 sln **3-5+ 分钟**(macOS 实测,无 solution 缓存,每次冷启全量 MSBuild/Roslyn 工作区构建,机器负载相关)
- 加载窗口期查询:csharp-ls 会把请求挂起到加载完成再答(实测正确非空);**未加载完成的语义空结果会报错而非静默返空**(防假"0 引用"陷阱),有结果即可信
- 加载等待上限:`LSP_LOAD_TIMEOUT`(秒,默认 300)
- 状态/依赖目录(`.state/`、`node_modules/`)不入库,按机器本地生成

## 典型工作流(迁移改造)

1. 批次开始就 `start --project <sln>`(~5s 返回,后台预热;多仓各 start 一个)
2. `callers <方法名>` 查影响面(改接口/砍老代码前必做)
3. 需精确位置再 `definition` / `references`
4. 批次结束 `stop --all`(批次内保持常驻,勿反复起停——冷启代价高)

## 设计方案

完整技术方案与决策见 `<repo>/references/ai-agent-lsp-navigation.md`。
