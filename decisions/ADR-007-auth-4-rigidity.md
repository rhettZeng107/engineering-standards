# ADR-007: 鉴权 4 条刚性(任一断 = 用户第一步就断)

- **Status**: Accepted
- **Date**: 2026-04 中 SYSV2 多次踩坑沉淀 → 2026-05-05 ADR 化回溯落地
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- SYSV2 / HC 等企业管理软件项目,鉴权链路任一环节断裂 = 用户登录后第一步就断,体验崩塌
- 实证:多次踩坑 — 加了 Controller 没加 `[Authorize]` 裸奔 / 注册了 Policy 但没 `AddPolicy` 抛 500 / 加了权限码没加菜单种子 / SSO token 不通进不了应用
- 早期 spec / plan 经常漏盖某一环 → 落盘后用户实操才暴露
- 鉴权链路是横向影响,跨所有 Controller / 跨所有子应用

### 决策不做的代价

- 漏盖某一环 → 用户登录后第一步即断,业务完全不可用
- 没有刚性清单 → spec / code-reviewer 可能漏检
- 跨子应用接入(MDM / SRM / MES / EAM)缺统一基线 → 每次接入重新踩坑

---

## Decision

**一句话**:鉴权 4 条任一断 = 用户第一步就断,**spec 必盖 + 代码必落 + review 必查**。

### 4 条刚性

1. **`[Authorize]` 默认属性必须加** — 否则 Controller 裸奔,所有 endpoint 公开
2. **Policy 必须 `AddPolicy(...)` 注册** — 否则抛 500(Policy 引用了但 IServiceCollection 没注册)
3. **权限码 + 菜单种子齐全** — 否则菜单看不到(用户登进来侧边栏空白)
4. **SSO token 必须通** — 否则进不了应用(BP → 子应用透传 token 失败)

### 落地清单

- spec 验收段必显式列 4 条核对
- plan tasks 拆解必含"鉴权 4 条落点"段
- code-reviewer 触发条件含"鉴权敏感"自动升档
- 跨子应用接入(MDM / SRM / MES / EAM)模板 `_template-app-onboarding.md` 强制 4 条

### 例外(显式标注)

- 跨进程 server-to-server 调用(如 SubApp manifest 拉取):`[AllowAnonymous]` + 替代鉴权(IP allowlist / mTLS) — 见 [ADR-006](ADR-006-subapp-cross-process-auth-ip-allowlist.md)
- 公共资源(LOGO / 公开图片):`[AllowAnonymous]` + 不带敏感字段
- 其他例外必须显式 spec / ADR 拍板,不允许默默 `[AllowAnonymous]`

## 修订(2026-05-20)— 工厂隔离 X-Plant-Code 第 5 条刚性

SRMV2 合同 spec(`2026-05-20-srm-contract-migration`)plan T0.2 Tier 3 拍板触发(对应 SYSV2 MDM 已有实证):**跨工厂(plant)隔离的业务模块**(SRM 合同 / 采购 / 供应商 / MDM 主数据等)需在鉴权 4 条之上**叠加第 5 条刚性**:

### 第 5 条:X-Plant-Code header 工厂隔离

**规则**:涉及工厂级数据隔离的业务模块,所有 axios 请求必须携带 `X-Plant-Code` header,后端 middleware 验证当前用户对该工厂的权限。

**实施**:

| 层 | 落地 |
|---|---|
| **前端 axios** | `axios.interceptors.request.use(config => { config.headers['X-Plant-Code'] = getCurrentPlantCode(); return config; })` |
| **后端 middleware** | `app.UseMiddleware<PlantCodeAuthorizationMiddleware>()`(验证 token 中 user 对 header plantCode 的权限,403 if mismatch)|
| **跨子应用 plant 上下文** | BP 宿主通过 SSO token claims 注入 plantCode → Wujie props / URL hash 透传到子应用(同 token 透传链)|
| **跨端调用** | Contract.2 React 跨端调 Supplier.2 后端时,**同一 plantCode 透传**(避免工厂隔离穿透)|

**适用范围**:

