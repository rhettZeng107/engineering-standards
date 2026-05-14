# ADR-024: Plan 落盘 E2E 分级 + CI/CD 接管全量回归

- **Status**: Accepted
- **Date**: 2026-05-14
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- 2026-05-14 Session「默认工作流哲学评价」:涛哥提问 Plan 落盘后 E2E 是否可取消(CI/CD 阶段已有 E2E 接管)
- 现状实证:
  - ADR-008 8 项核对要求 ⑦ 业务操作闭环 smoke 默认 CRUD + 过滤/搜索/下拉/多选/联动**每个都验**
  - feedback `e2e_user_view_full_path_verification` 要求 i18n/UI 大改 E2E 必须像手测一样登录 + 进每个核心业务页
  - feedback `e2e_proactive_business_constraint_check` 要求落盘前必跑完整业务路径
  - SYS CI/CD Phase 1 已闭环(2026-05-13 ADO Pipeline 跑通),具备流水线 E2E 的基建
- 实战观察:Plan 落盘 E2E 与 CI/CD E2E 本质是**两道不同闸**
  - Plan E2E = 涛哥 Y 前的**功能验收冒烟**(在 push 之前)
  - CI/CD E2E = 代码已入 git 后的**回归保障**(在 push 之后)
- 若 Plan E2E 全砍 → 涛哥 Y → 双推 → CI/CD 才暴露问题 → **回滚 / 修复 / 再推**,工作流断裂
- 若 Plan E2E 维持全量 → 每次都跑完整 8 项,token / 时间成本随项目规模线性增长,标准轨耗时偏高

### 决策不做的代价

- 维持现状:Plan 落盘 E2E 工作量随 spec 数量线性涨,CI/CD E2E 价值不显化
- 全砍:涛哥盲签 + 回滚成本上升,违反 ADR-007 鉴权 4 条入库前硬阈值的承诺

---

## Decision

**一句话**:Plan 落盘 E2E **按三轨分级执行**,CI/CD E2E **接管全量回归**;ADR-008 8 项清单不变,执行阶段策略由本 ADR 细化。

### 分级矩阵

| 轨道 | Plan 落盘 E2E(涛哥 Y 前必跑) | CI/CD E2E(push 后跑) |
|---|---|---|
| **简单轨**(单文件 ≤ 3 处 / 配置 / 文档) | **跳过**(本来就跳 spec/plan) | smoke 兜底 |
| **标准轨**(跨前后端 / DB schema / 鉴权敏感 / ≥ 8 文件) | **6 项硬冒烟**(见下) | **全量回归**(ADR-008 8 项 + 跨浏览器 + 性能 + 跨页面回归) |
| **迁移轨**(ADR-014 老项目迁移) | **E2E 双层 E1+E2 保留**(spec 已 Front-load 内嵌) | 全量回归 + 等价比对 |

### 标准轨 Plan 落盘 6 项硬冒烟(必跑,任一不通 = 阻塞涛哥拍板)

1. **入口可达性单链**(ADR-008 ⑤):路由 → 菜单 → 权限码 → 登录看到 → 点进去渲染,只跑 1 条主路径(非全菜单遍历)
2. **鉴权 4 条**(ADR-007):`[Authorize]` + Policy 注册 + 权限码 + SSO token,4 条全过
3. **业务操作核心 CRUD**(ADR-008 ⑦ 局部):增 + 删 + 改 + 查 一遍,**过滤/搜索/下拉/多选/联动留 CI/CD**
4. **错误反馈完整性**(ADR-008 ⑧):至少 1 个错误路径(如必填校验)有 toast/Modal 显示,**无默默 500**
5. **上传/下载/Image 链路**(memory `upload_link_e2e_ui_layer`):若 spec 涉及附件/图片,UI 层 `naturalWidth>0` 必跑
6. **i18n 中文 value 校验**(memory `i18n_zh_value_must_be_chinese`):若涉及 i18n,zh-CN.json 校验脚本必跑

**CI/CD E2E 接管(push 后跑)**:
- ADR-008 ②③④(技术契约层 — API 调用双向 / 列表分页结构 / DTO 同步)
- ADR-008 ⑦ 全量交互(过滤/搜索/下拉/多选/联动每个验)
- 跨浏览器(Chrome 主 / Edge 兜底)
- 性能基线(列表 ≤ 1s)
- 跨页面回归(本 PR 改的页面 + 邻接 5 页 smoke)

### 决策授权挂钩(ADR-018)

| 场景 | Tier |
|---|---|
| 6 项硬冒烟全过 | **Tier 1 自主**汇报涛哥 Y |
| 6 项硬冒烟有 1 项不通 | **Tier 2 简洁拍板**(修 vs defer) |
| CI/CD E2E 失败 → 是否回滚 push | **Tier 2**(修 vs revert vs hot-fix) |
| 推翻分级矩阵 | **Tier 3** 落新 ADR |

### 不变量(本 ADR 不动)

