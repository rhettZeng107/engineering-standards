# ADR-024: Plan 落盘 E2E 分级 + CI/CD 接管全量回归

- **Status**: Accepted
- **Date**: 2026-05-14
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- 2026-05-14 Session「默认工作流哲学评价」:涛哥提问 Plan 落盘后 E2E 是否可取消(CI/CD 阶段已有 E2E 接管)
- 现状实证:
  - ADR-008 8 项核对要求 ⑦ 业务操作闭环 smoke 默认 CRUD + 过滤/搜索/下拉/多选/联动**每个都验**
  - feedback `e2e_user_view_full_path_verification` 要求 i18n/UI 大改 E2E 必须像手测一样登录 + 进每个核心业务页
  - feedback `e2e_proactive_business_constraint_check` 要求落盘前必跑完整业务路径
  - SYS CI/CD Phase 1 已闭环(2026-05-13 ADO Pipeline 跑通),具备流水线 E2E 的基建
- 实战观察:Plan 落盘 E2E 与 CI/CD E2E 本质是**两道不同闸**
  - Plan E2E = 涛哥 Y 前的**功能验收冒烟**(在 push 之前)
  - CI/CD E2E = 代码已入 git 后的**回归保障**(在 push 之后)
- 若 Plan E2E 全砍 → 涛哥 Y → 双推 → CI/CD 才暴露问题 → **回滚 / 修复 / 再推**,工作流断裂
- 若 Plan E2E 维持全量 → 每次都跑完整 8 项,token / 时间成本随项目规模线性增长,标准轨耗时偏高

### 决策不做的代价

- 维持现状:Plan 落盘 E2E 工作量随 spec 数量线性涨,CI/CD E2E 价值不显化
- 全砍:涛哥盲签 + 回滚成本上升,违反 ADR-007 鉴权 4 条入库前硬阈值的承诺

---

## Decision

**一句话**:Plan 落盘 E2E **按三轨分级执行**,CI/CD E2E **接管全量回归**;ADR-008 8 项清单不变,执行阶段策略由本 ADR 细化。

### 分级矩阵

| 轨道 | Plan 落盘 E2E(涛哥 Y 前必跑) | CI/CD E2E(push 后跑) |
|---|---|---|
| **简单轨**(单文件 ≤ 3 处 / 配置 / 文档) | **跳过**(本来就跳 spec/plan) | smoke 兜底 |
| **标准轨**(跨前后端 / DB schema / 鉴权敏感 / ≥ 8 文件) | **6 项硬冒烟**(见下) | **全量回归**(ADR-008 8 项 + 跨浏览器 + 性能 + 跨页面回归) |
| **迁移轨**(ADR-014 老项目迁移) | **E2E 双层 E1+E2 保留**(spec 已 Front-load 内嵌) | 全量回归 + 等价比对 |

### 标准轨 Plan 落盘 6 项硬冒烟(必跑,任一不通 = 阻塞涛哥拍板)

1. **入口可达性单链**(ADR-008 ⑤):路由 → 菜单 → 权限码 → 登录看到 → 点进去渲染,只跑 1 条主路径(非全菜单遍历)
2. **鉴权 4 条**(ADR-007):`[Authorize]` + Policy 注册 + 权限码 + SSO token,4 条全过
3. **业务操作核心 CRUD**(ADR-008 ⑦ 局部):增 + 删 + 改 + 查 一遍,**过滤/搜索/下拉/多选/联动留 CI/CD**
4. **错误反馈完整性**(ADR-008 ⑧):至少 1 个错误路径(如必填校验)有 toast/Modal 显示,**无默默 500**
5. **上传/下载/Image 链路**(memory `upload_link_e2e_ui_layer`):若 spec 涉及附件/图片,UI 层 `naturalWidth>0` 必跑
6. **i18n 中文 value 校验**(memory `i18n_zh_value_must_be_chinese`):若涉及 i18n,zh-CN.json 校验脚本必跑

