# ADR-011: 业务门户(BP)定位与岗位边界

- **Status**: Accepted
- **Date**: 2026-05-07
- **Decider**: 涛哥
- **Scope**: 跨项目(BP 业务门户 + 子应用接入 + portal 三层岗位边界)

---

## Context(背景 / 为什么需要决策)

### 触发场景

涛哥 2026-05-07 实操反馈:用 systemadmin 登 BP 测试 → 看到菜单但点不开;改用 BPuser 测一样;暴露**业务门户产品定位与岗位边界从未明确决策**。

### 当前状态实证

- `BP` (`AI.REACT.SYS.BusinessPortal` :8002) 设计意图模糊:既是业务用户工作台,又被 systemadmin / 任意角色登录(无 portal 岗位拦截)
- 超管登 BP 走"超管 bypass"路径(`AuthInfoQueryService.cs` D4 fallback,line 131-146):`allowedAppNames` 空 → 按全量 SubApp 兜底 + `SYS_AdminMenuBypass` 审计留痕
- 该 fallback **是技术兜底**(防超管完全看不到菜单),**不是产品决策**(超管该不该看 BP)
- 业务用户(BPuser)登录后菜单可见,但子应用集成 bug 导致点击无反应(详见 ADR-012 子应用接入 SOP 强约束)
- ComplianceProfile=Standard(`SYS_SystemParameter` 当前)— 三员合规 / 审计严格隔离 默认关闭,涛哥确认 Standard 模式不强校验 portal 边界,**但产品方向需先定**

### 决策不做的代价

- portal 边界不清 → 客户上线后超管随意操作业务数据 → 审计追溯断链
- 业务门户与控制台混用 → 产品定位混乱 → 客户决策"哪个角色用哪个 portal"无依据
- 后续 ComplianceProfile=Compliance 模式启用时 → 临时加 portal 拦截 → 改造范围不可控

---

## Decision(决策本身)

**一句话**:**业务门户(BP)= 业务用户日常工作台**;超管 / 审计员**不进 BP**(走各自专属 portal),portal 三层岗位边界为**产品方向**(Standard 模式不强校验,Compliance 模式硬拦截)。

**详细**:

### portal 三层定位(产品方向)

| portal | 端口 | 目标用户 | 职责 | Compliance 模式硬约束 |
|---|---|---|---|---|
| **SYS.3 控制台** | :8001 | 系统管理员 / IT 运维(超管) | 组织 / 用户 / 权限 / 子应用注册 / 系统配置 | 仅超管 + IT 角色可登录 |
| **BP 业务门户** | :8002 | **业务用户**(采购员 / 仓管 / QC 员 / 工程师 / 主数据维护员等) | 日常业务操作(MDM 维护 / SRM 协作 / MES 工单 / EAM 设备 / QC 检验) | **超管禁登**;业务用户必须有 `BusinessPortalAccess=true` |
| **AuditPortal 审计门户** | :8003 | 审计员 / 内审 / 外审 | 只读审计日志 / 合规报表 / 操作追溯 | 仅审计角色可登录;BP/SYS.3 操作均留痕到此 |

### Standard / Compliance 双模式策略

| 场景 | Standard 模式(当前) | Compliance 模式(等保 / 合规客户) |
|---|---|---|
| systemadmin 登 BP | 允许(走超管 bypass + AdminMenuBypass 审计) | **禁止**(login 拦截 + 提示走 SYS.3) |
| 普通业务用户登 SYS.3 / AuditPortal | 允许(若有 ConsoleAccess / AuditAccess) | 严格按 portal 角色绑定 |
| 跨 portal 数据查看(如超管在 BP 看业务数据) | 允许 + AdminMenuBypass 留痕 | **二次审批 + 强审计** |

### 实施层(子模块决策)

- BP login 不强加 portal 角色拦截(Standard 默认),但**保留扩展点**(中间件 hook 位置预留)
- 超管 bypass 路径**保留**(已实装),作 Standard 模式兜底
- Compliance 模式启用时,扩展点激活 portal 角色拦截(独立合规 spec 实施)

---

## Consequences(影响 / 副作用)

### 正向

- 业务门户产品形态**首次拍板**,客户上线时角色 → portal 映射有依据
- 子应用接入(MDM / SRM / MES / EAM)的产品目标清晰:**业务用户日常工作台**,不容忍"打不开 / 看不到 / 数据错"
- Standard / Compliance 双模式分层,合规客户升级时改动范围可控
- 审计追溯(AdminMenuBypass / portal 跨域访问)有产品依据

### 负向 / 代价

- 超管在 BP 仍走 bypass 路径(Standard 模式)— 临时不"干净",但已有审计留痕兜底
- 数据级权限(用户 × 数据范围)未在本 ADR 涵盖,留独立合规 spec(ADR-013 候选)
- portal 三层硬切分需要 Compliance spec 落地中间件,本 ADR 仅定方向不实施

### 影响范围

- 影响 spec:`docs/superpowers/specs/2026-05-06-app-center-platform-modernization/spec.md` 顶部加回链;`docs/superpowers/specs/2026-05-07-mdm-browserrouter-migration/spec.md`(配 ADR-012 SOP)
- 影响 plan:`docs/superpowers/plans/_template-app-onboarding.md`(子应用接入模板加 portal 边界段)
- 影响代码:`AL.Extend.SYS.WebApi/Application/Queries/AuthInfoQueryService.cs:131-146`(超管 bypass 路径文档化)
- 影响 memory:无新增

---

## Alternatives Considered

### A. portal 完全开放(任意角色任意 portal)

- 优点:实施零成本
- 缺点:产品定位模糊;合规风险无解;客户角色映射无依据
- 不选原因:违背企业管理岗位职责分离常识

### B. portal 立即硬切分(Standard 也强拦截)

- 优点:产品边界最干净
- 缺点:超管运维场景受阻(无紧急 bypass);Standard 客户(无合规需求)增加复杂度
- 不选原因:Standard 客户用不上,过度治理

### C. 本 ADR 只定方向,Standard 暂不强校验,Compliance 启用时硬约束(选)

- 优点:平衡产品方向与实施成本;扩展点预留好
- 缺点:Standard 模式仍有 bypass,客户审计需依赖 AdminMenuBypass 留痕
- 选定原因:涛哥确认 Standard 模式三员关闭,先定方向,合规独立 spec 实施

---

## Related(相关引用)

- spec:[Platform spec](../../SYSV2/docs/superpowers/specs/2026-05-06-app-center-platform-modernization/spec.md);[MDM BrowserRouter 迁移 spec](../../SYSV2/docs/superpowers/specs/2026-05-07-mdm-browserrouter-migration/spec.md)
- plan:[`_template-app-onboarding.md`](../../SYSV2/docs/superpowers/plans/_template-app-onboarding.md)(子应用接入模板)
- 配套 ADR:[ADR-012 子应用接入 SOP 强制](./ADR-012-subapp-onboarding-sop-enforcement.md)
- 上游 ADR:[ADR-007 鉴权 4 条刚性](./ADR-007-auth-4-rigidity.md)(portal 边界是其延伸)
- 下游 ADR(候选):ADR-013(数据级权限第五维授权,独立合规 spec)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-07 | Proposed → Accepted | 涛哥拍板("systemadmin 不应该登 BP 是合规问题";Standard 模式三员关闭,Compliance 模式硬约束) |
