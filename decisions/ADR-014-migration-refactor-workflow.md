# ADR-014: AI Coding 工作流 — Front-load + Back-automate(迁移改造路径)

- **Status**: Accepted
- **Date**: 2026-05-09
- **Decider**: 涛哥
- **Scope**: 跨项目(老项目迁移改造系列: SYS / MDM 已做 + **SRM / MES / WMS / EAM / TPM 计划**)

> **迁移轨决策两半**:本 ADR 管「**怎么执行**」(工作流 / 自治 / 中断纪律 / 完整性审计 workflow);「**做什么算完**」(基线 + 三层等价 DoD + STEP1/2 解耦)见 [ADR-028](./ADR-028-legacy-migration-baseline-two-step.md)。**端到端操作主线(唯一总入口)= [legacy-migration-playbook §0](../standards/legacy-migration-playbook.md)。**

---

## Context(背景)

### 触发场景

涛哥 2026-05-09 战略性反馈:**AI Coding 价值 = 前期讨论加深 + 后期高自动化**。当前 SYSV2 工作流:
- spec discuss 阶段拍板足够,但 E2E 双层风险识别不够前置(执行阶段才暴露,涛哥反复打断)
- plan 阶段中断频次高(单 phase 内 5-10 task 都汇报,即使「批次任务扩大版」memory 已缩窄)
- code review 触发分散(每 task 后派,而非 plan 完结统一)

### 当前状态实证

- ADR-002:四层文档(ADR / Spec / Plan / Tasks)✓
- ADR-008:E2E 8 项核对清单 ✓ — 但**未约束 spec 阶段必嵌**
- memory `feedback_batch_contract_extended.md`:中断白名单 4 类
- memory `feedback_code_reviewer_trigger_matrix.md`:每次代码改动后触发(分散)
- 全局 CLAUDE.md「工作流路径」(本 ADR 落地后变更:2026-05-06 拍板时为「双轨」3 路 = 标准/简单/experiment;2026-05-09 ADR-014 加迁移改造路径变 4 路;2026-05-09 涛哥拍板**删 experiment 通道**,**最终 = 三轨:标准 / 简单 / 迁移改造**)

### 决策不做的代价

- 后续 5 个迁移改造项目(SRM / MES / WMS / EAM / TPM)沿用现状 → 涛哥被打断频率仍高 + AI Coding 价值无法发挥

---

## Decision(决策本身)

**一句话**:老项目迁移改造系列(SYS / MDM / SRM / MES / WMS / EAM / TPM)走**「迁移改造路径」**(三轨工作流第 3 路;2026-05-09 实时同步:experiment 通道已删除),核心 = **Spec 阶段 Front-load(Claude 自主深度风险识别)+ Plan 阶段 Back-automate(自治不中断 + 完结自动 CR + 自治修复)**。

### 1. Spec 阶段 Front-load(Claude 自主能力强化,非涛哥拍板矩阵)

#### 1.1 E2E 双层风险审查(Spec 内嵌段)

Spec 创建时 Claude 自主套用 [`feedback_e2e_double_layer_risk_checklist.md`](../../<projectMemoryDir>/) checklist 扫描:
- **E1 API 层**(7 风险点): DTO 大小写双兼容 / Policy 注册 / HTTP 动词 / 分页结构 / 错误响应 / token 信任链 / 响应类型
- **E2 UI 层**(8 风险点): Image 鉴权 3 层 / createObjectURL revoke / 下拉级联 / 工具栏三图标 / 路由 keepAlive / wujie props / 错误反馈 / 三态 UI
- **业务连通层**: ADR-008 8 项核对全套用

输出 spec 内嵌段:
```markdown
## E2E 双层风险审查(Claude 自主输出)
| 风险点 | 是否涉及 | 规避方案 |
|---|---|---|
...
```

涛哥**校验整体策略**而非逐条拍板。

#### 1.2 功能骨架等价审查(Spec 内嵌段)

迁移改造类 spec 默认套用[功能骨架等价原则](../../<projectMemoryDir>/feedback_skeleton_equivalent_migration.md):
- **前端**:源页面单 form → 新 React 也保留单 form(不分多步骤 / 多 Tab / 多 Drawer)
- **后端**:源 API 单 endpoint → 新 API 单 endpoint(同 in/out / 同业务流程)
- **不重新设计**:架构 / UX / 拆分 / 合并

输出 spec 内嵌段:
```markdown
## 功能骨架等价审查
| 模块 | 源页面/API 形态 | 新形态 | 等价 ✓ / 调整(标涛哥拍板) |
|---|---|---|---|
...
```

例外:涛哥显式要求改 UX / 鉴权安全必修 / 已下线技术栈强制迁移(craco → Vite)。

#### 1.3 Spec discuss 阶段不变

业务场景 + 全局理解 + 现状实证 + OQ 拍板等保留(ADR-004)。

### 2. Plan 自治执行 — 中断白名单缩窄到 3 类

| 中断条件 | 标准路径(原 4 类) | 迁移改造路径(新 3 类) |
|---|---|---|
| CR 直接报告 | ✅ | ❌ 撤销(plan 完结统一报) |
| HIGH 2 轮不收敛 | ✅ | ❌ 撤销(自治修复 2 轮) |
| 实证反转 | ✅ | 🟡 仅反转**出 spec 范围**才报 |
| 跨 spec 边界 | ✅ | ❌ 撤销(spec 阶段已识别 → 范围内) |
| **架构调整**(新 Aggregate / Schema 跨表 / portal 边界) | — | ✅ 必报 |
| **Spec 范围溢出**(发现漏写功能 / 边界扩大) | — | ✅ 必报 |
| **超 spec 已识别 CRITICAL 安全/数据** | — | ✅ 必报 |