**CI/CD E2E 接管(push 后跑)**:
- ADR-008 ②③④(技术契约层 — API 调用双向 / 列表分页结构 / DTO 同步)
- ADR-008 ⑦ 全量交互(过滤/搜索/下拉/多选/联动每个验)
- 跨浏览器(Chrome 主 / Edge 兜底)
- 性能基线(列表 ≤ 1s)
- 跨页面回归(本 PR 改的页面 + 邻接 5 页 smoke)

### 决策授权挂钩(ADR-018)

| 场景 | Tier |
|---|---|
| 6 项硬冒烟全过 | **Tier 1 自主**汇报涛哥 Y |
| 6 项硬冒烟有 1 项不通 | **Tier 2 简洁拍板**(修 vs defer) |
| CI/CD E2E 失败 → 是否回滚 push | **Tier 2**(修 vs revert vs hot-fix) |
| 推翻分级矩阵 | **Tier 3** 落新 ADR |

### 不变量(本 ADR 不动)

- **ADR-008 8 项核对清单本身不变** — 仍是验收基线,只是执行阶段细化
- **ADR-007 鉴权 4 条刚性** — 入库前必过,Plan E2E 6 项硬冒烟已包含
- **ADR-014 迁移轨 Front-load E2E 双层** — 不变,Plan E2E 仍要跑 E1+E2
- **简单轨跳 spec/plan** — 不变

---

## Consequences

### 正向

- 标准轨 Plan 落盘 E2E 时间下降(全量 8 项 → 6 项硬冒烟),session token / 时间成本降低
- CI/CD E2E 价值显化(承担全量回归 + 跨浏览器 + 性能)
- 鉴权 4 条 + 业务连通核心 4 项仍在 push 前阻塞 → 不放水
- 涛哥拍板从"看完整 8 项报告"简化到"看 6 项硬冒烟报告 + CI/CD 后看流水线绿"

### 负向 / 代价

- CI/CD E2E 必须稳定 — 若 CI/CD 频繁假阳性,反而增加返工(依赖 SYS CI/CD Phase 1+ 持续运维)
- 标准轨 6 项硬冒烟漏掉的复杂交互(下拉/多选/联动)若 CI/CD 也漏 → 操作员踩坑;**缓解:每月跑 1 次 eval E5 题(SYS.3 列表搜索过滤)抽查 CI/CD 覆盖率**
- 新 ADR 落地需同步更新全局 + 项目级 CLAUDE.md + 受影响 memory(短期一次性成本)

### 影响范围

- **影响 ADR**:ADR-008(执行阶段策略细化,顶部加注引用)/ ADR-007(无修改,Plan E2E 6 项含鉴权 4 条)/ ADR-014(无修改,迁移轨保留双层)
- **影响 memory**:
  - `feedback_e2e_proactive_business_constraint_check.md`(顶部加注:Plan 落盘按 ADR-024 6 项硬冒烟,完整业务路径由 CI/CD 兜底)
  - `feedback_e2e_double_layer_risk_checklist.md`(无修改,迁移轨仍套用)
  - `feedback_code_review_contract_check.md`(顶部加注:8 项分阶段执行参见 ADR-024)
  - `feedback_code_review_workflow.md`(无修改,tasks 完成后仍触发 code-reviewer)
  - `feedback_e2e_user_view_full_path_verification.md`(顶部加注:Plan 落盘只跑主路径 1 条,跨页面全量留 CI/CD)
- **影响 CLAUDE.md**:全局 + SYSV2 项目级「三轨工作流」+「E2E 8 项核对」段加分级矩阵
- **影响 spec 模板**:`_template-app-onboarding.md` 验收段调整为「Plan 落盘 6 项硬冒烟 + CI/CD 全量」

---

## Alternatives Considered

### A. 维持现状(Plan 落盘必跑全量 8 项)

- 优点:刚性最强,CI/CD 失败影响小
- 缺点:Plan 落盘 session token / 时间随项目规模线性涨;CI/CD E2E 价值不显化
- 不选原因:SYS CI/CD Phase 1 已闭环,基建已具备,继续浪费不合理

### B. 完全取消 Plan 落盘 E2E

