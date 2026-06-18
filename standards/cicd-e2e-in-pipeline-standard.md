# 标准 — CI/CD E2E-in-pipeline(部署后自动验证)

> 决策依据:ADR-024(Plan E2E 分级 + CI/CD 接管,修订段确立本标准为硬基线)+ ADR-022(CICD 监控)+ ADR-027(复盘分层蒸馏)。
> 模板:`templates/pipeline-e2e/` + `templates/azure-pipelines-e2e-stage.snippet.yml`。
> 钩子:`templates/hooks/cicd-e2e-stage-guard.js`(前端 pipeline 缺 E2E_Verify stage 即警示)。
> 由来:SYSV2 MDM pipeline(已含 E2E_Verify Stage 3)+ SRMV2 部署 10.8 踩坑(抄了无 E2E 的样板 → CI 绿 + dev render OK,但 prod build 上 10 个菜单点开即崩)。

## 1. 硬基线:前端部署 pipeline 必含三段

```
Stage 1 Build  →  Stage 2 DeployTest  →  Stage 3 E2EVerify
                  (msdeploy + smoke)      (Playwright 打部署 prod URL,CRASH 阻断)
```

- **smoke(index.html 200 + `<div id=root>`)不是 E2E**,只验静态首页可达,**不验 SPA mount + 数据渲染**,不能替代 Stage 3。
- Stage 3 `continueOnError: false`,**E2E 失败 = 部署失败**。

## 2. 五条根因教训(本标准要堵的坑)

| # | 坑 | 规则 |
|---|---|---|
| 1 | **dev render OK ≠ prod render OK** | E2E 必须打**部署后的 prod 环境**(`E2E_TARGET` = 部署 URL),禁只用 dev server 验。dev 掩盖 minify/ErrorBoundary/数据态差异。 |
| 2 | **CI smoke ≠ 页面渲染** | smoke 之外必须有页面级 render 断言(boot 壳子 + render-walk 逐页)。 |
| 3 | **共享 Table dataSource 无数组守卫 → 单点崩全站** | 前端编码标准:Table/列表 dataSource 必 `Array.isArray(x)?x:[]`(见 `react-ui-guidelines.md`);E2E render-walk 兜底拦截。 |
| 4 | **POST 被 IIS 降级 / 端点 5xx** | 部署后验关键 POST verb 不被重定向降级;E2E 捕获业务 5xx。 |
| 5 | **render-walk `goto` 路由 + 注入 token 绕过菜单 ≠ 入口可达** | 验收方(涛哥)只在部署环境以**操作用户视角**验收(登录门户 → 点菜单 → 进页面)。CI E2E 必**全检 ADR-008 #5 入口可达性全链**(路由→菜单种子→权限码→登录看到→渲染)**并确保绿**:有菜单的应用必加 **critical-menu-walk**(从门户菜单树**点进**目标页断言可达),**禁只** `goto` 路由 + 注入 token(漏菜单种子 / 权限码 —— SRM 外协单元1-3 代码迁完、render-walk 22/22 绿,却因菜单种子整组漏种门户点不进,即此漏)。 |

## 3. 验证 SOP(E2E_Verify stage 内)

