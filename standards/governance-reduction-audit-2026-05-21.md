# 治理减法审计(2026-05-21,深度实证版)

> 依据 ADR-033 金字塔 + 准入三闸。三方并行实证(hooks / rules / memory)+ 全局 CLAUDE.md 逐段。
> **认知校准(最重要)**:**行数 ≠ context 成本**。区分两类——
> - **常驻**(每会话注入、稀释注意力):全局 CLAUDE.md 231 + 工作区 156 + rules `common`534 + `web`534 + memory 索引 93 ≈ **1548 行**
> - **非常驻**(按需/磁盘/维护债):rules 语言层 path-scoped、ADR、未接线 hook
> **减法优先级 = 先砍常驻、含金量(误导>重复>冗余)优先,不是先砍行数最大的。**

---

## 一、Hook 层(35 文件 / 27 接线)— 底层主力,但有死接线 + SRMV2 缺口

### 1a. 可清理(死代码 / 空转)
| 项 | 状态 | 处置 |
|---|---|---|
| `gsd-update-banner.js` | 真孤儿(settings 无引用) | 删 |
| `gsd-validate-commit.sh` | opt-in 未开 = no-op,且与 `core-commit-message-style-guard` 重叠 | 摘接线 |
| `gsd-session-state.sh` / `gsd-phase-boundary.sh` / `gsd-workflow-guard.js` | opt-in `community/workflow_guard` 未开 = 3 个 no-op | 不用 GSD planning 可摘 |

### 1b. ⚠ SRMV2 底层防护缺口(反向发现 —— 该「补」不该「删」)
4 个 hook **硬编码 SYSV2**,在 SRMV2 cwd 下空转,6 仓尚无等价机器防护:
| Hook | SYSV2 专属点 | SRMV2 缺的防护 |
|---|---|---|
| `sysv2-multi-repo-push-guard.js` | 仓表只 SYS/MDM | 6 仓 push 白名单 |
| `sysv2-frontend-deploy-config-guard.js` | IP/ADR-023 写死 | .env.production/web.config 错配拦截 |
| `sysv2-migration-new-page-guard.js` | 仓正则只 MDM/SYS | 迁移仓新建页守门 |
| `sysv2-memory-staleness-check.js` | 路径写死 SYSV2 | SRMV2 memory 失效检测 |
> 治理金字塔的意义就是底层机器兜底;这 4 个对 SRMV2 没铺 = 同类坑在 SRM 仍可能复发。建议泛化成 `core-*`(参考已泛化的 `core-fact-driven` / `core-git-log-limit`)。**SRMV2 进代码组装前补。**

---

## 二、全局 CLAUDE.md(231 行常驻)— 已 Hook 强制的段砍成指针

| 段 | 已强制它的 Hook | 砍程度 |
|---|---|---|
| 事实驱动 / 禁臆测 | `core-fact-driven-prelude.js`(每会话全文注入) | **强**:留 1 行指针 |
| 项目地图作前置事实 | `project-map-staleness-check` + `project-map-session-digest` | **强**:留指针 |
| SQL 操作(生产红线) | `core-prod-sql-guard` + `core-destructive-bash-guard` | **强**:留指针 |
| 鉴权 4 条(第 1/2 条) | `core-authorize-attribute-guard` + `core-policy-registration-check` | 中:留 4 条标题(3/4 无 hook) |
| 编码路由(纯前端→qwen +-y) | `qwen-default-frontend-guard` + `sysv2-qwen-yolo-flag-guard` | 中:留路由表(后端行无 hook) |
| 进度文件全局段 | `core-progress-global-section-guard` | 中:留写入骨架 |
| commit 风格/secret | `core-commit-message-style-guard` + `core-secret-scan-commit-guard` | 中:留双推节奏 |
> + 已 ADR 化未 Hook 段(四层文档/E2E 8项/三轨/批次/PM)精简留表+指针。预估 231 → ~140 行,核心 cheatsheet 表全留。

---

## 三、rules(78 文件 / 5390 行)

| 动作 | 目标 | 省行 | 类型 | 风险 |
|---|---|---|---|---|
| **A 删死语言层** | dart/rust/java/kotlin/perl/golang/swift/php/cpp(9 层 45 文件) | **3473** | 非常驻(磁盘/维护债) | 极低(6 仓实证 0 对应文件;`install.sh` 可复装) |
| **B common/agents.md** | 与 ADR-003 Teams 角色**名称冲突**(planner/tdd-guide vs team-lead/dotnet-developer/qwen) | ~50 | **常驻** | 中(**误导>冗余,含金量最高,优先**) |
| **C common 重复/错层** | code-review.md(严重度表重复 CLAUDE.md)、performance.md(模型选型错层) | ~120 | **常驻** | 中 |
| D python 层 | 168 行,仅 ops 偶用 | 168 | 非常驻 | 低 |
| E 语言层↔skill 去重 | csharp/typescript 与同名 skill 双轨,留速查删样例 | ~150 | 按需 | 中 |
> 健康引用**不动**:`csharp/security.md→credential-injection.md`、`secret-scan hook→common/security.md`(金字塔底层引用)。

