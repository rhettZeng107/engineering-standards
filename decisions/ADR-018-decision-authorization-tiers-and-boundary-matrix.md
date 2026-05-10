# ADR-018: 决策授权三档 + 边界判定显式矩阵

- **Status**: Accepted
- **Date**: 2026-05-09(回溯,实际 2026-05-05 起效)
- **Decider**: 涛哥
- **Scope**: 跨项目

---

## Context

涛哥反复反馈两个问题:
1. **过度拍板**:Tier 1 级别的低风险 / 可逆决策(配置微调 / 测试库 DDL / 死代码清理 等)Claude 仍出选项让涛哥拍板,浪费精力
2. **边界模糊**:spec/plan 走或跳的边界 / 决策授权 Tier 1/2/3 边界本身需要决策,造成"决策的决策"循环

需要把 Claude 自判范围 + 升档触发 + 涛哥参与边界用显式矩阵固化。

## Decision

**一句话**:Claude 按显式三档矩阵自判优先,边界模糊才报涛哥;不确定升一档;执行中实证反转即停升档。

### 矩阵 1:决策授权三档

| Tier | 范围 | 汇报模式 |
|---|---|---|
| **1 自主** | 配置微调 / 文档结构 / 测试库 DDL / 死代码清理 / E2E 重试 / 调研性 grep / 已实证小改 | 动作 + 结果一句话,**不出选项不要拍板** |
| **2 简洁拍板** | 单 spec 内部边界 / 工作流微调 / 术语校准 / 测试数据 / 历史脏数据(测试库) | "推荐 X(理由 1-2 句),Y/N?" |
| **3 多选项拍板** | 跨项目 / schema 迁移 / 鉴权架构 / 客户分支 / 推翻 ADR / 生产库破坏 / 第三方依赖 / 跨契约破坏 | 实证 + A/B/C + 推荐 + 风险表 → **落 ADR** |

### 矩阵 2:Spec/Plan 走或跳

| 跳条件(任一即跳,走简单档) | 走条件(任一即走标准档) |
|---|---|
| 单文件 ≤ 3 处小改 | 跨前后端契约改动 |
| 配置 / 文档微调 | DB schema 迁移 |
| 资源已有,纯字段扩展 | 鉴权敏感(Policy / token / 菜单) |
| 工作量 S / 风险低 | ≥ 4 文件 |
| 多应用同门户模板化 | 多模块联动 |
| 涛哥显式说"直接改" | 涛哥显式立项 |

### 反模式

- ❌ Tier 1 仍出选项(假装放权)
- ❌ Tier 3 走自主(无 ADR 留痕)
- ❌ "推荐 X,但你也可以 A/B/C/D"(口头自主实际给 5 选项)
- ❌ 边界模糊不报涛哥就自判 Tier 3

### 升档触发

- 不确定时升一档
- 执行中实证反转即停升档
- 跨项目 / 推翻 ADR / 生产库破坏一律 Tier 3

## Consequences

### 正向
- 涛哥精力释放到产品策略 + 真正需要决策的边界
- Tier 1 自主范围明确,不再"假装放权"
- ADR 沉淀路径清晰(Tier 3 必落 ADR)

### 负向 / 代价
- 矩阵本身需要 Claude 持续自校准
- 边界条件可能需要后续补丁(通过 Superseded ADR 演进)

### 影响范围
- 全局 CLAUDE.md「决策授权层级」段 + 「三轨工作流」段
- 所有 spec / plan / 执行阶段
- memory:`feedback_delegate_low_risk_reversible.md`
- memory:`feedback_boundary_decision_matrix.md`
- memory:`feedback_skip_spec_plan_simple_tasks.md`
- memory:`feedback_standard_workflow_reduces_rework.md`
- 配套 ADR-017(批次合同扩大版 — 决定何时停下报告)

## Alternatives Considered

### A. 全自主(无授权层级)
- 缺点:Tier 3 级决策无 ADR 留痕,跨项目影响失控
- 不选原因:违反"重要决策必须沉淀"原则

### B. 全拍板(每个决策都报涛哥)
- 缺点:涛哥精力被低风险决策耗尽
- 不选原因:违反 PM 视角分工

### C. 模糊"按情况"
- 缺点:边界判定本身成为决策成本
- 不选原因:已经踩过该坑,显式矩阵是补救

## Related

- ADR-017:批次合同扩大版(决定何时不打断)
- ADR-015:事实驱动禁臆测(上位规则)
- memory:`feedback_delegate_low_risk_reversible.md`
- memory:`feedback_boundary_decision_matrix.md`
- memory:`feedback_skip_spec_plan_simple_tasks.md`

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-05 | Proposed → Accepted | 涛哥拍板,memory 落地 |
| 2026-05-09 | 回溯落 ADR | Tier 2 候选回溯,合并"决策授权三档"+ "边界判定矩阵" |
