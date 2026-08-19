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
| **全局层** | `~/.claude/`(CLAUDE.md / rules / hooks / agents) | 自动套到本机所有工作区 | 跨项目通用工作流、编码路由、批次任务、鉴权刚性等 |
| **跨项目标准层** | `engineering-standards` 仓(decisions / standards / templates) | 任何工作区引用,单一真理源,可 git 分发给团队 | ADR、工程标准、迁移手册、本模板 |
| **工作区层** | `<workspace>/CLAUDE.md` + `docs/superpowers/` + 项目地图 + memory | 用 bootstrap 模板实例化 | **仅项目特化 + 项目级覆盖全局规则**(multi-repo 再细化为工作区根 + 仓级 CLAUDE.md,详修订 2026-06-18) |

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
- **2026-05-20 增量**(SRMV2 P3/P4 实证踩坑驱动):
  - 新增 `templates/workspace-QWEN.md.template` —— qwen CLI 项目上下文,与 CLAUDE.md 配套;**不实例化 = 派 qwen 时项目盲跑,前端编码会被 team-lead 自己 Edit/Write 接管(P3/P4 实测 0 处 qwen 调用)**。
  - 新增 `templates/docs-ops-baseline/` 5 件套(SYSV2 沉淀升标准):`cicd-self-heal-sop.md` / `credential-injection.md` / `cicd-ado-monitor.md` / `cicd-ado-failure-notification.md` / `deployment-ip-map.md`。bootstrap 脚本自动落进新工作区 `docs/ops/`,免重复手工复用。
  - `bootstrap-workspace.sh` 同步更新:实例化 QWEN.md + 落 docs-ops-baseline。

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

### D. 仓级特化用工作区根 `.claude/rules/` 路径范围化(glob)替代仓级 CLAUDE.md(2026-06-18 修订评估)
- 优点:规则集中工作区根,`paths:` glob 按路径触发。
- 缺点:`.claude/rules` 落工作区根容器仓,nested 仓各自独立 git(SRMV2 推 ADO+GitHub)单独 clone 即丢治理上下文;且 `.claude/rules` 是 Claude 私有,Codex 等其他 agent 看不到。
- 不选原因:仓级 CLAUDE.md **随仓 git 走 + 物理就近**(规则跟代码同目录,单仓 clone 也带上下文),对 multi-repo 独立仓更优。

---

## Related(相关引用)

- 配套 standards:[workspace-bootstrap-guide.md](../standards/workspace-bootstrap-guide.md)
- 相关 ADR:ADR-002(四层文档)、ADR-009(CLAUDE.md cheatsheet 化)、ADR-025(项目地图自适应维护)、ADR-028(老项目迁移基线)
- 工作流偏好:SYSV2 走 spec/plan 体系、不启用 GSD

---

## 修订 2026-06-18 — multi-repo 工作区层细化为「工作区根 + 仓级」两落点

**背景**:Claude Code 官方 memory 机制(`code.claude.com/docs/en/memory`)—— CLAUDE.md 从 cwd 向上链**全量加载**,**子目录 CLAUDE.md 在 Claude 读该目录文件时按需加载**(progressive disclosure,不污染无关仓 context);`AGENTS.md` Claude **不读**。SRMV2(7 nested 仓)实证:工作区根单一 CLAUDE.md 承载不了各仓技术细节(构建/端口/HTTP/分层/契约),Claude 进子仓干活缺仓级 context。

**修订**(三层治理模型不变,仅「工作区层」物理载体细化):

1. **工作区层 = 工作区根 `CLAUDE.md` + 各仓 `<repo>/CLAUDE.md`** 两个落点。单仓工作区只有前者;**multi-repo 工作区两者都铺**。
2. **职责切分**:
   - **工作区根**:跨仓定位(域/仓架构)、Git 双推表、Teams 映射、LSP 通道、项目级覆盖全局规则。
   - **仓级**:本仓特化 —— 构建/运行命令、dev 端口、鉴权特化、DbContext/库、序列化约定、目录/feature 约定、契约锚点、易错点。
