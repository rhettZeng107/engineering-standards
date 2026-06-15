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

**核心边界**:**Symbol 查找一律 LSP / 非 Symbol 走 grep · Read · ps · git · dba**。

| 任务类型 | 派 sub-Claude? | 理由 |
|---|---|---|
| **任何 symbol 查找**(class / interface / method / property 定义 / 引用 / 类型 / 调用链) | ✅ **默认派** | LSP 一致精准,grep 偶错风险 > LSP 启动开销;**`run_in_background=true` 吸收等待** |
| `findReferences` 跨文件 | ✅ | grep 命中噪声 100x,LSP 精准 |
| `goToDefinition` / 简单单点 "class X" 找 file:line | ✅ | 一致性优先;grep 偶错(命中注释/字符串/同名不同类)→ 返工成本 > LSP $0.05-0.15 单次 |
| 精确 `rename` 跨文件 | ✅ | grep + sed 不安全(注释/字符串误改) |
| `prepareCallHierarchy` / `incomingCalls` / `outgoingCalls` | ✅ | grep 难以拼调用链 |
| `hover`(看类型 signature) | ✅ | grep 拿不到类型推断 |
| `workspaceSymbol` 模糊搜索 | ✅ | LSP 限定符号语义 |
| `goToImplementation`(接口实现 / 子类) | ✅ | grep 没有"实现"语义,LSP 直接给 |
| **非 symbol 查找** — 看文件 outline | ❌ | `Read` 直接读 |
| 找文件(file 名 / 路径)| ❌ | `find / ls / Glob` |
| grep 文本(配置 / 文档 / 注释) | ❌ | `grep / Read` |
| 进程 / 装机状态 | ❌ | `ps / ls / which` |
| git 状态 / commit / blame | ❌ | `git status / log / blame` |
| DB schema / DBSet 字段 | ❌ | `dba` subagent / mssql MCP |
| 跨前后端契约 / 工作区文档 / SQL / 配置 | ❌ | grep / Read,LSP 无关 |

### 1.1 修订理由(2026-05-27 涛哥反馈)

- **一致性 > 局部效率**:涛哥 KPI 是「一次性成功率」+「减少试错 token 浪费」;grep 偶错(命中注释 / 同名不同类 / 漏继承链)→ 基于错事实决策 → 返工成本远超 LSP 单次 $0.05-0.15
- **启动开销吸收**:首次冷启 30s-2min → `run_in_background=true` 后台跑,涛哥根 session 期间继续其他工作;同 session 后续 cache reuse,启动 < 10s
- **判定简化**:不再 case-by-case 判断 "grep 够不够",规则变成「**是 symbol 吗?是 → LSP / 否 → 其他**」

### 2. 派遣命令模板

```bash
cd <项目根>/<子项目目录> && claude -p --model claude-haiku-4-5 \
  --exclude-dynamic-system-prompt-sections \
  "用 LSP <op> <file:line:col>,返 <格式> JSON 数组" \
  --output-format json
```

- **`--exclude-dynamic-system-prompt-sections`**(2026-05-27 修订追加):移 per-machine 段(cwd / env info / memory paths / git status)从 system prompt 到首个 user message。改善 cross-session prompt-cache reuse,多次派遣同 / 类似任务时第 2 次开始 cache 大幅命中。零风险(官方 flag,不影响 LSP / hook / plugin)。

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

- **非 symbol 任务**(文件 / 进程 / git / 配置 / DB schema / 文档 / 文本 grep)→ `grep` / `Read` / `ps` / `git` / `dba` 直接,LSP 无关
- **sub-Claude 失败 / 超时 / 不可达 → fallback grep**,标注精度可能损失,后续涛哥拍板修
- **sub-Claude 启动 cold start 30s-2min**,根 session 用 `run_in_background=true` 后台跑,期间继续其他工作

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
- **一致性**:所有 symbol 查找走同一路径,不再 case-by-case 判定「grep 够不够」(避免 grep 偶错 → 返工)
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

## 修订(2026-05-27)

### 派遣命令加 `--exclude-dynamic-system-prompt-sections`

