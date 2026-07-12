# 老项目迁移改造手册(Legacy Migration Playbook)

> 决策依据:[ADR-028](../decisions/ADR-028-legacy-migration-baseline-two-step.md)(迁移基线与两步走)+ [ADR-014](../decisions/ADR-014-migration-refactor-workflow.md)(迁移轨工作流)。
> 适用:所有老项目迁移改造(SYS / MDM 已做 + SRM / MES / WMS / EAM / TPM 计划)。
> 配套:[frontend-ui-standard.md](frontend-ui-standard.md)(前端统一 4 标准)、[subapp-onboarding-guide.md](subapp-onboarding-guide.md)。

---

## 0. 标准迁移轨工作流(总入口 — 单一真理源导航)

> 本节是迁移轨**唯一总入口**:任何老项目迁移改造从这里开始,按主线走;每阶段挂的决策(ADR)/ 操作章节 / 工具 / 门禁见下表。
> **决策两半(互补不冲突)**:[ADR-014](../decisions/ADR-014-migration-refactor-workflow.md) 管「**怎么执行**」(Front-load 风险审查 + Back-automate 自治 + 中断纪律 + 完整性审计 workflow);[ADR-028](../decisions/ADR-028-legacy-migration-baseline-two-step.md) 管「**做什么算完**」(基线 + 四层等价 DoD + STEP1/2 解耦)。各阶段以下表「决策依据」列为准。
> **工具两件**:[`tools/migration-fanout`](../tools/migration-fanout/)(执行 = 批量同构页落盘)/ [`tools/migration-audit`](../tools/migration-audit/)(查漏 = 完整性多维并扫)。
> **特化**:BP 微前端子应用接入另套 [subapp-migration-checklist](../templates/subapp-migration-checklist.md) + [subapp-onboarding-guide](subapp-onboarding-guide.md)。

### 端到端主线(立项 → 完结)

| 阶段 | 做什么 | 决策依据 | 操作 | 工具 | 过关门禁(DoD) |
|---|---|---|---|---|---|
| **0 立项·基线声明** | spec 声明四项基线(后端运行时 / 前端工具链 / 工程标准 / 源仓分支范围) | ADR-028 §1 | §2 | — | 基线四项已声明 |
| **1 源工件盘点** | 产 old 源工件清单(逐页/逐接口标 完好/半成品/坏)+ 老视图逐行提 UI 功能清单(本体锁定作契约锁基准)+ **壳层 layouts 功能去留表**；另产 `current-new-only` 清单，登记没有 old 对应行的 new 页面/字段/自动化/工程增强 | ADR-028 §3 · ADR-037 | §3.1 | — | old 清单全标状态;UI 功能清单 + 壳层去留表 + current-new-only 清单齐 |
| **2 前期实证·完整性审计** | **官方 Dynamic Workflow 动态编排**(禁 general-purpose 单跑):主完整性方向保持 old→new 全覆盖，并增加只用于增强保留的 current-new-only delta sweep；adversarial 投票 + critic + loop-until-dry；**产迁移矩阵表**(允许 `old=N/A` 的 new-only 行) | ADR-014(修订 2026-06-22) | **§3.0** / §3.6 | **Dynamic Workflow**(migration-audit + baseline-adversarial 作模板) | 迁移矩阵过对抗投票锁基准;CRITICAL/HIGH gap 全登记 |
| **3 Front-load 风险审查** | E2E 双层风险审查 + 功能骨架等价审查(spec 内嵌) | ADR-014 §1 | — | — | 涛哥校验整体策略(非逐条) |
| **4 STEP1 分模块迁移** | 按契约锁 + 范式 1:1 等价移植落盘(批量同构页并行) | ADR-028 §2/§6 · ADR-037 | §3.2 | **migration-fanout** | Back-automate 自治(中断白名单 3 类,ADR-014 §2) |
| **5 四层等价 DoD 门** | ①工具链 ②UI工程标准 ③功能骨架(对 UI 功能清单逐项打钩)④入口可达 — 四层逐项核 | ADR-028 §2 | §3.2 | — | 四层全过 |
| **6 STEP1 模块验收** | 三方交叉(菜单↔页面↔后端 4 类异常清零)+ 4 道质量闸 + 完整性审计复扫(后端归属清零) | ADR-028 §3.6 · ADR-014 §3-4 | §3.4-3.6 | migration-audit | 零异常 + 后端归属 = 新平台 → 解锁 STEP2 |
| **7 完结报告** | 一次性完结报告(实施 / E2E双层 / CR / 风险闭环 / 骨架等价闭环 / backlog) | ADR-014 §5 | — | — | — |
| **8 STEP2 功能演进** | 先出现有页清点表 → 默认增强、禁造新 | ADR-028 §4-5 | §4 | — | 该模块 STEP1 已解锁 |

> **坑库 vs 主线**:每阶段易踩的坑见 §5(3 失效模式,防再犯)+ §3.2 blockquote 硬铁律 —— 那是「**为什么这么定**」的实证锚;本 §0 主线是「**按什么顺序做**」的导航。两者配合读。

---

## 1. 核心原则

> **总纲**:STEP 1 的硬验收 = 原业务在新基线上可正常使用。先保证原业务可用,才谈 STEP 2 功能扩展 —— 否则迁移只是把异常/缺陷债务搬到新地基继续累积。

### 迁移轨工作流哲学(跨项目根本原则 — 为什么这么做,ADR-014 修订 2026-06-22)

