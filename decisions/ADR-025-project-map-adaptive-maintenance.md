# ADR-025: 项目地图自适应维护(Supersedes ADR-013)

- **Status**: Accepted
- **Date**: 2026-05-16
- **Decider**: 涛哥
- **Scope**: 跨项目(所有 GSD `.planning/codebase/` 用户)

---

## Context(背景 / 为什么需要决策)

### 触发场景

ADR-013(2026-05-09)确立 codebase 画像作前置事实基础,维护机制为「触发式增量更新 + 月度全量兜底 + 启动必扫」三联。运行数周后涛哥反馈:**「月度兜底全量重扫」不够灵活** —— 固定日历周期与项目实际演进节奏脱节:

- 项目长期无结构变化时,月度全量重扫(~25-40 分钟)是纯浪费
- 工作区新增项目 / 子应用这种**实质变化**反而要等下一个月度周期,或靠人记

### 当前状态实证

- ADR-013 §3「月度兜底全量重扫」+「启动自检 > 30 天主动报涛哥」当前是**规则层约定**,无 hook 实现,靠 Claude 自觉
- 「codebase 画像」术语对 PM(涛哥)不直观,要求改用更直白的「**项目地图**」

### 决策不做的代价

- 维护节奏继续跟日历而非项目演进 → 浪费 + 滞后并存
- 启动检测靠 Claude 自觉 → 不可靠

---

## Decision(决策本身)

**一句话**:ADR-013 的「画像作前置事实 + 启动必扫 + 触发式增量」全部保留;**「月度全量兜底」废除**,改为「**自适应触发为主 + 启动软兜底**」;术语「codebase 画像」统一更名为「**项目地图**」。

### 保留(承自 ADR-013,不变)

- 项目地图(`.planning/codebase/*.md` 7 文件)作 spec / plan / 重大调研的**前置事实基础**
- **启动必扫 6 类**(项目地图 → 跨项目 ADR → 项目级 ADR → 历史 spec → 历史 plan → Domain 命名实证)
- **Spec 完结触发式增量更新**(强触发清单 + 三档更新方式:手工 Edit / `--paths` 增量 / 全量)
- **时效水印** `Last Updated: YYYY-MM-DD`

### 变更

1. **废除月度全量兜底** —— 不再有「每月 1 次定时全量重扫」
2. **新增自适应触发** —— 工作区结构发生实质变化时即时触发扫描,不等日历:
   - 工作区新增项目 / 子应用(新 nested repo / 新顶层项目目录)
   - 项目下线 / 归档(地图需移除过时项)
3. **启动软兜底**(替代硬月度)—— 新 session 启动时 hook 自动检测项目地图 git mtime;若 > 30 天未更新且当前项目使用 GSD codebase map,则提示涛哥;**仅提示不强制**,涛哥按实际判断是否重扫
4. **术语更名** —— 所有文档「codebase 画像」→「**项目地图**」;`.planning/codebase/` **目录名不变**(GSD `/gsd-map-codebase` 产出物,改目录名会破坏工具链)

### 触发机制全景

| 触发类型 | 时机 | 动作 |
|---|---|---|
| 启动必扫 | spec / plan / 重大调研启动 | 读项目地图作前置事实(6 类必扫) |
| 事件触发(增量) | spec 完结 + 强触发命中 | 三档增量更新 |
| **自适应触发(新增)** | 工作区加 / 减项目 | 即时扫该项目地图 |
| **启动软兜底** | 每次 session 启动 | hook 检测 > 30 天 → 提示涛哥 |

---

## Consequences(影响 / 副作用)

### 正向

- **维护节奏跟项目实际演进走,不跟日历** —— 消除「长期无变化仍月度重扫」的浪费 + 「新项目等月度」的滞后
- **软兜底 hook 化** —— 不再靠 Claude 自觉记「> 30 天」,SessionStart hook 自动检测
- **「项目地图」术语对 PM 更直观** —— 比「codebase 画像」少一层翻译

