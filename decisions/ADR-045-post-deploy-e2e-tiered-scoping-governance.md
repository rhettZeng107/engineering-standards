# ADR-045: 部署后 E2E 分层定级治理 — 跨工作区 CI 发布 E2E 标准

- **Status**: Accepted
- **Date**: 2026-06-18
- **Decider**: 涛哥
- **Scope**: 跨工作区(SYSV2 / SRMV2 / TPMV2 / MESV* / WMS / EAM 等所有 brownfield 工作区的前后端 CI 发布)
- **扩展**: [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md)(E2E 分级 + CI 接管)+ [ADR-022](ADR-022-cicd-monitoring.md)(CICD 监控)

---

## Context(背景)

- **诉求**(涛哥 2026-06-18):CI 部署后 E2E 要**替代人工测试**;首发模块全量逐页体检、日常增量只测受影响面(省时间)、异常走 CI 自愈自治修。
- **张力**:纯选择性测试(只测受影响点)省时间,但**容易 under-scope 漏跨切面回归** —— 共享组件/i18n/路由「小改」blast radius 是整站(正是 ADR-024 要堵的那批坑)。
- **现状盘点**(跨工作区普查):三层所需方法**基本已有**,缺「定级编排」把它们组织起来 —— 前端 boot/quality/i18n-mix(L0 料)、SRM Buyer `m03-batch*` 模块级 spec(L1 先例)、SRM/TPM menu-walk(L2 骨架);后端仅 SYS 有单测、TPM 有 API-Health Verify,**多数后端无 post-deploy 验证**。

## Decision(决策)

**一句话**:部署后 E2E 走**三层 + 改动路径自动定级**,用「永远跑的廉价 floor + 判不准默认全量」让选择性变安全,既省日常又不漏跨切面回归;前后端全覆盖,异常接 CI 自愈。

### 一、三层模型

| 层 | 触发 | 跑什么 |
|---|---|---|
| **L0 核心 floor** | **每次部署无条件** | 前端 boot+i18n-mix+quality+核心导航 smoke(登录+进 3-5 主菜单页);后端 API-Health(swagger 200+menu/manifest 非空) |
| **L1 定向** | diff 只碰单模块 | L0 + 该 `@module` 逐页 render+视觉 + 前后端契约关联页 |
| **L2 全量逐页** | 首发 / 碰共享层 / 判不准 / 夜间 | L0 + 全菜单逐页 render+视觉+截图(替代人工) |
| **L3 自愈** | 任一层红 | `cicd-self-heal-sop` 三层分流 |

### 二、两个保险(强制,不可裁掉)

1. **L0 永远跑** —— 不管改什么每次部署都跑廉价 floor,兜高频失败模式(白屏/崩溃/5xx/MIME/中英混杂/后端没起来)。
2. **改动路径自动定级 + 判不准默认 L2** —— git diff 命中共享层(`components/v2/layouts/router/locales/request 封装/构建配置`)→ 升 L2;无法映射模块 → L2;首发 → L2。**赌不起就全量**。

### 三、关键机制

- **模块标签**:页级 spec 打 `@module:<name>`;`src/views/<module>/` 目录名=模块;diff→受影响模块→`--grep` 选跑。
- **首发检测**:`menu-manifest.json` diff 出现新菜单页 = 首发 → L2;无 manifest 仓以「无绿基线」判。
- **前后端关联(本期做,不留二期)**:后端契约改 → 契约锁(ADR-037)标 `consumers` → **触发消费前端仓 pipeline** 跑 L1;映射不全 → L2。
- **后端 floor 标准化**:TPM API-Health 范式(swagger+manifest)提为**所有后端 post-deploy 必跑**。
- **E2E job timeout ≥ 60min**(涛哥拍板;全量套件留余量,分层后 L0/L1 远低于此)。

### 四、L2「真替代人工」覆盖

每菜单页:点进 → #root 有子节点 + 非白屏 + 无 pageerror + 无业务 5xx + 列表首屏渲染 + 整页截图留档。**不验**数据值对错/跨页业务流(UAT 残留)。

## Consequences(影响)

### 正向
- 日常增量部署只跑 L0+定向,省时间;首发/共享层改动全量,不漏回归。
- 后端补 floor,部署后「后端没起来」当场拦。
- 替代人工逐页 QA(视觉+打开健康+中英混杂),异常自治修。

### 负向 / 代价
- 定级引擎 + `@module` 标签 + 共享层路径表需建+维护(未打标自动 L2 兜底)。
- 跨仓后端→前端触发需 ADO pipeline resource 编排。
- L2 全量逐页慢(故 timeout 提 60min;只在首发/共享层/夜间)。