> 把 MDM→SRM→TPM→HC 多次迁移踩坑上升为可复用心智。**机制层细节随项目变,这 8 条不变**;每条都有血的锚点。

1. **完整性是迁移第一性问题** —— 本质风险不是「迁错」,是「漏迁/半迁而不自知」;故审计方向恒为 **old→new 全覆盖**(老仓全量清单逐项在新平台找落点),**禁 new→old**(逐文件确认来源天然看不见「老仓有、新平台无」整类)。
2. **「迁完」是四层闭环,非单层达标** —— 后端✅≠迁完;后端✅+前端桩 / 前端✅+后端老系统 / 代码✅+菜单漏种 均为半迁中间态,任一层断 = 用户用不了 = 没迁完。
3. **单视角必有盲区 → 多智能体动态编排对抗/投票** —— 人/单 agent 线性一遍过,漏的那一维自己不会提醒;前期实证用官方 Dynamic Workflow(多维互盲并扫 + refute 投票 + 完整性 critic + loop-until-dry)。**机制 > 努力**。
4. **坑在基准埋下、验收才查太晚 → 重心前移到建基准** —— 对抗/投票放在锁契约前,验收只赴约打钩。
5. **动态编排 > 固化脚本** —— 据本次现状 inline 编排 Workflow,预存脚本只作起点模板,不套死 args 黑盒。
6. **源基线先收口再迁** —— Fork 保留全分支并展示活动度,不得自行默认排除 customer 分支;多版本仓 diff 实证谁更全,最终源范围由项目决策者拍板;基线不锁干净不开迁(§2 + ADR-028)。
7. **移植非重写、半成品不搬运** —— 业务规则原样移植+适配;半成品/退化产物补完或登记欠债,禁等价搬运、禁当设计意图。
8. **old 能力取并集、new 非冲突增强不删** —— 目标能力集 = `old 已实证有效能力 ∪ new 已有非冲突增强 − 已实证无业务价值的死行为/错误分支`。发生冲突时仅以 old 业务语义覆盖冲突局部,不得借 parity 整页、整模块回退;new 已有且不改变 old 业务语义的页面、字段、交互、校验、自动化与工程增强必须保留。含 Bug 但仍有业务入口/消费者的工件必须迁移有效语义并修复缺陷,不能整项剔除。

| 原则 | 含义 |
|---|---|
| 两步走解耦 | STEP 1 基线迁移 → STEP 2 功能演进;STEP 1 未完成的模块禁止 STEP 2 |
| 四层等价 | 迁移完成 = 工具链 + UI 工程标准 + 功能骨架 + 入口可达 四层都等价 |
| 迁移=移植非重写 | 业务逻辑移植到新基线 + 适配,业务规则原样保留;禁从零重写 |
| 半成品不搬运 | 源工件是半成品/坏的 → 补完或登记欠债,禁止等价搬运 |
| 默认增强、禁造新 | 迁移轨在现有页/组件上增强;新建 page/组件 = 卡点须说明理由 |
| **old 能力取并集、new 非冲突增强不删** | 目标能力集 = `old 已实证有效能力 ∪ new 已有非冲突增强 − 已实证无业务价值的死行为/错误分支`。冲突时 old 业务语义优先,但只覆盖冲突局部;new 已有且不改变 old 业务语义的交互/校验/批量/预览/拖拽上传/自动化等增强强制保留,禁整页或整模块回退。含 Bug 的活动业务走“净化后迁移”,不得整项 skip。 |
| 模块级解锁 | STEP 1 按模块切片验收,某模块达标即解锁该模块 STEP 2 |

---

## 2. 基线(Baseline)定义

基线由迁移项目**启动时在 spec 声明**,不写死技术栈。声明四项:

| 层 | 声明内容 | SYSV2 系列实例 |
|---|---|---|
| 后端运行时 | 目标 .NET / JVM / Node 等 | .NET Core 8(三层 / 单层 WebApi 按既有架构) |
| 前端工具链 | 目标构建工具(Vite / Rspack / Next.js / Webpack…) | Vite + pnpm |
| 前端工程标准 | 项目前端工程标准 | antd 5 + pro-components + 前端统一 4 标准(ADR-023):ListPage 四段式 / AutoHeightProTable / 工具栏三图标 / 字段大小写双兼容 / react-i18next |
| **源仓分支范围**(规则1,2026-06-22 涛哥定) | **Fork 全分支避污染**;默认看 master/develop + 最新活跃分支;**基线分支涛哥拍板** | develop>master 取功能更全者 |
| **前端 UI 标准**(2026-06-22 涛哥定) | 迁移默认套 **UI V2(Atlas)标准**同步更新,不复刻老 UI | `frontend-ui-v2-standard.md`(SectionCard 三范式,ADR-032) |

> 其他项目(如 HC)按自身技术栈声明基线,本手册方法不挑栈。

> **源仓分支范围铁律(规则1,ADR-028 修订 2026-06-22,TPM 设备手册漏迁复盘)**:**Fork 迁移源远程仓(保留全部分支),禁本地多 clone 副本污染工作区**(踩坑:TPM `_legacy` 拉 6 个本地副本污染)。默认审查 `master` 与 `develop`(并存按项目声明谁优先,默认取功能更全者),**但最新活跃分支必看** —— `git for-each-ref --sort=-committerdate refs/remotes` 列**全分支活动度**(不论是否 `customer/*`),最新活跃分支重点标。**最终迁移源基线分支永远由涛哥拍板**:Claude 只**实证摆出分支事实**(全分支活跃度 + 最新活跃分支),**禁自行默认排除/纳入**(客户分支进入拍板视野不无脑排除;fork 全分支 = 看得全 ≠ 都迁)。**多版本仓(FW vs Core 等并存)选基线必 diff 实证谁功能更全,禁靠单点假设**(踩坑:TPM 凭「FW 更全」假设选 FW,实测 net8 的 CORE 版活更久 / `_legacy` customer/kd/prd@2026-02 未进拍板视野)。