3. **边界铁律延伸**:仓级 CLAUDE.md 同样**只放本仓特化,不重复**工作区根 / 全局层 / 跨项目标准层;顶部回链 `../CLAUDE.md` + `~/.claude/CLAUDE.md`;目标 < 200 行(超 = 仓特化过载,先精简)。
4. **仲裁铁律(防分叉,本 ADR 核心价值)**:同一事实只在**最高适用层**写一次 —— 跨仓共享/协调(共享库 server、跨域契约、Teams 映射、测试环境)→ 工作区根;仓内实现细节(本仓 DbContext 列表、JWT key 变量名、dev 端口)→ 仓级;下层只在"本仓偏离/特化"时才重述。
5. **AGENTS.md 桥接(有前提)**:仓若已有**经实证校验对齐当前仓**的 `AGENTS.md`,仓级 `CLAUDE.md` 才写一行 `@AGENTS.md` import 复用(Claude 不读 AGENTS.md 本身,但读 import)。⚠️ **import = 单向信任**:AGENTS.md 由其他 agent(Codex)维护可能漂移,import 前必须校准(命令/端口/路由实测对齐),否则把未校验内容灌进 context(违 ADR-015);校准成本高时直接自写。**multi-repo 前端/同类仓统一形态**(全自写 或 全 import 受控),勿"有 AGENTS.md 就 import"致分叉。
6. **模板/脚本**:`workspace-CLAUDE.md.template` 增「仓级 CLAUDE.md」段(含 stub);bootstrap 时 multi-repo 逐仓实例化。`bootstrap-workspace.sh` + skill `workspace-bootstrap` 加"nested 仓 ≥2 → 逐仓落仓级 stub"逻辑**待跟进**(暂人工铺)。

**横向影响**:后续 multi-repo 工作区(MES/WMS/EAM/TPM)bootstrap 一并铺仓级 CLAUDE.md。SRMV2 7 仓已落(**均自写** —— 前端 Buyer/Supplier 原有 Codex `AGENTS.md` 实证已过时 craco→vite/端口错,未 import 改自写)。

## 修订 2026-08-19 — Codex-first 最小治理容器

**背景**:Codex 接管全局工作流后，旧 bootstrap 同时实例化 `CLAUDE.md`、`QWEN.md`、个人 memory 和运维基线，既扩大常驻 context，也把 provider、本机状态和项目事实混入团队治理。部分 GSD runtime 已不存在，继续绑定 `/gsd-*` 会生成不可执行的工作区规则。

**修订**（替代本 ADR 中 2026-05-20 与 2026-06-18 的 provider-specific bootstrap 操作细节；原文保留为历史证据）：

1. 工作区层的 Codex 主载体改为最近的 `AGENTS.md`；multi-repo 按需在 nested repo 放更近的 `AGENTS.md`，只写该目录树的项目特化。
2. 新工作区默认只生成 `AGENTS.md`、安全 `.gitignore`、`docs/decisions/`、`docs/ops/`、`docs/superpowers/{specs,backlog,_archive}/` 和 `.planning/codebase/` 空骨架。
3. bootstrap 不自动生成 `CLAUDE.md`、`QWEN.md`、个人 memory、凭据、hooks、完整 Skill 目录或运维脚本。provider adapter、项目事实和运维资产必须基于实际需要单独引入。
4. 项目地图保持 provider-neutral：Codex 本体、当前可用 mapper/explorer 或结构化 `codex exec` 均可按受影响范围增量维护；不依赖 GSD 命令。
5. 已存在工作区只做 preflight 后的增量合并，不覆盖已有指令、`.gitignore`、用户改动或 nested repo。
6. 当前模板真理源为 `templates/workspace-AGENTS.md.template` 和最小化 `templates/bootstrap-workspace.sh`；初始化后的项目命令、边界与验证项必须经实证补全。

**保留边界**:三层治理、最近指令优先、项目特化不重复全局规则等核心决策不变；旧 Claude/Qwen 模板仅作兼容参考，不再是默认 bootstrap 输出。

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-18 | Proposed → Accepted | 涛哥拍板,SRM 迁移新建 SRMV2 工作区驱动 |
| 2026-06-18 | Accepted(修订) | multi-repo 工作区层细化为「工作区根 + 仓级」两落点;Claude 官方按需加载 + AGENTS.md import 桥接;涛哥拍板 |
| 2026-08-19 | Accepted(修订) | Codex-first 最小 bootstrap：AGENTS 为主、provider-neutral 项目地图、禁止自动写个人 memory/hooks/Qwen/GSD/ops 基线 |
