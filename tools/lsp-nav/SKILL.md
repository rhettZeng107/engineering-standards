---
name: lsp-nav
description: 跨平台 C# 语义化代码导航工具(Roslyn LSP)——跳转定义、查找引用、按符号名查调用、悬停、符号列表;支持多 sln 并存。用于 AI agent 在迁移改造中精确查跨项目调用关系。
version: 2.0.0
---

# LSP Nav — 跨平台 C# 语义化代码导航

基于 Roslyn Language Server(VS Code C# 扩展自带)的精确语义分析。相比 grep / tree-sitter,
能正确处理**多态、重载、接口、依赖注入**——`item.Approve()` 会精确解析到 `item` 真实类型的那个方法,
而不是按名糊成一团。适合迁移改造中"改接口/砍代码前查影响面"。

## 前置条件(所有平台)

1. **Node.js** ≥ 18
2. **VS Code + C# 扩展**(`ms-dotnettools.csharp` 或 C# Dev Kit)
   - 装好后会自动下载 Roslyn DLL + .NET 10 runtime,本工具自动发现,无需手动配
3. 首次使用先在本目录 `npm install`(安装 vscode-jsonrpc)

> 路径自动适配 Windows / macOS / Linux。新机首次务必先跑 `doctor` 自检。

## 安装与自检

```bash
cd <repo>/tools/lsp-nav
npm install
node lsp-nav.js doctor      # 检查 平台/Node/依赖/Roslyn DLL/.NET runtime 是否齐全
```

`doctor` 全绿即可用;若报缺失,按提示装 VS Code C# 扩展或 npm install。

## bridge 管理(支持多 sln 同时在线)

```bash
node lsp-nav.js start --project <sln 或目录>   # 等到项目语义加载完成才返回
node lsp-nav.js status                          # 列出全部实例(每 sln 独立端口)
node lsp-nav.js stop --project <sln>            # 停某个
node lsp-nav.js stop --all                      # 停全部
```

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
- bridge 首次启动需加载项目:纯类库约 10-30s,含 WebAPI 的大 sln 30-90s
- 加载超时上限用环境变量 `LSP_LOAD_TIMEOUT`(秒,默认 180)调整
- 状态/依赖目录(`.state/`、`node_modules/`)不入库,按机器本地生成

## 典型工作流(迁移改造)

1. `start --project <sln>`(等"项目已加载")
2. `callers <方法名>` 查影响面(改接口/砍老代码前必做)
3. 需精确位置再 `definition` / `references`
4. 用完 `stop --all`

## 设计方案

完整技术方案与决策见 `<repo>/references/ai-agent-lsp-navigation.md`。