---

## 3. STEP 1 — 基线迁移

### 3.0 前期实证阶段:官方 Dynamic Workflow + 迁移矩阵(规则2,ADR-014 修订 2026-06-22)

> 源工件盘点 / 完整性审计 / 基准对抗(§3.1 / §3.6 + 两 workflow)的**执行机制定标 = Claude 官方 Dynamic Workflow**(harness 原生 `Workflow` 工具)。**禁** general-purpose / 单 agent 一遍过替代(TPM 设备手册漏迁即此劣化替代所致:workflow 已落地却没跑,改用 general-purpose → 失真放过「后端✅前端桩」)。

**四条硬规则**:
1. **动态编排优先**:主会话本体**据本次迁移现状 inline 编排**官方 Workflow(`phase/agent/parallel/pipeline`),内含官方四 pattern —— **multi-modal sweep**(N agent 各扫一维互盲:模块/页面/字段/接口/菜单)+ **adversarial verify 投票**(每「已迁」判定派 N 独立 skeptic refute,多数票才确认)+ **completeness critic**(每轮收口「还漏哪维/哪模块停中间态/哪声称迁完无证据」)+ **loop-until-dry**(连续 2 轮无新发现才停)。预存的 `tools/migration-audit/{migration-audit,baseline-adversarial}.workflow.js` 降为**参考实现/起点模板**(可 `scriptPath` 复用、可据现状改写增维),不是套死 args 黑盒。
2. **审计方向以 old→new 全覆盖为主,辅以 current-new-only 保留扫描**:以**老仓全量清单为锚**逐项在新平台找落点,禁止用 new→old 替代主完整性审计；同时独立枚举当前 new 的页面/字段/自动化/工程能力,对没有 old 对应项的 delta 建 `old=N/A` 行,防止 new-only 增强在迁移中被误删。
3. **强制产物 = 迁移矩阵表**:逐**页面/字段/接口**为行,除四层覆盖与投票外,必须同时记录 new 现有能力、冲突分类与最终目标;过对抗投票才锁为契约基准(ADR-037):

| old 源工件(页/字段/接口) | new 现有能力 | 分类 | 最终目标 | 后端实装 | **前端真实装(非桩)** | 菜单种子 | 操作员可用 | 对抗投票 |
|---|---|---|---|---|---|---|---|---|
| `老仓/.../ManualEdit` 三级树 | 新仓已有批量预览 | `merge-union`（可合并-取并集） | 三级树 + 批量预览 | ✅ ManualAppService | 🔴 桩(import hourType/字段≠DTO/无子表树) | ✅ routes | 🔴 不可用 | 3:0 确认漏 |

**机器枚举固定为五类**（中文仅作展示标签,不得另造枚举值）:

- `conflict-old-wins`（冲突-old覆盖）:new 与 old 的业务规则、状态机、财务口径或字段语义冲突;old 优先,只替换冲突局部。
- `merge-union`（可合并-取并集）:old 与 new 能力可同时成立;去重后合并,任一侧有效能力不得丢失。
- `keep-new-enhancement`（new增强保留）:new 独有且不改变 old 业务语义;强制保留,允许 `old=N/A`,不得以 parity 为由删除。
- `fix-source-defect`（源缺陷净化后迁移）:工件仍有菜单/路由/配置/调用方或业务价值,但含 Bug、半成品或异常分支;迁移有效语义并修复,或登记欠债且 STEP1 不得判绿。
- `exclude-proven-dead`（源死行为剔除）:仅限已实证无业务价值的死端点/不可达分支/错误行为;剔除的是死行为,不是整个含 Bug 的有效业务工件。

`exclude-proven-dead` 证据门:至少完成仓内调用、路由、菜单与配置的反向检索；运行日志/访问日志可得时必须补查；错误行为或异常路径须有可复现测试或运行证据。任何 skip 都必须经过 adversarial vote,单次 `rg` 0 命中或单纯 build 结果不足以证明可剔除。

4. **「前端真实装(非桩)」专项检测**(治设备手册类桩):① service import 是否错配自身模块 ② 表单字段数 vs 后端 DTO ③ 子表/树形结构是否存在。任一异常 = 桩 = 未迁。

**触发**:迁移启动前置(扫存量盲区,产矩阵)/ 每模块 STEP1 验收前(复扫该模块四列)/ 完结 DoD(矩阵全绿才宣告迁完)。**机制必须是官方 Workflow,矩阵未过对抗投票不得锁基准。**

