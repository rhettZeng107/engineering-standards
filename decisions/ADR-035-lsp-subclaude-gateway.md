# ADR-035: LSP Sub-Claude Gateway — Multi-repo workspace 的 LSP 使用模式

- **Status**: Accepted
- **Date**: 2026-05-27
- **Decider**: 涛哥
- **Scope**: 跨项目(SYSV2 / SRMV2 / HC / 未来 MES/WMS/EAM/TPM 等 multi-repo workspace)

---

## Context(背景 / 为什么需要决策)

### 触发场景

2026-05-27 SYSV2 工作区试用 Claude Code 官方 `csharp-lsp` + `typescript-lsp` plugin,**实证根启动失败**:
- SYSV2 是 multi-repo workspace(8 个 nested git repo,各自 sln/package.json),根目录无 sln/package.json
- Claude Code session 在工作区根启动 → LSP 客户端把 SYSV2 根作 rootUri 传给 csharp-ls → csharp-ls 找不到 sln 加载 → 所有 LSP 操作返空(`ps` 实证 csharp-ls 进程 1 分钟 CPU 0% / 0 个 sln 打开)
- 涛哥日常工作流**硬约束**:根 session 启动,跨子项目跳(契约/SQL/git 双推/工作区文档),不接受改成 `cd 子项目` 启动 Claude
- LSP 协议本质单 workspace 设计,multi-root(`workspaceFolders`)即使 server 支持,plugin manifest 也不暴露配置

### 当前状态实证

- `csharp-lsp` plugin marketplace.json:`{"command": "csharp-ls", "extensionToLanguage": {".cs": "csharp"}}`,无 multi-workspace 配置
- 子目录启动 spike 实证(2026-05-27 早 7:18,`cd AI.Extend.SYS && claude`):LSP 完整工作,`findReferences SysContext` 返 305 refs across 105 files
- Sub-Claude 派遣 spike 实证(2026-05-27 8:30,Haiku 4.5):**12.7 秒 / $0.15 / 10 条精准 SysContext refs JSON**(跨 Domain + Tests 跨 csproj 解析成功)

### 决策不做的代价

- 涛哥强行改工作流(cd 子目录)→ 跨子项目契约/SQL/文档场景 LSP 用不上,反而把简单根任务也复杂化
- 不用 LSP(纯 grep 兜底)→ 损失精度 + 跨文件 refactor 不安全;grep "SysContext" 命中 1000+ 行噪声 vs LSP 精准 10 条

---

## Decision(决策本身)

**一句话**:Multi-repo workspace 用 **Sub-Claude Gateway** 模式访问 LSP —— 涛哥根 session 工作流不变,高精度 symbol 任务自治派 sub-Claude 进子目录用 LSP,返结果到根 session。

**详细**:

### 1. 触发判定(任务类型 → 是否派 sub-Claude)

| 任务类型 | 派 sub-Claude? | 理由 |
|---|---|---|
| `findReferences` 跨文件 | ✅ | grep 命中噪声 100x,LSP 精准 |
| `goToDefinition` | ✅ | grep 不分类 / 接口实现,LSP 精准 |
| 精确 `rename` 跨文件 | ✅ | grep + sed 不安全(注释/字符串误改) |
| `prepareCallHierarchy` / `incomingCalls` / `outgoingCalls` | ✅ | grep 难以拼调用链 |
| `hover`(看类型 signature) | ✅(中) | grep 拿不到类型推断 |
| `workspaceSymbol` 模糊搜索 | ✅(中) | grep 也能但 LSP 限定符号语义 |
| 简单 `grep "ClassName"` 找 file:line | ❌ | grep 已足够,启动 sub-Claude 开销不值 |
| 看文件 outline / 列 method | ❌ | `read` 直接读 |
| DBSet / Entity 字段清单 | ❌ | `read` 实体类 |
| 跨前后端契约 / 跨 SQL / git / 工作区文档 | ❌ | 根 session 业务,LSP 无关 |

### 2. 派遣命令模板

```bash
cd <项目根>/<子项目目录> && claude -p --model claude-haiku-4-5 \
  "用 LSP <op> <file:line:col>,返 <格式> JSON 数组" \
  --output-format json
```

- **模型默认 Haiku 4.5**(成本控制,2026-05-27 spike $0.15/call vs Opus 4.7 $1.02/call 6.8x 差)
- **复杂场景升级 Sonnet 4.6**(sub-Claude 内部需要多 op 组合 / 综合分析时)
- **--output-format json**:结构化输出,根 session 解析
- **cd 子目录是 LSP 加载 sln/package.json 的硬约束**(详 Context)

### 3. 多 sub-Claude 并行(跨子项目契约场景)

```bash
# 跨 SYS 后端 + MDM 后端 + BP 前端契约对齐 CR
Bash(run_in_background=true): cd AI.Extend.SYS && claude -p ...
Bash(run_in_background=true): cd AI.Extend.MDM.1 && claude -p ...
Bash(run_in_background=true): cd AI.REACT.SYS.BusinessPortal && claude -p ...
# 根 session 等三个 task-notification,综合 JSON 输出
```

### 4. Fallback 策略

- **简单任务默认 grep + 项目地图**(`.planning/codebase/`),不滥用 sub-Claude
- **sub-Claude 失败 / 超时 / 不可达 → fallback grep**,标注精度可能损失
- **sub-Claude 启动 cold start 30s-2min**,涛哥根 session 用 `run_in_background=true` 等通知,期间继续其他工作

