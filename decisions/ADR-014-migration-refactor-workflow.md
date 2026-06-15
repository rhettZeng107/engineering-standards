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

锚点:SRMV2 specs/2026-06-12-srmshop-migration(修复 commit dea1af9 ShopNav);playbook §5 坑 11。

## 修订(2026-06-14)— 前后端归属审计 + 绞杀者中间态看板(TPM 整模块漏迁复盘)

**踩坑事实**:TPM 迁移做完 P0-P4、自评「主体完整」后,复盘才发现**计量器具检定 + 特种设备检定两个整模块后端从未迁到新平台**——实体层已建,但 AppService / Controller / DTO 全无,**前端已 React 化但 api 仍指向老 CoreTPMWebApi**(`migration-gap-review.md:43-49`;实测 `AI.REACT.PROD.TPM/src/api/index.js` 中 `tpmApi`(=老 `TPMWebApi`/CoreTPMWebApi)引用 `grep -c=10`:`SpecialEquipment/SimplePagination:111`、`EquipmentModel/List:97` 等仍指老后端)。这不是死链 404,而是**「前端迁了、后端没迁」的隐性半迁态**,P0-P4 全程未覆盖、progress 未记录,纯靠事后复盘碰运气才暴露。

**复盘定性**:这是**异构重写迁移**(老 .NET Framework MVC + cshtml → 全新 ABP + React 独立平台,**非**同构框架升级)特有的盲区。业界同构升级最佳实践(绞杀者 Strangler Fig + YARP + System.Web Adapters)针对「同进程逐路由替换 + 共享 Session」,对独立新平台 + SSO 统一鉴权场景**基本不适用**;但其「**迁移前做依赖 / 可行性全量扫描**」这条通用原则,在我们场景的等价物**缺位**——源工件清单(2026-06-12 修订已扩到含 `layouts/` 壳层)仍按**已知 Phase 模块**枚举,枚举不到「前端已存在、但后端仍指向老系统」这一整类。补两条铁律:

1. **前后端归属全量审计(迁移启动强制前置 = 依赖扫描的我们版)**:迁移立项时产**前端 api endpoint 全量归属清单**(逐 endpoint 标:指向老后端 / 新后端)。凡指老后端 = 未迁 / 半迁,强制登记进迁移看板,**不得遗漏到 Phase 执行后才发现**。挂载:§1.1 Front-load 源工件清单(与「壳层枚举」并列的第二张全量表,前端 api 寻址层多后端的工作区必产)。
2. **绞杀者中间态看板 + 后端归属 DoD**:每模块按 `前端(老/新) × 后端(老/新)` 四象限登记,目标全部到 `(新, 新)`;**`(新前端 + 老后端)` 是中间态,必登记为「未完成」,禁算迁完**。迁移完成 DoD(三层等价之上)硬加一条:**后端归属 = 新平台**,归属审计未清零不得宣告模块迁移完成。挂载:DoD ④ 入口可达性等价 增列「后端归属」判据。

**适用**:SRM / MES / WMS / EAM / TPM 全迁移改造系列;尤其前端可在新老后端间切换(api 寻址层多后端,如 TPM `hostMap` 同时存 `TPMWebApi`/`JYTPMWebApi`)的工作区,B1 类盲区高发。锚点:TPM `specs/2026-06-13-tpm-legacy-migration/migration-gap-review.md`(P5 补迁立项)+ `progress.md:206-213`;`AI.REACT.PROD.TPM/src/api/index.js:4,97,111-112`(tpmApi 残留实测)+ `src/hostMap.js:8-9`。

## 修订(2026-06-15)— 完整性审计 workflow 化(从「人工一遍过」到「多维并扫 + 收敛循环」)

**根因再定性(跨三次迁移)**:MDM→SRM→TPM 三轮迁移的高代价坑,本质是**同一类 —— 完整性盲区**:① 整模块后端漏迁(TPM 计量/特种检定,前端迁了后端仍指老系统,见 2026-06-14 段)② 壳层功能随 layout 整删(SRMShop 购物车入口,见 2026-06-12 段)③ 菜单种子整组漏种(SRM 外协单元,playbook §5 坑 8/9)。前几次修订一直在**补检查项**(归属清单 / 壳层去留表 / 三方交叉矩阵),检查项已齐;但仍复发,说明病根不在「缺内容」,在**检查方式** —— 完整性检查是「人工/单 agent 一遍过」:线性、靠记忆穷举维度、易漏一整类(漏的那一维自己不会冒出来提醒)。

