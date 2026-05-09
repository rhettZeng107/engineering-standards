# ADR-014: AI Coding 工作流 — Front-load + Back-automate(迁移改造路径)

- **Status**: Accepted
- **Date**: 2026-05-09
- **Decider**: 涛哥
- **Scope**: 跨项目(老项目迁移改造系列: SYS / MDM 已做 + **SRM / MES / WMS / EAM / TPM 计划**)

---

## Context(背景)

### 触发场景

涛哥 2026-05-09 战略性反馈:**AI Coding 价值 = 前期讨论加深 + 后期高自动化**。当前 SYSV2 工作流:
- spec discuss 阶段拍板足够,但 E2E 双层风险识别不够前置(执行阶段才暴露,涛哥反复打断)
- plan 阶段中断频次高(单 phase 内 5-10 task 都汇报,即使「批次合同扩大版」memory 已缩窄)
- code review 触发分散(每 task 后派,而非 plan 完结统一)

### 当前状态实证

- ADR-002:四层文档(ADR / Spec / Plan / Tasks)✓
- ADR-008:E2E 8 项核对清单 ✓ — 但**未约束 spec 阶段必嵌**
- memory `feedback_batch_contract_extended.md`:中断白名单 4 类
- memory `feedback_code_reviewer_trigger_matrix.md`:每次代码改动后触发(分散)
- 全局 CLAUDE.md「双轨工作流」3 路: 标准 / 简单 / experiment

### 决策不做的代价

- 后续 5 个迁移改造项目(SRM / MES / WMS / EAM / TPM)沿用现状 → 涛哥被打断频率仍高 + AI Coding 价值无法发挥

---

## Decision(决策本身)

**一句话**:老项目迁移改造系列(SYS / MDM / SRM / MES / WMS / EAM / TPM)走**「迁移改造路径」**(双轨工作流第 4 路),核心 = **Spec 阶段 Front-load(Claude 自主深度风险识别)+ Plan 阶段 Back-automate(自治不中断 + 完结自动 CR + 自治修复)**。

### 1. Spec 阶段 Front-load(Claude 自主能力强化,非涛哥拍板矩阵)

#### 1.1 E2E 双层风险审查(Spec 内嵌段)

Spec 创建时 Claude 自主套用 [`feedback_e2e_double_layer_risk_checklist.md`](../../<projectMemoryDir>/) checklist 扫描:
- **E1 API 层**(7 风险点): DTO 大小写双兼容 / Policy 注册 / HTTP 动词 / 分页结构 / 错误响应 / token 信任链 / 响应类型
- **E2 UI 层**(8 风险点): Image 鉴权 3 层 / createObjectURL revoke / 下拉级联 / 工具栏三图标 / 路由 keepAlive / wujie props / 错误反馈 / 三态 UI
- **业务连通层**: ADR-008 8 项核对全套用

输出 spec 内嵌段:
```markdown
## E2E 双层风险审查(Claude 自主输出)
| 风险点 | 是否涉及 | 规避方案 |
|---|---|---|
...
```

涛哥**校验整体策略**而非逐条拍板。

#### 1.2 功能骨架等价审查(Spec 内嵌段)

迁移改造类 spec 默认套用[功能骨架等价原则](../../<projectMemoryDir>/feedback_skeleton_equivalent_migration.md):
- **前端**:源页面单 form → 新 React 也保留单 form(不分多步骤 / 多 Tab / 多 Drawer)
- **后端**:源 API 单 endpoint → 新 API 单 endpoint(同 in/out / 同业务流程)
- **不重新设计**:架构 / UX / 拆分 / 合并

输出 spec 内嵌段:
```markdown
## 功能骨架等价审查
| 模块 | 源页面/API 形态 | 新形态 | 等价 ✓ / 调整(标涛哥拍板) |
|---|---|---|---|
...
```

例外:涛哥显式要求改 UX / 鉴权安全必修 / 已下线技术栈强制迁移(craco → Vite)。

#### 1.3 Spec discuss 阶段不变

业务场景 + 全局理解 + 现状实证 + OQ 拍板等保留(ADR-004)。

### 2. Plan 自治执行 — 中断白名单缩窄到 3 类

| 中断条件 | 标准路径(原 4 类) | 迁移改造路径(新 3 类) |
|---|---|---|
| CR 直接报告 | ✅ | ❌ 撤销(plan 完结统一报) |
| HIGH 2 轮不收敛 | ✅ | ❌ 撤销(自治修复 2 轮) |
| 实证反转 | ✅ | 🟡 仅反转**出 spec 范围**才报 |
| 跨 spec 边界 | ✅ | ❌ 撤销(spec 阶段已识别 → 范围内) |
| **架构调整**(新 Aggregate / Schema 跨表 / portal 边界) | — | ✅ 必报 |
| **Spec 范围溢出**(发现漏写功能 / 边界扩大) | — | ✅ 必报 |
| **超 spec 已识别 CRITICAL 安全/数据** | — | ✅ 必报 |

Phase 间 / Phase 内 / Plan 全程**全部不汇报**(批次合同进一步扩大,只 3 类中断)。

### 3. Plan 完结 — 自动 Code Review + 自治修复

#### 3.1 自动 code review

