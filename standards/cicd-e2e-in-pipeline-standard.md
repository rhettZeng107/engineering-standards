# 标准 — CI/CD E2E-in-pipeline(部署后自动验证)

> 决策依据:ADR-024(Plan E2E 分级 + CI/CD 接管,修订段确立本标准为硬基线)+ ADR-022(CICD 监控)+ ADR-027(复盘分层蒸馏)+ **ADR-045(部署后 E2E 分层定级治理,§7)**。
> 模板:`templates/pipeline-e2e/` + `templates/azure-pipelines-e2e-stage.snippet.yml`。
> 钩子:`templates/hooks/cicd-e2e-stage-guard.js`(前端 pipeline 缺 E2E_Verify stage 即警示)。
> 由来:SYSV2 MDM pipeline(已含 E2E_Verify Stage 3)+ SRMV2 部署 10.8 踩坑(抄了无 E2E 的样板 → CI 绿 + dev render OK,但 prod build 上 10 个菜单点开即崩)。

## 1. 硬基线:前端部署 pipeline 必含三段

```
Stage 1 Build  →  Stage 2 DeployTarget  →  Stage 3 E2EVerify
                  (容器或 IIS + smoke)       (Playwright 打部署 prod URL,CRASH 阻断)
```

- **smoke(index.html 200 + `<div id=root>`)不是 E2E**,只验静态首页可达,**不验 SPA mount + 数据渲染**,不能替代 Stage 3。
- Stage 3 `continueOnError: false`,**E2E 失败 = 部署失败**。

## 2. 五条根因教训(本标准要堵的坑)

