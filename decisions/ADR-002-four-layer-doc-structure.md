# ADR-002: 四层文档结构(ADR / Spec / Plan / Tasks)

- **Status**: Accepted
- **Date**: 2026-05-03 原"三层"拍板 → 2026-05-05 升"四层"(本 ADR 回溯落地)
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- 早期文档散乱:Spec / Plan / Tasks 三者位置 / 命名 / 内容边界不清,SYSV2 项目内同时存在扁平 / 嵌套 / 混合多种结构
- 三层规范确立后:重要决策仍散落 spec / plan / memory / commit message 各处,后期回溯成本高
- 实证案例:"用户视角 → PM 视角"校准在多文件中出现,没有不可改写的决策锚点
- 实证案例:MDM 现代化 spec 启动差点把已经决策过的"应用中心 / SubApp / 菜单"当未知系统重新实证

### 决策不做的代价

- 决策无即时锚点 → 新人 / Claude 都看不到决策全貌
- 决策可被随意改写 → 演化路径丢失,3 个月后说不清"为什么这样定"
- spec / plan 边界继续模糊 → 重复劳动 / 漏盖 / 摇摆

---

## Decision

**一句话**:全局采用四层文档结构 — `ADR / Spec / Plan / Tasks`,主题单目录组织,主题级文件 `ADR-NNN-<topic>.md` / `<YYYY-MM-DD-topic>/spec.md` / `<YYYY-MM-DD-topic>/plan.md`。

### 详细落点

| 层级 | 位置 | 回答 |
|---|---|---|
| **ADR** | `docs/decisions/ADR-NNN-<topic>.md` | 为什么这样定 + 替代方案为什么没选 + 影响范围 |
| **Spec** | `docs/superpowers/specs/<YYYY-MM-DD-topic>/spec.md` | 做什么 + 为什么 + 边界 + 验收 |
| **Plan** | `docs/superpowers/plans/<YYYY-MM-DD-topic>/plan.md` | 怎么做 + 谁做 + 验证 |
| **Tasks** | 内嵌 plan 底部 `## Tasks 拆解` | 单单元目标 / 输入 / 输出 / 涉及文件 / 验收 / 依赖 |

- 单目录命名,主题归属,元文件 `_template-*.md` 与 `backlog/` 保留扁平
- ADR 不可改写,变更 = 新建 + 旧标 Superseded
- L3 孤立 plan 历史扁平免回溯

---

## Consequences

### 正向

- 决策即时锚点,不再散落
- ADR 不可改写 → 决策演化路径强制保留
- spec / plan 边界清晰,新人 / Claude 上下文加载有据可依
- 跨项目统一格式,SYSV2 经验可直接复用到 HC / 后续项目

### 负向 / 代价

- 增加 1 层管理(ADR 索引 / 编号 / 回链)
- 历史散落决策回溯需要时间投入(本次 Tier 1 = 7 条,~2 小时)

### 影响范围

- **影响 spec**:所有新 spec 走单目录;现有扁平 spec 按需回溯
- **影响 plan**:同上
- **影响 memory**:重要规则上提全局后,SYSV2 memory 退化为锚点 + 项目实例存档
- **影响代码**:无(纯文档治理)

---

## Alternatives Considered

### A. 仅在 spec 顶部加 `## 决策` 段(已否)

- 优点:零新增层,改造成本低
- 缺点:决策无独立文件 → 难以跨 spec 引用 / 难以"不可改写"约束 / 决策回溯仍要翻全 spec
- 不选原因:决策的本质是**横向影响 ≥ 2 个 spec**,放在某一 spec 内部不合适

### B. 全靠 commit message 沉淀决策(已否)

- 优点:零文档,git log 即记录
- 缺点:回溯成本极高 / 不可索引 / 不可链接 / 决策细节被压缩成 commit summary
- 不选原因:已实证不可行(SYSV2 半年下来 commit message 找不到关键决策)

### C. 五层结构(加"产品 PRD"层)(已否)

- 优点:产品需求与技术 spec 分离
- 缺点:涛哥即 PM,PRD 内容已融入 spec 头部业务段,独立 PRD 层冗余
- 不选原因:涛哥单兵作战不需要正式 PRD

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`「四层文档:ADR / Spec / Plan / Tasks」段
- 项目级规则:[`docs/decisions/README.md`](README.md)
- memory:`feedback_adr_for_cross_spec_decisions.md`
- memory:`feedback_spec_review_workflow.md`(三层文档原始拍板)
- memory:`feedback_plans_location.md`(已被本 ADR 上位覆盖)
- memory:`feedback_superpowers_doc_path_follow_claudemd.md`(superpowers 插件 patch)
- 上游:无(基础架构决策)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-04-21 | 三层文档雏形 | spec/plan/tasks |
| 2026-05-03 | 三层定型 + 上提全局 | 主题单目录结构 |
| 2026-05-05 | 三层 → 四层 + ADR-002 回溯落地 | 增 ADR 第 4 层 |
