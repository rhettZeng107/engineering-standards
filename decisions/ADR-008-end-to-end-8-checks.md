# ADR-008: 端到端交付 8 项核对清单(技术契约 4 + 业务连通 4)

- **Status**: Accepted
- **Date**: 2026-04-22 5 项升 8 项 → 2026-05-05 ADR 化回溯落地
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

> **执行阶段策略细化**(2026-05-14):8 项清单本身不变,但**分阶段执行** — Plan 落盘按 [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md) 6 项硬冒烟,完整 8 项 + 跨浏览器 + 性能 + 跨页面回归由 CI/CD 接管。迁移轨(ADR-014)Plan E2E 双层保留。

---

## Context

### 触发场景

- 跨前后端 feature 验收漏点频繁:API 通了但前端调用错 / DTO 字段同步漏 / 业务操作闭环缺验证
- 早期"5 项核对"漏盖业务连通层(操作员实际能不能用)
- 实证:2026-04-22 升级为 8 项 — 在技术契约 4 项基础上加业务连通 4 项
- 实证:2026-05-04 涛哥反馈 E2E 主动业务约束实证防被动反应式踩坑(跑完整业务路径,不只 API 200 happy path)

### 决策不做的代价

- 验收靠"差不多对"经验判断 → 漏盖率高
- 操作员实操踩坑 → 涛哥被动反应式干预,Claude 反复返工
- 跨前后端 feature 没有统一验收基线 → 各 spec 重新定义验收

---

## Decision

**一句话**:跨前后端 feature 必做 **8 项核对**,任一不通 = 阻塞;技术契约 4 项 + 业务连通 4 项,不可裁剪。

### 技术契约层 4 项

① **API ↔ 前端调用双向核对** — 后端有的 endpoint 前端要么调用要么删除;前端调用的 endpoint 后端必须有
② **列表分页结构对齐** — `items` / `totalCount` / `current` / `pageSize` 字段名一致
③ **HTTP 动词 / 路由 / Policy 注册** — Policy 必须 `AddPolicy(...)`,否则抛 500
④ **DTO 字段增删同步** — 后端加字段前端必显示 / 后端删字段前端必移除引用

### 业务连通层 4 项

⑤ **入口可达性全链** — 路由 → 菜单种子 → 权限码 → 登录看到 → 点进去渲染(整链不断)
  - ❌ **反模式**:把"前端 render-walk(直渲路由组件)/ URL 直达 / build 通过"当 ⑤ 已过 —— 缺菜单种子+权限码,**操作用户在菜单里根本看不到模块**。⑤ 必须在**有菜单种子 + 权限码 + 登录**的环境(部署/集成,非 dev)按操作用户视角验:菜单看得到 + 点得进。(2026-05-24 SRM 采购端补全踩坑)
⑥ **Service 实装 + DB schema 对齐** — Controller 非空壳(实际查 DB 不返 mock 数据)+ EF 实体 vs `INFORMATION_SCHEMA.COLUMNS` 实证一致
⑦ **业务操作闭环 smoke** — CRUD + 日常交互(过滤 / 搜索 / 下拉 / 多选 / 联动,**每个用到的都验**)
⑧ **错误反馈完整性** — toast / Modal / inline,无默默 500 用户无感

### 落地

- spec 验收段必显式列 8 项
- code-reviewer 触发"跨前后端"时自动 8 项扫描
- E2E spec 必盖业务连通 4 项(尤其 ⑦ 业务操作闭环)
- 跨子应用接入模板 `_template-app-onboarding.md` 强制 8 项

---

## Consequences

### 正向

- 验收基线刚性,漏盖率显著下降
- 操作员实操故障被防住
- 跨前后端 feature 工作量可预估
- code-reviewer / E2E / spec 三层都有 8 项核查点

### 负向 / 代价

- 每个跨前后端 feature 验收时间增加(8 项核对都要走)
- 简单 task(单字段加列)如严格走 8 项过度,故 memory `feedback_skip_spec_plan_simple_tasks.md` 已界定简单 task 跳流程

### 影响范围

- 全部 SYSV2 / HC / 后续项目跨前后端 feature
- memory `feedback_code_review_contract_check.md` / `feedback_e2e_proactive_business_constraint_check.md` / `feedback_upload_link_e2e_ui_layer.md` 同向
- 影响 spec / plan / E2E spec 编写规范
- 影响 code-reviewer 触发矩阵

---

## Alternatives Considered

### A. 全 E2E 自动化覆盖(不立人工核查清单)(已否)

- 优点:可重复 / 可 CI
- 缺点:8 项里业务连通层(⑤⑥⑦⑧)很多无法纯自动化,需人工核查;E2E 投入产出比在 SYSV2 阶段不划算
- 不选原因:E2E 是补充不是替代,人工 8 项核查仍必要

### B. 仅 API 契约 4 项(原 5 项的精简版)(已否)

- 优点:工作量小
- 缺点:漏业务连通层 → 操作员实操踩坑频繁
- 不选原因:实证 2026-04-22 5 项不够,升 8 项

### C. Case-by-case 验收(不立清单)(已否)

- 优点:灵活
- 缺点:每个 spec 重新定义,漏盖率高,新人 / Claude 无据可依
- 不选原因:实证多次踩同样的坑

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`「端到端交付 8 项核对」段
- memory:`feedback_code_review_contract_check.md`(本 ADR 主源)
- memory:`feedback_e2e_proactive_business_constraint_check.md`(E2E 主动业务约束实证)
- memory:`feedback_upload_link_e2e_ui_layer.md`(UI 层端到端)
- memory:`feedback_root_cause_exhaustive.md`(根因穷尽)
- memory:`feedback_skip_spec_plan_simple_tasks.md`(简单 task 跳流程例外)
- memory:`feedback_code_reviewer_trigger_matrix.md`(code-reviewer 触发)
- 实证模板:`docs/superpowers/plans/_template-app-onboarding.md`
- 上游 ADR:[ADR-007](ADR-007-auth-4-rigidity.md)(鉴权 4 条 — 与 8 项核对的入口可达性 ⑤ 部分重叠)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-04 早 | 5 项核对雏形 | 散落 memory |
| 2026-04-22 | 5 项升 8 项 | 加业务连通 4 项 |
| 2026-05-04 | E2E 主动业务约束实证补充 | 涛哥反馈 |
| 2026-05-05 | ADR-008 回溯落地 | 散落决策合并到 ADR |