1. **critical-boot**(每仓必跑):部署壳子健康 — bundle 加载 / `#root` 挂载 / 无资源 5xx / 无 .js·.css 返 text/html(IIS hash 残留 MIME 错配)/ 无 ErrorBoundary。
2. **critical-render-walk**(有业务页必跑):登录 + 逐路由(**曾崩溃 + 核心业务**)断言 — 无致命 JS 错(`is not a function`/读 undefined)/ 无 ErrorBoundary / `#root` 有子节点 / body 非白屏。
3. **critical-menu-walk**(有菜单的门户子应用必跑,ADR-008 #5 入口可达性):**以操作用户视角**登录门户 → 渲染菜单树 → **逐目标菜单点进**(`click` 菜单项,非 `goto` 路由)→ 断言落到目标页且渲染健康。验**菜单种子 + 权限码 + 路由**全链,堵「代码迁完但菜单点不进」。**禁**用注入 token + `goto` 路由绕过菜单(那只验渲染层)。
4. **critical-i18n-mix**(标准 antd-console / 门户应用必跑,ADR-024 修订 2026-06-18):**zh-CN 默认模式**扫描菜单/标签/列头/按钮渲染文本,堵**部署后视觉中英混杂** — ① 原始 i18n key 泄露(`menu.org.list`)② 未渲染插值 `{{}}`/`${}` ③ zh 模式纯英文菜单/标签(白名单豁免合法缩写)。检测器 `helpers/i18n-mix.ts`(`collectMixHits` 返回 `{hits, scanned}`),力度=**稳健+英文菜单拦**;**哨兵**:`scanned` 过少(login/渲染失败)判失败防假绿(反 stub)。每仓白名单 `APP_ALLOW` 首跑后调;`COMMON_ALLOW` 已含 MDM/SRM/API/KPI/版本号等通用缩写。
5. **失败诊断**:`helpers/diag.ts` 在 CI log 直出 pageError/console/network/DOM(不用下 trace)。
6. **CRASH > 0 / 菜单不可达 / 中英混杂命中 = 阻塞**,根因到 file:line 再修;修后重跑(CI 自愈 SOP `cicd-self-heal-sop.md`)。

### 3.6 critical-i18n-mix 适用边界(2026-06-18 SYSV2 试点定)

- **适用**:标准 antd5 console / 门户应用(SYS.3 51 项·BP 404 项实测 0 命中,检测器正控 19/19 验证抓 raw-key/未翻译英文、放行中文+缩写)。
- **豁免(整仓不放本 spec)**:**定制双语设计**应用 —— 英文是刻意设计而非 bug(如审计门户卷宗风 `// OVERVIEW`/`CASE`/`DOSSIER`/`CONFIDENTIAL`,且 nav 非 antd 结构)。豁免理由落标准/spec 注释。
- **子应用延期**:需父门户注入 token 才渲染业务菜单的子应用(如 MDM 挂 BP),standalone 扫不到业务菜单 → 本 spec 留父门户走查 iframe(B 方案);standalone 仍跑 boot/shell 兜底。

## 4. 部署模式对照(E2E_TARGET / E2E_ROOT_PATH)

| 模式 | 部署 | E2E_TARGET | E2E_ROOT_PATH |
|---|---|---|---|
| external 独立站点 | 自有端口 | `http://<host>:<port>` | `/` |
| shared_iis 子应用 | 挂 BP 站点 /vdir | `http://<host>:<bp-port>/<vdir>` | `/<vdir>/` |

## 5. 落地(新前端仓)

见 `templates/pipeline-e2e/README.md` 3 步:拷骨架 → 改 spec(login + 路由)→ 接 stage snippet。
`bootstrap-workspace.sh` / `workspace-CLAUDE.md.template` 已引用本标准,新工作区自动提示 scaffold。

## 6. 自查清单(部署交付前)

- [ ] 前端 pipeline 含 Build + DeployTest + **E2EVerify** 三 stage
- [ ] E2EVerify 打**部署 prod URL**(非 dev),`continueOnError: false`
- [ ] critical-boot 通过(壳子 + MIME + #root)
- [ ] 有业务页:critical-render-walk 覆盖曾崩溃 + 核心路由,**CRASH = 0**
- [ ] **有菜单门户子应用:critical-menu-walk 从门户菜单点进每目标页,菜单全可达(#5 入口可达性,操作员视角)**
- [ ] **标准 antd-console/门户应用:critical-i18n-mix 中英混杂门禁通过(zh-CN 0 命中,scanned 哨兵过线);定制双语应用豁免须注释理由**
- [ ] Table dataSource 数组守卫(编码标准)
- [ ] 钩子 `cicd-e2e-stage-guard` 未报缺 stage