**决策(即时生效)**:迁移完整性审计从「被动检查清单」升级为「**主动多维扫描机制**」,三个 Workflow 质量模式组合:

- **multi-modal sweep(多维并扫)**:N 个 agent 各扫一个维度、**互相盲**(一个维度的盲区不污染另一个)。初始 4 维对应四类历史坑:① 前后端归属(按 api 寻址层逐 endpoint 标老/新后端)② 壳层功能(layouts/全局组件逐项去留)③ 三方交叉(菜单↔页面↔后端 4 类异常)④ 源工件退化/半成品(git 核原始版本,防把退化产物当设计意图)。
- **completeness critic(完整性批判收口)**:每轮末一个 agent 专问「**还漏哪个维度 / 哪个模块停在(新前端+老后端)中间态 / 哪个声称迁完但无证据**」,挖出的遗漏维度并入下一轮补扫 —— 机器不会像人一样「忘了还有 X 没查」。
- **loop-until-dry(连续 2 轮无新发现才停)**:防「扫一遍就宣告干净」的线性遗漏,收敛到稳定。

**承载工具**:`tools/migration-audit/migration-audit.workflow.js`(跨项目通用,首版)。**只读审计,不改码、不拍板**;契约锁定 / 风险拍板仍由主会话本体做(ADR-037)。与 `tools/migration-fanout`(执行=批量落盘)互补:audit 管「查漏」,fanout 管「做」。

**触发时机(强制)**:① **迁移启动前置** —— 扫存量盲区(尤其前端 api 寻址层多后端的工作区,B1 类整模块漏迁高发)② **每模块 STEP1 验收前** —— 扫该模块四维完整性 ③ **迁移完结 DoD** —— 后端归属清零未达不得宣告迁完。挂载:playbook §3.1(源工件清单)/ §3.6(三方交叉)/ §5 坑 8-11;归属审计(2026-06-14 段那条人工清单)即由本机制承载执行。

**适用 + 复验**:SRM / MES / WMS / EAM / TPM 全迁移改造系列。决策即时生效;承载工具为首版,**下个迁移项目启动时首用并复验三指标**(主 context 省 / wall-clock / gap 检出率),达标后从「首版」转「稳定推广」。关联 [ADR-037](./ADR-037-cross-stack-contract-lock-ownership.md)(契约锁不进 workflow)+ 迁移 fanout 试点 memory `project-migration-fanout-workflow-pilot`。

---

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-09 | Proposed → Accepted | 涛哥拍板;触发场景 = AI Coding 价值最大化(Front-load + Back-automate);适用 5 个未来迁移改造项目 |
| 2026-05-24 | 修订 | §4 E2 UI 钉死「必验 ADR-008 ⑤ 入口可达性全链(菜单可见可点)+ 必打部署/集成环境(非 dev server)」。踩坑:SRM 采购端 MVC→React 缺口补全,把 dev 端 render-walk(直渲路由组件)当 E2 验收,漏菜单种子+权限码,操作用户在菜单里看不到模块 → 标准早在 ADR-008 ⑤,问题是迁移轨 E2 被降级,本次回链钉死 |
| 2026-06-12 | 修订 | 壳层功能清单缺口复盘(SRMShop 购物车入口随源顶栏整删):① 源工件清单必含 layouts/壳层+产功能去留表 ② layout 收敛类任务前置去留表(视觉收敛≠功能裁剪)③ E2E 业务闭环段间禁 goto 拼接(应用内入口必真实点击);ADR-008 ⑤ 含义扩展 |
| 2026-06-14 | 修订 | 前后端归属审计 + 绞杀者中间态看板(TPM 计量/特种检定整模块后端漏迁复盘):① 迁移启动强制产前端 api endpoint 全量归属清单(指老后端=半迁必登记)② 模块按 前端×后端 四象限看板登记,(新前端+老后端)禁算迁完,DoD ④ 加「后端归属=新平台」判据。异构重写迁移(非同构升级)专属盲区,SRM/MES/WMS/EAM/TPM 复用 |
| 2026-06-15 | 修订 | 完整性审计 workflow 化(multi-modal sweep + completeness critic + loop-until-dry):跨三次迁移根因再定性=完整性盲区,病根在检查方式(人工一遍过)非检查内容;升级为主动多维并扫+收敛循环,承载工具 `tools/migration-audit/migration-audit.workflow.js`(只读审计,与 fanout 执行互补)。SRM/MES/WMS/EAM/TPM 复用,首版待下个迁移项目复验 |
