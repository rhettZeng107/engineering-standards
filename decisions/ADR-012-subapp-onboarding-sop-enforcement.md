# ADR-012: 子应用接入 SOP 强约束 + BrowserRouter 标准

- **Status**: Accepted
- **Date**: 2026-05-07
- **Decider**: 涛哥
- **Scope**: 跨项目(BP 业务门户 + 所有子应用 MDM/SRM/MES/EAM/QC/...)

---

## Context(背景 / 为什么需要决策)

### 触发场景

涛哥 2026-05-07 实操反馈:BPuser 登 BP → 点 MDM 菜单 → 打不开页面 → 实证为 **wujie sync=true + MDM HashRouter 不兼容**(BP 主路由 navigate 通过 history.pushState 触发 wujie sync,但 MDM HashRouter 只读 hash 不读 history,永远停在默认 MaterialIndex 不切页)。

### 当前状态实证

- 子应用接入手册 [`subapp-onboarding-guide.md`](../standards/subapp-onboarding-guide.md) 第 1.8 步明确写"wujie sync + BrowserRouter",**但 MDM 自己用 HashRouter**(`AI.REACT.MDM.1/src/index.jsx:6 import {HashRouter as Router}`)
- MDM `App.jsx:42` 加了 `bus.$on('mdmreact-router-change', routerJump)` bus 事件兼容老接入方式 — **绕开标准的临时方案**
- 接入手册存在,但**没有强约束力** — MDM 是参考实现却破例(历史遗留 CRA 时代 HashRouter)
- 后续 SRM / MES / EAM / QC 接入时,如果各自踩坑、各自绕 hack → **每个子应用都是定制开发** → 项目成本失控,业务上线不可预期
- 同时,P3 Vite 升级(commit `6389f1c`)只解决了工具链,没修 antd v5 + pro-components 老 API 兼容(`hidden:true` x 11 处),涛哥 P-D 验收阶段才被发现

### 决策不做的代价

- SRM/MES/EAM 接入时复读同样问题:wujie sync 不工作 / antd 老 API 触发 throw / 子应用接入流程不一致
- 接入手册是文档摆设,产品标准化承诺破产
- 客户(企业 IT 部门)把 BP 当作 portal 工具时无法预期"接入第 N 个子应用要多久 / 多少风险"

---

## Decision(决策本身)

**一句话**:**子应用接入手册 = 准入 SOP 强约束**;子应用必须用 **BrowserRouter**(配 wujie sync=true)、必须实现 manifest API、必须 IP allowlist 跨进程鉴权;**MDM 作为参考实现先按 SOP 改造**(HashRouter → BrowserRouter)。

**详细**:

### SOP 强约束清单(子应用接入门槛)

| # | 约束 | 强制性 | 检测手段 |
|---|---|---|---|
| 1 | 路由必须用 **BrowserRouter** + basename 对齐 SubApp.VirtualPath(如 `/MDM/`) | **强制** | 接入评审 + grep `HashRouter` 必为 0 |
| 2 | manifest API 实装 + IP allowlist 中间件(参见 ADR-006) | **强制** | curl 从应用中心 IP 200,从其他 IP 403 |
| 3 | axios 拦截器:prod 走 `$wujie.props.token`,dev fallback localStorage | **强制** | 代码审查 + `request.js` 模板比对 |
| 4 | 子应用内部 navigate 走 React Router(相对路径或 absolute 自动加 basename) | **强制** | grep `window.location` 不可有 SPA 跳转用法 |
| 5 | 后端 API base path = `/<appName>api/`(如 `/mdmapi/`)便于 BP vite proxy 配置 | **强制** | manifest API 路径前缀检查 |
| 6 | 子应用 build 产物含 `manifest.json` + 部署到 BP 网关路径(如 `/MDM/`) | **强制** | postbuild 脚本(参考 MDM `generate-manifest.mjs`) |
| 7 | E2E 双层覆盖(API + UI 经 BP wujie 加载)| **强制** | 接入完结前必跑 |
| 8 | antd 5 + pro-components 标准用法(无 `hidden:true` 老 API,改 `hideInTable`/`hideInSearch`)| **建议**(子应用自治) | code-reviewer HIGH |

### MDM 改造作参考实现

- `index.jsx`: `HashRouter` → `BrowserRouter` + `basename="/MDM"`
- App.jsx: 移除或保留 `mdmreact-router-change` bus 监听(保留作 backward compat,新接入子应用不依赖)
- 全部业务页面 navigate 路径核对(已实证只 1-2 处需关注)

### 接入流程治理(ITSM 风格)

参考 ADR-014(候选,子应用全生命周期治理):

