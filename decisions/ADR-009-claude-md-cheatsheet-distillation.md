# ADR-009: 全局 CLAUDE.md 精简到 cheatsheet 本质,详细规则下沉 ADR / memory

- **Status**: Accepted
- **Date**: 2026-05-05
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则文档治理)

---

## Context

### 触发场景

- 全局 `~/.claude/CLAUDE.md` 持续生长到 357 行 / 23k 字节 / ~6.5k tokens(中文密度高)
- 涛哥读到觉得冗长,主动询问"长内容对 Claude 是否有影响 + 能否控制 ≤ 200 行"
- 2026-05-05 ADR 机制刚建立(ADR-002 四层文档),详细决策档案有了独立载体,CLAUDE.md 不再需要承担"详细 Why / Alternatives / 反模式案例"

### 实证证据

- 「Lost in the middle」效应真实存在 — 长 system prompt 中段指令遵循率比头尾下降 ~15-25%
- Claude 不逐段扫描,中段细节(如埋在 70 行编码路由段中段的"Qwen 兜底 5 条")召回不稳定
- 多文档叠加(全局 357 行 + SYSV2 项目级 ~225 行 + MEMORY.md + 50+ memory 元数据 + skills + agents)挤压真实 attention budget
- 涛哥维护成本上升 → "加内容易,减内容难"是经典文档腐烂路径

### 决策不做的代价

- 357 行会持续生长,半年后 500+ 行
- Claude 中段指令遵循率持续损失
- 涛哥维护时遗漏 / 修订错位概率上升
- ADR 机制建好但 CLAUDE.md 仍承担详细叙述,职责边界混乱

---

## Decision

**一句话**:全局 CLAUDE.md **回归 cheatsheet 本质**,精简到 ≤ 200 行(实测 170 行);详细 Why / Alternatives / 反模式案例 / 实证叙述 **下沉 ADR + memory**;CLAUDE.md 只保留**核心规则一句话 + 表格清单 + ADR/memory 锚点**。

### 详细落点

#### 1. CLAUDE.md 内容边界

- ✅ 保留:核心规则一句话 / 表格 / 清单 / ADR-NNN 锚点 / memory 文件锚点
- ❌ 删除(下沉 ADR / memory):
  - 详细 Why 解释(2-3 段)
  - 替代方案分析(A/B/C 选项 + 不选原因)
  - 反模式案例叙述(MDM 现代化 / LOGO bug 等具体案例)
  - 历史背景溯源(2026-04-21 雏形 → 2026-04-27 升级 → 2026-05-02 校准)
  - 长黑名单展开(事实驱动 5 类禁词 / Qwen 6 条约束 / 兜底 5 触发)

#### 2. 段落保留(15 段全保,不删段)

按原顺序保留:用户画像 → 事实驱动 → Spec discuss grep 历史 → PM 视角 → 四层文档 + cheatsheet → 评审 → 8 项核对 → 鉴权 4 条 → 编码工作流 → 决策授权 → 客户全新部署 → 批次节奏 → 通用设计 → SQL → Agent 默认值

#### 3. 各段对应 ADR / memory

| 段 | 详细档案 |
|---|---|
| 事实驱动 | memory `feedback_fact_driven_no_speculation.md` |
| Spec discuss grep 历史 | memory `feedback_load_project_history_first.md` |
| PM 视角 | ADR-004 |
| 四层文档 | ADR-002 |
| 8 项核对 | ADR-008 |
| 鉴权 4 条 | ADR-007 |
| 编码工作流路由 | ADR-003 |
| 决策授权三档 | memory `feedback_delegate_low_risk_reversible.md`(Tier 2 ADR 候选) |
| 客户全新部署 | ADR-005 |

#### 4. 维护规则