> **机器门补充(减法,ADR-014 修订 2026-06-22)**:可机器判的高频坑下沉为一个能跑的门 `tools/migration-audit/migration-gate.sh` —— **Gate0 枚举完整性**(老仓 `Controllers`+`Views`+`Scripts` 三源 vs 新前端,零黑名单:暴露 `Home`/统计/看板等非 CRUD 漏页,失效模式④;传 `legacy_roots_csv` 第4参启用,传 `coverage_file` 第5参升硬 gate)+ Gate1 前端桩(Edit import 的 service 不含自身/聚合模块=疑似复制桩;**前缀放行为弱判据,真实装仍以迁移矩阵「前端真实装」列+本体字段数核对为准**,MED)+ Gate2 后端归属(前端 api 寻址含老后端 marker)+ Gate3 路由孤儿(弱信号)。**CI / 迁移收尾必跑,退出码非 0 即红**。本次对 TPM 实跑精准抓出设备手册桩 `views/Manual/components/Edit`(0 误报)+ 老后端残留 2 处;Gate0 抓出 `Home`/`LubricationStatistics` 等非 CRUD 漏页。**「一个能跑的门 > 人工记一长串坑」**;坑库见 §5(4 失效模式)。

> **机器门补充·字段级(ADR-014 修订 2026-06-23,TPM 设备父子漏迁复盘)**:补现有字段维盲区——现行字段级铁律覆盖链是「老UI→新前端→新DTO」(UI 功能清单 + 桩检测 + curl 大小写),**缺「老仓后端实体/DTO 字段集 × 新仓 DTO 字段集」机械并集 diff**。设备父子掉此缝:老 `EquipmentDto.cs:270` 有 `ParentEqptNo`、新 DTO 无、前端无控件、后端孤儿列(实体有列但 DTO/Service/前端零引用)→ 三现有链都够不着,19-agent workflow 漏放。门 `tools/migration-audit/field-diff.sh`(栈中立铁律 + 实现优选 LSP):枚举双侧类型字段(**默认 LSP symbol 级最准,ADR-035;grep 兜底**)→ 归一(strip `Bas_/Fk_` 前缀 + 大小写)→ `老有−新无` = 漏候选 → 过 `.field-coverage` 登记消解(`renamed→X / merged→Y / intentional / backlog#N`),未登记=硬红退出码。**取舍:宁多报(改名靠登记)不漏报真缺**(完整性工具偏假阳优于假阴);首跑成熟迁移有一批候选要登记,之后持久化。**回归实证**:对 TPM Equipment 跑(老 DTO × 审计当时态 HEAD 新 DTO),精准抓出 `ParentEqptNo/ParentEqptName`(0 漏 + 核心字段 `EqptNo/EqptName` 不误报);补迁后复跑确认父子消失。**边界(防超额承诺)**:本门抓字段级标量 + 父类型上集合属性名漏迁;**整子类型/子表是否随父迁移**由 Gate0 类型枚举 + 迁移矩阵「子表/树」判据兜,不由本门独揽。**核心实体清单机器锚(禁靠人正向挑,否则枚举裸奔重蹈失效模式④)**= 老仓 `*Dto.cs`/`*Entity.cs` 全集 − 显式登记排除(`.field-entities` 标 `skip→边缘表`,未登记的实体默认必跑),随源工件清单(§3.1)由本体锁定;OLD 侧入参 = 老仓**实体 ∪ DTO** 并集(防实体有列/DTO 无 那层自身漏)。CI / 迁移收尾必跑。

