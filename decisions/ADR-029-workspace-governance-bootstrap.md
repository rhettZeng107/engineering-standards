# ADR-029: 工作区治理三层模型与新工作区 bootstrap 模板

- **Status**: Accepted
- **Date**: 2026-05-18
- **Decider**: 涛哥
- **Scope**: 跨项目(所有工作区:SYSV2 / HC 已有 + 计划中的 SRMV2 及未来新工作区)

---

## Context(背景 / 为什么需要决策)

- SYSV2 工作区的治理(`CLAUDE.md` / `docs/superpowers/` / 项目地图 / memory)是一年多逐步手搓积累的,没有模板,也没有「一个工作区该长什么样」的标准。
- 下一步要为 SRM 迁移新建 `SRMV2` 工作区,未来 MES / WMS / EAM / TPM 等还会有更多工作区。
- 涛哥诉求:工作流哲学 + 工程标准 + 工程治理要能复用到**任何新工作区**,固化后直接给团队复用,并在实战中持续优化。
- 现状问题:每新建工作区都手搓治理 → 不一致、易遗漏、无法团队复用;且 HC 工作区用 GSD `.planning/` 体系、SYSV2 用 spec/plan 体系,治理已经分叉。

### 决策不做的代价

继续手搓:SRMV2 又是一份和 SYSV2 不一致的治理;团队无法复用;治理改进无法横向同步。

---

## Decision(决策本身)

**一句话**:工作区治理定为**三层模型**,工作区层用统一 bootstrap 模板实例化;新工作区按 `workspace-bootstrap-guide.md` 启动。

### 三层治理模型

| 层 | 载体 | 复用方式 | 放什么 |
|---|---|---|---|
| **全局层** | `~/.claude/`(CLAUDE.md / rules / hooks / agents) | 自动套到本机所有工作区 | 跨项目通用工作流、编码路由、批次合同、鉴权刚性等 |
| **跨项目标准层** | `engineering-standards` 仓(decisions / standards / templates) | 任何工作区引用,单一真理源,可 git 分发给团队 | ADR、工程标准、迁移手册、本模板 |
| **工作区层** | `<workspace>/CLAUDE.md` + `docs/superpowers/` + 项目地图 + memory | 用 bootstrap 模板实例化 | **仅项目特化 + 项目级覆盖全局规则** |

### 边界铁律

- 工作区层 `CLAUDE.md` **只放项目特化**(交付线 / 端口 / 仓库 / 落盘对接 / 项目级覆盖),**不重复**全局层与跨项目标准层 —— 重复 = 维护分叉源头。
- 跨项目可复用的规则 essence 上提 `engineering-standards`;本机通用工作流留全局层;项目独有的留工作区层。

### 新工作区 bootstrap

新工作区按 `standards/workspace-bootstrap-guide.md` 步骤启动:实例化 CLAUDE.md 模板 → 建 `docs/superpowers/` 骨架 → 建项目地图目录 → 建 memory 目录 → 回链 `engineering-standards`。老项目迁移工作区额外按 `legacy-migration-playbook` 声明基线 + 产源工件清单。

---

## Consequences(影响 / 副作用)

### 正向
- 工作区治理一致、可团队复用;新工作区启动标准化、不遗漏。
- 三层职责清晰,各层不重复,维护源单一。
- 治理改进沉淀进模板 → 横向惠及所有后续工作区。

### 负向 / 代价
- bootstrap 模板需随治理演进同步维护。
- 跨项目标准变更要通知各工作区(各工作区 CLAUDE.md 顶部回链 engineering-standards 缓解)。

### 影响范围
- 新建 `standards/workspace-bootstrap-guide.md` + `templates/workspace-CLAUDE.md.template`。
- 后续新工作区(SRMV2 起)一律按本模型 bootstrap。

---

## Alternatives Considered(其他选项 + 为什么没选)

### A. 每工作区手搓治理(现状)
- 优点:无前期成本。
- 缺点:不一致、不可复用、改进无法横向同步。
- 不选原因:正是本 ADR 要解决的问题。

### B. 所有项目塞进一个巨型工作区
- 优点:治理只有一份。
- 缺点:工作区臃肿、context 爆、独立交付线强耦合。
- 不选原因:一工作区 = 一条交付线,边界要干净。

### C. 工作流全固化进全局层 `~/.claude/`
- 优点:自动套用。
- 缺点:全局层是本机级,团队复用要靠可 git 分发的 `engineering-standards`;且工作区特化不该进全局层。
- 不选原因:团队复用 + 职责分层都要求跨项目标准独立成仓。

---

## Related(相关引用)

- 配套 standards:[workspace-bootstrap-guide.md](../standards/workspace-bootstrap-guide.md)
- 相关 ADR:ADR-002(四层文档)、ADR-009(CLAUDE.md cheatsheet 化)、ADR-025(项目地图自适应维护)、ADR-028(老项目迁移基线)
- 工作流偏好:SYSV2 走 spec/plan 体系、不启用 GSD

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-18 | Proposed → Accepted | 涛哥拍板,SRM 迁移新建 SRMV2 工作区驱动 |