- **新规则落地**:先写 ADR 或 memory(详细)→ CLAUDE.md 加锚点 + 一句话 + 表格行(不超过 5 行)
- **修订已有规则**:先改 ADR / memory → CLAUDE.md 同步精简版
- **后续审核**:每季度 / 每个里程碑后做一次行数体检,> 200 行触发再次精简

---

## Consequences

### 正向

- 行数减半:357 → 170(-52%);tokens 6.5k → ~3.2k
- Claude 中段指令遵循率回升(短文本召回率高)
- 涛哥维护负担下降,找规则成本降低
- ADR 机制职责边界清晰(详细决策在 ADR,速查在 CLAUDE.md)
- 长期防腐:每季度行数体检 + 维护规则约束

### 负向 / 代价

- **信息损失风险**:实证案例 / 反模式叙述删除,边界场景 Claude 判断时少了"反例参考" — 但 ADR / memory 已存档,锚点保留即可
- **维护习惯需调整**:从"在 CLAUDE.md 加段"改为"先 ADR/memory 详细 + CLAUDE.md 同步精简"
- **跨段引用成本**:某些规则原本在 CLAUDE.md 一段内自洽,现在需要跨文件查 ADR

### 影响范围

- **影响 CLAUDE.md**:`~/.claude/CLAUDE.md`(357 → 170 行)
- **影响 ADR**:ADR-002~ADR-008 现有 8 条 ADR 的"被锚点引用次数"上升
- **影响 memory**:相关 memory 锚点从 SYSV2 私域提升为全局可引用
- **影响 Claude 行为**:中段指令遵循率回升;边界场景判断改为"先看 CLAUDE.md cheatsheet → 不够再读 ADR/memory"

---

## Alternatives Considered

### A. 保持现状(357 行)(已否)

- 优点:零改动,已有完整 context
- 缺点:持续生长 / 中段遵循率损失 / 维护成本上升 / ADR 职责边界混乱
- 不选原因:涛哥已感冗长 = 真信号,不动等于默认接受持续腐烂

### B. 仅删 ~50 行(轻度精简到 ~300 行)(已否)

- 优点:改动最小,风险低
- 缺点:不彻底解决问题,半年后又回到 350+ 行
- 不选原因:折中方案不解决根本问题,且需要再做一次精简

### C. 拆成多文件(`CLAUDE.md` + `WORKFLOW.md` + `RULES.md`)(已否)

- 优点:每个文件更短
- 缺点:Claude 加载逻辑不变(全部都要读),反而新增文件检索成本;涛哥维护需跨文件
- 不选原因:不解决 attention budget 问题,只是把行数分散

### D. ✅ 精简到 cheatsheet 本质(选中)

- 优点:行数减半 / 职责边界清晰 / ADR 机制承接详细内容 / 长期防腐
- 缺点:一次性投入 + 维护习惯调整
- 选择原因:ADR 机制刚建好正是最佳精简时机,错过会持续累积;涛哥已拍板

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`(本 ADR 直接产物)
- 上游 ADR:[ADR-002](ADR-002-four-layer-doc-structure.md)(四层文档,本 ADR 是其延伸 — ADR 层就位后 CLAUDE.md 才能精简)
- 受影响 ADR:[ADR-003](ADR-003-coding-workflow-frontend-backend-split.md) / [ADR-004](ADR-004-pm-view-business-scenario.md) / [ADR-005](ADR-005-customer-fresh-deploy-no-ops.md) / [ADR-007](ADR-007-auth-4-rigidity.md) / [ADR-008](ADR-008-end-to-end-8-checks.md)(被 CLAUDE.md 引用频次上升)
- memory:`feedback_fact_driven_no_speculation.md` / `feedback_load_project_history_first.md` / `feedback_delegate_low_risk_reversible.md`(被 CLAUDE.md 引用)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-05 | Proposed → Accepted | 涛哥拍板 A 档"精简到 ≤ 200 行" |
| 2026-05-05 | 落地完成 | 357 → 170 行,~52% 减重 |
