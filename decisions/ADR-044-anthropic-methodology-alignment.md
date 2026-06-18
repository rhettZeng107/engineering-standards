# ADR-044: 对标 Anthropic 官方方法论 — 工作流哲学增补

- 状态:Accepted
- 日期:2026-06-18
- 关联:ADR-009(CLAUDE.md 精简 cheatsheet)/ ADR-015(事实驱动)/ ADR-017(批次自治)/ ADR-031(progress 接续 = 官方 long-running harness 同源)/ ADR-014(迁移轨,G5 重构对象)/ ADR-035(LSP = just-in-time retrieval)
- 官方来源(2026-06-18 实证):
  - building-effective-agents(workflows vs agents + 5 模式 + 3 原则)
  - effective-context-engineering-for-ai-agents(context 稀缺 / context rot / just-in-time)
  - effective-harnesses-for-long-running-agents(progress 文件 / 防 one-shot / harness 老化)
  - a-harness-for-every-task: dynamic workflows(claude.com/blog,6 组合模式)
  - lessons-from-building-claude-code: how we use skills(claude.com/blog)
  - Opus 4.x best-practices(subagent 克制 / 反 over-engineering / safe actions)

## Context

2026-06-18 全量对标 Anthropic 官方 6 篇工作流方法论。结论:本体系与官方**高度同源**,且在"机制化(hook 把规则变硬约束)"维度**超越官方默认**;progress.md(ADR-031)、契约锁(ADR-037)、subagent 隔离、决策授权三档(ADR-018)等是独立收敛到官方推荐的同一最佳实践。

识别 5 个有增量价值的 gap(G1–G5),其余维度已对齐或领先,**不动**——避免"为对标而堆规则",这本身违背 context 稀缺原则(G2)。

## Decision

### 立即采纳(轻量,落全局 `~/.claude/CLAUDE.md` + 本 ADR)

- **G1 最简优先 + subagent 克制**:不造多余文件/抽象/未要求的 flexibility(官方明示 Opus 4.5/4.6/4.8 有 over-engineer 倾向);subagent 只在可并行/需隔离/独立工作流时派,简单查询(grep/单文件/需跨步保 context)直接做不 spawn(官方:Opus 4.6 过度偏好 subagent,简单 grep 也派)。
- **G2 context 是稀缺资源(第一原则)**:优先最小高信号 token(context rot —— token 越多召回越差,硬限之前已退化)。已实践:ECC 通用 rules 停载、全局 CLAUDE.md 222→121。延伸:程序知识下沉 ADR/skill 按需加载,不堆 always-loaded 的 CLAUDE.md。
- **G3 harness 老化审计节律**:模型大版本切换(如 → Opus 4.8)后做一次轻审计,删因模型升级而成 dead weight 的 hook/规则/CLAUDE.md 段(官方:context-anxiety reset 在 Sonnet 4.5 需要、Opus 4.5 后成 dead weight)。2026-06-18 的 rules 停载 + CLAUDE.md 精简即首次范例。

### 立项(中大,走 spec+plan)

- **G4 progressive disclosure(CLAUDE.md 薄 + skill 厚)**:`standards/` 17 个程序标准仅 2 个(onprem-ssh-ops / workspace-bootstrap)做成可自动触发 skill,其余靠 CLAUDE.md/ADR 指针(部分 always-loaded)。立项评估哪些 standards/程序流程包装成带 description 触发器的 skill,CLAUDE.md 只留触发指针。依据 = 官方 skills 方法论(description 为模型触发写、folder 作 progressive disclosure)+ context engineering。
  - **第一批落地(2026-06-18)**:2 个高 ROI 已 skill 化 —— `subapp-onboarding`(标杆 MDM,SRM/MES/EAM 反复接入)+ `legacy-migration`(迁移痛点,联动 G5)。形态 = `~/.claude/skills/<name>/SKILL.md` progressive disclosure 入口(触发器 description + 主流程骨架 + 高频坑 + 指向 standards 全文真理源)。2 文件轻量,**未走独立业务 spec(G1 最简)**。验证实际触发 ROI 后再评估中 ROI 批(cicd/部署/i18n/memory-maintenance)。
- **G5 迁移轨重构(参考 dynamic-workflows 6 模式)**:迁移轨(ADR-014)历史踩坑密集(涛哥点名痛点)。引入官方 6 组合模式(classify-and-act / fan-out-synthesize / adversarial-verification / generate-filter / tournament / loop-until-dry)+ Workflow 工具编排,把迁移轨从"线性 plan"升级为"带独立 verifier 投票的 workflow harness",针对迁移特有失败模式(退化页误采信、等价性漏验、跨契约失真)设独立 verifier。

## Alternatives considered

| 方案 | 结论 |
|---|---|
| 全盘照搬官方建议 | 拒。多数已对齐/领先;照搬 = 重复造轮 + 堆规则,违背 G2(context 稀缺)。 |
| 不动(体系已成熟) | 部分采纳。但 G1–G3 低成本高频增益,G4/G5 是真痛点(迁移踩坑),值得。 |
| G1/G2/G3 各立独立 ADR | 拒。同一次对标的同源原则增补,合一 ADR 一决策语境;G4/G5 衍生 spec 另立。 |

## Consequences

- ✅ 补齐官方对标缺口,且保持 context 克制(全局 CLAUDE.md 仅 +2 行)。
- ✅ G3 制度化"删 dead weight",防 hook/规则只增不减膨胀。
- ✅ G4/G5 衍生 spec 立项(progressive disclosure / 迁移轨 workflow 重构)。
- 适用:全工作区(SYSV2 / SRMV2 / HC / MES / WMS / EAM / TPM)。
- **未采纳(已对齐,记录备查)**:workflows-vs-agents 分型、orchestrator-workers(主会话本体)、just-in-time retrieval(LSP)、像人测(E2E 真实 UI 提交)、人做 what/Claude 做 how(discuss 简化 + 涛哥深域 PM)、note-taking(progress.md)—— 均已在现行体系。