Phase 间 / Phase 内 / Plan 全程**全部不汇报**(批次任务进一步扩大,只 3 类中断)。

### 3. Plan 完结 — 自动 Code Review + 自治修复

#### 3.1 自动 code review

Plan 全部 phase 完成后 Claude 自动派(无需涛哥触发):
- `code-reviewer`(通用)
- 语言专项:`csharp-reviewer` / `typescript-reviewer` / `database-reviewer` 等
- 自动判定 CRITICAL / HIGH / MEDIUM / LOW

#### 3.2 自治修复 2 轮(spec 范围内)

| 范围内(自治修复) | 出范围(必报涛哥) |
|---|---|
| spec 已覆盖的逻辑 bug | 架构调整 |
| typo / 字段对齐 / DTO 同步 | 数据库 Schema 改动 |
| 错误处理 / 异常分支补全 | 业务逻辑变化 |
| E2E 选择器调整 / 等待策略 | 鉴权模型变更 |

CRITICAL / HIGH 自治修复 2 轮内,MEDIUM / LOW 列报告等涛哥决定。

### 4. E2E 自动跑

Plan 完结后 Claude 自动跑:
- E1 API: curl / Postman / 单元测试(自动)
- E2 UI: Playwright headless(自动)—— **必验 ADR-008 ⑤ 入口可达性全链**(路由 → 菜单种子 → 权限码 → 登录看到 → 点进渲染),**不是只 render-walk 渲染路由组件**;**必打部署/集成环境(非 dev server)**,参 ADR-024 修订(dev render OK ≠ prod render OK / CI smoke ≠ 页面渲染);**菜单种子 + 权限码缺失 = E2 不通过**(回链 ADR-007 鉴权 4 条第 3 条)
- 失败先重试 2-3 次再 clarify(已有 memory `feedback_e2e_test_fail_clarify_first.md`)

### 5. 完结报告(一次性产出)

Plan 全部完成 + code review 自治修复完后,**一次性输出完整报告**:
```markdown
## ✅ <Spec 名> 完结报告
- 实施清单(各 phase 落盘文件)
- E2E 双层结果(API + UI 截图/录像)
- code review 报告(CRITICAL/HIGH 修复 + MED/LOW 待决)
- 风险闭环(spec 风险审查每条 ✓ / ✗)
- 功能骨架等价审查闭环
- 后续 backlog(出范围项 / 待决项 / 优化欠债)
```

---

## Consequences(影响)

### 正向

- **涛哥前期讨论加深**:Spec 阶段 Claude 自主深度风险识别 → 涛哥校验整体策略,不逐条拍板
- **涛哥后期释放时间**:Plan 自治执行 + 自动 CR + 自治修复 → 涛哥被打断频率降 80%+
- **AI Coding 价值发挥**:前重 + 后轻 = 智力投入 spec / 自动化执行 / 涛哥时间到产品策略
- **5 个未来项目受益**:SRM / MES / WMS / EAM / TPM 直接套用

### 负向 / 代价

- Spec 阶段长 — 涛哥前期校验时间增加(涛哥本意接受)
- 自治修复错了风险 — 中断白名单 3 类兜底 + 完结报告人工 review 兜底
- E2E 双层不能验证的功能(配置 / 内部库) — spec 标 "E2E exemption" 涛哥拍板

### 影响范围

- 影响 spec:未来迁移改造类 spec 全部套用本 ADR(BP 切换组织 spec 作首个试点)
- 影响 plan:同 spec
- 影响 memory:
  - 升级 `feedback_batch_contract_extended.md`(中断白名单 3 类适用迁移改造路径)
  - 升级 `feedback_code_reviewer_trigger_matrix.md`(plan 完结自动触发 + 自治修复 2 轮)
  - 新建 `feedback_e2e_double_layer_risk_checklist.md`(E2E checklist)
  - 新建 `feedback_skeleton_equivalent_migration.md`(功能骨架等价)
- 影响全局 CLAUDE.md「工作流路径」段:3 路 → 4 路加迁移改造路径(2026-05-09 涛哥后续删 experiment 通道,最终落定为三轨)

---

## Alternatives Considered

### A. 涛哥逐条拍板风险/阻塞/优化矩阵
- 优点:风险全部涛哥确认
- 缺点:Spec 阶段拍板负担过重 → 违背"AI Coding 价值"
- 不选原因:涛哥明确 Claude 自主识别更高效

### B. 当前现状(标准路径 4 类中断白名单)
- 优点:稳定性高
- 缺点:Plan 阶段中断频次高,5 个未来项目沿用现状 → 涛哥被打断频率仍高
- 不选原因:不发挥 AI Coding 价值

### C. Front-load + Back-automate(迁移改造路径,选)
- 优点:平衡 spec 深度 + plan 自动化;后续 5 项目复用
- 缺点:自治修复需边界明确(spec 范围内 / 出范围 必报)
- 选定原因:涛哥本意 + 5 项目长期收益

---

## Related

