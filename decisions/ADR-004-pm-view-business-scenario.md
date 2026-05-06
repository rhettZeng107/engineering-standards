# ADR-004: PM 视角 + 业务场景化作 spec / 方案 / E2E 兜底

- **Status**: Accepted
- **Date**: 2026-05-03 拍板上提全局 → 2026-05-05 校准"用户视角 → PM 视角" + ADR 化回溯落地
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- AI 编码落盘有不确定性,缺乏全局观;早期 spec discuss 走"代码视角"频繁误伤业务
- 实证:2026-05-05 MDM 现代化 spec discuss Q3 用代码视角"砍命名疑似过期 5 个 Controller",涛哥纠偏要 PM 视角矩阵
- 实证:2026-05-03 SYSV2 LOGO bug — Claude 走 API 视角通过测试,但用户视角(操作员真实点击)实际全部断;教训:E2E 必须按操作员真实点击路径
- 早期"用户视角"口径不准:操作员视角偏具体执行 / 用户视角偏模糊;**PM 视角(涛哥 Job 业务负责)**才是兜底

### 决策不做的代价

- 继续代码视角讨论 spec → 业务边界 / 操作流 / 异常路径漏盖
- E2E 仅测 API 层 → UI 层 native 行为(antd Upload native XHR / `<img>` native fetch)单独失败用户立即可见
- 涛哥(PM + 产品负责)的业务全局观无落点 → AI 落盘 + PM 视角脱节

---

## Decision

**一句话**:**PM 视角(涛哥 Job 业务负责)+ 业务场景化**作所有 spec / 方案讨论 / E2E 验证三个环节的兜底,不限 task 类型,跨项目通用。

### 详细落点

#### 1. 需求 / 方案讨论(spec / discuss 提问导向)

- 从"操作员视角"切入提问:谁用 / 场景 / 步骤 / 异常时怎么办 / 跨角色协作
- 取消 3 阶段访谈 / 5 问表格 / `<user_stories>` 段(2026-05-02 拍板)
- 简单 task / 配置 / 文档 / 微调 → 直接干
- 复杂业务功能 → 1-3 个操作场景拍板点确认后落 spec
- 迁移 / 整改 / 整合类 spec → discuss 必做"功能盘点"前置实证(前端清单 + 后端清单 + 缺口矩阵)

#### 2. E2E 验证(2026-05-03 LOGO bug 实证升级)

- 必按**操作员真实点击路径**端到端跑:登录 → 菜单 → 卡片/列表 → 表单 → 提交 → 反馈
- API spec 通 ≠ 链路通(UI 层 native 行为在 axios 拦截器外)
- 断言粒度:Image 用 `naturalWidth>0`,列表用真实数据校验
- 诊断穷尽根因:1 根因后默认追问"还有哪能复现"
- E2E spec = E1(API 层) + E2(UI 层端到端)双层

#### 3. 范围

所有项目 / 所有需求类型 / 所有迁移改造默认适用,不限 上传/下载/Image 这类典型场景。CRUD / 报表 / 配置 / 菜单 / 权限 / SSO / 数据迁移 / 技术栈升级 / UI 重构 / 合规改造任何 task 都按 PM 视角切入。

---

## Consequences

### 正向

- 业务边界 / 操作流 / 异常路径有兜底视角,Claude 不再代码视角误伤
- E2E 必盖 UI 层 → LOGO bug 类用户立即可见的故障被防住
- 涛哥业务全局观与 AI 落盘对齐
- 迁移 / 整改类 spec 有"功能盘点"实证矩阵,PM 拍板基于事实

### 负向 / 代价

- spec / E2E 工作量增加(必跑 UI 层 / 必做盘点矩阵)
- PM(涛哥)需要主动参与 1-3 个操作场景拍板
- 简单 task 仍可跳

### 影响范围

- 全部 SYSV2 / HC / 后续项目 spec / 方案 / E2E
- memory `feedback_pm_view_feature_inventory.md` / `feedback_upload_link_e2e_ui_layer.md` / `feedback_root_cause_exhaustive.md` / `feedback_no_full_interview_project_endgame.md` 等多条同向收敛

---

## Alternatives Considered

### A. 操作员视角(过具体)(已否)

- 优点:具体到点击步骤,Claude 易理解
- 缺点:遗漏跨角色协作 / 异常路径 / 业务边界
- 不选原因:操作员看不到全局,不是 PM 兜底应有的视角

### B. 代码视角(命名 / 路由 / Controller)(已否)

- 优点:Claude 主场,实证容易
- 缺点:误伤业务 — "命名疑似过期"的 Controller 可能仍在被某客户使用
- 不选原因:实证案例 MDM Q3 反例

### C. 用户视角(2026-05-05 前的口径)(已 Superseded)

- 优点:接近 PM 视角
- 缺点:"用户"含糊 — 是操作员 / 部门 leader / 涛哥本人?口径不一致
- 不选原因:2026-05-05 涛哥校准为"PM 视角(涛哥 Job 业务负责)",更精确

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`「PM 视角 + 业务场景化」段
- memory:`feedback_pm_view_feature_inventory.md`(迁移/整改/整合类 spec 必做功能盘点)
- memory:`feedback_no_full_interview_project_endgame.md`(取消 3 阶段访谈)
- memory:`feedback_upload_link_e2e_ui_layer.md`(LOGO bug E2E UI 层)
- memory:`feedback_root_cause_exhaustive.md`(根因穷尽)
- memory:`feedback_e2e_proactive_business_constraint_check.md`(E2E 主动业务约束实证)
- memory:`feedback_discuss_phase_frontend_4dim_sys3_only.md`(已废弃,4 维必问)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-02 | 取消 3 阶段访谈 | 项目尾声简化 |
| 2026-05-03 | 拍板上提全局 + 范围扩展 | LOGO bug 实证 |
| 2026-05-05 | "用户视角 → PM 视角"校准 + ADR-004 回溯 | 口径精确化 |
