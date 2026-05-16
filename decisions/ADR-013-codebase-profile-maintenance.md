# ADR-013: codebase 画像作前置事实基础 + 触发式增量维护

- **Status**: Superseded by ADR-025
- **Date**: 2026-05-09
- **Decider**: 涛哥
- **Scope**: 跨项目(所有 GSD `.planning/codebase/` 用户)

---

## Context(背景 / 为什么需要决策)

### 触发场景

2026-05-09 BP 切换组织 spec discuss 阶段,Claude 在事实驱动原则下仍发生 4 次实证反转:
1. 关键词 `UserPlant|RolePlant|UserOrgAccess` 0 命中 → 错误结论"无现成表",未尝试 SYSV2 实际命名 `AuthPlant`
2. 漏看 `Domain/Aggregates/Plant/AuthPlant.cs`(C# Aggregate 已存在 + 完整工厂方法 + 软删除)
3. 漏看 `AL.Extend.SYS.Domain/DomainServices/AuthPlantDomainService.cs`(500 行成熟 DomainService,7 个生命周期方法)
4. 漏看 `AI.REACT.SYS.3/src/views/OrgAuth/index.jsx`(SYS.3 控制台已实装"组织授权"双 Tab 维护页面)

涛哥批评:**"我是想让你做任何新增或修改之前,都能基于当前事实再分析并推荐方案,这是我事实驱动的本意。"**

### 当前状态实证

- SYSV2 项目曾用 `/gsd-map-codebase` 产出 `.planning/codebase/` 7 文件,但 **`Analysis Date: 2026-04-11` 已 4 周过期**
- 内容仍在描述已下线的 HRIS / MAIN.1,**未覆盖 BP / AP / MDM / engineering-standards 独立仓 / 2026-05 ADR 联动**
- Spec discuss 阶段直接关键词 grep 代码仓 + dba 查 schema,**未先扫 codebase 画像** → 频繁实证反转

### 决策不做的代价

- codebase 画像过期 → spec 失去前置事实基础 → Claude 反复"以为没有"再"实证发现已存在" → 涛哥时间被打断 4-5 次/spec
- 多项目通用问题:任何用 GSD codebase mapper 的项目都会有过期风险

---

## Decision(决策本身)

**一句话**:codebase 画像 (`.planning/codebase/*.md` 7 文件)是 spec / plan / 重大调研的**前置事实基础**;通过**触发式增量更新 + 月度全量兜底 + 启动必扫**三联机制保鲜。

### 详细规则

#### 1. 启动必扫(前置事实驱动)

Spec / Plan / 重大调研启动前必扫 6 类(顺序优先级):
1. **`.planning/codebase/*.md`(7 文件)** — 当前 codebase 画像快照
2. `~/Projects/engineering-standards/decisions/ADR-*.md` — 跨项目 ADR
3. `<project>/docs/decisions/ADR-*.md` — 项目级 ADR
4. `docs/superpowers/specs/<topic>` Glob — 同主题历史 spec(含 `_archive/`)
5. `docs/superpowers/plans/<topic>` Glob — 同主题历史 plan(含 `_archive/`)
6. **现有 Domain Aggregate / DomainService / EF DbSet 命名实证** — 防 grep 关键词盲区:
   - Glob `<project>/**/Aggregates/**/*.cs` 拿命名清单
   - Read `SysContext.cs` / 各项目 DbContext 看注册 DbSet
   - Read `Domain/DomainServices/*.cs` 看现存生命周期方法

#### 2. 触发式增量更新(Spec 完结时同步)

**强触发(必更新)**:任一即触发
- 新 Aggregate / DomainService / Controller / 前端 view 落盘
- DB Schema 改动(新表 / 字段 / 索引 / 真理源)
- portal 边界变化 / 新子应用接入
- 新 ADR(横向决策)
- 新 EF DbSet 注册 / 新 SysContext mapping

**不触发(保持原 archive 节奏)**:
- 配置 / 文档 / 注释微调
- bug 修复(无新增能力)
- E2E 修补
- qwen 纯前端样式调整 / 单字段补漏

**三档更新方式(按代价递增)**:

| 档位 | 场景 | 工具 | 时间 |
|---|---|---|---|
| 极小改 | 单字段添加 / 现有 Aggregate 加方法 | 手工 Edit codebase 对应章节 | ~5 min |
| 中改 | 单模块 ≤ 3 文件 / 新增 1 view | `/gsd-map-codebase --paths <受影响路径>` | ~10-15 min |
| 大改 | 跨模块 / Schema 迁移 / 新 portal | `/gsd-map-codebase` 全量 | ~25-40 min |

#### 3. 月度兜底全量重扫

即使无 Spec 完结,每月 1 次 `/gsd-map-codebase` 全量刷新,捕捉零散小改累积漂移。

**触发自检**:Claude 启动新 session 时 `git log -1 --format="%cr" .planning/codebase/` 时长 > 30 天主动报涛哥提议重扫。

#### 4. codebase 文档时效水印

每个 `.planning/codebase/*.md` 顶部强制 `Last Updated: YYYY-MM-DD`(GSD mapper 模板已有)。**Spec discuss 启动时若发现某 codebase 文档 > 30 天未更新且涉及当前 spec 范围,Claude 主动报涛哥**(spec 启动 checkpoint)。

---

## Consequences(影响 / 副作用)

### 正向

- **解决 BP 切换组织 spec 4 次实证反转的根因** — 启动必扫 codebase 画像即可拿到 AuthPlant Aggregate / OrgAuth UI 等关键事实
- **平衡新鲜度与成本** — 触发式增量比"每次代码改动后跑 mapper"省 90%+ token,比"全手动靠自觉"避免 4 周过期
- **跨项目通用** — 任何用 GSD codebase mapper 的项目都受益
- **配合月度兜底** — 不依赖触发判断完美,月度全量兜底防漂移

### 负向 / 代价

- 触发判断依赖经验(强 / 不触发清单是辅助,边界场景仍需 Claude 判断)
- 月度全量重扫 ~25-40 分钟成本(可后台跑不阻塞)
- codebase mapper 工具依赖 GSD `/gsd-map-codebase` skill(项目须支持)

### 影响范围

- 影响 spec:所有跨前后端 / 跨模块 / 鉴权敏感 / Schema 变更类 spec(本 ADR 落定后启动)
- 影响 plan:同 spec
- 影响 memory(已升级):
  - `feedback_load_project_history_first.md` 加 6 类必扫清单
  - `feedback_spec_archive_after_completion.md` 加触发式更新条款
- 影响代码:无(本 ADR 是工作模式 / 不动代码)
- 影响全局 CLAUDE.md:「事实驱动 / 禁臆测」段加 codebase 必扫 cheatsheet 1 行

---

## Alternatives Considered

### A. 全自动同步(每次代码改动后自动跑 mapper)
- 优点:永远最新
- 缺点:token 爆炸不现实(每次小改重跑 4 mapper agent ~30 分钟)
- 不选原因:成本不可接受

### B. 全手动靠开发者自觉
- 优点:精确控制
- 缺点:容易忘 — SYSV2 已踩坑 4 周过期
- 不选原因:依赖人为纪律,不可靠

### C. 触发式 + 月度兜底 + 启动必扫(选)
- 优点:平衡新鲜度 / 成本 / 可执行
- 缺点:"关键事件"判断需经验
- 选定原因:涛哥拍板,平衡三角最优

### D. 只增量,无月度兜底
- 优点:最经济
- 缺点:跨模块漂移 / 触发清单边界场景可能漏
- 不选原因:无兜底层不安全

### E. 只全量,无增量
- 优点:最简单
- 缺点:频繁 25-40 分钟成本
- 不选原因:小改也走全量浪费

---

## Related(相关引用)

- 上游 ADR:[ADR-002 四层文档结构](./ADR-002-four-layer-doc-structure.md)(codebase 画像不在 ADR/Spec/Plan/Tasks 四层,是事实档案,与四层正交但前置)
- 上游 ADR:[ADR-009 全局 CLAUDE.md cheatsheet 精简](./ADR-009-claude-md-cheatsheet-distillation.md)(本 ADR 详细规则下沉,CLAUDE.md 仅加 1 行 cheatsheet)
- memory:`feedback_load_project_history_first.md`(SYSV2 必扫清单)
- memory:`feedback_spec_archive_after_completion.md`(SYSV2 完结时触发更新)
- 全局 CLAUDE.md:「事实驱动 / 禁臆测」段(加 codebase 必扫 cheatsheet 1 行)
- 工具:GSD `/gsd-map-codebase` skill + `/gsd-map-codebase --paths <p1,p2>` 增量
- 触发踩坑案例:SYSV2 BP 切换组织 spec(2026-05-09)4 次实证反转(SYS_AuthPlant 表 / AuthPlant Aggregate / AuthPlantDomainService / OrgAuth UI)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-09 | Proposed → Accepted | 涛哥拍板;BP 切换组织 spec 4 次反转触发;方案 C 触发式 + 月度兜底 + 启动必扫;沉淀 memory + ADR + 全局 CLAUDE.md cheatsheet |
| 2026-05-16 | Accepted → Superseded by ADR-025 | 月度兜底不灵活;改「自适应触发为主 + 启动软兜底」+ 术语更名「项目地图」;详见 [ADR-025](./ADR-025-project-map-adaptive-maintenance.md) |