- 优点:Plan 落盘最快
- 缺点:涛哥 Y → 双推 → CI/CD 失败 → 回滚成本 > 节省时间;鉴权 4 条 + 业务连通核心 4 项必须在 push 前过,否则违反 ADR-007 承诺
- 不选原因:工作流断裂风险 > 收益,违反 ADR-007 入库前硬阈值

### C. 按 spec 复杂度动态决定(无固定分级)

- 优点:最灵活
- 缺点:Claude 每次都要 case-by-case 判断,易漏 / 易跑偏;违反 ADR-018 显式边界判定矩阵原则
- 不选原因:与 ADR-018"边界判定显式矩阵"哲学冲突,改成显式三轨更符合工作流哲学

---

## 修订(2026-05-24)— E2E_Verify in-pipeline 升为硬基线

**触发**:SRMV2 采购+供应商部署 10.8。抄了合同域**无 E2E stage** 的 pipeline 样板 → CI 4 仓绿 + 本机 dev render OK,但 **prod build** 上供应商 10 个菜单点开即崩(共享 Table dataSource 无数组守卫 → `dataSource.map is not a function` → ErrorBoundary)。smoke(index 200)漏网。多次重申"复用 SYSV2/MDM CI(含 E2E_Verify Stage 3)"仍走偏。

**决策**:本 ADR 政策(CI/CD 接管全量回归)的**落地形态固化为硬基线**:
- 前端部署 pipeline **必含三段**:Build → DeployTest → **E2EVerify**;smoke 不替代 E2E。
- E2E **必须打部署 prod 环境**(非 dev server);**CRASH=0** 才算过,stage `continueOnError:false`。
- **复用资产**(一次定义、跨项目自动复用):标准 `standards/cicd-e2e-in-pipeline-standard.md` + 模板 `templates/pipeline-e2e/` + `templates/azure-pipelines-e2e-stage.snippet.yml`。
- **自执行**:钩子 `templates/hooks/cicd-e2e-stage-guard.js`(前端 pipeline 缺 E2E_Verify stage 即警示,免逐项目重申)。
- **配套编码标准**:Table dataSource 必数组守卫(`react-ui-guidelines.md` §4.2)。

**四条根因教训**:① dev render OK ≠ prod render OK ② CI smoke ≠ 页面渲染 ③ 共享 Table 无数组守卫 → 单点崩全站 ④ POST 被 IIS 降级 / 端点 5xx。详标准文档。

---

## 修订(2026-05-25)— 标准轨 ③ CRUD 冒烟走真实 UI 表单 + CR 静态契约对齐前置门

**触发**:SRMV2 M03 迁移实证(详 [ADR-008](ADR-008-end-to-end-8-checks.md) 同日修订)—— E2E 双层的 E1 后端契约用 **spec 手写 payload**(与 contract-lock 对齐,**非前端真实发出**),E2-b 只验渲染+读连通**不提交表单**。结果 ①(API↔前端双向)④(DTO 字段同步)从未真跑,前端字段名错 / 漏必填**三层全绿仍漏过**。涛哥拍板 **A 双管(CR 主 + E2E 辅)**。

**决策**(对标准轨 / 迁移轨 6 项硬冒烟第 3 项的强化,不改分级矩阵):

1. **③ 核心 CRUD 冒烟必走真实前端 UI 表单提交** —— 增 / 改至少 1 遍**点击页面表单提交**(`page.fill/click` 真实操作),**禁用 `page.request.post` 合成 payload 顶替 ③**;捕获真实出参断言 `payload 字段 ⊆ DTO 属性 + 必填齐 + isSuccess/2xx`,并断言列表至少 1 个已知 DTO 字段**真实渲染到单元格**(读路径字段映射,非仅「Table 可见」)。合成 payload 仅作 ① 后端契约旁证,不算 ③ 已过。
   - 迁移轨特例:存量数据稀疏 / 表单依赖未迁移主数据(物料/供应商下拉降级文本)时,表单填不全 → ③ 退到 **CR 静态对齐为主 + E2E 提交可填字段子集**,并在 spec 记取舍。