- **ADR-008 8 项核对清单本身不变** — 仍是验收基线,只是执行阶段细化
- **ADR-007 鉴权 4 条刚性** — 入库前必过,Plan E2E 6 项硬冒烟已包含
- **ADR-014 迁移轨 Front-load E2E 双层** — 不变,Plan E2E 仍要跑 E1+E2
- **简单轨跳 spec/plan** — 不变

---

## Consequences

### 正向

- 标准轨 Plan 落盘 E2E 时间下降(全量 8 项 → 6 项硬冒烟),session token / 时间成本降低
- CI/CD E2E 价值显化(承担全量回归 + 跨浏览器 + 性能)
- 鉴权 4 条 + 业务连通核心 4 项仍在 push 前阻塞 → 不放水
- 涛哥拍板从"看完整 8 项报告"简化到"看 6 项硬冒烟报告 + CI/CD 后看流水线绿"

### 负向 / 代价

- CI/CD E2E 必须稳定 — 若 CI/CD 频繁假阳性,反而增加返工(依赖 SYS CI/CD Phase 1+ 持续运维)
- 标准轨 6 项硬冒烟漏掉的复杂交互(下拉/多选/联动)若 CI/CD 也漏 → 操作员踩坑;**缓解:每月跑 1 次 eval E5 题(SYS.3 列表搜索过滤)抽查 CI/CD 覆盖率**
- 新 ADR 落地需同步更新全局 + 项目级 CLAUDE.md + 受影响 memory(短期一次性成本)

### 影响范围

- **影响 ADR**:ADR-008(执行阶段策略细化,顶部加注引用)/ ADR-007(无修改,Plan E2E 6 项含鉴权 4 条)/ ADR-014(无修改,迁移轨保留双层)
- **影响 memory**:
  - `feedback_e2e_proactive_business_constraint_check.md`(顶部加注:Plan 落盘按 ADR-024 6 项硬冒烟,完整业务路径由 CI/CD 兜底)
  - `feedback_e2e_double_layer_risk_checklist.md`(无修改,迁移轨仍套用)
  - `feedback_code_review_contract_check.md`(顶部加注:8 项分阶段执行参见 ADR-024)
  - `feedback_code_review_workflow.md`(无修改,tasks 完成后仍触发 code-reviewer)
  - `feedback_e2e_user_view_full_path_verification.md`(顶部加注:Plan 落盘只跑主路径 1 条,跨页面全量留 CI/CD)
- **影响 CLAUDE.md**:全局 + SYSV2 项目级「三轨工作流」+「E2E 8 项核对」段加分级矩阵
- **影响 spec 模板**:`_template-app-onboarding.md` 验收段调整为「Plan 落盘 6 项硬冒烟 + CI/CD 全量」

---

## Alternatives Considered

### A. 维持现状(Plan 落盘必跑全量 8 项)

- 优点:刚性最强,CI/CD 失败影响小
- 缺点:Plan 落盘 session token / 时间随项目规模线性涨;CI/CD E2E 价值不显化
- 不选原因:SYS CI/CD Phase 1 已闭环,基建已具备,继续浪费不合理

### B. 完全取消 Plan 落盘 E2E

- 优点:Plan 落盘最快
- 缺点:涛哥 Y → 双推 → CI/CD 失败 → 回滚成本 > 节省时间;鉴权 4 条 + 业务连通核心 4 项必须在 push 前过,否则违反 ADR-007 承诺
- 不选原因:工作流断裂风险 > 收益,违反 ADR-007 入库前硬阈值

### C. 按 spec 复杂度动态决定(无固定分级)

- 优点:最灵活
- 缺点:Claude 每次都要 case-by-case 判断,易漏 / 易跑偏;违反 ADR-018 显式边界判定矩阵原则
- 不选原因:与 ADR-018"边界判定显式矩阵"哲学冲突,改成显式三轨更符合工作流哲学

---

## Related

- **配套全局规则**:`~/.claude/CLAUDE.md`「E2E 8 项核对」+「三轨工作流」段
- **配套 SYSV2 规则**:`SYSV2/CLAUDE.md`(同步段)
- **上游 ADR**:[ADR-008](ADR-008-end-to-end-8-checks.md)(8 项核对清单本身)/ [ADR-007](ADR-007-auth-4-rigidity.md)(鉴权 4 条)/ [ADR-014](ADR-014-migration-refactor-workflow.md)(迁移轨 E2E 双层)
- **下游 memory**:`feedback_e2e_proactive_business_constraint_check.md` / `feedback_code_review_contract_check.md` / `feedback_e2e_user_view_full_path_verification.md` / `feedback_upload_link_e2e_ui_layer.md` / `feedback_i18n_zh_value_must_be_chinese.md`
- **CI/CD 基建依赖**:SYSV2 `docs/ops/cicd-*.md`(SYS CI/CD Phase 1 闭环报告)
- **相关 ADR**:[ADR-022](ADR-022-cicd-monitor-feedback.md)(CI/CD Monitor & Feedback 策略)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-14 | Proposed → Accepted | 涛哥 Y 分级减负方案 |