| # | 坑 | 规则 |
|---|---|---|
| 1 | **dev render OK ≠ prod render OK** | E2E 必须打**部署后的 prod 环境**(`E2E_TARGET` = 部署 URL),禁只用 dev server 验。dev 掩盖 minify/ErrorBoundary/数据态差异。 |
| 2 | **CI smoke ≠ 页面渲染** | smoke 之外必须对本次改动及关联页面执行 render/交互断言。 |
| 3 | **共享 Table dataSource 无数组守卫 → 单点崩全站** | 前端编码标准:Table/列表 dataSource 必 `Array.isArray(x)?x:[]`(见 `react-ui-guidelines.md`);E2E render-walk 兜底拦截。 |
| 4 | **POST 被 IIS 降级 / 端点 5xx** | 部署后验关键 POST verb 不被重定向降级;E2E 捕获业务 5xx。 |
| 5 | **render-walk `goto` 路由 + 注入 token 绕过菜单 ≠ 入口可达** | 验收方(涛哥)只在部署环境以**操作用户视角**验收(登录门户 → 点菜单 → 进页面)。CI E2E 必**全检 ADR-008 #5 入口可达性全链**(路由→菜单种子→权限码→登录看到→渲染)**并确保绿**:有菜单的应用必加 **critical-menu-walk**(从门户菜单树**点进**目标页断言可达),**禁只** `goto` 路由 + 注入 token(漏菜单种子 / 权限码 —— SRM 外协单元1-3 代码迁完、render-walk 22/22 绿,却因菜单种子整组漏种门户点不进,即此漏)。 |
| 6 | **分层 grep 含 `\|` 经 CLI `--grep` 在 PowerShell→npx 泄漏成管道符 → reporter EPIPE 假崩** | tier L1 多模块 grep(`@floor\|@module:A\|@module:B`)经 CLI `--grep "…"` 传 npx,Windows PowerShell 把 `\|` 当 shell 管道符 → `ListReporter.onBegin` `EPIPE broken pipe`(用例没跑就崩;Deploy stage 已绿=deliverable 已上,仅验证 stage 假红易误判)。**规则:grep 必经 `$env:E2E_GREP` 注入(playwright.config.ts 读 `process.env.E2E_GREP`→`new RegExp`),禁 CLI `--grep` 带 `\|`**(SYSV2 2026-06-28 实证:#1182/1183 EPIPE 崩 → env 化后 #1186 同多模块场景绿)。 |
| 7 | **只验“点开无异常”会让业务空壳假绿** | 菜单/按钮点击后必须检查目标页、Drawer、Modal 的语义内容:标题/主键、契约关键字段、状态、关联对象、统计与明细。`undefined/null/[object Object]/NaN/Invalid Date`、有数据但关键值全空或汇总矛盾均阻断;API 200/无 JS 错/容器可见不能单独通过。批次改动页面与关键详情必须拆为独立 spec,防止早期失败遮蔽后续异常。 |

## 3. 验证 SOP(E2E_Verify stage 内)

1. **critical-boot**(每仓必跑):部署壳子健康 — bundle 加载 / `#root` 挂载 / 无资源 5xx / 无 .js·.css 返 text/html(IIS hash 残留 MIME 错配)/ 无 ErrorBoundary。
2. **critical-render-walk**(有业务页必跑):登录 + 逐路由(**曾崩溃 + 核心业务**)断言 — 无致命 JS 错(`is not a function`/读 undefined)/ 无 ErrorBoundary / `#root` 有子节点 / body 非白屏。
3. **critical-menu-walk**(有菜单的门户子应用必跑,ADR-008 #5 入口可达性):**以操作用户视角**登录门户 → 渲染菜单树 → **逐目标菜单点进**(`click` 菜单项,非 `goto` 路由)→ 断言落到目标页且渲染健康。验**菜单种子 + 权限码 + 路由**全链,堵「代码迁完但菜单点不进」。**禁**用注入 token + `goto` 路由绕过菜单(那只验渲染层)。
4. **critical-i18n-mix**(标准 antd-console / 门户应用必跑,ADR-024 修订 2026-06-18):**zh-CN 默认模式**扫描菜单/标签/列头/按钮渲染文本,堵**部署后视觉中英混杂** — ① 原始 i18n key 泄露(`menu.org.list`)② 未渲染插值 `{{}}`/`${}` ③ zh 模式纯英文菜单/标签(白名单豁免合法缩写)。检测器 `helpers/i18n-mix.ts`(`collectMixHits` 返回 `{hits, scanned}`),力度=**稳健+英文菜单拦**;**哨兵**:`scanned` 过少(login/渲染失败)判失败防假绿(反 stub)。每仓白名单 `APP_ALLOW` 首跑后调;`COMMON_ALLOW` 已含 MDM/SRM/API/KPI/版本号等通用缩写。
5. **失败诊断**:`helpers/diag.ts` 在 CI log 直出 pageError/console/network/DOM(不用下 trace)。
6. **critical-business-display**(改动模块必跑):用已知真实数据打开列表首行/指定行详情与批次内安全操作,断言标题主键、契约关键字段、状态、关联对象、列表/统计一致性;显式扫描 `undefined/null/[object Object]/NaN/Invalid Date` 与裸 key。每个改动页/关键详情独立 spec,不允许“九菜单一个长用例”中首个失败遮蔽其余场景。
7. **CRASH > 0 / 菜单不可达 / 中英混杂 / 业务显示契约命中 = 阻塞**,根因到 file:line 再修;修后重跑(CI 自愈 SOP `cicd-self-heal-sop.md`)。

### 3.6 critical-i18n-mix 适用边界(2026-06-18 SYSV2 试点定)

- **适用**:标准 antd5 console / 门户应用(SYS.3 51 项·BP 404 项实测 0 命中,检测器正控 19/19 验证抓 raw-key/未翻译英文、放行中文+缩写)。
- **豁免(整仓不放本 spec)**:**定制双语设计**应用 —— 英文是刻意设计而非 bug(如审计门户卷宗风 `// OVERVIEW`/`CASE`/`DOSSIER`/`CONFIDENTIAL`,且 nav 非 antd 结构)。豁免理由落标准/spec 注释。
- **子应用延期**:需父门户注入 token 才渲染业务菜单的子应用(如 MDM 挂 BP),standalone 扫不到业务菜单 → 本 spec 留父门户走查 iframe(B 方案);standalone 仍跑 boot/shell 兜底。

## 4. 部署模式对照(E2E_TARGET / E2E_ROOT_PATH)

| 模式 | 部署 | E2E_TARGET | E2E_ROOT_PATH |
|---|---|---|---|
| external 独立站点 | 自有端口 | `http://<host>:<port>` | `/` |
| shared_iis 子应用 | 挂 BP 站点 /vdir | `http://<host>:<bp-port>/<vdir>` | `/<vdir>/` |
| container_gateway | 容器候选 + 统一网关路径 | `https://<gateway>/<app>` | `/<app>/` |

## 5. 落地(新前端仓)

见 `templates/pipeline-e2e/README.md` 3 步:拷骨架 → 改 spec(login + 路由)→ 接 stage snippet。
`bootstrap-workspace.sh` / `workspace-CLAUDE.md.template` 已引用本标准,新工作区自动提示 scaffold。

## 6. 自查清单(部署交付前)

- [ ] 前端 pipeline 含 Build + DeployTarget + **E2EVerify** 三 stage，DeployTarget 与当前真实承载模式一致
- [ ] E2EVerify 打**部署 prod URL**(非 dev),`continueOnError: false`
- [ ] critical-boot 通过(壳子 + MIME + #root)
- [ ] 有业务页:critical-render-walk 覆盖曾崩溃 + 核心路由,**CRASH = 0**
- [ ] **有菜单门户子应用:critical-menu-walk 从门户菜单点进每目标页,菜单全可达(#5 入口可达性,操作员视角)**
- [ ] **标准 antd-console/门户应用:critical-i18n-mix 中英混杂门禁通过(zh-CN 0 命中,scanned 哨兵过线);定制双语应用豁免须注释理由**
- [ ] **改动模块:critical-business-display 已验标题/主键、关键字段、状态、关联对象、数量一致性;0 个未定义值/裸 key/数据空壳**
- [ ] Table dataSource 数组守卫(编码标准)
- [ ] 钩子 `cicd-e2e-stage-guard` 未报缺 stage
- [ ] **E2E job `timeoutInMinutes ≥ 60`**(为真实登录、保存重读及关联页留余量，不代表扩大为全菜单)

---

## 7. 按提交影响面验收(ADR-045)

> 目标:部署后 E2E 验证本次提交及必要关联项；全菜单巡检作为独立专项，不混入普通提交门禁。详 [ADR-045](../decisions/ADR-045-post-deploy-e2e-tiered-scoping-governance.md)。

| 层 | 触发 | 跑什么 |
|---|---|---|
| **L0 核心 floor** | **每次部署无条件** | 前端 boot+i18n-mix+quality+核心导航 smoke(登录+进 3-5 主菜单页);**后端 API-Health**(swagger 200 + menu/manifest 非空,TPM 范式) |
| **L1 定向** | diff 可映射到明确模块及共享消费者 | L0 + 改动模块、共享消费者及前后端契约关联页 |
| **专项全量** | 手工点名、独立计划或周期性健康巡检 | 全菜单逐页 render+视觉+截图；结果单独归档，不冒充某次提交验收 |
| **L3 自愈** | 任一层红 | `cicd-self-heal-sop` 三层分流 |

**两个保险(强制)**:① L0 永远跑；② 改动路径必须映射到直接模块和关联模块。共享层 `components/v2/layouts/router/locales/request`、构建配置和菜单路由必须在 `tier-config.json` 显式维护消费者；判不准直接使影响范围计算失败并补映射，禁止回退全菜单，也禁止只跑 floor 冒充页面验收。

**关键机制**:`@module:<name>` 页级标签→本次提交 diff 选跑；`routes.config` 按实际增删的 `manifestPath` 映射到对应模块，不因菜单文件整体变更扩大为全菜单；后端契约改→**后端 pipeline 绿后 REST queue 消费前端 pipeline + 传 affectedModules→前端定向**(机制 B，详 [ADR-046](../decisions/ADR-046-cross-repo-contract-driven-e2e-trigger.md))；**后端 floor**(API-Health)所有后端必跑。

> 后端 post-deploy 也要 floor:`dotnet test`(pre-deploy 门,SYS 范式)+ **API-Health Verify**(post-deploy,swagger 200 硬断言 + manifest 非空,TPM 范式)。MDM/SRM/MES 后端现缺,按本标准补。

## 8. 容器与 IIS 发布边界

同一应用在同一测试环境只保留一个日常业务发布载荷，先按当前运行实证选择链路：

1. `containerized`：主 CI 以目标 SHA 构建可追溯镜像/预构建上下文，只更新授权的单个容器服务，随后从统一网关执行 API health、`floor + 本次改动页面 + 直接关联项`；三段全部 `completed/succeeded` 才是终态。
2. `iis-only`：继续执行 Build → IIS Deploy → 部署地址 E2E；尚未容器化的应用不得因总体策略被提前移除。
3. 容器化应用不得再向 IIS 同步同一业务包。旧端口如承担跳转、反向代理或未迁消费者的 API 兼容，必须固化为独立基础配置，禁止日常业务 CI 覆盖；消费者完成迁移后再单独下线。
4. 从 IIS 迁往容器必须先证明容器、网关路由和部署后 E2E 可用，再退出旧发布链；声明已容器化但现场缺容器/路由时保持 `blocked`，不能制造服务中断。
5. 目标 SHA、镜像 revision、CI buildId 和运行容器必须相互一致；`running/healthy`、首页 200、旧绿 CI 或手工构建不能单独判定完成。共享宿主只允许 `--no-deps` 更新本批服务，不滚动其他工作区或平台基础容器。
