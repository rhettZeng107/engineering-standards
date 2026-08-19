# ADR-021: SYSV2 工程标准机制化 — Lint + Eval 双引擎

- **Status**: Accepted
- **Date**: 2026-05-10
- **Decider**: 涛哥
- **Scope**: 跨项目(engineering-standards 仓 + SYSV2 8 个 nested repo + 后续所有 Claude Code 协作 brownfield 项目)

---

## Context(背景)

- **触发事件**:2026-05-10 与 Claude 关于 OpenAI Harness Engineering 文章的讨论。共识结论:涛哥当前工作流哲学**心法对标 OpenAI 到位**(Repository as system of record / 进步式披露 / 中央边界强制 / 决策授权放权),但**工程实施机制化欠缺**(rules-as-code / quality scorecard / doc-gardening),处于"手工艺"阶段。
- **真实诉求**(涛哥校准):不追 OpenAI greenfield 范式,聚焦 **「少踩坑 + 少返工 + PM 一人 leverage 多 agent 协同快速完成项目」**。
- **历史踩坑**(已沉淀但仍反复发生):
  - ADR-007 鉴权 4 条刚性写在 markdown,**code-reviewer 人工扫,Controller 缺 `[Authorize]` / Policy 未注册 仍需复审 1-2 轮才捕获**。
  - ADR-008 #6 Controller 空壳(直返 `new List<>()`)只能 E2E 实操才发现(P-E 踩过)。
  - 8 项核对人工清单装载随机,Claude 落盘前不撞墙。
- **决策不做的代价**:
  - 19 个 ADR + 28 条 memory 全靠 session 装载靠 Claude 主动 grep,**漏装即漏拦**,规则永远是反应式补丁。
  - 涛哥治理决策(新 ADR / 调 memory / 改 CLAUDE.md)凭感觉,无量化反馈回路。
  - 类似踩坑事件第二次发生时仍**无自动识别机制**。
- **核心判断**:涛哥的工程标准建设方向不应该追"自动化深度"(OpenAI 7 人 greenfield 范式),而应该聚焦自己范式独有的 ROI 操作 — **把已有规则从「markdown 文本」升级为「build-time 可执行 + 月度可量化」**。

## Decision(决策)

**一句话**:在 engineering-standards 仓加 **Lint(build-time 可执行规则)** 和 **Eval(月度可量化趋势)** 两个引擎,形成 `ADR ⇔ analyzer ⇔ eval` 三角自验证回路。

### 一、范围拍板

**做(in-scope)**:
- Lint 5 条(覆盖反复踩坑最集中的鉴权 + 契约 + qwen 越界)
- Eval 5 题(覆盖典型 task 类型,验证协议遵守率)
- 反馈回路(月度复盘 + 跨期对比)
- engineering-standards 仓增加 `analyzers/SYSV2.Analyzers/` + `eval/` 两个子目录

**不做(out-of-scope,留二期独立 spec)**:
- ❌ GitHub Actions CI 全面接入(本期仅本地 + 双推前 build 验证)
- ❌ 前端 ESLint custom plugin(本期不上,因为 i18n value 中英写反这类核心踩坑是数据问题非代码问题)
- ❌ 中文注释 lint(false positive 太高 + "业务约束"判断难自动化,留给 code-reviewer)
- ❌ Quality scorecard 持续评分(本期靠 eval 趋势替代)
- ❌ Doc-gardening 定时 agent(本期手动月度复盘)

### 二、Lint 5 条(分诊清单)