### 负向 / 代价

- 「工作区新增项目」的识别仍需 Claude / 涛哥判断(hook 可辅助但不全自动)
- 失去固定日历兜底 —— 若长期无 spec 完结且无项目增减,仅靠软兜底的 30 天提示

### 影响范围

- 影响全局 CLAUDE.md:「codebase 画像作前置事实」段更名「项目地图」+ 改机制描述
- 影响 memory:`feedback_load_project_history_first.md` / `feedback_spec_archive_after_completion.md`(术语更名,机制引用更新)
- 影响 hook:新增 SessionStart `~/.claude/hooks/project-map-staleness-check.js`
- 影响代码:无(工作模式 ADR)

---

## Alternatives Considered(其他选项 + 为什么没选)

### A. 维持 ADR-013 月度兜底
- 优点:固定周期简单
- 缺点:涛哥明确反馈不灵活,日历与项目演进脱节
- 不选原因:已被实际运行否定

### B. 纯自适应,无任何兜底
- 优点:最经济
- 缺点:长期无项目增减且无 spec 完结时,地图悄悄过期无人提醒
- 不选原因:无兜底层不安全

### C. 自适应触发为主 + 启动软兜底(选)
- 优点:节奏跟项目走 + 软兜底防遗忘 + hook 化不靠自觉
- 选定原因:涛哥拍板,平衡灵活性与安全性

---

## Related(相关引用)

- **被取代**:[ADR-013 codebase 画像维护](./ADR-013-codebase-profile-maintenance.md)(标记 `Superseded by ADR-025`)
- 上游 ADR:[ADR-002 四层文档结构](./ADR-002-four-layer-doc-structure.md) / [ADR-009 CLAUDE.md cheatsheet 精简](./ADR-009-claude-md-cheatsheet-distillation.md)
- 全局 CLAUDE.md:「事实驱动 / 禁臆测」段(项目地图必扫 cheatsheet)
- 工具:GSD `/gsd-map-codebase` skill + `/gsd-map-codebase --paths <p1,p2>` 增量
- hook:`~/.claude/hooks/project-map-staleness-check.js`(启动软兜底)

## 修订(2026-05-22)— Multi-repo 工作区适配 + plan 完结触发(约定层)

### 触发

涛哥评估「复用 `/gsd-map-codebase` 做技能增强、迁移轨 plan 完结自动刷对应域」时,实证 gsd 原生机制对 **multi-repo 工作区** 的失配点(`map-codebase.md` / `codebase-drift-gate.md` / `bin/lib/drift.cjs` 实证;前 3 点 SYSV2 实证 + 第 4 点 SRMV2 2026-05-22 dogfood 验证暴露):

| 失配点 | 实证 | 后果 |
|---|---|---|
| ① MECHANISMS 非 gsd 原生 | `map-codebase.md:117-124` 只产 **7** 图;MECHANISMS 是 ADR-026 加的第 8 维(只在 `gsd-doc-writer.md`) | 跑 gsd-map-codebase **漏刷 MECHANISMS** —— 最防迁移踩坑的「AI 最易臆测错处」图 |
| ② multi-repo 漂移失明 | drift 基于 `last_mapped_commit..HEAD` 数 **workspace 仓** commit;但代码在 N 个 nested repo,workspace `.gitignore` 排除它们 → workspace HEAD 与 nested 代码脱钩 | nested repo 改 50 文件,workspace HEAD 可能不动,漂移检测对 nested 代码改动**失明** |
| ③ 触发点用不上 | gsd drift gate 挂 `/gsd:execute-phase`;SYSV2 不走 GSD execute(走自有 spec/plan/tasks + qwen/dotnet 落盘) | 现成自动触发钩子 SYSV2 一次没用上 |
| ④ mapper 整篇重写冲他域 | `gsd-codebase-mapper.md:181` 强制 `Write` 整篇覆盖;聚合图(STACK/ARCHITECTURE/CONVENTIONS/INTEGRATIONS 按关注点交织、非按 repo 分节)裸跑 `--paths` 时 mapper 只看 scope 内文件 → **静默冲掉未 scope 域的事实(数据丢失)** | SRMV2 dogfood 发现 |