- SRM 合同(Contract.2)/ 采购(Buyer.2)/ 供应商(Supplier.2)
- MDM 主数据(已实证 SYSV2 模式)
- MES / WMS / EAM / TPM(后续工作区,涉及工厂场景全适用)

**不适用范围**:

- 跨工厂报表 / 集团级聚合视图(显式 spec 标 `[NoPlantIsolation]`)
- 系统管理 / 配置类模块(不涉及工厂业务数据)

**Why**(涛哥 2026-05-20 Tier 3 拍板):

- 企业多工厂场景下,合同 / 采购 / 供应商主数据按工厂隔离是业务底线,鉴权 4 条不够
- SYSV2 MDM 已实证此模式可行 + 跨子应用 plantCode 透传 + 后端 middleware 校验
- 升级到鉴权刚性第 5 条 = 跨项目统一标准,避免每个 spec 重新拍板

**ADR 化策略**:本次按涛哥 2026-05-20「描述不当 / 范围微调直接 Edit 原 ADR」流程,**不新建 ADR**,作为本 ADR-007 修订段补入。后续工作区(MES / WMS 等)启动时,本规则自动适用。

**参考**:

- `~/Projects/SRMV2/docs/superpowers/specs/2026-05-20-srm-contract-migration/plan.md` T0.2 + spike-microfrontend-host-contract.md §3
- SYSV2 MDM `X-Plant-Code` 实证模式(参见 SYSV2 memory)

### 范围

- 默认范围:鉴权功能链路 4 条刚性(本 ADR)
- **不在默认范围**:合规深度(越权穷举 / 审计完整性 / 脱敏深度 / 密码策略等保化)— 由独立合规 spec + plan 引入 `security-reviewer` 处理

---

## Consequences

### 正向

- 鉴权基线清晰,跨子应用 / 跨项目可直接复用
- spec / plan / code-reviewer 三层都有刚性核查点,漏盖率显著下降
- 用户第一步即断的故障被防住

### 负向 / 代价

- 4 条 + 跨子应用接入额外清单 → 接入子应用 spec 工作量增加
- 例外必须显式 ADR / spec 拍板 → 跨进程 / 公共资源场景需要额外文档

### 影响范围

- 全部 SYSV2 / HC / 后续项目所有 Controller / 跨子应用接入
- memory `feedback_g21_ldap_portal_plan` / `feedback_mvp_phase_workflow_downgrade` 等多条同向收敛
- 影响代码:`AL.Extend.SYS.WebApi/Controllers/` 全 Controller / `Program.cs` Policy 注册段 / SQL 菜单种子 / 前端 SSO token 透传

---

## Alternatives Considered

### A. 单条核查(只查 `[Authorize]`)(已否)

- 优点:工作量小
- 缺点:漏 Policy / 菜单种子 / SSO,实证踩坑频繁
- 不选原因:实证不足

### B. 全合规化(等保级越权穷举 + 审计完整性 + 脱敏深度)(已否)

- 优点:覆盖最深
- 缺点:成本极高,与"业务功能优先"基线冲突
- 不选原因:合规深度独立 spec 处理(`feedback_mvp_phase_workflow_downgrade.md`),不混入默认 4 条

### C. 不立刚性,case-by-case(已否)

- 优点:灵活
- 缺点:每个 spec 重新讨论,漏盖率高
- 不选原因:实证多次踩同样的坑

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`「鉴权 4 条刚性」段
- 项目级:`docs/standards/frontend-ui-standard.md`(前端 SSO 透传)
- memory:`feedback_mvp_phase_workflow_downgrade.md`(合规深度独立 spec 边界)
- memory:`feedback_code_reviewer_trigger_matrix.md`(鉴权敏感自动升档)
- 例外 ADR:[ADR-006](ADR-006-subapp-cross-process-auth-ip-allowlist.md)(跨进程 IP allowlist 例外)
- 实证模板:`docs/superpowers/plans/_template-app-onboarding.md`

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-04 中 | 多次踩坑沉淀 | 散落 spec / plan / memory |
| 2026-04-23 | MVP 默认工作流定型,4 条进默认范围 | `feedback_mvp_phase_workflow_downgrade.md` |
| 2026-05-05 | ADR-007 回溯落地 | 散落决策合并到 ADR |
