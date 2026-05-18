# ADR-030: 选择性融合 GSD 能力到工作流

- **Status**: Accepted
- **Date**: 2026-05-18
- **Decider**: 涛哥
- **Scope**: 跨项目(所有工作区工作流)

---

## Context(背景 / 为什么需要决策)

- 涛哥工作流已成熟:四层文档(ADR/spec/plan/tasks)、三轨工作流、迁移 playbook、E2E 8 项核对、批次合同、决策授权三档。
- GSD(Get Shit Done)是成熟的 spec-driven + context-engineering 系统,共 121 个功能。
- 全局评估 GSD:大部分与涛哥工作流重叠(phase / 验证 / 文档),但若干 GSD 能力填补**真实缺口** —— 这些缺口在 MDM 迁移踩坑中已暴露(审计大小写判反、E2E 冒烟漏检列空、批次改坏前序页)。
- 不做的代价:缺口不补,踩坑复发;或反向照搬整套 GSD,重复造轮子、推翻自有成熟工作流。

---

## Decision(决策本身)

**一句话**:不照搬 GSD,**选择性融合 8 项**(A 档 4 + B 档 4)补缺口;跳过 C 档及其余 GSD 功能。

### A1 — 新会话注入项目地图摘要
SessionStart hook `project-map-session-digest.js`:新会话自动注入 `.planning/codebase/` 的 STACK / ARCHITECTURE / MECHANISMS 摘要(各截断 ~22 行)。Claude 一开场即有工作区基本盘,不用每次重建认知。与 `project-map-staleness-check.js` 互补。

### A2 — Context 窗口监控
**已装**:GSD `gsd-statusline.js`(statusLine)+ `gsd-context-monitor.js`(PostToolUse)已在 settings.json 注册运行 —— context % 显示 + 剩余 ≤35%/≤25% 注入 advisory 警告(非阻塞、debounce)。本 ADR 确认纳入工作流,不另建。

### A3 — Claim 来源标注机制
把事实驱动(ADR-015)从「规则」升为「机制」:任何结论 / 审计 claim **必须标注来源证据**(`file:line` / API 响应 / curl 实测 / DB 查询);**假设**(未实证的推断)与**实证事实分区记录**,不得混写。上游 agent 报告同理(trust but verify)。MDM casing 踩坑根因 = 审计 claim 无来源、靠读代码推断。

### A4 — 目标导向验收(goal-backward)
验收回到 spec 的「验收标准」**逐条核**(交付物是否达成目标),不止「task 勾完 / build 绿 / CI 绿」。锚点:MDM casing —— task 全勾、CI 全绿,列却是空的。

### B1 — 验证欠债追踪
验收引入三态:`完成` / `partial`(会话结束但仍有未验项)/ `blocked`(带 `blocked_by` 外部依赖)。`partial` / `blocked` / 待人工项**持久化登记**到 `docs/superpowers/backlog/verification-debt.md`,不靠完结报告口头提一句(易丢)。

### B2 — 跨阶段回归闸
多批次 / 多阶段 plan,阶段 N 落盘后**跑「之前阶段」的 E2E**,防回归累积。锚点:MDM 批次 1/2/3 把前序正确页改坏。

### B3 — 静默砍需求检测
plan 不得静默丢 spec 需求。三层防御:① plan 显式逐条覆盖 spec 需求 ② review / 检查核需求覆盖率 ③ 发现漏项找回再规划。

### B4 — 项目地图 last_mapped_commit + 漂移检测
项目地图文件 YAML frontmatter 带 `last_mapped_commit`(GSD mapper 已写入);`project-map-staleness-check.js` 增「漂移检测」—— 该 commit 之后提交数超阈值即提示重扫。补充 ADR-025。

### 跳过(不融合)
GSD phase 机器(new-project/plan-phase/execute-phase)、UI design contract / review、Nyquist 测试映射、milestone 机器、quick/autonomous 模式、code review pipeline、developer profiling、extract-learnings、多运行时 / SDK / 安装器 —— 已有等价物,或属 GSD 自身基建。

---

## Consequences(影响 / 副作用)

### 正向
- 补齐迁移 / 验收 / 事实驱动的机制缺口,MDM 同类踩坑可防。
- 新会话有项目基本盘;context rot 有治理。

### 负向 / 代价
- hook / 规则增多,需随治理演进维护。
- A2 依赖 GSD hook(随 GSD 版本);GSD 大改时需校验。

### 影响范围
- 新增 hook `project-map-session-digest.js`;增强 `project-map-staleness-check.js`。
- `legacy-migration-playbook.md` 增「验收质量闸」段(A4/B1/B2/B3)。
- 全局 `~/.claude/CLAUDE.md` 事实驱动段补 A3 回链。
- ADR-025 补 B4(地图文件 frontmatter)。

---

## Alternatives Considered(其他选项 + 为什么没选)

### A. 照搬整套 GSD
- 优点:功能全。
- 缺点:重复造轮子,推翻自有成熟工作流,GSD phase 机器与 spec/plan 体系冲突。
- 不选原因:涛哥工作流已成熟,只需补缺口。

### B. 完全不融合
- 缺点:MDM 踩坑暴露的缺口不补,同类问题复发。
- 不选原因:缺口是实证出来的真问题。

### C. 等做成插件再融合
- 缺点:规则融合不必等插件;先固化规则,实战打磨,插件 MVP 后续再说。
- 不选原因:规则即时可用,插件是后续打包形态。

---

## Related(相关引用)

- 相关 ADR:ADR-015(事实驱动禁臆测)、ADR-024(Plan E2E 验收分级)、ADR-025(项目地图自适应维护)、ADR-027(踩坑复盘)、ADR-028(迁移基线)、ADR-029(工作区治理)
- standards:[legacy-migration-playbook.md](../standards/legacy-migration-playbook.md)

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-18 | Proposed → Accepted | 涛哥拍板,GSD 121 功能全局评估后选择性融合 8 项 |