> **代码分析默认 LSP(锚 ADR-035)**:迁移现状实证 / 影响面 / 契约比对(symbol 级)默认走 **LSP**(C#→lsp-nav bridge / 前端 JS→typescript-lsp),grep 仅作 `migration-gate.sh` 机器门粗筛与旁证。**LSP 解决「查得准」,不解决「查得全 / 查对方向」** —— 须配 old→new 方向 + 四层覆盖 + 前端切 typescript-lsp(教训:gap 那轮用了 lsp-nav 仍漏设备手册桩,因 new→old 方向 + 只查 C# 后端层、没切前端 LSP)。

### 3.1 启动第一步:产「源工件清单」

> **枚举范围铁律(多源并集 + 零黑名单,2026-06-22 TPMV2 复盘,失效模式④)**:源工件清单的枚举**不得单源(只看 Controller)、不得 boilerplate 黑名单预过滤**(`Home`/`Account`/`Default` 可能是 dashboard / 个人中心真功能,曾致 TPM 整页漏迁)。**枚举范围 = `Controllers` ∪ 所有 `Views/*` ∪ `Scripts/*` ∪ 菜单种子(SYS_AuthInfo)∪ 路由(routes)的多源并集,零黑名单**;任一来源出现的页都上册,改名/合并的另作「合并入 X」标注消解(不准默删)。机器把关:`migration-gate.sh` **Gate0** —— **机器枚举 = `Controllers` + 所有 `Views` + `Scripts` 三源**(零黑名单;Controllers 源专抓 MVC-only dashboard 如 `Home`),**菜单种子 + 路由 2 源因难机器化由 `migration-audit.workflow.js` `enumeration` 维兜**(合计 5 源,文档↔实装勿漂移)。**传 `coverage_file`(第 5 参)升硬 gate**:无同名新页者须 `.migration-coverage` 登记 `renamed→X / merged→Y / backlog#N / boilerplate`,**未登记=退出码硬红**(治改名误报=登记留痕、不弃强制力=真漏即红)。**完整性是机器可验事实源,不靠人手臆测过滤**。并对每页标「**页类**」(crud / dashboard / report / statistics / topology / map / workbench);非 CRUD 页在 §3.0 迁移矩阵换判据(聚合端点 + 可视化渲染 + 入口,非 CRUD 4 列)。

逐页 / 逐接口列对应表,**每项必须标状态**:

| 源工件 | 类型 | 基线工件 | 状态 | 处置 |
|---|---|---|---|---|
| `老项目/src/xxx/index.jsx` | 列表页 | `新基线/src/xxx/index.jsx` | 完好 | 等价迁移 |
| `老项目/src/yyy/edit.jsx` | 表单页 | `新基线/src/yyy/edit.jsx` | **半成品** | 补完到基线 |
| `老项目/.../ZzzController.cs` | 接口 | 同 | 坏 | 登记欠债 |

- **状态判定**:`完好` = 源工件功能完整可用;`半成品` = 未完成的开发态;`坏` = 有缺陷/报错。
- **半成品识别**是迁移轨等价审查的硬补丁 —— 等价审查只比「迁移前后一致」,抓不到「源工件本就半成品」。清单这一步专门兜它。

> **基准 adversarial 投票门铁律(2026-06-18,ADR-014 修订 + ADR-044 G5)**:源工件清单 + UI 功能清单 + 退化判定产出后**不由单视角直接锁定** —— 过 adversarial verification 投票门(`tools/migration-audit/baseline-adversarial.workflow.js`,N 个独立 verifier 各被 prompt 去 refute,投票判:① 工件状态对不对 ② 是不是退化产物当设计意图 ③ 清单有无遗漏),多数票通过才锁为契约基准(ADR-037)。**与 migration-audit 分工**:audit 查「漏」(哪些没枚举),adversarial 查「误判」(枚举了但判错)。原则:**坑在基准埋下、验收才查太晚 → 投票前移到建基准;STEP1 验收只按已确认 checklist 赴约打钩**。防坑 2(半成品盲区)/坑 10(退化产物误判)。

### 3.2 四层等价 DoD —— 逐项核对

迁移一个模块,四层全过才算「迁移完成」:

- [ ] **① 工具链等价**:迁到项目声明的目标构建栈 / 运行时完成(SYSV2 系列 = CRA→Vite / 旧 .NET→.NET 8),`build` 0 error。
- [ ] **② UI 工程标准等价**:套用项目声明的前端工程标准(SYSV2 系列 = 前端统一 4 标准 ADR-023;列表页 ListPage 四段式;新前端不引私有库 `@jy/jy-antd-components`)。**迁移过程前端 UI 默认套用 UI V2(Atlas)标准同步更新**(`frontend-ui-v2-standard.md`,SectionCard 业务页三范式,源 ADR-032)—— 迁移**不复刻老 UI 形态**,边迁边升级到 V2(2026-06-22 涛哥定)。
- [ ] **③ 功能骨架等价**:源页面的功能 / 字段 / 交互在新页面 1:1 可用;活动能力中的半成品/Bug(`fix-source-defect`)已补完。仅登记欠债不能勾绿；只有经产品拍板从当前迁移单元边界移出的边缘项可记 `approved defer`,且该项不得仍计入本模块“已完成”。**以等价回归测试(老↔新行为比对)为强制证据**,不靠「应该能用」的假设;已上线系统并行运行 + 等价验证后切换。
- [ ] **④ 入口可达性等价**:迁移单元的菜单**实种进门户菜单库 + 权限码挂到测试角色**,从门户菜单**点得进**页面(不止路由可达)。锚点 ADR-008 E2E #5 入口可达性全链(路由→菜单种子→权限码→登录看到→渲染)。

> **菜单种子实证铁律(入口可达性)**:迁移单元「代码完结 + E2E render-walk(直接 `goto` 路由 + 注入 token)绿」**不等于菜单可见** —— render-walk 绕过了菜单。每单元 DoD 必**查菜单库实证**(SRMV2 = `SYS_AuthInfo` WHERE `PortalScope='bp' AND AppName='<子应用>'`)确认本单元 authCode 全在 + 权限码挂角色 + 真从门户菜单点进。锚点见 §5 坑 8/9(SRM 外协单元1-3 代码迁完、render-walk 22/22 绿,却因菜单种子整组漏种,门户点不进)。

> **壳层(layout/全局组件)枚举铁律(2026-06-12 涛哥定,SRMShop 复盘)**:源工件清单的枚举范围 = pages + controllers + components + **`layouts/` 与全局壳层**(顶栏/侧栏/底部 TabBar/Footer/路由守卫/全局浮层/徽标)。壳层**不是「页」也常不被归入「组件」,按页组织的 UI 功能清单天然覆盖不到** —— 必须单独产「**壳层功能项去留表**」:逐项列功能(导航项/购物车入口+徽标/用户区/退出/搜索…)→ 处置(等价迁 / 由宿主门户承担 / 不迁+理由),涛哥拍板后才进 plan。任何「layout 收敛/适配/删源容器进宿主」类 plan 任务,**前置产出此表 —— 视觉收敛 ≠ 功能裁剪**:容器可以删,容器里的功能必须逐项有去向。锚点 §5 坑 11。
> **UI 功能清单铁律(老视图 → 新页面全程基准,2026-06-11 涛哥定)**:迁移源是 cshtml(MVC Razor)等老视图时,必须先**逐行提取成 UI 功能清单** —— 每列 / 每按钮 / 每弹窗 / 每必填(含校验规则)/ 每交互(联动、默认值、显隐条件)逐项列出当 checklist。清单**贯穿迁移全程,不只验收兜底**:① **提取**:随源工件清单(§3.1)在迁移启动时由 **Claude 本体提取并锁定,作为契约锁基准**(ADR-037),**禁下放 subagent 自行提取**(context 隔离传话失真),落 `<spec-dir>/contract/` 或 `.planning/artifacts/contract/`;② **实现**:派单 prompt 必附清单,subagent **按清单逐项 1:1 等价落盘**(边迁边对,不是迁完再核 —— 避免返工),完成时自报逐项勾选;③ **验收**:CR 静态比对 + E2E 断言均以此清单为基准,**对清单逐项打钩**,任一项未勾即 ③ 功能骨架等价不通过;不靠「看了一遍差不多」放行。
> **字段契约实测铁律**:列 `dataIndex` / 字段名与后端是否匹配,**必须 curl 实测接口真实 JSON 响应为准**,严禁靠读 EF 实体 / 后端代码推断序列化大小写。MDM 迁移踩坑实证:审计靠「读实体」推断后端 PascalCase,实际全局 camelCase,据此把本来正确的页面 `dataIndex` 改坏。
> **E2E 冒烟必查 `-` 占位**:列表页 `dataIndex` 与后端字段不匹配时 ProTable 渲染 `-` 占位。冒烟「页面渲染通过 + 无 JS 报错」不足以验收 —— **必须断言关键列(编码/名称类)首数据行单元格非 `-`、非空**(列有真实数据);数据为空的页降级标注「数据为空未验列值」,不算通过。

### 3.3 半成品 / 坏工件处置

| 处置 | 条件 |
|---|---|
| 补完到基线 | 该工件是模块核心功能,STEP 2 会用 |
| `blocking debt` | 活动业务能力尚有半成品/Bug；登记到 backlog 仅用于追踪,③ 不勾绿、STEP1 不解锁 |
| `approved defer` | 仅边缘项经产品拍板移出当前迁移单元边界；登记到 backlog,且不得把该项计入本模块“已完成” |
| 经涛哥拍板新建替换 | 源工件无法承载基线、且补完代价过高(例外,需实证 + 拍板) |

### 3.4 验收:模块级切片解锁

- STEP 1 **不要求全系统一刀切**。某模块四层等价 DoD 全过 → 该模块解锁 STEP 2。
- 验收产物:模块边界内源工件清单全部完好(`fix-source-defect` 已修)+ 四层等价 DoD 勾选 + E2E 通过；`blocking debt` 存在即不解锁,`approved defer` 必须有拍板与移出边界记录。

### 3.5 验收质量闸(ADR-030 GSD 融合)

验收套 4 道质量闸,迁移轨必走,通用工作流亦可参照:

- **目标导向验收(A4)**:验收回到 spec「验收标准」**逐条核**交付物是否达成目标,不止「task 勾完 / build 绿 / CI 绿」。列表页类一律实跑核「列有真实数据」。锚点:MDM casing —— task 全勾、CI 全绿,列却是空的。
- **验证欠债追踪(B1)**:验收状态分 `完成` / `partial`(会话结束但仍有未验项)/ `blocked`(带 `blocked_by` 外部依赖);`partial` / `blocked` / 待人工项**登记** `docs/superpowers/backlog/verification-debt.md`,不靠完结报告口头提一句。
- **跨阶段回归闸(B2)**:多批次 plan,阶段 N 落盘后**跑「之前阶段」的 E2E**,防回归累积。锚点:MDM 批次 1/2/3 把前序正确页改坏。
- **静默砍需求检测(B3)**:plan 显式逐条覆盖 spec 需求;review 核需求覆盖率;发现漏项找回再规划。
- **入口可达性 E2E 闸(C1,操作员视角)**:**涛哥只在部署环境(SRM = 10.8)以操作用户视角验收 —— 登录门户 → 点菜单 → 进页面**。故 CI E2E 必**全检 ADR-008 #5 入口可达性全链**(路由→菜单种子→权限码→登录看到→渲染)**并确保绿**:E2E 必模拟操作员**从门户菜单点进**目标页,**禁**用 `goto` 路由 + 注入 token 绕过菜单(那只验渲染,漏菜单种子/权限码)。每迁移单元交付前,此闸绿 = 入口真可达。锚点见 §5 坑 8。

### 3.6 迁移基准三方交叉验证(B/S 硬门 —— 全局规划/升级前置)

> 涛哥 2026-05-25 定基准原则:「B/S 应用,菜单↔页面↔后端交叉验证是最基本盘,否则用户怎么操作、怎么确认业务逻辑?基准不拉平根本没法全局规划与升级改造。**迁移基准一定要确保无异常**。」

**硬门**:某域/模块迁移基准在进入 STEP 2 演进或全局规划前,必须做**三方交叉验证矩阵**并**零异常**:

| 三方 | 真理源 | 必须对齐 |
|---|---|---|
| **菜单**(用户入口) | 门户菜单库(SRMV2 = `SYS_AuthInfo` bp)| 每业务页有菜单可点进 |
| **页面**(前端) | 前端路由 + 组件(App.jsx / routes.config)| 每菜单有页;每页有菜单(无孤儿) |
| **后端**(业务逻辑) | Controller + Service 实装(非空壳) | 每页有实装后端,EF vs schema 对齐 |

**4 类异常必须全清零**:① 有页面无菜单(用户看不到入口) ② 有菜单无页面(点了白屏/404) ③ 有页面/菜单无后端或后端空壳(加载无数据/500) ④ 后端孤儿(已迁后端未接入)。

**纪律**:迁移基准复盘产「三方交叉异常清单」→ 逐项拉平 → 零异常才认定基准达成 → 才允许在此基准上做升级改造/全局规划。**禁**在异常未清零的基准上叠加新功能(否则异常累积、用户无法操作、业务逻辑无法确认)。锚点见 §5 坑 8(外协单元菜单种子整组漏种即此类基准异常)。

> **完整性审计 workflow 化(ADR-014 修订 2026-06-15)**:本节三方交叉 + §3.1 源工件/壳层枚举 + §5 坑 8-11 的完整性检查,统一由 `tools/migration-audit/migration-audit.workflow.js` 主动多维并扫(multi-modal sweep + completeness critic + loop-until-dry)承载执行 —— 解「人工一遍过易漏一整维」。迁移启动前置 / 每模块 STEP1 验收前 / 完结 DoD 强制跑;只读审计,gap 清单交本体决策。

---

## 4. STEP 2 — 功能演进

- 前置:该模块 STEP 1 已解锁。
- 默认在现有页面增强(Extend);spec discuss 第一步先出「现有页清点表」,标明本 task 落在哪个现有页增强。
- 新建 page / 组件 = 卡点,plan / commit 写明「为何不能在现有页增强」。

---

## 5. 历史坑 → 4 失效模式(防再犯)

> 历次迁移高代价坑归 **4 个根本失效模式 + 流程/特化两类**;可机器判的已下沉 `migration-gate.sh`(§3.0)。**本节是「为什么」的实证档案(只读锚点),执行看 §3.0 迁移矩阵 + 机器门**;每条保留原始踩坑锚,不再平铺编号(防「12 条表格 / 3 模式 / 3 Gate」三处并存)。

### 失效模式 ①:完整性盲区(漏迁整类)
> 门:migration-audit workflow 多维并扫 + **`field-diff.sh` 字段级并集 diff(后端实体/DTO 漏字段)** + §3.6 三方交叉 + §3.1 壳层去留表。
- **后端字段/整子表漏迁**(TPM 设备父子):老 `EquipmentDto` 有 `ParentEqptNo` 自引用 + 子设备子表,新仓后端孤儿列(实体有列、DTO/Service/前端全无)、前端无控件;「老UI→新前端→新DTO」检测链够不着,矩阵「字段」维误信前端错 label(`父项设备(positionId 树选)`)判为「位置树解耦·非漏迁」→ **门 `field-diff.sh` 老仓DTO×新DTO 并集 diff 自动抓**(老有新无必出,不靠 agent 想到);根因:字段维只锚新前端、未做后端实体/DTO 机械并集 + 误信单源前端 label(违 old→new 多源)。
- **壳层功能随 layout 整删**(SRMShop 购物车入口):plan 把 layout 写成视觉任务,源顶栏导航(购物车入口+徽标+用户区+TabBar)随容器删;源工件/UI 清单都覆盖不到 `layouts/`,E2E 用 goto 拼接漏「加购后进购物车」→ 壳层单独产功能去留表(**视觉收敛≠功能裁剪**)+ 业务闭环段间禁 goto 拼接(ADR-008 ⑤)。
- **菜单种子整组漏种**(SRM 外协单元1-3):代码完结 + render-walk goto 绿,但 `SYS_AuthInfo` 整组缺致门户点不进;且双机制认错生效方(实际靠 SQL 种 `AppName='SRM'`,manifest 的 `SRMBuyer` 走 ScanMenus 从没跑通)→ 查菜单库实证 authCode + 权限码挂角色 + 模拟操作员从门户点进;manifest AppName 必与门户注册一致。

### 失效模式 ②:半迁中间态(看似迁完实则半截)
> 门:`migration-gate.sh` Gate1(前端桩)/Gate2(后端归属)+ §3.1 源工件状态标注 + 四层等价 DoD。
- **后端✅前端桩**(TPM 设备手册):后端三级树迁完,前端 Edit 是 HourType 复制桩(`views/Manual/components/Edit/index.jsx:4` import hourType / 字段 `typeCode/typeName` / 无三级树);根因 new→old 锚点 + general-purpose 单跑替代官方 workflow → **gate Gate1 自动抓**(service import 错配 / 字段数 vs DTO / 子表树缺失);审计方向恒 old→new。
- **前端✅后端老系统**(TPM 计量/特种检定):前端 React 化但 api 寻址仍指老 CoreTPMWebApi → **gate Gate2 自动抓**;模块按 前端×后端 四象限,(新前端+老后端)禁算迁完。
- **工具链冒充完整迁移**(MDM CRA→Vite):只换工具链,UI 标准+功能骨架没动 → 四层等价缺一不算迁完。
- **半成品搬运**(`supplier/index.jsx` 被「坏→坏」放过):源工件清单标状态 + baseline-adversarial 投票防半成品盲区。

### 失效模式 ③:误判(看了但判错)
> 门:baseline-adversarial N 视角投票 refute + curl 实测接口。
- **退化产物当设计意图**(MDM 期初导入 5 类→退化 1 卡,涛哥两次纠正):评估现状前必 `git log --all` + `git show <first-commit>` 核原始版本 / 核内网老仓;trust-but-verify「都整合了 / 现在只是 / 已替换」。
- **字段大小写误判 + `-` 占位**:读 EF 实体推断 PascalCase 实为全局 camelCase,把对的 `dataIndex` 改坏;列表 `-` 占位漏检 → curl 实测真实 JSON 大小写 + 冒烟断言关键列首行非 `-`。

### 失效模式 ④:CRUD 形状盲区(枚举/判据只覆盖 CRUD,非 CRUD 整类系统性漏)
> 门:`migration-gate.sh` **Gate0**(多源枚举完整性,零黑名单)+ 迁移矩阵加「**页类**」维(非 CRUD 换判据)。根因:链条「枚举 → 扇出查 → 对抗复核」中,扇出/复核都在枚举下游,**枚举本身裸奔**则强度=裸奔那环。
- **枚举单源 + boilerplate 黑名单**(TPM `Home`/个人中心 dashboard 漏迁):清单从 `*Controller.cs` 单源生成、且 `grep -viE "^Home|^Account"` 当样板剔除 → 675 行设备 dashboard 整页**从不上册**,扇出/对抗复核只覆盖在册项、**无法暴露被预先排除者**(漏迁不自知)。**修(铁律见 §3.1):枚举范围 = Controllers ∪ 所有 Views ∪ Scripts ∪ 菜单种子 ∪ 路由 的多源并集 + 零黑名单**(`Home`/`Account` 未证伪前算真功能)。
- **判据只有 CRUD 4 列**(`LubricationStatistics` 润滑统计 / `FaultReason` 关系拓扑图 / `Equipment` 地图位置 / `Task` 个人工作台 被误绿或退化):4 列(后端 AppService / 前端 Edit / 菜单 / 可用)**套不上无 Edit、无 CRUD 的页** → 看板/统计/报表/拓扑/地图/工作台 要么没上册、要么塞进某 CRUD 兄弟簇挥手放行。**修:迁移矩阵加「页类」维**(`crud` / `dashboard` / `report` / `statistics` / `topology` / `map` / `workbench`),**非 CRUD 页换判据 = 数据聚合端点 + 图表/可视化渲染 + 入口可达**(而非 CRUD 4 列)。
- 教训:**完整性必须机器 gate 化(可验证事实源),禁人手臆测过滤**;每环对抗验证、唯独枚举裸奔 = 没意义。锚:TPMV2 2026-06-22,`Home` 个人中心 + `LubricationStatistics` 靠涛哥提醒才补回。

### 流程纪律 + 特化(方法层,非失效模式)
- **迁移未完成就做功能 → 逼出违规造新**(供应商 v1 自造简版 Modal):STEP1/2 解耦,默认增强禁造新。
- **grep 历史不够宽**:加「同模块已实现工作页作对齐标杆」(ADR-016)。
- **子应用迁 BP**:逐条对照参考实现(MDM)G 方案 postMessage 路由同步契约 + 全 service `baseURL`;E2E 真实 BP iframe + production-like **逐菜单**跑(套 `subapp-onboarding-guide.md` + ADR-012),禁 dev proxy 假通过。

---

## 6. 速查清单

迁移一个模块,按序走:

0. [ ] **前期实证**:官方 Dynamic Workflow 动态编排(multi-modal sweep + adversarial 投票 + critic + loop-until-dry,**禁 general-purpose 单跑**),主方向 old→new 全覆盖,另做 `current-new-only` 保留扫描；**产迁移矩阵表**(允许 `old=N/A` 的 new-only 行,含后端·前端真实装非桩·菜单·可用覆盖列),过对抗投票锁基准(§3.0,规则2)
0b. [ ] **确定性机器门必跑**(退出码非0即红,补 workflow 漏跑风险):`migration-gate.sh`(Gate0 枚举完整性 / Gate1 前端桩 / Gate2 后端归属)+ `field-diff.sh`(核心实体 老DTO×新DTO **字段并集 diff**,抓后端字段漏迁如设备父子;`.field-coverage` 登记消解)。CI / 迁移收尾必跑(§3.0 机器门补充)
1. [ ] 产 old 源工件清单(完好/半成品/坏)+ `current-new-only` 清单；每行用 canonical enum 分类:`conflict-old-wins / merge-union / keep-new-enhancement / fix-source-defect / exclude-proven-dead`
2. [ ] 老视图(cshtml 等)源工件**逐行提取 UI 功能清单**(每列/每按钮/每弹窗/每必填)作契约锁基准,贯穿提取→派单实现 1:1 对照→验收打钩全程(Claude 本体锁定,§3.2 铁律)
3. [ ] 半成品/Bug 的活动能力走 `fix-source-defect` 并在 STEP1 前补完；仅登记为 `blocking debt` 不放行。只有产品拍板移出边界才可 `approved defer`。死行为走 `exclude-proven-dead` 前必须完成 calls/routes/menus/config 反查、可得日志、异常复现与 adversarial vote
4. [ ] 四层等价 DoD 逐项核对(③ 功能骨架等价 = 对 UI 功能清单逐项打钩;④ 入口可达走真实菜单/权限链)
4. [ ] E2E 验证功能骨架等价(列表页必查无 `-` 占位 = 关键列有真实数据;字段大小写以 curl 实测接口为准)
5. [ ] 模块级 STEP 1 验收(套 §3.5 验收质量闸:目标导向 / 验证欠债 / 跨阶段回归 / 需求覆盖)→ 解锁 STEP 2
6. [ ] STEP 2 功能演进:先出现有页清点表,默认增强、禁造新
7. [ ] 若迁移的是 **BP 微前端子应用**:套 `subapp-onboarding-guide.md` 子应用侧 G 方案自检(postMessage 路由同步桥 + 全 service `baseURL` + 嵌入隐藏 chrome + manifest/IP allowlist + production iframe 逐菜单验收),禁 dev proxy 假通过