### 决策(约定层适配,**不改 gsd 原生 skill**)

1. **引擎复用 + merge-aware spawn**:`/gsd-map-codebase --paths <nested-repo-目录前缀>`(`--paths` 真实存在,`map-codebase.md:30-66`);**派 mapper 时必须带现有图作 `required_reading` + 显式「保留未 scope 域内容」指令**(规避失配点④ —— mapper `Write` 整篇覆盖会冲他域)
2. **MECHANISMS 必补**:增量刷 7 原生图后,Claude 本体单独补刷 MECHANISMS(跨模块语义,不适合纯 mapper agent)
3. **触发点提前到 plan 完结**:迁移轨/标准轨 plan 全 phase 完成 + E2E pass 即刷,**不等 archive**(plan 完结未必立刻 archive);作批次自治动作,不打断涛哥
4. **per-repo HEAD**:`last_mapped_commit` 记 nested repo **各自** HEAD,不是 workspace HEAD(后续修 `project-map-staleness-check.js` 的 multi-repo 失明,C 档)
5. **不改 gsd 原生 SKILL.md/workflow** —— 避免 gsd 升级覆盖 + 跨工作区污染

### 为什么约定层起步(不写 wrapper skill)

YAGNI:机制未验证先固化成 skill 有 over-engineer 风险;跑 2-3 个迁移后若手动步骤反复出现再固化(B 档)。参见 ADR-019(解决问题第一 + 规则可推翻)。地图定位:**导航层**(防 unknown unknowns / 漏看隐式依赖),不替代 grep 实证层(ADR-015 验真值);旧地图比没地图更危险(虚假安全感)→ 维护必须跟 plan 走。

### 影响

- 配套 SYSV2 memory:`feedback_plan_complete_map_refresh.md`(新建)+ `feedback_spec_archive_after_completion.md`(回链补缺)
- 配套 SRMV2 memory:`feedback_plan_complete_map_refresh_multirepo.md`(新建,6 nested repo dogfood 验证 + 第 4 失配点 merge-aware spawn 解法)
- 不影响 gsd 工具链代码

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-16 | Proposed → Accepted | 涛哥拍板;ADR-013 月度兜底不灵活;改「自适应触发为主 + 启动软兜底」+ 术语更名「项目地图」;Supersedes ADR-013 |
| 2026-05-18 | 补强(ADR-030 B4) | 项目地图文件 YAML frontmatter 带 `last_mapped_commit`(GSD mapper 已写入);`project-map-staleness-check.js` 增「漂移检测」—— 该 commit 之后提交数超阈值即提示重扫,与 30 天时效检测并行 |
| 2026-05-22 | 修订(multi-repo 适配) | 实证 gsd 原生 3 失配点(MECHANISMS 非原生 / multi-repo 漂移失明 / 触发点挂 GSD execute);约定层适配 = `--paths` 增量复用 + MECHANISMS 必补 + plan 完结即刷 + per-repo HEAD;不改 gsd 原生 skill;约定层起步(YAGNI) |
| 2026-05-22 | SRMV2 验证 + 第 4 失配点 | SRMV2(6 nested repo)dogfood 验证机制跑通(增量只扫 scope / 8 图齐含 MECHANISMS / per-repo HEAD 非根 HEAD 84935dc / 他域零丢失);新发现失配点④(mapper `Write` 整篇覆盖冲聚合图他域,数据丢失)→ 解法 merge-aware spawn(带 required_reading 现有图 + 保留他域指令) |