- **触发**:涛哥关心启动开销 / cache 复用,实证 SessionStart 注入大头是 `project-map-session-digest.js`(项目地图 STACK + ARCH + MECHANISMS 摘要)+ 全局 + 项目 CLAUDE.md + memory 索引,合计 ~50-150k tokens
- **改动**:派遣模板加 `--exclude-dynamic-system-prompt-sections`(官方 flag,移 per-machine 段到 user message 改善 cache reuse)
- **预期降本**:多次派遣同/类似任务时 cache_read 命中率提升,平均成本降 30-50%
- **未做**(策略 B 暂缓):hook env-aware skip 逻辑(`CLAUDE_SUB_TASK=1`)— 涛哥选 A 先观察 1-2 周再评估是否升级到 B

## 修订(2026-06-01)— SRMV2 复现 + 病根精确定位(原生 C# LSP 根 session 静默返空)

### 实证(SRMV2 工作区,本机 csharp-ls 0.24.0)

- **原生 LSP 工具对 C# 在根 session 语义操作静默返空**(行为较 2026-05-27 死锁报错更隐蔽):
  - `documentSymbol`(语法)✅ 通 —— `SCMContext.cs` 返完整符号树
  - `findReferences`(语义)❌ 返「No references found」—— 而 grep ground truth = **59 处真实引用**(`Program.cs:113 AddDbContext<SCMContext>`、多 Controller 注入)
  - 诊断 ✘ `System.Object`/`System.Void` **CS0518/CS0012「未引用程序集」** —— 证明是**编译模型没加载**(非 warmup 冷启动问题)
- **防坑硬规则**:根 session 的 C# 语义 LSP(findReferences / goToDefinition 跨文件 / goToImplementation / workspaceSymbol)**返空不可信任**;`documentSymbol` 可用。否则基于"无引用"假事实决策 = ADR-015 返工。

### 病根精确定位(纠正早期"CC 协议没救"判断)

