# ADR-044: 对标 Anthropic 官方方法论 — 工作流哲学增补

- 状态:Accepted
- 日期:2026-06-18
- 当前适用范围（2026-09-09修订）：早期Claude/Anthropic机制、模型、独立verifier投票及路径仅为历史理由；当前执行以Codex运行时、最近AGENTS和本ADR末尾修订为准，不从旧G5重建已停用评审门禁。
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

## 修订(2026-08-19,OpenAI AGENTS.md 字节预算与常驻规则压缩)

> 触发:核对“AGENTS.md 官方是否建议不超过 200 行”。OpenAI 官方没有 200 行限制;Codex 按 global→project→nested 合并指令链,默认在 `project_doc_max_bytes=32 KiB` 停止追加,并建议主文件简短准确、任务流程下沉 skill、项目特化放最近的 nested `AGENTS.md`。

### 实证

- 优化前 `~/.codex/AGENTS.md`:227 行 / 23,487 bytes,单文件未超过默认 32 KiB,但每次任务均常驻。
- 本机 `project_doc_max_bytes=65,536`;压缩后 global+HC root 为 42,858 bytes(41.85 KiB)。当前实测最深链 `global + gsd-fork/docs + gsd-fork/docs/ja-JP` 为 62,031 bytes(60.58 KiB),距 64 KiB 仅余 3,505 bytes(3.42 KiB)。恢复默认 32 KiB 会截断现有项目指令,不是优化。
- 200 行只作为可读性经验值,不作为门禁。内部软目标改为:全局文件优先 ≤16 KiB,无语义重复,只保留跨项目硬边界;最终是否合格以字节、加载链、代表性 eval 和规则逃逸共同判断。

### 决策

1. 将全局文件的 Why、命令细节、长 SOP 和项目特化继续下沉 ADR/standard/skill/hook/automation/项目 `AGENTS.md`。
2. 不删除授权、安全、范围完整性、CR、迁移、DB/生产和真实验证边界;只合并重复表述与入口说明。
3. `project_doc_max_bytes=64 KiB` 暂留作合并链安全上限,不得把提高上限当作继续膨胀全局文件的许可。
4. 后续月度复盘同时看 global bytes、最大项目 instruction chain、首审/返工/HIGH 逃逸;一次只精简一组规则并做 delta 验证。

### 结果

- `~/.codex/AGENTS.md`:227→168 行(-26.0%),23,487→13,790 bytes(-41.3%),降至内部 16 KiB 软目标以内。
- 64 KiB 是兼容当前大型项目 instruction chain 的有意偏离,不是 OpenAI 官方默认值;后续应优先压缩 HC 与 `gsd-fork/docs` 多层链,而非继续提高上限,再评估恢复 32 KiB。

官方依据:

- OpenAI `AGENTS.md`:合并顺序、默认 32 KiB、接近目录优先和 nested 拆分。<https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- OpenAI Codex best practices:短而准确优于长而模糊;过大时引用任务特定文件,重复流程转 skill。<https://learn.chatgpt.com/guides/best-practices>

## 修订（2026-09-09：项目特化保留、专项按需与Memory生命周期）

### 原因与选择

同一要求在全局、项目、Memory和历史任务中并行维护，会增加解释冲突。删除全部提醒容易丢危险操作边界；只加“简单任务忽略”无法撤回已加载文本。因此采用一个正文维护源＋任务触发入口，不追求零重复或统一全部项目交付顺序。

### 归属

- 全局AGENTS保留完整范围、授权、证据、批次交付、验收硬要求及明确触发器。字段/E2E、鉴权、符号导航、地图维护与质量观察的详细检查项移到本机`~/.codex/workflow-details.md`命中章节；下沉不是豁免。
- 项目AGENTS保留真理源、固定分支/远端、环境、交付前置、阶段性豁免及已批准的模型试验。全局减载不得将HC候选UAT顺序套到SYSV2/SRMV2，也不得取消WMSV2暂停/阶段性CI豁免或MESV1本地根仓约定。
- ADR记录原因、替代和归属，不维护第二份操作清单；Skill/Runbook提供命中任务后的步骤，不承载另一套权限或活跃业务状态。
- Memory保留稳定偏好；已固化政策缩为主题/工作区/权威路径索引；历史任务保留证据和当时例外并标历史。不要把“完成任务免一次E2E”变成未来默认，不删除暂停/禁止/未完成合同。生成状态不直接改，用户明确授权后仅通过允许的更新入口提出小更新，并单独确认生成是否生效。
- 一份progress承载当前执行状态，接续只指向它；无法唯一确定任务时进入只读对账/任务选择，而非用mtime或旧build号制造下一动作。CLI/Desktop接管须确认原执行者暂停及候选/证据交接。

### 落地与验证边界

2026-09-09先修工作区执行歧义与恢复入口，再移动全局专项细则及提交Memory分层更新。保留64KiB上限、运行模型配置、hook与业务门禁；不批删低频能力，不新增自动重建/轮询任务。

验收采用迁出检查项逐条比对、入口/链接检查、简单文档/字段/鉴权/接续/现场等场景路由和项目特化保留检查。后续5–10个可比业务批次按轨观察输入Token（可取时区分缓存）、重复验证、返工及逃逸；没有数据记unknown，不以字节下降或零事故证明费用下降或安全门禁可删。

官方依据：Codex手册本轮刷新，Best practices 1788–2019、AGENTS 22760–22912、Memories 25191–25300；[任务专项引用](https://learn.chatgpt.com/guides/best-practices)、[启动时的指令链](https://learn.chatgpt.com/docs/agent-configuration/agents-md)、[Memory为召回与生成状态](https://learn.chatgpt.com/docs/customization/memories)。本节规定本地治理，不声称产品会自动热替换已有会话或立即重生成Memory。