| # | 规则 | 类型 | 严重度 | 对应 ADR/memory |
|---|---|---|---|---|
| L1 | Controller 缺 `[Authorize]` 属性(含 ADR-007 4 类例外映射 — 见 spec §6.2) | Roslyn analyzer | error(new)/warning(legacy) | ADR-007 #1 + §例外 |
| L2 | `[Authorize(Policy="X")]` X 必在 `Program.cs` 注册(覆盖 2 种静态注册写法;自定义 `IAuthorizationPolicyProvider` 跳过 — 见 spec §6.1) | Roslyn 跨文件 analyzer | error | ADR-007 #2 |
| L3 | Controller method 直返 `new List<>()` 字面量空壳(**仅覆盖 ADR-008 #6 子项 1**;EF schema 漂移由 eval E2 + E2E 兜底) | Roslyn analyzer | warning | ADR-008 #6 子项 1 + `feedback_e2e_proactive_business_constraint_check` |
| L4 | 列表 API 返回类型必含 `items/totalCount/current/pageSize` 4 字段 | Roslyn analyzer | error | ADR-008 #2 |
| L5 | qwen 标记 commit 含 `.cs` 文件 | pre-commit hook (PowerShell + bash) | block | ADR-003 + `feedback_qwen_default_coding` |

**关键设计**:每条 lint 的 error message 必含**注入 Claude context 的 remediation**:具体怎么改 + 哪查参考 + 例外条件 + ADR 链接。

### 三、Eval 5 题(锁 3 个月,只调参数不改题型)

| # | 题目 | 检验维度 | 重复成本 |
|---|---|---|---|
| E1 | 给 SYS_HREmp 列表加 1 列 + i18n zh/en + 列设置三图标 | 前端 UI 标准 / i18n 完整 / zh-CN 中文 value / Vite 构建 | 测试库 DDL 回滚 + git reset |
| E2 | 给 SYS_AuthInfo 加 GET 接口 + Policy + DTO + 前端调用 | 鉴权 4 条 / 8 项核对 / 契约一致 | git reset + DDL 回滚 |
| E3 | 修一个已知 bug(BP 菜单 race 简化版) | 根因穷尽 / 自动复现 / 防回归 | git reset |
| E4 | Spec discuss 启动 → 全局理解 + 实证 + 灵感建议 → Q1 拍板 | ADR-016 历史先 grep / ADR-015 事实驱动 / ADR-004 灵感建议 / ADR-018 拍板等候 | **0**(纯 spec 文档,无副作用) |
| E5 | 给 SYS.3 一个列表页加搜索过滤 | 8 项核对 #7 业务操作闭环 / E2E 双层 | git reset |

**关键设计**:每题独立 git worktree + 模拟冷启动 + 跑完 Claude 自评 + 独立 `code-reviewer` subagent 审(防 self-gaming)+ 涛哥每月抽查 1 题。

### 四、反馈回路(`ADR ⇔ analyzer ⇔ eval` 三角)

```
踩坑事件 ──► ADR/memory 沉淀
                  │
                  ▼
            可机器验证?
            ├─ 是 ──► 加 lint(build-time 兜底)
            └─ 否 ──► 加 eval 题(暴露雷达)
                  │
                  ▼
            月度跑 eval baseline
                  │
                  ▼
            同类坑复发?
            ├─ 是 ──► 反推该升级到 lint
            └─ 否 ──► 验证规则装载有效
                  │
                  ▼
            数据反馈给 ADR/memory 治理
```

### 五、技术选型

| 维度 | 选型 | 理由 |
|---|---|---|
| .NET 静态分析 | Roslyn Analyzer + `Microsoft.CodeAnalysis.CSharp` | 默认接入 `dotnet build`,IDE/CI 都能跑 |
| 分发方式 | NuGet 包 `SYSV2.Analyzers` + 各 `.csproj` 引用 | 8 个 nested repo 统一升级 |
| Spike 阶段发布通道 | 本地 NuGet feed | 1 周快速迭代,不阻塞 |
| 扩量阶段发布通道 | GitHub Packages 或内网 Azure Artifacts(涛哥拍板) | — |
| 强制方式 | `dotnet build /warnaserror:SYSV2_*` | 本地 + 双推前阻塞 |
| Eval 跑法 | 独立 git worktree + 标准 CLAUDE.md 装载 + Claude 4.7 | 模拟真实 session 启动 |
| Self-gaming 防御 | 独立 `code-reviewer` subagent 审 + 涛哥月度抽查 | 三层 |

## Consequences(影响)

### 正向

- **rules-as-code**:鉴权 4 条 + Controller 空壳从「人工扫」升到「build-time 撞墙」,Claude 落盘前自修不用 reviewer 反馈环
- **量化治理**:涛哥治理改动(新 ADR / 调 memory)从「凭感觉」升到「看 eval 趋势」
- **预防式拦截**:同类坑第二次发生前自动识别
- **engineering-standards 仓升级为完整生态**(规则 + 执行 + 验证 + 反馈),与 SYSV2 业务仓彻底解耦
- **可跨项目复用**:后续 SRM / MES / WMS / EAM brownfield 改造可直接套用同套基建

### 负向 / 代价

- **Legacy false positive**:首批 L1 必须 warning + suppress list 灰度,baseline 跑出 N 条 legacy 一次性加 `SuppressMessage` 或例外清单
- **Roslyn analyzer 学习曲线**:Claude 自己写需要练习,Spike 阶段 Tier 2 涛哥参与降风险
- **维护点新增**:ADR 改动 → analyzer 改动 → eval 题改动 三件套需要同步演进
- **Token 耗费**:Eval 全跑一次预估 ~200K token,首期只跑 E4(~30K)+ E2(~50K)灰度
- **题目集过拟合**:v1 锁 3 个月,期间只调参数(列名/字段名)不改题型

### 影响范围

- **影响 spec**:`docs/superpowers/specs/2026-05-10-harness-mechanization-lint-eval/spec.md`
- **影响 plan**:同主题 `plan.md`
- **影响仓**:
  - `engineering-standards/analyzers/SYSV2.Analyzers/`(新建,本 ADR spec 落地)
  - `engineering-standards/eval/`(新建,本 ADR spec 落地)
  - SYSV2 中 .NET 项目共 **6 个 .csproj**(SYS 4 个:Domain / Infrastructure / WebApi / Tests + MDM 2 个:BaseModel / MDMWebApi),分布在 **2 个 nested repo**(`AI.Extend.SYS` + `AI.Extend.MDM.1`)
  - **首期 L1 仅接入 2 个 WebApi.csproj**(`AL.Extend.SYS.WebApi.csproj` + `MDMWebApi.csproj`),Domain/Infrastructure/Tests/BaseModel 不引 analyzer(避免 Tests 项目 mock controller 全是误报)
  - **`feature/ww` 鉴权阉割版例外**(C2):该分支 `.csproj` 加 `Condition` 跳过 `SYSV2.Analyzers` PackageReference,或加根目录 `.editorconfig` 关掉 `SYSV2_AUTH_*` 诊断;该分支永不推 GitHub
- **影响全局 CLAUDE.md**:新增「Lint × Eval 双引擎」段(本 spec 完结后更新)
- **配套 ADR**:
  - ADR-007(鉴权 4 条刚性)→ L1/L2 实施载体
  - ADR-008(8 项核对)→ L3/L4 实施载体
  - ADR-003(编码工作流硬切分)→ L5 实施载体
  - ADR-016(历史先 grep)→ E4 检验载体
  - ADR-015(事实驱动)→ E4 检验载体
  - ADR-004(PM 视角灵感建议)→ E4 检验载体
  - ADR-018(决策授权三档)→ E4 检验载体
  - ADR-017(批次任务扩大版)→ Eval 跑题不打断

## 修订(2026-06-18,P3 A 阶段 — L4 砍除,降级 E2E 兜底)

> 触发:P3 A 阶段扩量(L2/L3/L4 + MDM 接入)实证现状时,**L4 既定前提反转 + 技术阻塞**(ADR-015 实证反转,涛哥拍板 A 案)。

**实证发现**(SYSV2 代码级):

| 来源 | 真实返回形态 | 合规 `items/totalCount/current/pageSize`? | return-type analyzer 可见? |
|---|---|---|---|
| SYS `Pagination<T>`(16 处,HR 全家) | `Data` / `Total` | ❌(缺 current/pageSize,用 Data) | ✅ 命名类型 → 会误报 16 处 |
| SYS `PagedResult<T>`(7 处) | `Items`/`Total`/`Page`/`PageSize` | ❌(Total/Page ≠ totalCount/current) | ✅ → 误报 7 处 |
| SYS `AuthAccountPagedResult`(1,最新) | `Items`/`TotalCount`/`Current`/`PageSize` | ✅ | ✅ |
| MDM(`CustomerController.cs:494/613` 等) | `Ok(new { items, totalCount, current, pageSize })` 匿名对象 | ✅ 已合规 | ❌ 声明类型=`IActionResult`,字段在方法体匿名对象内 |

**两个硬伤**:
1. **前提反转** — spec §6.1 假设「新 SYS 合规(error)/ MDM legacy 不合规(warning)」;实况相反:MDM 列表接口**已合规**,SYS 主力分页类型 `Pagination<T>`(16 处)**不合规**。按 spec 字面写 L4 会误报 SYS 23+ 处正常接口。
2. **技术错配** — L4 = return-type symbol 分析:只看得见 SYS 命名类型(不合规那批),完全看不见 MDM 真正合规的匿名对象 `Ok(new {...})`。能看的不合规,合规的看不见。

**决策**:**L4 砍除**(不实现 `SYSV2_CONTRACT_002`,常量保留为 deferred)。真实分页契约 = 每个接口前后端**逐接口各自约定**(前端按 `res.total`/`res.items`/`res.data` 适配),非单一绝对字段名集合 → 属**契约锁 + E2E 8 项核对 #2(真实 UI)**职责,非静态 analyzer 能干净覆盖。

**影响**:本 ADR §二 L4 行(:50)语义降级为「E2E #2 + contract-lock 兜底,不上 analyzer」;§三 Eval 不变(E2/E5 仍验分页契约一致);P3 A 阶段仅落 L2 + L3 + MDM 接入(L1-L3)。

## 修订(2026-08-19,Codex 工作流质量记录 + 月度复盘)

> 触发:全局工作流完成 Codex-native 接管与 CR/迁移成本优化后,现有 eval 仍主要停留在单个 Claude 时代 E4 baseline,无法客观判断首审、返工、E2E 和 HIGH 逃逸趋势。涛哥拍板把正常门禁产生的质量事件同步进接续/run record,并按月用评测证据优化或清理规则。

本修订覆盖原文 §三/§四/§五中固定 `Claude 4.7`、固定 5 题全跑和“仅手工月度复盘”的运行口径,不改 Lint 已有技术决策。

### 质量事件

- `progress.md` 只保留人读快照;需要跨期统计时以结构化 run record 为准。只在门禁状态变化或批次关闭时更新,不为每个 task 生成评测总结。
- 记录批次结果(`complete/partial/blocked/cancelled/unknown`)、主 CR 首审直通、CR 阻断回修、验证回修、E2E 产品回修/环境失败、重新锁定基线和 HIGH 逃逸观察边界。不得用存在 `endedAt` 或 run record 推断已完成;正常编码修改、格式化、非阻断 LOW/MED 和纯环境重试不算返工。
- HIGH 逃逸按 `not_observed/observed/not_evaluable` + `observedThrough` 表达。任务刚关闭时的 0 只代表截至当前观察边界未发现,不是永久无逃逸断言。
- Token、成本、耗时只有运行时可自动取得时才记录;禁止让模型估算,也不为补齐这些字段增加一次总结调用。

### 月度复盘

1. 先做确定性聚合和数据质量检查,再由模型/人工判断因果和规则取舍。
2. 简单/标准/迁移/DB 鉴权/E2E-heavy 分层比较,不汇总成一个误导性平均分。
3. 每条规则给出 `retain/optimize/move_to_mechanism/demote/remove` 建议、证据和残余风险。
4. 一次只改一组可归因规则,保留 baseline 后运行相关 delta eval;质量回归则恢复或再调整。
5. 零事故不能单独证明规则无用;安全、生产破坏、鉴权、不可逆 DB 和审计硬边界不因低频清理。

### 自动化边界

月度 Scheduled/automation 默认只读,可以读取 run record、eval 和事故证据并生成报告,不得无人值守修改全局/项目 `AGENTS.md`、ADR、skill 或门禁。正式规则调整仍按正常实证、评审、验证和提交闭环执行。

官方依据:

- OpenAI Evaluation best practices:任务特定评测、开发时记录、尽量自动评分、持续评测,并用人工反馈校准自动评分。<https://developers.openai.com/api/docs/guides/evaluation-best-practices>
- OpenAI Scheduled tasks:定时任务先在普通会话验证,观察前几次运行再调整;本地项目任务依赖桌面端运行和可用工作区。<https://learn.chatgpt.com/docs/automations>

## Alternatives Considered(其他选项)

### A. 维持现状(仅 markdown 规则 + 人工 code-reviewer)
- **优点**:0 基建成本
- **缺点**:规则反应式补丁,同类坑反复踩,治理决策凭感觉
- **不选原因**:与涛哥诉求「少踩坑 + 少返工 + 协同快速」直接冲突

### B. 全 Lint 不 Eval(只做规则机器化,不做量化反馈)
- **优点**:实施聚焦,首期成本低
- **缺点**:无反馈回路验证 lint 有效性,无法识别"哪类坑没被规则覆盖"
- **不选原因**:Lint 单方面是开环系统,缺 eval 暴露雷达

### C. 全 Eval 不 Lint(只做量化趋势,不做规则机器化)
- **优点**:暴露问题
- **缺点**:每个踩坑都是新事件,无 build-time 兜底
- **不选原因**:Eval 是诊断工具不是预防工具,需 Lint 配合

### D. 上 GitHub Actions CI + 全套 doc-gardening(完整对标 OpenAI)
- **优点**:对标头部团队
- **缺点**:范围扩大 3 倍,1 人 PM 不开 PR review 价值低,跨仓 CI 成本高
- **不选原因**:涛哥真实诉求是协议机制化不是自动化深度;留二期独立 spec

### E. 独立 `SYSV2.Analyzers` 仓(与 engineering-standards 平级)
- **优点**:关注点分离(文档真理源 vs NuGet 源代码)/ NuGet 发布纯净 / 仓职责单一
- **缺点**:跨仓维护成本(改 ADR-007 → 同时改 analyzer 跨仓 PR);版本漂移风险;ADR ⇔ analyzer 反向引用难
- **不选原因**:工程标准与执行载体协同演进,放一仓减少版本漂移;跨项目复用时(后续 SRM / MES / WMS / EAM 等)直接在 `engineering-standards/analyzers/<Project>.Analyzers/` 子目录扩展即可,无需独立仓

## References

- **Spec**:`SYSV2/docs/superpowers/specs/2026-05-10-harness-mechanization-lint-eval/spec.md`
- **Plan**:`SYSV2/docs/superpowers/plans/2026-05-10-harness-mechanization-lint-eval/plan.md`
- **触发讨论**:2026-05-10 Session「Harness Engineering 工程讨论与改善」
- **外部参考**:OpenAI Harness Engineering blog (2026-02-11) — Ryan Lopopolo
- **配套 ADR**:ADR-003 / ADR-004 / ADR-007 / ADR-008 / ADR-015 / ADR-016 / ADR-017 / ADR-018