- 上游 ADR:[ADR-002 四层文档](./ADR-002-four-layer-doc-structure.md) / [ADR-004 PM 视角业务场景化](./ADR-004-pm-view-business-scenario.md) / [ADR-008 E2E 8 项核对](./ADR-008-end-to-end-8-checks.md) / [ADR-025 项目地图](./ADR-025-project-map-adaptive-maintenance.md)(原 ADR-013 已 Superseded by 025)
- 配套 memory:
  - `feedback_e2e_double_layer_risk_checklist.md`(E2E 双层 checklist)
  - `feedback_skeleton_equivalent_migration.md`(功能骨架等价)
  - `feedback_batch_contract_extended.md`(批次任务扩大版,迁移改造路径中断白名单 3 类)
  - `feedback_code_reviewer_trigger_matrix.md`(plan 完结自动触发 + 自治修复)
- 全局 CLAUDE.md「三轨工作流」段(2026-05-09 最终落定:标准 / 简单 / 迁移改造)
- 试点:SYSV2 BP 切换组织 spec(2026-05-09 落地)

## 修订(2026-06-12)— 壳层功能清单缺口 + E2E 段间衔接(SRMShop 购物车入口复盘)

**踩坑事实**:SRMShop 前台迁入买方门户,购物车/结算页面均迁且功能正常,但**源顶栏导航(购物车入口+数量徽标+用户区+移动端 TabBar)随「layout 收敛」整删** — 用户加购后界面无处进购物车,涛哥实测才暴露。复盘定性:**非违反既有铁律,是铁律 3 个系统性缺口**(gap 复盘 6 项遗漏全部 layout 级、0 项页面级 — 按页清单机制对页面内功能有效,盲区精确在壳层):

1. **§1.1 Front-load 清单缺口**:源工件清单(按页/控制器/组件)与 UI 功能清单(按页)的枚举范围**都覆盖不到 `layouts/` 全局壳层** → 新增铁律:源工件清单必含 layouts/全局壳,壳层单独产「**壳层功能项去留表**」(逐项:功能 → 等价迁/宿主承担/不迁+理由),涛哥拍板后进 plan。详 legacy-migration-playbook §3.1。
2. **Plan 任务定性缺口**:「layout 适配/收敛」被写成视觉任务(收敛 100vh/改路径前缀),无功能盘点硬产出 → 新增铁律:**视觉收敛 ≠ 功能裁剪** — 删源容器类任务前置壳层功能去留表,容器可删、容器内功能必须逐项有去向。
3. **§4 E2E 段间衔接缺口**:2026-05-24 修订只钉死「门户菜单→页面」段禁 goto 绕过;业务闭环用例**页面之间**仍用 goto 拼接,「应用内功能入口」(加购后→购物车)无断言 → 新增铁律:**E2E 业务闭环段间禁 goto 拼接** — 用例内页面跳转必走真实 UI 入口(按钮/导航条/链接),goto 仅允许作用例起点;ADR-008 ⑤「入口可达性」含义扩展为「菜单入口 + 应用内功能入口」。

锚点:SRMV2 specs/2026-06-12-srmshop-migration(修复 commit dea1af9 ShopNav);playbook §5 失效模式①(壳层 layout 整删)。

## 修订(2026-06-14)— 前后端归属审计 + 绞杀者中间态看板(TPM 整模块漏迁复盘)

**踩坑事实**:TPM 迁移做完 P0-P4、自评「主体完整」后,复盘才发现**计量器具检定 + 特种设备检定两个整模块后端从未迁到新平台**——实体层已建,但 AppService / Controller / DTO 全无,**前端已 React 化但 api 仍指向老 CoreTPMWebApi**(`migration-gap-review.md:43-49`;实测 `AI.REACT.PROD.TPM/src/api/index.js` 中 `tpmApi`(=老 `TPMWebApi`/CoreTPMWebApi)引用 `grep -c=10`:`SpecialEquipment/SimplePagination:111`、`EquipmentModel/List:97` 等仍指老后端)。这不是死链 404,而是**「前端迁了、后端没迁」的隐性半迁态**,P0-P4 全程未覆盖、progress 未记录,纯靠事后复盘碰运气才暴露。

**复盘定性**:这是**异构重写迁移**(老 .NET Framework MVC + cshtml → 全新 ABP + React 独立平台,**非**同构框架升级)特有的盲区。业界同构升级最佳实践(绞杀者 Strangler Fig + YARP + System.Web Adapters)针对「同进程逐路由替换 + 共享 Session」,对独立新平台 + SSO 统一鉴权场景**基本不适用**;但其「**迁移前做依赖 / 可行性全量扫描**」这条通用原则,在我们场景的等价物**缺位**——源工件清单(2026-06-12 修订已扩到含 `layouts/` 壳层)仍按**已知 Phase 模块**枚举,枚举不到「前端已存在、但后端仍指向老系统」这一整类。补两条铁律:

1. **前后端归属全量审计(迁移启动强制前置 = 依赖扫描的我们版)**:迁移立项时产**前端 api endpoint 全量归属清单**(逐 endpoint 标:指向老后端 / 新后端)。凡指老后端 = 未迁 / 半迁,强制登记进迁移看板,**不得遗漏到 Phase 执行后才发现**。挂载:§1.1 Front-load 源工件清单(与「壳层枚举」并列的第二张全量表,前端 api 寻址层多后端的工作区必产)。
2. **绞杀者中间态看板 + 后端归属 DoD**:每模块按 `前端(老/新) × 后端(老/新)` 四象限登记,目标全部到 `(新, 新)`;**`(新前端 + 老后端)` 是中间态,必登记为「未完成」,禁算迁完**。迁移完成 DoD(三层等价之上)硬加一条:**后端归属 = 新平台**,归属审计未清零不得宣告模块迁移完成。挂载:DoD ④ 入口可达性等价 增列「后端归属」判据。