### 影响范围
- **标准**:`standards/cicd-e2e-in-pipeline-standard.md`(加 §7 分层定级)。
- **Skill**:`workspace-bootstrap`(新工作区继承分层模型)。
- **Spec**:`SYSV2/docs/superpowers/specs/2026-06-18-post-deploy-e2e-tiered-scoping/spec.md`(实现分期 P1-P5)。
- **模板**:`templates/pipeline-e2e/`(L0/L1/L2 spec 骨架 + 定级脚本)。

## Alternatives Considered

- **A. 每次全量**:零漏报但每次慢(涛哥明确否,日常太浪费)。
- **B. 纯选择性(只测受影响)**:最省时但漏跨切面回归,替代人工有缺口 —— 不选(故加两个保险)。
- **C. 留二期做跨仓联动**:本期只同仓 —— 涛哥拍板不留二期,跨仓本期做。

## 修订

### 2026-06-18(P3 首发检测落地 — 实证反转,ADR-015)

原决策设「前端 pipeline 复用 menu-manifest diff 做首发检测」。P3 落地前实证(SYSV2 4 前端仓)发现前提不成立:
- 前端 `menu-manifest.json` 是 postbuild 产物且 **gitignored 不进 git**;committed manifest 在**后端** `wwwroot/`。前端 pipeline 无可 diff 的 manifest。
- portals(SYS.3/BP/AuditPortal)无 `routes.config.mjs`(菜单来自后端 SYS_AuthInfo);仅 MDM 前端有,且已被 `sharedLayer` 判 L2。

**修订后实施**:
1. 前端首发由**现有两保险**覆盖(菜单声明变更→L2 / 全新仓无基线→L2),不在前端做 manifest-diff。
2. tier-decide 加防御规则:`menu-manifest.json` / `routes.config` 命中 → `菜单结构变更(首发风险)→ L2`(canonical 模板,self-test 17/17;`.dev.json` 不误触)。
3. **首发逐页真正落点 = 后端 manifest publisher + 跨仓触发**:后端 `wwwroot/menu-manifest.json` committed,后端 deploy git-diff 出新 Path = 首发 → 后端 L2 + 经前后端契约关联(本 ADR Decision 第3条/spec §5)触发消费前端 L2。并入后端 floor + P4 实施,不在前端 pipeline 重复。

## References
- [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md) / [ADR-022](ADR-022-cicd-monitoring.md) / [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md)
- 标准:`standards/cicd-e2e-in-pipeline-standard.md`
- Spec:`SYSV2/docs/superpowers/specs/2026-06-18-post-deploy-e2e-tiered-scoping/spec.md`
- 自愈:`docs/ops/cicd-self-heal-sop.md`

---

## 修订(2026-06-26)— per-push 封顶 L1 + 夜间 L2 补全(D-cap,涛哥拍板 A)

### 触发 / Context