web + GitHub issue 交叉印证:
- csharp-ls **0.24.0** 作者 razzmatazz 在 [anthropics/claude-code#16360](https://github.com/anthropics/claude-code/issues/16360)(2026-04-17)称协议握手已修、不再需要 adapter —— **0.24.0 即本机装的版本**。
- 故 multi-root 根 session 仍失败的**真因不是 Claude Code 协议 handler 缺口,而是 monorepo 根无 .sln** → csharp-ls 拿不到 solution path → CS0518。
- 印证:#16360 unsafePtr(2026-05-26)做代理注入 `solution/open` 通知即跑通 findReferences → 缺的就是"加载哪个 solution"。
- **结论**:本 ADR 的 sub-Claude `cd 子项目`(子项目根有单一 .sln)正是"提供 solution path"的正确解 —— web 通用建议「scope rootUri 到单 solution 目录」与本 ADR 同向,gateway 被背书。

### 关联 issue tracker(待 Anthropic 修则可弃 gateway 省 token)

| Issue | 内容 | 状态(2026-06-01 实证) |
|---|---|---|
| [anthropics/claude-code#16360](https://github.com/anthropics/claude-code/issues/16360) | csharp-ls 不工作 — CC 缺 `workspace/configuration` / `client/registerCapability` / `window/workDoneProgress/create`,拿不到 solution path | **OPEN**,`bug`+`has repro`+**`oncall`**,51 评论,2026-01-05 开 |
| [anthropics/claude-code#38683](https://github.com/anthropics/claude-code/issues/38683) | 改进 CC 对官方 Roslyn LS(`Microsoft.CodeAnalysis.LanguageServer`)兼容;换 Roslyn 也只半通(goToImpl/workspaceSymbol 仍坏) | **OPEN**,5 评论,2026-03-25 开 |

### 评估过的"更优 server"为何不选

- **官方 Roslyn LS**:质量更高但非独立(需 wrapper)+ 最新 SDK + **仍需代理注入 `solution/open`** 补 CC 缺口 + multi-root rootUri 照旧 → 不解 SRMV2 根问题,性价比低。
- **OmniSharp**:官方已 maintenance-only,不选。
- **根级聚合 .sln**:跨 3 个 gitignored 独立仓 + 维护负担 → 高代价不彻底。

### 不做(defer)

- roslyn-ls + adapter 代理实测 spike(Tier 3):预期仍受 multi-root 限制,默认不做;待 #16360 修复或涛哥立项再评估。

## 修订(2026-06-10)— lsp-nav v2.1 双后端落地:同仓高频 symbol 导航补位,gateway 收窄不替换

### 背景

评估 `references/ai-agent-lsp-navigation.md` + `tools/lsp-nav`(Rhett 2026-06-03 Windows 实现并入仓,Roslyn LS 后端,macOS 当时未实测)在 macOS 的可行性。该工具在架构上 = 本 ADR Alternatives **B(自建 LSP 代理)** 被否路线的 TCP 轻量变体 —— 自建常驻 bridge,**绕开 Claude Code 的 LSP 客户端**,自行应答 CC 缺失的 3 类 server→client 请求(`workspace/configuration` / `client/registerCapability` / `window/workDoneProgress/create`,即 #16360 缺口),并显式提供 solution path。

### macOS 实证(2026-06-10,涛哥 Y 后落地)

- **本机阻断**:v2.0 Roslyn 路线硬依赖 VS Code C# 扩展 DLL + 其 .NET 10 runtime —— 本机仅 Cursor(0 扩展)、无 Roslyn DLL,v2.0 跑不起来。
- **解法 = v2.1 双后端**:bridge 增加 **csharp-ls 0.24.0 次选路线**(本机已有,零新依赖,不需 VS Code);Roslyn 仍为优先后端(Windows)。
- **#16360 真因证实**:同一 csharp-ls(CC 根 session 下语义返空,见 2026-06-01 修订)接自建 bridge 后,SRMV2 供应商真 sln `references` 返 **63 命中/32 文件**;grep ground truth 116 行/37 文件(LSP 滤掉 ~2x 注释/字符串噪声)。瓶颈确认是 CC LSP 客户端实现,不是 server。
- **多实例双仓实证**:Supplier(63 refs)+ Buyer(同名 `SCMContext` 45 refs)并存不串,`--file` 自动路由正确。
- **成本/延迟**:单查 $0(零 token)、常驻后 ~2s;`start` ~5s 返回(listener 前置),sln 后台加载 **3-5+ 分钟/次冷启**(csharp-ls 无 solution 缓存,常态非调试干扰;批次内保持常驻摊薄)。
- **防假阴性**:未加载完成的语义空结果报错而非静默返空(加载窗口 csharp-ls 实测会挂起查询到加载完再答,非空结果可信)。

### 决策(涛哥 2026-06-10 拍板 A:双后端合一)

**补位共存,不替换 gateway**(不推翻本 ADR,故不 Supersede):

| 场景 | 走哪条 |
|---|---|
| **同一 sln 内高频 symbol 导航**(references / definition / hover / find / callers) | **lsp-nav bridge**(零 token + 常驻后秒级) |
| 跨子项目并行契约 CR / 需大 context 隔离的综合分析 | **sub-Claude gateway**(本 ADR 主体) |
| TS/JS symbol | 原生 typescript-lsp plugin(根 session 可用,见 2026-06-01 修订) |

- 对 B 选项否决理由的修正:当初估「1-2 天开发 + 3.2GB 内存(8 sln 驻留)」;实际 Windows 半天落地 + macOS 半天移植,sln 按需启停。**否 B 的核心依据已部分失效,但 gateway 的 context 隔离价值仍独立成立** → 共存而非替换。
- 代价:工具自维护(~800 行 JS);若 #16360 官方修复使原生 LSP 在 multi-repo 根可用,lsp-nav 与 gateway 同时退役。
- 用法/装机/性能基线唯一真理源:`tools/lsp-nav/SKILL.md`(v2.1)。
- **defer**:Windows 机 pull 后跑 Roslyn 路线回归冒烟(start 不带 --wait → 立即 callers,确认半加载窗口行为;本 macOS 无法回归 Roslyn 路线)。

## 修订(2026-06-11)— SessionStart 自动预热 lsp-nav(免手动启动,全局标准)

### 背景

涛哥 HC 会话实测:每个工作区每次新会话都要人为提示才 start lsp-nav,冷启 3-5 分钟等待落在查询时刻。涛哥要求「新增会话默认加载并启动,全局标准」。

### 决策(涛哥 2026-06-11 指示,Claude 自治落地)

- **全局 SessionStart hook `~/.claude/hooks/core-lsp-autostart.js`**:会话启动时读工作区 `<cwd>/.claude/lsp-autostart.json`(`{"solutions": ["相对或绝对 sln 路径", ...]}`),对每个 sln 后台 detached `lsp-nav start` 预热;已运行实例幂等跳过;spawn 后立即返回不阻塞会话启动。
- **无配置文件 = 静默不启动**:避免误预热 fork 仓 / 他人 sln / 非 C# 工作区;新工作区接入只需建一个 json(workspace-bootstrap 项目纳入模板)。
- **HC 首个接入**:`HC/.claude/lsp-autostart.json` 列 srm / srm02 / srmc 三主力 sln(JY.SRMM03 / SRMMgt_M03 / contract 等辅助 fork 仓不预热)。
- **实证(2026-06-11)**:hook 实测幂等正确(srm02 已运行跳过,srm/srmc 新启);预热后 `find M02Context` 返回 2 类定义精确命中,查询守卫在加载窗口正确等待不返假阴性。
- **资源约定**:常驻 csharp-ls 每 sln 一实例;批次结束 `stop --all` 释放(hook 注入提示语已带)。

## 修订(2026-06-15)— macOS Roslyn 路线打通 + 关官方 csharp-lsp 插件消「框架引用假阳性诊断」

### 触发场景(本会话,涛哥问)

C# 文件 Edit 后 Claude Code 注入的 `<new-diagnostics>` 满屏框架引用飘红(CS0518 `IsExternalInit` / CS0656 `RequiredMemberAttribute` / CS0246·CS0234 `Microsoft.AspNetCore.*` / CS0012 `IApplicationBuilder`),而 `dotnet build` = 0 error。问:是否假阳性 + 能否优化。

### 根因实证(假阳性源 = 官方 csharp-lsp 插件的 csharp-ls 0.24,**非 lsp-nav**)

机器有**两条独立 C# LSP 通道,共用同一 csharp-ls 0.24 二进制**:

| 通道 | 实证 | 角色 | 假阳性责任 |
|---|---|---|---|
| 官方 `csharp-lsp@claude-plugins-official` | `settings.json` enabledPlugins=true;插件目录仅 `README.md`+`LICENSE`(无 plugin.json / 无 server 配置项,server 由 CC core 写死探测 csharp-ls);`ps` 裸 `.csharp-ls.shim`(无 sln 参数) | Edit/Write 后注入 `<new-diagnostics>` | **就是它** |
| lsp-nav bridge | `ps` `.csharp-ls.shim -s <sln> -l` | 主动 `find`/`callers` 导航(workspace symbol index,可信) | 无关 |

- 环境本身健康(排除 restore / targeting pack 缺失):.NET SDK `8.0.421` + ASP.NET Core 共享框架 `8.0.27` 在位、6 个 `.csproj` 的 `project.assets.json` 全 restore → `dotnet build` 0 error 为真相。
- **真根因**:csharp-ls 0.24.0(社区单作者轻量 server)对 .NET 8 SDK-style **隐式框架引用**(`Microsoft.AspNetCore.App` 由 SDK 隐式注入)+ targeting pack 引用程序集的 MSBuild design-time 解析不完整 → 语义诊断引擎拿不到框架元数据,专挑 `record`/`required`/ASP.NET 类型飘红;但 workspace symbol index 有源码符号 → 「**navigation 可信、diagnostics 不可信**」分裂正源于此。
- **关键**:lsp-nav 切 Roslyn **不碰官方插件** → 纯换 lsp-nav 后端消不掉这批假阳性;消假阳性唯一手段 = **关官方插件**。

### 决策(涛哥 2026-06-15 拍板 A2:关插件 + lsp-nav 上 Roslyn)

实证反转纠正(ADR-015):初版方案把「lsp-nav 换 Roslyn」描述为「假阳性基本消除」,深挖后证伪(假阳性源是官方插件不是 lsp-nav)→ 升档回报 → 校准后涛哥选 A2:

1. **A 关官方 csharp-lsp 插件**:`~/.claude/settings.json` enabledPlugins `csharp-lsp@claude-plugins-official` → **false**(消假阳性注入源;session 重启生效);导航零损失(lsp-nav 独立通道)。`typescript-lsp@…` 不动,保留。
2. **C lsp-nav 升 Roslyn**(macOS 路线打通,**反转 2026-06-10 修订「本机阻断」**):
   - 涛哥本机已装 VS Code 1.123.2(`~/Desktop/VS Code/`,非 /Applications 故早期 `which code` 未探到);
   - `code --install-extension ms-dotnettools.csharp` → C# 扩展 **v2.140.9**(darwin-arm64),自带 Roslyn DLL `.roslyn/Microsoft.CodeAnalysis.LanguageServer.dll`;
   - Roslyn `runtimeconfig.json` 要 `net10.0`(rollForward Major)→ `dotnet-install.sh --channel 10.0 --runtime dotnet` 装 **.NET 10.0.9 runtime** 到 lsp-nav 期望路径 `…/ms-dotnettools.vscode-dotnet-runtime/.dotnet/10.0/`;
   - `lsp-nav doctor` → 「LSP 后端:✓ Roslyn(语义质量最高)」;bridge 重启实测 `initialize OK(26 caps)` / **`projectInitializationComplete` 耗时 2s**(csharp-ls 同 sln 冷启 3-5 分钟,提速两个数量级);`find EquipmentGetListOutputDto`→`:6:14`、`find TpmWebApiModule`→`:59:14` 精确。

### 装机要求更新(覆盖 Decision §5 line 99-106)

- **C# 优先后端改 Roslyn**:VS Code C# 扩展(`ms-dotnettools.csharp`,自带 Roslyn DLL)+ .NET 10 runtime(lsp-nav `.dotnet/10.x/` 路径);**csharp-ls 0.24 降为「无 VS Code 机器」的 fallback**(2026-06-10 双后端结论保留:Roslyn 优先、csharp-ls 次选)。
- **官方 `csharp-lsp@claude-plugins-official` 反转为 disable**(原 §5 line 102 要求启用):它只用 csharp-ls 0.24、无法切 Roslyn、是框架假阳性诊断唯一注入源;**C# 编译正确性以 `dotnet build` 为唯一裁定,符号导航走 lsp-nav(Roslyn)**。

### 影响范围(跨项目机器级)

- Roslyn DLL + .NET 10 runtime 是**机器级共享**(`~/.vscode/extensions/` + VS Code globalStorage);`lsp-nav doctor` 现全局返 Roslyn → **SYSV2 / SRMV2 / HC / TPMV2 所有 C# 工作区的 lsp-nav 下次 autostart 自动升级 Roslyn**(无需各自配置)。
- 关官方 csharp-lsp 插件是**全局 settings**,对所有 C# 工作区一致生效(消假阳性 + 不再起裸 csharp-ls 实例)。
- 本次 `stop --all` 停了 SYSV2(SYS/MDM)历史 bridge;下次各 session autostart 用 Roslyn 重起。

### defer

- 官方 issue #16360(CC LSP 客户端缺 solution path)/ #38683(CC 对 Roslyn LS 兼容)未复查;本次走 lsp-nav 自建 bridge,不依赖 CC 原生 LSP,不受影响。
- hook `core-lsp-autostart.js` 文案「后台加载 3-5 分钟」对 Roslyn 已过时(实测秒级),但 csharp-ls fallback 场景仍准 → 暂不改。

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-27 | Proposed → Accepted | 涛哥拍板;基于 Haiku 4.5 spike 实证 $0.15 / 12.7s / 10 refs |
| 2026-05-27 | 修订(派遣模板加 `--exclude-dynamic-system-prompt-sections`)| 启动开销实证后加官方 cache reuse flag |
| 2026-06-01 | 修订(SRMV2 复现 + 病根精确定位)| 原生 C# LSP 根 session 语义静默返空(documentSymbol 通/findReferences 空+CS0518);真因=monorepo 根无 .sln(非 CC 协议,csharp-ls 0.24.0 已修握手);关联 anthropics/claude-code#16360(oncall OPEN)#38683;gateway 被 web 背书 |
| 2026-06-10 | 修订(lsp-nav v2.1 双后端落地)| macOS csharp-ls 路线实证 63 refs/$0/常驻秒级,双仓多实例不串;补位共存:同仓高频 symbol → lsp-nav,跨子项目/context 隔离 → gateway;#16360 实证仍 OPEN(oncall,last update 5/26) |
| 2026-06-11 | 修订(SessionStart 自动预热)| 全局 hook core-lsp-autostart.js + 工作区 .claude/lsp-autostart.json 声明式接入;无配置静默跳过;HC 首接(srm/srm02/srmc);幂等 + find 实证通过 |
| 2026-06-15 | 修订(macOS Roslyn 打通 + 关官方 csharp-lsp 插件消框架假阳性)| 框架引用假阳性源=官方插件 csharp-ls 0.24 语义诊断(非 lsp-nav);涛哥拍板 A2:关插件(settings false)+ lsp-nav 升 Roslyn(VS Code C# 扩展 v2.140.9 + .NET 10.0.9 runtime,加载 2s,find 精确);机器级,所有 C# 工作区 lsp-nav 自动升 Roslyn;csharp-ls 降 fallback |