**适用**:SRM / MES / WMS / EAM / TPM 全迁移改造系列;尤其前端可在新老后端间切换(api 寻址层多后端,如 TPM `hostMap` 同时存 `TPMWebApi`/`JYTPMWebApi`)的工作区,B1 类盲区高发。锚点:TPM `specs/2026-06-13-tpm-legacy-migration/migration-gap-review.md`(P5 补迁立项)+ `progress.md:206-213`;`AI.REACT.PROD.TPM/src/api/index.js:4,97,111-112`(tpmApi 残留实测)+ `src/hostMap.js:8-9`。

## 修订(2026-06-15)— 完整性审计 workflow 化(从「人工一遍过」到「多维并扫 + 收敛循环」)

**根因再定性(跨三次迁移)**:MDM→SRM→TPM 三轮迁移的高代价坑,本质是**同一类 —— 完整性盲区**:① 整模块后端漏迁(TPM 计量/特种检定,前端迁了后端仍指老系统,见 2026-06-14 段)② 壳层功能随 layout 整删(SRMShop 购物车入口,见 2026-06-12 段)③ 菜单种子整组漏种(SRM 外协单元,playbook §5 失效模式①)。前几次修订一直在**补检查项**(归属清单 / 壳层去留表 / 三方交叉矩阵),检查项已齐;但仍复发,说明病根不在「缺内容」,在**检查方式** —— 完整性检查是「人工/单 agent 一遍过」:线性、靠记忆穷举维度、易漏一整类(漏的那一维自己不会冒出来提醒)。

**决策(即时生效)**:迁移完整性审计从「被动检查清单」升级为「**主动多维扫描机制**」,三个 Workflow 质量模式组合:

- **multi-modal sweep(多维并扫)**:N 个 agent 各扫一个维度、**互相盲**(一个维度的盲区不污染另一个)。初始 4 维对应四类历史坑:① 前后端归属(按 api 寻址层逐 endpoint 标老/新后端)② 壳层功能(layouts/全局组件逐项去留)③ 三方交叉(菜单↔页面↔后端 4 类异常)④ 源工件退化/半成品(git 核原始版本,防把退化产物当设计意图)。
- **completeness critic(完整性批判收口)**:每轮末一个 agent 专问「**还漏哪个维度 / 哪个模块停在(新前端+老后端)中间态 / 哪个声称迁完但无证据**」,挖出的遗漏维度并入下一轮补扫 —— 机器不会像人一样「忘了还有 X 没查」。
- **loop-until-dry(连续 2 轮无新发现才停)**:防「扫一遍就宣告干净」的线性遗漏,收敛到稳定。

**承载工具**:`tools/migration-audit/migration-audit.workflow.js`(跨项目通用,首版)。**只读审计,不改码、不拍板**;契约锁定 / 风险拍板仍由主会话本体做(ADR-037)。与 `tools/migration-fanout`(执行=批量落盘)互补:audit 管「查漏」,fanout 管「做」。

**触发时机(强制)**:① **迁移启动前置** —— 扫存量盲区(尤其前端 api 寻址层多后端的工作区,B1 类整模块漏迁高发)② **每模块 STEP1 验收前** —— 扫该模块四维完整性 ③ **迁移完结 DoD** —— 后端归属清零未达不得宣告迁完。挂载:playbook §3.1(源工件清单)/ §3.6(三方交叉)/ §5 失效模式①(完整性盲区);归属审计(2026-06-14 段那条人工清单)即由本机制承载执行。

**适用 + 复验**:SRM / MES / WMS / EAM / TPM 全迁移改造系列。决策即时生效;承载工具为首版,**下个迁移项目启动时首用并复验三指标**(主 context 省 / wall-clock / gap 检出率),达标后从「首版」转「稳定推广」。关联 [ADR-037](./ADR-037-cross-stack-contract-lock-ownership.md)(契约锁不进 workflow)+ 迁移 fanout 试点 memory `project-migration-fanout-workflow-pilot`。

## 修订(2026-06-18)— 基准建立 adversarial verification 门(查"误判",补 migration-audit 查"漏"之外;ADR-044 G5)

**动机(对标官方 + 失败模式再分类)**:参见 [ADR-044](./ADR-044-anthropic-methodology-alignment.md)(对标 Anthropic dynamic-workflows 6 模式)。现有 migration-audit(2026-06-15 段)解**完整性盲区 = 查"漏"(哪些维度/模块没枚举)**;但三轮迁移另有一类高代价坑是**判定误判 = 查"对不对"(已识别的源,状态/性质判错)**,单视角审查必漏:
- 坑 10 退化产物当设计意图(MDM 期初导入 5 类→1 卡,涛哥两次纠正)——"现状是什么"判错。
- 坑 2 等价审查半成品盲区(`supplier/index.jsx` 半成品被"坏→坏"放过)——"源状态"判错。
这两类不是"漏了某维度"(completeness 能抓),是"看了但判错"(需多个独立 skeptic 投票 refute 才抓)。官方 **adversarial verification** 模式正对此。

