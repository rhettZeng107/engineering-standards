# ADR-026: 项目地图新增 MECHANISMS 维度 + discuss 读图可见化

- **Status**: Accepted
- **Date**: 2026-05-17
- **Decider**: 涛哥
- **Scope**: 跨项目(所有 GSD `.planning/codebase/` 用户)

---

## Context(背景 / 为什么需要决策)

### 触发场景

2026-05-17「MDM 主数据分发模块」spec,discuss 阶段出现基线偏差,涛哥多轮纠正:

- spec §11 写了「集团主数据管理员**角色**授权」,但未实证 SYS 授权机制就假设了「角色」存在。
- 后续派 Explore agent 调研,直接采信其断言「SYS 无角色层、授权岗位只管组织授权」—— 实为**错误**:SYS 的「授权岗位」(`AuthPosition`)正是角色/职责载体,挂菜单权限(`PositionAuthInfo`)+ 挂成员(`AuthPositionMember`),作用被搞反。

### 当前状态实证

- `.planning/codebase/` 项目地图 7 文件(STACK / ARCHITECTURE / STRUCTURE / CONVENTIONS / INTEGRATIONS / TESTING / CONCERNS)2026-05-09 在;本次 spec discuss **未读地图**。
- 地图 7 维**无「核心机制 / 领域模型」维度** —— 鉴权与授权链路、组织模型、主数据真理源、子应用接入等跨模块语义机制,在地图里无机制级讲解处可查。
- ADR-025「启动必扫地图」是规则层约定,靠 Claude 自觉,**无可见交付物可供涛哥校验是否真读了**。

### 决策不做的代价

继续则:AI 对平台机制反复臆测踩坑;上游 agent 的断言式结论无人核验;工程标准 + 项目地图形同虚设。

---

## Decision(决策本身)

**一句话**:项目地图新增 `MECHANISMS.md`(核心机制 / 领域模型)第 8 维，作为可选、非阻断导航；当前机制结论仍以按需运行证据为准。

**详细**:

1. **地图 7→8 文件**:新增 `.planning/codebase/MECHANISMS.md` —— 专讲跨模块语义机制(鉴权与授权模型、组织模型、主数据真理源、子应用接入、菜单注册等)。这是 AI 最易臆测错的层面,集中固化、带 `file:line` / 表名锚点。
2. discuss 若使用项目地图，可引用 `MECHANISMS` / `ARCHITECTURE` 等具体段帮助导航；未使用地图无需额外说明，关键结论必须引用当前代码、LSP、DB、API、git、build/test 或 Browser/E2E 证据。
3. **探索类调研派带「事实驱动铁律」的 `code-explorer`**(铁律:断言慎下 / 找不到≠不存在 / 交叉验证 / 带锚点),不派无定义文件、不可编辑的内置 Explore;agent 的断言式结论(无 / 只能 / 必须)必须二次核验到 `file:line` / 表结构再采信。
4. `MECHANISMS.md` 只在涛哥明确要求，或低频核心机制变化具有重复导航价值时按受影响范围增量更新；spec 完结本身不触发刷新。

## Consequences(影响 / 副作用)

### 正向

- 平台机制有单一可查处,新 spec 不再从零臆测鉴权 / 授权 / 组织模型。
- 地图在有价值时可复用，但不会挤占当前运行证据和交付门禁。
- agent 误判经核验拦截,不直接污染基线。

### 负向 / 代价

- `MECHANISMS.md` 需随平台演进持续维护。
- 地图内容仍可能过时，使用时必须回到当前运行证据复核。

### 影响范围

- 影响采用 `.planning/codebase/` 的项目导航方式。
- 影响 ADR-025(地图维度 7→8，且只作非阻断导航)。
- 影响 memory:[feedback_verify_platform_mechanism_before_conclusion](项目 memory)。
- 影响 agent:`~/.claude/agents/code-explorer.md`(已加事实驱动铁律)。

## Alternatives Considered(其他选项 + 为什么没选)

### A. 只补一条 memory / 给 agent 加铁律

- 优点:改动小。
- 缺点:治标 —— 机制认知缺口、读图不可见两个根因都没解决。
- 不选原因:涛哥定性为「大事」,需系统性机制。

### B. 重新全量生成项目地图

- 优点:一次刷新。
- 缺点:7 文件结构本身没问题,缺的只是「机制」维度。
- 不选原因:增量加 `MECHANISMS.md` 即可,全量重扫是浪费(与 ADR-025 自适应精神一致)。

### C. 给内置 Explore agent 加铁律

- 不选原因:`Explore` 是 Claude Code 内置 agent type,无可编辑定义文件,改不了;改用可编辑的 `code-explorer`。

## 修订(2026-08-31)— MECHANISMS 保留但读图不再是交付物

`MECHANISMS.md` 继续作为可复用导航维度；spec/plan 是否读取项目地图由当前任务是否受益决定，不再要求展示“地图依据”，也不以未读、过期、漂移或未刷新阻断调研、评审与交付。机制结论必须回到代码、LSP、DB、API、git、build/test 或 Browser/E2E 运行证据复核。本修订覆盖本 ADR 早期“强制读图并可见化”的流程要求。

## Related(相关引用)

- spec:`SYSV2/docs/superpowers/specs/2026-05-17-mdm-master-data-distribution/`
- 上游 ADR:ADR-004(PM 视角 + 全局理解)、ADR-025(项目地图维护)、ADR-016(启动必扫历史)

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-17 | Proposed → Accepted | 涛哥拍板(MDM 分发 spec discuss 基线偏差复盘) |
| 2026-08-31 | 修订 | 保留 MECHANISMS 导航价值；取消强制读图与可见交付物要求，当前运行证据为真理源。 |