### 5. 装机要求(跨项目复用前)

每个适用工作区(SYSV2 / SRMV2 / HC 等)需:
- **C# 项目**:.NET 10 SDK + `csharp-ls`(dotnet tool global)+ wrapper 注入 `DOTNET_ROOT`(系统默认 dotnet 是 .NET 8 时必需);plugin `csharp-lsp@claude-plugins-official`
- **TS / JS 项目**:`typescript-language-server`(npm global);plugin `typescript-lsp@claude-plugins-official`
- **工作区 `.claude/settings.local.json`**:allow `"LSP"` + `"Bash(claude -p:*)"`

SYSV2 装机 SOP 见配套 spec(若需重做):`docs/superpowers/specs/2026-05-27-subclaude-lsp-gateway-setup.md`(待写)。

---

## Consequences(影响 / 副作用)

### 正向

- **LSP 在 multi-repo workspace 可用**(突破单 workspace 限制)
- **涛哥工作流 0 改**(根 session 启动不变)
- **跨子项目并行**(N sub-Claude 同时跑 N 个 LSP server,各自子项目)
- **按需精度**(简单任务不付 LSP 启动开销)
- **符合 Anthropic 文章 "Subagent isolates context windows" 哲学**(隔离 context 处理 LSP 大 cold start)

### 负向 / 代价

- **单次 sub-Claude 成本**:Haiku 4.5 $0.10-0.30 / Opus 4.7 $0.5-1(模型选择拍板)
- **启动开销**:sub-Claude session 启动 + LSP cold start 30s-2min(首次)
- **月度成本估**(Haiku 4.5,假设 10-20 次/天):$45-90/月;Opus 4.7 同频:$300-600/月 — 模型选择重要
- **Cache 复用**:同 session 多次派遣 cache_read 命中后单次降到 $0.05-0.10

### 影响范围

- **跨项目工作区**:SYSV2 / SRMV2 / HC / 未来 MES/WMS/EAM/TPM
- **不适用**:单文件 / 单仓项目(Budget)— 直接根启动 LSP 即可,不需 sub-Claude
- **全局 `~/.claude/CLAUDE.md`**:加 Sub-Claude Gateway 触发桩(短,引本 ADR)
- **项目 CLAUDE.md**:不重复细则,引 ADR-035

---

## Alternatives Considered(其他选项 + 为什么没选)

### A. 改 Claude 启动目录(cd 子目录每次启动)

- 优点:0 装机改动,LSP 原生工作
- 缺点:涛哥工作流硬约束反对,跨子项目场景反而复杂化
- 不选原因:**涛哥明确拒绝改使用习惯**(2026-05-27 拍板)

### B. Custom MCP Server(写 LSP 代理)

- 优点:彻底解决 multi-root,主 session 内调
- 缺点:1-2 天开发 + 1-2 周稳定 / 3.2GB 内存(8 sln 同时驻留)/ 自维护负担
- 不选原因:工程量大 + 内存重 + Sub-Claude 已实证可用

### C. SYMBOLS.md 离线 symbol 索引

- 优点:0 成本 / 0 启动开销
- 缺点:陈旧风险(2-3 commit/day 项目 7 天显著陈旧)+ 覆盖度 40-50%(class 级,method 走 grep)
- 不选原因:**覆盖度低 + 维护成本**;Sub-Claude 实证后覆盖 95% + 实时

### D. 改 csharp-ls 源码支持 multi-sln

- 优点:从根本解决 csharp-ls 单 sln 限制
- 缺点:1 周开发 + .NET/F# 学习 + fork 噩梦(razzmatazz 每发版要 rebase)
- 不选原因:工程量过大 + 维护重

### E. 重构 csharp-lsp plugin manifest(本地 fork + 上游 PR)

- 优点:从 plugin 层支持 multi-root
- 缺点:plugin manifest 改不动 Claude Code 内核传 rootUri 行为(本会话 fetch 实证 marketplace.json 只有 command + extensionToLanguage 字段)
- 不选原因:**plugin 不是瓶颈,Claude Code 内核 + csharp-ls 设计才是**

### F. 换 Claude desktop / VSCode 扩展

- 优点:VSCode 原生 multi-root workspace
- 缺点:desktop / web 共享同一 plugin 实现不解决;VSCode 扩展工作流大改(涛哥 terminal CLI 是核心生产力)
- 不选原因:不解决问题 / 工作流大改

---

## Related(相关引用)

- **Anthropic 文章**:[How Claude Code works in large codebases](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start) —— "Subagent / Parallelism Strategy" 章节官方哲学背书
- **上游 ADR**:
  - ADR-002(四层文档结构,本 ADR 落工程标准层)
  - ADR-015(事实驱动 4 步硬规则,本 ADR 设计过程 spike + 实证反转走完整流程)
  - ADR-017(批次自治 / 中断白名单)
  - ADR-018(决策授权三档,本 ADR 是 Tier 3 多选项拍板)
- **下游影响**:
  - 全局 `~/.claude/CLAUDE.md`:加 Sub-Claude Gateway 触发桩
  - SYSV2 `CLAUDE.md`:Sub-Claude Gateway 段简化为引本 ADR
  - SRMV2 / HC `CLAUDE.md`:不动(全局已含)
- **实证 spike**:2026-05-27 早 7:18 + 8:30(本 ADR 写作时已完成,无独立 spec 落档)

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-27 | Proposed → Accepted | 涛哥拍板;基于 Haiku 4.5 spike 实证 $0.15 / 12.7s / 10 refs |