Plan 全部 phase 完成后 Claude 自动派(无需涛哥触发):
- `code-reviewer`(通用)
- 语言专项:`csharp-reviewer` / `typescript-reviewer` / `database-reviewer` 等
- 自动判定 CRITICAL / HIGH / MEDIUM / LOW

#### 3.2 自治修复 2 轮(spec 范围内)

| 范围内(自治修复) | 出范围(必报涛哥) |
|---|---|
| spec 已覆盖的逻辑 bug | 架构调整 |
| typo / 字段对齐 / DTO 同步 | 数据库 Schema 改动 |
| 错误处理 / 异常分支补全 | 业务逻辑变化 |
| E2E 选择器调整 / 等待策略 | 鉴权模型变更 |

CRITICAL / HIGH 自治修复 2 轮内,MEDIUM / LOW 列报告等涛哥决定。

### 4. E2E 自动跑

Plan 完结后 Claude 自动跑:
- E1 API: curl / Postman / 单元测试(自动)
- E2 UI: Playwright headless(自动)
- 失败先重试 2-3 次再 clarify(已有 memory `feedback_e2e_test_fail_clarify_first.md`)

### 5. 完结报告(一次性产出)

Plan 全部完成 + code review 自治修复完后,**一次性输出完整报告**:
```markdown
## ✅ <Spec 名> 完结报告
- 实施清单(各 phase 落盘文件)
- E2E 双层结果(API + UI 截图/录像)
- code review 报告(CRITICAL/HIGH 修复 + MED/LOW 待决)
- 风险闭环(spec 风险审查每条 ✓ / ✗)
- 功能骨架等价审查闭环
- 后续 backlog(出范围项 / 待决项 / 优化欠债)
```

---

## Consequences(影响)

### 正向

- **涛哥前期讨论加深**:Spec 阶段 Claude 自主深度风险识别 → 涛哥校验整体策略,不逐条拍板
- **涛哥后期释放时间**:Plan 自治执行 + 自动 CR + 自治修复 → 涛哥被打断频率降 80%+
- **AI Coding 价值发挥**:前重 + 后轻 = 智力投入 spec / 自动化执行 / 涛哥时间到产品策略
- **5 个未来项目受益**:SRM / MES / WMS / EAM / TPM 直接套用

### 负向 / 代价

- Spec 阶段长 — 涛哥前期校验时间增加(涛哥本意接受)
- 自治修复错了风险 — 中断白名单 3 类兜底 + 完结报告人工 review 兜底
- E2E 双层不能验证的功能(配置 / 内部库) — spec 标 "E2E exemption" 涛哥拍板

### 影响范围

- 影响 spec:未来迁移改造类 spec 全部套用本 ADR(BP 切换组织 spec 作首个试点)
- 影响 plan:同 spec
- 影响 memory:
  - 升级 `feedback_batch_contract_extended.md`(中断白名单 3 类适用迁移改造路径)
  - 升级 `feedback_code_reviewer_trigger_matrix.md`(plan 完结自动触发 + 自治修复 2 轮)
  - 新建 `feedback_e2e_double_layer_risk_checklist.md`(E2E checklist)
  - 新建 `feedback_skeleton_equivalent_migration.md`(功能骨架等价)
- 影响全局 CLAUDE.md「双轨工作流」段:3 路 → 4 路加迁移改造路径

---

## Alternatives Considered

### A. 涛哥逐条拍板风险/阻塞/优化矩阵
- 优点:风险全部涛哥确认
- 缺点:Spec 阶段拍板负担过重 → 违背"AI Coding 价值"
- 不选原因:涛哥明确 Claude 自主识别更高效

### B. 当前现状(标准路径 4 类中断白名单)
- 优点:稳定性高
- 缺点:Plan 阶段中断频次高,5 个未来项目沿用现状 → 涛哥被打断频率仍高
- 不选原因:不发挥 AI Coding 价值

### C. Front-load + Back-automate(迁移改造路径,选)
- 优点:平衡 spec 深度 + plan 自动化;后续 5 项目复用
- 缺点:自治修复需边界明确(spec 范围内 / 出范围 必报)
- 选定原因:涛哥本意 + 5 项目长期收益

---

## Related

- 上游 ADR:[ADR-002 四层文档](./ADR-002-four-layer-doc-structure.md) / [ADR-004 PM 视角业务场景化](./ADR-004-pm-view-business-scenario.md) / [ADR-008 E2E 8 项核对](./ADR-008-end-to-end-8-checks.md) / [ADR-013 codebase 画像](./ADR-013-codebase-profile-maintenance.md)
- 配套 memory:
  - `feedback_e2e_double_layer_risk_checklist.md`(E2E 双层 checklist)
  - `feedback_skeleton_equivalent_migration.md`(功能骨架等价)
  - `feedback_batch_contract_extended.md`(批次合同扩大版,迁移改造路径中断白名单 3 类)
  - `feedback_code_reviewer_trigger_matrix.md`(plan 完结自动触发 + 自治修复)
- 全局 CLAUDE.md「双轨工作流」段(3 路 → 4 路加迁移改造路径)
- 试点:SYSV2 BP 切换组织 spec(2026-05-09 落地)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-09 | Proposed → Accepted | 涛哥拍板;触发场景 = AI Coding 价值最大化(Front-load + Back-automate);适用 5 个未来迁移改造项目 |