**决策(重心前移、验收赴约)**:
- **主门(建基准,实证/spec 阶段,强制)**:§3.1 源工件清单产出的 ① 工件状态(完好/半成品/坏)② 退化产物判定(git 考古+老仓对照,是否设计意图)③ UI 功能清单完整性,过 **N 个独立 verifier(Workflow parallel,context 隔离,各被 prompt 去 refute)投票**,多数票通过才锁为契约基准(ADR-037)。
- **赴约门(STEP1 DoD 验收)**:按已确认 checklist 逐项核(现有 migration-audit + CR + E2E 赴约),不重复 adversarial(基准已多方确认)。
- 原则:**坑在基准埋下、验收才查太晚 → adversarial 重心在"建基准",验收是"赴约打钩"**。

**承载工具**:`tools/migration-audit/baseline-adversarial.workflow.js`(parallel N verifier + 多数票,复用 migration-audit 多维并扫基础设施)。只读判定门,不改码;契约锁定/拍板仍主会话本体(ADR-037)。**分工**:migration-audit = 查漏(completeness),baseline-adversarial = 查误判(correctness),建基准时两者都跑。

**适用 + 节奏**:SRM/MES/WMS/EAM/TPM 全迁移系列。设计 + 流程(挂载 playbook §3.1)+ 承载脚本 `tools/migration-audit/baseline-adversarial.workflow.js`(fan-out-and-vote:每判定 3 视角独立 skeptic refute + 多数票)**均已落地**;首用复验"误判检出率"。锚点:ADR-044(G5)+ playbook §3.1/§3.2 + §5 失效模式②(半成品)/③(误判)。

## 修订(2026-06-22)— 前期实证阶段机制定标 = 官方 Dynamic Workflow(动态编排优先)+ 迁移矩阵 + 工作流哲学沉淀(TPM 设备手册漏迁复盘)

**踩坑事实**:TPM 设备手册(Manual)后端三级整树 1:1 迁完,但**前端编辑页是从 HourType 模块复制的桩**(`import {...} from "@/service/hourType"`,表单字段为 `typeCode/typeName`,零三级树 UI),`progress.md:66` 把「手册三级核对」列为 remaining 后 phase 直接标 done。**这是「后端✅+前端桩」的隐性半迁态,gap 阶段用 general-purpose agent 单跑审计而非既有 workflow → 大面积失真(`gap-analysis-verified.md:3`)放过了它。** 同时 `_legacy` 6 个源仓的 `customer/*` 活动分支(customer/kd/prd@2026-02)从未核、FW/CORE 基线靠单点假设未 diff。

**根因再定性(机制存在但被绕过)**:2026-06-15 / 06-18 两次修订已把 migration-audit(查漏)+ baseline-adversarial(查误判)两个**官方 Workflow 脚本**落地,但标准把它们定位为「**可选工具/钩子**」,未禁止用 general-purpose 单 agent 替代 —— 结果实际执行时被替代,workflow 根本没跑。病根从「检查方式(人工一遍过)」再下沉一层到 **「前期实证的执行机制未定标 + 未禁劣化替代」**。

**决策(即时生效,规则2)**:迁移轨**前期实证阶段的执行机制定标 = Claude 官方 Dynamic Workflow**(harness 原生 `Workflow` 工具),四条硬规则:
1. **动态编排优先(A 方案)**:由主会话本体**据本次迁移现状 inline 动态编排**官方 Workflow(phase/agent/parallel/pipeline);预存的 `migration-audit` / `baseline-adversarial` 两脚本**降为参考实现/起点模板**(可 `scriptPath` 复用、可据现状改写增维),不是套死 args 的黑盒。理由:各项目源仓数/分支/技术栈/壳层差异大,「动态」正是官方机制的价值。
2. **禁劣化替代(红线)**:前期实证**禁用 general-purpose / 单 agent 一遍过替代官方 Workflow**;multi-modal sweep(互盲多维)+ adversarial verify 投票(refute)+ completeness critic + loop-until-dry 四 pattern 为前期实证标配。
3. **审计方向 old→new 全覆盖**:以老仓全量清单(模块/页面/字段/接口/菜单)为锚逐项在新平台找落点,**禁 new→old**(后者天然看不见「老仓有、新平台无」整类;`gap-analysis-verified` 即因 new→old 锚点而漏前端桩)。
4. **强制产物 = 迁移矩阵表**:逐页面/字段/接口为行,**后端实装 · 前端真实装(非桩)· 菜单种子 · 操作员可用** 四列覆盖 + 对抗投票结论;过投票才锁为契约基准(ADR-037)。「前端真实装(非桩)」列专设检测:service import 错配 / 表单字段数 vs DTO / 子表树是否存在 → 抓设备手册类桩。

