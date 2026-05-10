# ADR-016: Spec / Plan 启动前必扫历史目录,不当未知项目重新实证

- **Status**: Accepted
- **Date**: 2026-05-09(回溯,实际 2026-05-05 起效)
- **Decider**: 涛哥
- **Scope**: 跨项目

---

## Context

SYSV2 / MDM / 应用中心 / SubApp / 菜单 等概念都是 Claude 配合涛哥过去几个月持续升级改造过的。新 spec 启动时,Claude 容易把熟悉的概念当陌生项目处理,直接 mssql `LIKE '%xxx%'` 取一张表就用,绕过了历史 spec/plan/ADR 沉淀的真理源。

实证案例(2026-05-05):"应用中心"实证应该看 EF `ToTable("SYS_*")` 映射,而非 `LIKE 'AuthInfo'` 取到 29 列老表。错表实证发现后必须全文回溯修订,代价高。

## Decision

**一句话**:Spec discuss / plan 启动阶段必先 Glob + Grep 扫历史目录(specs / plans / ADR / memory),read 找到的关键段作事实基础;实证表名先看代码引用(`ToTable\(...)`)再用 mssql。

**3 步硬流程**:

| 步骤 | 操作 |
|---|---|
| **1. Glob 历史** | 跨项目 `~/Projects/engineering-standards/decisions/ADR-*.md`(优先) + 项目特化 `<project>/docs/decisions/ADR-*.md` + `<project>/docs/superpowers/specs/**/*<keyword>*` + `plans/**/*<keyword>*` |
| **2. Grep 实体** | `<EntityName>\|<TableName>\|<ServiceName>` 在历史 + ADR + 项目 memory |
| **3. Read 关键段** | ADR 优先(不可改写真理源)→ schema/状态机/契约段 → spec 顶部"前置实证"段 `参见 ADR-NNN / file:line` |

**强制规则**:涉及"已存在 / 已改造 / 已上线 / 老系统"概念时,**禁** mssql `LIKE '%xxx%'` 取一张表就用 → 必须先看 EF `ToTable(...)` 映射或代码引用确认真理源。

**优先级**:历史 memory > session 内重新实证;memory 与新实证冲突先报告涛哥。

**例外**:全新业务领域 / 简单 task(单文件 ≤ 3 处小改 / 配置 / 文档微调)。

## Consequences

### 正向
- 避免错表 / 错实体 / 错路径返工
- 历史决策 reuse 率提升
- ADR 真理源被持续引用

### 负向 / 代价
- spec 启动多 3-10 分钟扫历史
- 历史目录庞大时 grep 耗时

### 影响范围
- 全局 CLAUDE.md「Spec discuss 阶段先 grep 历史」段
- 所有 spec/plan 启动流程
- memory:`feedback_load_project_history_first.md`
- memory:`feedback_evidence_consumer_vs_producer.md`(配套规则)
- ADR-013(codebase 画像作前置事实,自动化版本)

## Alternatives Considered

### A. 仅在涛哥提示时扫历史
- 缺点:涛哥不应承担"何时扫历史"的判断职责
- 不选原因:违反 PM 视角分工

### B. 完全依赖 LLM 记忆
- 缺点:LLM 记忆有上下文窗口限制 + 跨 session 失忆
- 不选原因:历史规则只增不减,LLM 记不住

## Related

- ADR-013:codebase 画像维护(自动化历史扫描)
- ADR-015:事实驱动禁臆测(上位规则)
- memory:`feedback_load_project_history_first.md`
- memory:`feedback_evidence_consumer_vs_producer.md`

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-05 | Proposed → Accepted | 涛哥拍板 |
| 2026-05-09 | 回溯落 ADR | Tier 2 候选回溯 |