per-push 改动命中共享层(routes/components/i18n/router)→ 保险②强制 L2 全量逐页(menu-walk),实测 TPM 前端 ~10.5min + 复用 flaky menu-walk 周期性假红(P5 #1139 根因:改 `routes.js` 即触发)。同时实证:**本 ADR Decision「三层模型」(夜间触发 L2)已列「夜间」,但各工作区 `azure-pipelines.yml` 从未实现 `schedules`** —— 夜间 L2 是 ADR 欠账。

### 决策(涛哥 2026-06-26 拍板 A):per-push 封顶 L1 提速 + 夜间 cron 补全量 L2 兜跨切面回归

1. **per-push 封顶**(保险② per-push 档降级):`tier-decide` 加 `--max-tier`,per-push 传 `--max-tier L1` —— 共享层/判不准的 L2 决策 per-push 降 L1(能映射模块→L1+模块 grep;共享层 modules 空→grep 空→退 @floor);`git-diff 失败`兜底同样应用 maxTier。
2. **首发/菜单结构豁免封顶**(`forceFull`):首发(`--first-publish`)/ 菜单结构变更(menu-manifest/routes.config)是本 ADR 核心防御点(新页未验证、崩概率高)→ **per-push 仍全量 L2**,不被封顶抹平(否则新页崩要等夜间 ~24h 才被 menu-walk 抓到)。
3. **夜间全量 L2**(落地「夜间」欠账):`schedules` cron(每晚,工作区锁定分支,`always:true`=catch-up 无 push 也体检)+ 跳 Build/Deploy(复用 consumer-trigger 的 `e2eOnly` 跳部署机制 + `Build.Reason==Schedule` condition;E2EVerify 条件不变,DeployTest=Skipped∉{Failed,Canceled} 仍跑)只跑 E2E,打**已部署版本**全菜单。
4. **夜间档 `retries:1`**(per-push 仍 0):夜间无人值守,retries:1 降 flaky 假红;手动逃生口不设 retry(即时看真红)。
5. **手动逃生口**:`forceFullE2E` 参数手动触发强制全量 L2。
6. **保险① L0 floor 永跑无损**:白屏/崩溃/5xx/MIME/中英混杂每次部署当场拦,不受封顶影响。

### ⚠️ 配套必跟进(A 正当性前提,merge 后必补 — MED-1,architect CR 核心判断)

per-push 封顶后,弱化保险②的**全部兜底押在夜间 L2 接得住**。但实证当前**夜间红检测闭环未机制化**:`cicd-ado-monitor.js` 是手动/Claude 按需调用工具(非常驻 watcher),且 `cancel-old` 显式 `reasonFilter` 排除 Schedule → 夜间无 push → 无人起监控 → 夜间红无自动上报 → 兜底静默失效 = **保险②等于被删、而非下沉夜间**。
**必补其一**(待涛哥拍板):(A) ADO notification subscription(Schedule build failed → 邮件/Teams),或 (B) SOP 每日晨检 `node cicd-ado-monitor.js status <repo>` 看昨夜 Schedule run。**未补前,per-push 封顶的弱化不成立。**

### 适用范围

TPM 前端 `feature/vite` 先落地(dev/feature 分支,未上 master/生产,跨切面回归延迟到夜间可接受)。**其他工作区按需采纳**;**生产分支慎用 per-push 封顶**(弱化保险②;若用必先接夜间红检测闭环)。原 ADR Decision「两个保险」对未采纳封顶的工作区不变。

### 实证 vs 假设(ADR-015)

- **[实证]** `tier-decide --self-test` 25 过(封顶/forceFull 豁免/判不准保留模块 grep/非法 maxTier 不封顶)/ `playwright.config` + `azure-pipelines.yml` 语法 OK / architect + code-reviewer 双 CR **APPROVE 0 HIGH**(限定「4 修正点全落实、保险①无损」范围)。注:#2 首发豁免 / #4 retries:1 为 CR **后**回修(响应 code-reviewer findings / architect MED-2),以 self-test 25 过为据,未经 reviewer 单独复审。
- **[假设/风险]** 夜间 L2 兜底有效性 = 依赖上方 MED-1 配套接上;未接则弱化保险②无真兜底(architect 核心判断:「白天提速了、晚上安全网没挂钩」)。

### 文件(TPM 落点 commit `ff3c0ba` feature/vite)

- `<前端仓>/pipeline-e2e/tier-decide.mjs`(`--max-tier` 封顶 + `forceFull` 豁免 + git-diff 兜底应用 maxTier)
- `<前端仓>/azure-pipelines.yml`(`schedules` + Build/Deploy 跳 Schedule + E2E 模式分流 + `forceFullE2E`)
- `<前端仓>/pipeline-e2e/playwright.config.js`(`retries` 读 `E2E_RETRIES`)

## 修订(2026-06-28)— grep 必经 E2E_GREP env 注入(EPIPE post-mortem,SYSV2 实证)

**问题**:tier L1 多模块 grep(`@floor|@module:A|@module:B`)经 CLI `npx playwright test --grep "@floor|$grep"`,在 Windows PowerShell→npx 传参时 `|` 泄漏成 shell 管道符 → Playwright `ListReporter.onBegin` `EPIPE broken pipe`,**用例没跑就崩**。Deploy stage 已绿(deliverable 已上 10.8),仅 E2E 验证 stage 假红,易误判成代码 bug。SYSV2 SYS.3 #1182/#1183 实证(一次只改 Company+HRDept 两模块,首次触发带 `|` 的 L1 grep)。单模块/L2 全量(无 `|`)不触发,故此前未暴露。

**修复**:grep 改经 `$env:E2E_GREP` 环境变量注入 —— `playwright.config.ts` 读 `process.env.E2E_GREP` → `new RegExp` 应用 `grep` 字段;`azure-pipelines.yml` 两条 grep 路径(tiered L0/L1/L2 + consumer-trigger e2eOnly)去掉 CLI `--grep`,改 `$env:E2E_GREP=...` 前置再 `npx playwright test`。`$env:X=` 是 PowerShell 字符串赋值,`|` 安全;L2 设空串=全量。

**实证(ADR-015)**:[实证] env 化后 #1186(e2eOnly + affectedModules=Company,HRDept,定向复现多模块 L1)同场景**绿**(对比 #1182/1183 EPIPE)+ 本机 `E2E_GREP="@floor|@module:Company|@module:HRDept" npx playwright test --list` 正确解析 + code-reviewer APPROVE 0 HIGH。

**落点**:标准 §2#6 + 模板 `templates/pipeline-e2e/playwright.config.ts` / `cross-repo-tiered-e2e-cookbook.md` / `consumer-trigger-frontend.md` 已同步;SYSV2 4 前端仓(SYS.3/BP/AP/MDM)`azure-pipelines.yml` + `playwright.config.ts` 已铺。**新仓拷模板即含修复。**