**工作流哲学沉淀(跨项目根本原则,7 条 — 把多次迁移踩坑上升为可复用心智)**:
1. **完整性是迁移第一性问题**:迁移本质风险不是「迁错」,是「漏迁/半迁而不自知」;审计方向恒为 old→new 全覆盖。
2. **「迁完」是四层闭环非单层达标**:后端✅≠迁完;后端✅+前端桩、前端✅+后端老系统、代码✅+菜单漏种均为半迁中间态,任一层断=用户用不了。
3. **单视角必有盲区 → 多智能体动态编排对抗/投票**:人/单 agent 线性一遍过,漏的那一维自己不会提醒;机制 > 努力。
4. **坑在基准埋下、验收才查太晚 → 重心前移到建基准**:对抗/投票放在锁契约前,验收只赴约打钩。
5. **动态编排 > 固化脚本**:据现状现编排,预存脚本只作起点模板。
6. **源基线先收口再迁**:源 = master/develop 主线,customer 默认排除;多版本 diff 实证谁更全,基线不锁干净不开迁(规则1,详 ADR-028)。
7. **移植非重写、半成品不搬运**:业务规则原样移植+适配;半成品/退化产物补完或登记欠债,禁等价搬运、禁当设计意图。

**承载 + 适用**:复用现有两脚本(参考实现)+ 本体动态编排;SRM/MES/WMS/EAM/TPM 全系列。锚点:TPM `specs/2026-06-13-tpm-legacy-migration`(设备手册前端桩 `views/Manual/components/Edit/index.jsx:4`)+ playbook §1 哲学总纲/§2 分支范围/§3.0 前期实证 Dynamic Workflow + 迁移矩阵/§5 失效模式②(前端桩)。配套 ADR-028 同日修订(规则1)+ ADR-044(官方 dynamic-workflows 对标)。

## 修订(2026-07-15)— Codex 长任务分段 + 规范化迁移合同硬锁(WMS 首用)

**问题**:自由文本迁移矩阵同时承载源清单、合同决策和实现进度,无法机器证明“页面/操作/API/字段/Service/菜单/壳层/集成”逐项闭合;长任务若把“全项目 1:1 迁完”直接作为一个 Goal,也会把基线发现、产品判断和大批实现混在同一自治边界内。旧的“每个判定 3 票”还会让机械可证字段产生线性投票成本,却不能防引用串错或合同漂移。

**决策**:

1. 完整项目目标和 DoD 留在 spec/plan;Codex active Goal 每次只承载一个可验里程碑。新迁移首个 Goal 固定为 **Phase 0 基线合同锁定**,不写 STEP1 业务代码。
2. 源工件、基线决策和实现进度分离为 `source-inventory.json`、`migration-matrix.json`、`migration-progress.json`;页面/UI 操作/API/字段/Service/菜单/壳层/集成拆成 8 个规范化合同集合,以稳定 ID 关联。每个源工件声明主合同维度并须被同行合同记录引用,禁止只归组不建合同。
3. `codex-migration-audit contract` 全量机器校验批次一致、ID 唯一、源工件和合同的单一矩阵归属、专用引用、状态、证据和零 gap;`lock` 在合同/字段/投票均绿后写内容哈希锁。任何输入变化、输入集合变化或重锁异常都让旧锁失效。
4. 对抗投票改为**风险分层**:源/ref 选择、排除、合并/重命名、半成品/坏工件、非 CRUD、客户集成和模块完整性等判断性结论保留独立 skeptic 投票;机械可证标量由确定性合同门全量覆盖,不再逐字段重复三票。
5. STEP1 只更新 `migration-progress.json`;最终 `verify` 必须同时通过当前合同、当前锁、既有迁移/字段/投票门、逐矩阵行 verified 证据和本地 build/test/E2E。

**代价**:Phase 0 文件数增加,首次整理成本上升;收益是基线可重放、引用可机验、合同变化显式失锁,后续模块 Goal 可按已锁矩阵稳定分批,降低漏迁与返工。

---

## 修订(2026-07-15)— 全局迁移轨硬门收口(CR 2 HIGH + 技术 MED)

**问题**:2026-07-15 首版规范化合同已能校验引用和内容哈希,但完整性 sweep/critic/loop-until-dry 仍只有流程文字,锁链可在未实际扫全时变绿；`spec.md` 未进锁导致范围、运行时、工具链或源决策变化不失锁；风险票把空票一律判红却遗漏了仅以 `CRITICAL/HIGH` severity 标记的风险行；Service 关系虽写可达 DB,源工件类型没有 Repository/表/视图/存储过程；逐任务字段 coverage 也未纳入哈希。

**决策**:

1. 新增 `completeness-sweep.json` 与 `codex-migration-audit completeness` 硬门。固定检查六维枚举、前后端归属、壳层、菜单页面后端三方、源退化、current-new-only,项目配置只能追加不能缩减；critic 发现的漏维、中间态模块、无证完成声称必须转成同轮 gap ID,绑定矩阵行、解决并给证据,不得在后续轮静默清空；最后连续两轮必须 dry。
2. `lock` 固定运行 `contract + completeness + fields + vote`。哈希输入增加 `spec.md`、完整性产物和 `field-diffs.json` 每项声明的 coverage 文件；输入内容或集合变化都让旧锁失效。
3. 风险票采用两层触发：判断性 classification/riskFlags **或** severity=`CRITICAL/HIGH` 均强制绑定票；只有全批次零风险时允许 `votes.json` 为空。
4. Service 关系正式支持 `repository`、`database-table`、`database-view`、`stored-procedure` 源工件类型，并统一映射到 `serviceLinks` 维度。
5. 版本化/分发封装不属于本轮硬门：由涛哥明确豁免，当前继续以用户级 `$HOME/.agents/skills/legacy-migration` 作为运行时入口，不影响上述机制完成判定。

**结果**:“扫全、规格未漂移、字段差异已消解、风险结论已复核”从提醒文字变成可重放的失败条件；未满足任一项时不得生成或保留 baseline lock。