2. **新增 CR 静态契约对齐前置门(跨前后端契约改动)** —— code-reviewer 在「跨前后端」触发时,**E2E 前**先跑静态对齐(前端 service 请求体 / 表单字段 / 响应读取 vs DTO,详 ADR-008 修订 a-d 四查),不过门不进 E2E。确定性、便宜、部署前拦截,补 E2E 动态校验抓不早的命名 / 缺字段类。

**授权挂钩**:CR 静态对齐失败 = Tier 1 本体回修(命名 / 缺字段确定性问题);③ 真实表单冒烟失败 = 现有 Tier 2(修 vs defer)不变。

---

## 修订(2026-06-01)— 标准轨前置门「契约锁文件」基准 + 本体锁契约

标准轨 6 项硬冒烟「前置门:CR 静态契约对齐」的比对基准**统一为 Claude 本体产出的契约锁文件**(动词/路由/字段名/大小写/必填)。跨前后端契约**禁下放 subagent 锁定**(context 隔离),由本体锁。详 [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md)。

---

## 修订(2026-06-18)— 部署后 E2E 增 critical-i18n-mix 中英混杂门禁

> 触发:涛哥要求统一各工作区前端「CI 部署后 E2E 标准」,消除部署后视觉中英混杂 + 打开异常。

- **新增 critical-i18n-mix**(标准 antd-console/门户应用必跑):zh-CN 默认模式扫描菜单/标签/列头/按钮渲染文本,堵中英混杂 — ① 原始 i18n key 泄露 ② 未渲染插值 ③ zh 模式纯英文菜单(白名单豁免)。力度=**稳健+英文菜单拦**(涛哥拍板)。检测器 `templates/pipeline-e2e/helpers/i18n-mix.ts`(`collectMixHits`→`{hits,scanned}`);**哨兵** scanned 过少判失败防假绿。
- **适用边界**:① 定制双语设计应用(审计卷宗风英文是设计非 bug)**整仓豁免** ② 子应用(需父门户 token)standalone 留 boot/shell,业务菜单走查留父门户 iframe(B 方案)。详标准 §3.4/§3.6。
- **试点实证**(SYSV2,2026-06-18):SYS.3 51 项·BP 404 项 zh-CN **0 命中**(现状干净);检测器正控 19/19(抓 raw-key/未翻译英文,放行中文+MDM/SRM/API/KPI 缩写);AuditPortal 豁免;MDM 延 B 方案。其它工作区(SRMV2 含 Contract.2 缺 E2E / TPMV2)按本标准铺。
- 标准载体:[`standards/cicd-e2e-in-pipeline-standard.md`](../standards/cicd-e2e-in-pipeline-standard.md) §3.4 + §3.6 + §6。

---

## Related

- **配套全局规则**:`~/.claude/CLAUDE.md`「E2E 8 项核对」+「三轨工作流」段
- **配套 SYSV2 规则**:`SYSV2/CLAUDE.md`(同步段)
- **上游 ADR**:[ADR-008](ADR-008-end-to-end-8-checks.md)(8 项核对清单本身)/ [ADR-007](ADR-007-auth-4-rigidity.md)(鉴权 4 条)/ [ADR-014](ADR-014-migration-refactor-workflow.md)(迁移轨 E2E 双层)
- **下游 memory**:`feedback_e2e_proactive_business_constraint_check.md` / `feedback_code_review_contract_check.md` / `feedback_e2e_user_view_full_path_verification.md` / `feedback_upload_link_e2e_ui_layer.md` / `feedback_i18n_zh_value_must_be_chinese.md`
- **CI/CD 基建依赖**:SYSV2 `docs/ops/cicd-*.md`(SYS CI/CD Phase 1 闭环报告)
- **相关 ADR**:[ADR-022](ADR-022-cicd-monitor-feedback.md)(CI/CD Monitor & Feedback 策略)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-14 | Proposed → Accepted | 涛哥 Y 分级减负方案 |
| 2026-05-24 | 修订 | E2E_Verify in-pipeline 升硬基线 + 标准/模板/钩子固化(SRMV2 10.8 部署踩坑) |
| 2026-05-25 | 修订 | ③ CRUD 冒烟走真实 UI 表单(禁合成 payload 顶替)+ CR 静态契约对齐前置门(SRMV2 M03 实证 ①④ 从未真跑) |