1. **申请**:子应用方提交接入申请(子应用 metadata + 部署目标 + 接入手册自检表)
2. **IT 评审**:Architect / 代码 review SOP 8 项检测
3. **业务审批**:涛哥 / 业务负责人确认子应用业务范围
4. **接入实施**:走接入手册 10 步 + IT 配合应用中心注册 / IP allowlist
5. **验收**:E2E 双层 + 涛哥手动 BP 跑通 → GoOnline
6. **监控 / 运维**:子应用监控 + 审计日志
7. **下线 / 迁移**:GoOffline → 数据归档 → 状态机收尾

(本 ADR 仅定 SOP 8 项约束,完整生命周期治理留 ADR-014 独立 spec)

---

## Consequences(影响 / 副作用)

### 正向

- 接入手册从"文档"升级"准入 SOP",有强约束力(接入前 8 项检测必过)
- MDM 改造作参考实现,SRM/MES/EAM 后续接入直接复用(0 定制)
- wujie + BrowserRouter sync 工作,业务用户菜单 click → 真切页 → 业务可用
- 子应用接入项目可估期(企业 IT 部门可决策)

### 负向 / 代价

- MDM 自身需投入 1 spec / 1 plan / 1-2 文件改 + E2E 全回归(本批次推进)
- 接入手册的强约束,新接入团队学习成本提升(但有 MDM 参考实现降低)
- 后续 SOP 8 项更新需要走 ADR Superseded 流程(不可改写历史)

### 影响范围

- 影响 spec:[2026-05-07-mdm-browserrouter-migration/spec.md](../../SYSV2/docs/superpowers/specs/2026-05-07-mdm-browserrouter-migration/spec.md)(本 ADR 推动落盘)
- 影响 plan:[2026-05-07-mdm-browserrouter-migration/plan.md](../../SYSV2/docs/superpowers/plans/2026-05-07-mdm-browserrouter-migration/plan.md)
- 影响代码:`AI.REACT.MDM.1/src/index.jsx:6`(HashRouter → BrowserRouter);`AI.REACT.MDM.1/src/App.jsx:42`(bus 监听保留 backward compat 注释)
- 影响标准文档:[`standards/subapp-onboarding-guide.md`](../standards/subapp-onboarding-guide.md)(SOP 8 项检测段升级,从"建议"改"强制")
- 影响 memory:[`feedback_subapp_onboarding_sop_enforcement.md`](../../SYSV2/.claude/projects/.../memory/...)(新增,跨项目 SOP)

---

## Alternatives Considered

### A. 保留 MDM HashRouter,BpLayout 菜单 click emit `mdmreact-router-change` bus(速决)

- 优点:1 文件改;1 小时落地
- 缺点:**违背接入手册标准**;每个子应用都要复用 hack;hash 不持久(刷新丢失);wujie alive=true 切回时 hash 错;长期债务
- 不选原因:涛哥要"企业管理治理"层面解,不是绕坑

### B. 接入手册作"建议",子应用自治选用 HashRouter / BrowserRouter

- 优点:子应用团队自由度高
- 缺点:每个子应用各自踩坑;接入流程不可预期;BP 集成层每个子应用都要适配
- 不选原因:违背产品标准化承诺,客户决策"接入要多久"无依据

### C. SOP 强约束 + MDM 作参考实现先改造(选)

- 优点:产品标准化;SRM/MES/EAM 0 定制接入;客户可估期;符合企业 ITSM 治理常识
- 缺点:MDM 需 1 批次改造投入(本批次)
- 选定原因:涛哥 2026-05-07 拍板"按推荐组合方案改造更新",MDM 投入可控,长期收益高

### D. 完整重构 BP 子应用集成层(Platform spec v2)

- 优点:架构最优
- 缺点:1-2 周;脱离当前 MDM 已上线的现实
- 不选原因:过度设计;留作 SRM/MES/EAM 大批量接入时启动

---

## Related

- 上游 ADR:[ADR-011 BP 业务门户边界](./ADR-011-bp-business-portal-boundary.md)(决定 BP 是业务用户工作台 → 必须打通子应用集成)
- 配套 ADR:[ADR-006 SubApp 跨进程鉴权 IP allowlist](../../SYSV2/docs/decisions/ADR-006-subapp-cross-process-auth-ip-allowlist.md)(子应用接入 SOP 第 2 项依赖)
- 上游 ADR:[ADR-008 端到端交付 8 项核对](./ADR-008-end-to-end-8-checks.md)(接入手册 SOP 与 8 项核对呼应)
- 下游 ADR(候选):ADR-014(子应用全生命周期治理 ITSM)
- 标准文档:[`standards/subapp-onboarding-guide.md`](../standards/subapp-onboarding-guide.md)
- spec:[`2026-05-07-mdm-browserrouter-migration/spec.md`](../../SYSV2/docs/superpowers/specs/2026-05-07-mdm-browserrouter-migration/spec.md)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-07 | Proposed → Accepted | 涛哥拍板;MDM 作参考实现先改造,SOP 8 项强约束 |