## 修订(2026-08-06)— 迁移轨禁止 MVP/演示切片冒充等价完成

**问题**:迁移任务即使已有 source inventory 和 parity 机制，若实施阶段把少量页面、字段、样例数据或 happy path 当作“先做一个 MVP”，仍会形成前端可见但字段、操作、异常、菜单、数据规则或集成追溯缺失的半迁状态，并污染完成判定。

**决策**:

1. baseline lock 必须覆盖源系统逐页/操作/字段/API/菜单/数据规则的全量并集，并纳入目标端已有非冲突增强；不得由 agent 擅自把子集迁移标记为等价或完成。涛哥明确批准的原型/阶段范围仍须保留完整已知目标和剩余项。
2. 允许按模块和里程碑分批实施。单批任务可复用 spec 验收表，多批任务才建独立 coverage ledger；每个合同项须有稳定 ID、批次、验收、证据和 `covered/pending/blocked/approved-defer` 状态。外部依赖缺失默认 `blocked`，仅涛哥明确批准后转 `approved-defer`。本批承诺项全覆盖后可标 `batch-complete`；执行中模块标 `in-progress`，批次关闭但仍有剩余项标 `partial`，零剩余项才标 `complete`。涛哥重定基线后，`approved-defer` 项须带决策/证据迁入父级或 backlog ledger，禁止静默删除。
3. 外部契约未取得时，不依赖该契约的目标端内部能力须完整；依赖外部报文的字段、状态、映射和写请求禁止猜测。已有或合同约定的用户入口须实现禁用态、待接入/错误反馈和禁止假成功边界；无 UI 的任务须返回稳定能力状态/错误码并留审计证据。
4. 本规则只防业务范围裁剪，不改变“移植非重写、Extend 优先、禁无关扩建、最小必要代码改动”。

## 修订(2026-08-19)— GPT-5.6 成本优化：机器优先 + 单 Critic + 选择性两票

**问题**:确定性合同门成熟后，固定六 Agent 全量重复阅读、连续两轮相同 dry critic，以及“仅 severity=HIGH 即投票”产生大量相关性重复调用；更多同模型、同材料投票并不能替代字段/菜单/路由等机器枚举证据。

**决策**:

1. 六个 canonical completeness 维度继续强制覆盖，但默认由确定性枚举、规范化合同和一份结构化 sweep 记录证明，不再要求每维固定派一个 LLM Agent。只有独立、可并行且机器证据不足的维度才派 bounded subagent。
2. `completeness` 改为至少 1 个独立 critic，最终一轮必须 dry。首次即 dry 可收口；critic 找到 gap、源清单/合同变化或 Tier 3 高风险时，解决后再跑定向 critic。取消无变化材料上的固定连续两轮 dry。
3. 确定性失败直接阻断，不投票。投票触发改为“**需要非确定性判断且影响高**”；仅 severity=`CRITICAL/HIGH`、但结论可被机器证明的普通 `migrate-equivalent` 行不再强制投票。`conflict-old-wins`、`exclude-proven-dead`、源/ref 选择、语义冲突、客户集成和明确 riskFlag 仍属选择性高风险票。
4. 高风险 claim 最少两个不同证据 lens，采用 fail-safe 一致制：任一有效反证即 `disputed`；第三票不作为默认多数裁决，证据冲突返回涛哥拍板。
5. 迁移批次最终代码仍做 1 次主 CR，并保留 E1+E2。基线对抗验证与实现 CR 检查对象不同，不能互相替代。
6. 模型与上下文按成本路由：确定性检查用脚本；第一 critic/第一 skeptic 可用 Terra bounded context；Sol High 留给主合同锁、高影响争议第二票和最终 CR；禁止默认 full-history fan-out。