---

## 四、SRMV2 memory(55 实质条目)

| 类 | 条数 | 处置 |
|---|---|---|
| a 已 ADR 化 | 13 | 删正文,MEMORY.md 留指针 |
| b 已 Hook 化 | 6 | 删(`git_log_full_history`/`local_dev_db_must_26`/`progress_global_section`/`migration_no_new_pages`/`qwen_dispatch`/`commit_and_push`) |
| c 可合并 | 28→9 集合 | E2E(8→1)/coding-routing(5→1)/fact-driven(5→1)/sql-db(3→1)/communication(3→1)/dev-lifecycle(2→1)/cross-workspace(2→1) |
| d 特化保留 | 8 | 留(六仓架构/测试环境/code_comments/react-race/wakeup-first/check-upstream/cicd-self-heal/边界案例) |
> **55 → ~17 文件(-70%)**,索引 93 → ~18 行 + 删条转一行指针。

---

## 执行批次(按含金量 × 风险排序,非行数)

| 批 | 内容 | 风险 | 价值(常驻注意力) |
|---|---|---|---|
| **B1** | common/agents.md 冲突修正 + code-review/performance 重复错层 | 中 | **最高**(误导消除 + 常驻瘦身) |
| **B2** | 全局 CLAUDE.md 已 Hook 段砍指针(事实驱动等) | 低 | 高(常驻 -90 行) |
| **B3** | memory 55→17(删 a/b + 合并 c) | 低 | 中(索引瘦身 + 维护债清) |
| **B4** | 删 9 死语言层(-3473) | 极低 | 磁盘/维护债(非常驻) |
| **B5(补强)** | 4 个 SYSV2 hook 泛化 `core-*` 覆盖 SRMV2 6 仓 | 中 | **缺口补强(防复发)** |
> 改全局 CLAUDE.md / common(跨所有项目)前给涛哥过 diff。

---

## 执行结果(2026-05-21,涛哥拍板全做 A 安全网 + B1/B2/B3/B5,B4 跳过)

**前置安全网(实证反转后补)**:`~/.claude` 原非 git + rules 无复装源 → 任何减法不可逆。先 `git init ~/.claude` + 白名单 `.gitignore`(排除会话/凭据/`.mcp.json`)+ 基线 commit `3d7501a` → private 仓 **`github.com/rhettZeng107/claude-governance`**(GitHub only,**不进 ADO**)。memory 含测试凭据 → 不入 git,走 `backups/memory-backup-20260521.tgz`(272K)。

| 批 | 结果 | commit |
|---|---|---|
| B1 | 删 `common/agents.md`(ADR-003 冲突)+ perf 删模型选型/thinking 错层 + code-review 删 agent 表 | `23f2d61` |
| B2 | 全局 CLAUDE.md **231 → 202**(事实驱动/四层/spec历史/PM/三轨/编码路由/进度 砍指针;核心 cheatsheet 表全留) | `3b8e210` |
| B3 | SRMV2 memory **55 → 17**(删 18 已 Hook/ADR 覆盖 + 合并 27→7 集合 + 留 10 特化);MEMORY.md 索引重写。memory 不入 git(tar 备份) | (本地) |
| B4 | **跳过**(实证:死语言层 path-scoped 不占 context = 假杠杆 + 无复装源不可逆) | — |
| B5 | 3 hook 泛化覆盖 SRM 6 仓:push-guard(+6 仓)/ migration-new-page(+3 前端)/ memory-staleness(路径按 cwd 动态);frontend-deploy-config 待 SRMV2 .env 约定稳定 | `8d9f93a` |

**附带**:`~/.claude/AGENTS.md`(ECC 插件文档,非 Claude 官方配置,与 CLAUDE.md/ADR-003 冲突)→ 存档 `backups/`,不再用。

**实证反转记录**:① 盘点 agent 的「rules 可 install 复装」失实(无 install.sh);② 「死语言层 3473 行最大杠杆」是假杠杆(不占 context);③ `~/.claude` 全程无版本控制(减法前必补)。