本修订覆盖本 ADR 2026-07-15 硬门收口中“最后连续两轮 dry”和“severity 单独触发投票”的旧口径，其余规范化合同、哈希锁、字段门和完整范围铁律保持不变。

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-09 | Proposed → Accepted | 涛哥拍板;触发场景 = AI Coding 价值最大化(Front-load + Back-automate);适用 5 个未来迁移改造项目 |
| 2026-05-24 | 修订 | §4 E2 UI 钉死「必验 ADR-008 ⑤ 入口可达性全链(菜单可见可点)+ 必打部署/集成环境(非 dev server)」。踩坑:SRM 采购端 MVC→React 缺口补全,把 dev 端 render-walk(直渲路由组件)当 E2 验收,漏菜单种子+权限码,操作用户在菜单里看不到模块 → 标准早在 ADR-008 ⑤,问题是迁移轨 E2 被降级,本次回链钉死 |
| 2026-06-12 | 修订 | 壳层功能清单缺口复盘(SRMShop 购物车入口随源顶栏整删):① 源工件清单必含 layouts/壳层+产功能去留表 ② layout 收敛类任务前置去留表(视觉收敛≠功能裁剪)③ E2E 业务闭环段间禁 goto 拼接(应用内入口必真实点击);ADR-008 ⑤ 含义扩展 |
| 2026-06-14 | 修订 | 前后端归属审计 + 绞杀者中间态看板(TPM 计量/特种检定整模块后端漏迁复盘):① 迁移启动强制产前端 api endpoint 全量归属清单(指老后端=半迁必登记)② 模块按 前端×后端 四象限看板登记,(新前端+老后端)禁算迁完,DoD ④ 加「后端归属=新平台」判据。异构重写迁移(非同构升级)专属盲区,SRM/MES/WMS/EAM/TPM 复用 |
| 2026-06-15 | 修订 | 完整性审计 workflow 化(multi-modal sweep + completeness critic + loop-until-dry):跨三次迁移根因再定性=完整性盲区,病根在检查方式(人工一遍过)非检查内容;升级为主动多维并扫+收敛循环,承载工具 `tools/migration-audit/migration-audit.workflow.js`(只读审计,与 fanout 执行互补)。SRM/MES/WMS/EAM/TPM 复用,首版待下个迁移项目复验 |
| 2026-06-18 | 修订 | 基准建立 adversarial verification 门(ADR-044 G5):区分 migration-audit 查"漏"(completeness)vs adversarial 查"误判"(correctness);主门前移到建基准(源状态/退化判定/清单完整性 N verifier 投票 refute,多数票锁契约基准),验收变赴约打钩;承载 `baseline-adversarial.workflow.js`(已实现:fan-out-and-vote 3 视角 refute+多数票)。防坑 2 半成品盲区/坑 10 退化误判 |
| 2026-06-22 | 修订(规则2 + 哲学) | 前期实证机制定标=官方 Dynamic Workflow(TPM 设备手册前端桩漏迁复盘):① 动态编排优先(本体据现状 inline 编排,预存 2 脚本降为参考模板)② 禁 general-purpose 单跑替代官方 Workflow ③ 审计方向 old→new 全覆盖 ④ 强制产物=迁移矩阵(逐页/字段/接口 × 后端·前端真实装非桩·菜单·可用 4 列 + 对抗投票);并沉淀「迁移轨工作流哲学」7 条总纲(跨项目)。根因:workflow 机制已落地但被劣化替代→失真放过「后端✅前端桩」半迁态。配套 ADR-028 规则1 + playbook §1/§3.0/§5 失效模式② |
| 2026-06-22 | 修订(标准瘦身 / dogfood) | 自评过度设计(10 天 5 修订,规则涨坑同期发;06-22 桩在前 4 次规则全就位后仍发)→ **减法**:① 12 类坑库收敛为 **3 失效模式**(完整性盲区/半迁中间态/误判+入口断链)② 高频坑下沉**机器门** `tools/migration-audit/migration-gate.sh`(Gate1 前端桩 / Gate2 后端归属 / Gate3 路由孤儿;CI/收尾必跑,非 0 即红)③ 文档单一真理源=活迁移矩阵取代散落复盘 md。**实跑 TPM 精准抓设备手册桩(0 误报)+ 老后端残留 2 处**。原则:「能跑的门 > 记 12 条坑」,治本在执行穿透而非加规则。锚点:playbook §3.0/§5 + SKILL |
| 2026-06-22 | 修订(失效模式④ — CRUD 形状盲区) | TPMV2 6 仓审计漏 `Home` 个人中心 dashboard(单源 Controller 枚举 + boilerplate 黑名单)+ 误绿 `LubricationStatistics` 统计页(CRUD 4 列判据套不上非 CRUD 页),靠涛哥提醒才补回。根因:扇出/对抗投票全在**枚举下游**,枚举本身单源+黑名单+无完整性校验=裸奔最弱环。**减法修**:① **枚举范围铁律** = Controllers ∪ 所有 Views ∪ Scripts ∪ 菜单种子 ∪ 路由 多源并集 + **零黑名单**(Home/Account 未证伪算真功能)② `migration-gate.sh` 加 **Gate0 枚举完整性 critic**(传 legacy_roots,机器暴露非 CRUD 漏页)③ 迁移矩阵加**「页类」维**,非 CRUD 页换判据(聚合端点+可视化渲染+入口);workflow 加第 5 维(enumeration)。原则:**完整性=机器可验事实源,禁人手臆测过滤**。锚点:playbook §3.1 枚举铁律/§3.0 Gate0/§5 失效模式④ + SKILL + TPMV2 specs/2026-06-22-tpm-manual-migration |
| 2026-07-15 | 修订(Codex/WMS 首用) | 全项目 DoD 留 spec/plan,Goal 按可验里程碑分段;首个 Goal 只锁 Phase 0。自由文本矩阵升级为源清单 + 基线矩阵 + 8 类规范化合同 + 独立进度;新增 contract/lock/check-lock/progress 硬门。对抗投票从机械字段逐项三票改为确定性全量校验 + 高判断风险多票。 |
| 2026-07-15 | 修订(CR 硬门收口) | 完整性六维扫描与连续两轮 dry critic 升级为 `completeness` 硬门；锁输入增加 spec、完整性产物和逐任务字段 coverage；severity 高风险纳入投票；补 Repository/DB 工件类型。版本化按本轮明确授权豁免。 |
| 2026-08-06 | 修订 | 迁移轨新增禁止 agent 擅自用 MVP/演示切片冒充等价完成硬门；coverage ledger 区分合同项/批次/模块状态；缺失外部契约的依赖项禁止猜测。 |
| 2026-08-19 | 修订 | GPT-5.6 成本优化：canonical 六维覆盖保留但不固定六 Agent；至少一个最终 dry critic；仅非确定性且高影响判断两票；任一反证即 disputed；确定性 gate、最终批次 CR、E1/E2 保留。 |
