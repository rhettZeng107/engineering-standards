# 子应用发布业务门户(BP)+ CI/CD 流水线标准(编排总纲)

> **状态**:Stable v1.0(2026-06-18,TPM 首落地后沉淀)
> **适用范围**:任何要发布到业务门户(BP)并接入内网 CI/CD 的子应用 — MDM/SRM ✅ 已落地 · TPM ✅ 首个 ABP+Furion + 后端独立站点跨域参考实现 · MES/WMS/EAM 复用
> **定位**:**总纲 = 把发布全链 7 环节串成顺序流,每环节一句话 + 指向其 detail doc,不重复细节**。照本文走一遍即"从代码就位到 BP 真机逐菜单 200"全闭环。
> **维护规则**:流程/契约变更 → 新建 ADR + 旧条目标 `Superseded by`,不改写历史。

---

## 0. 一句话

子应用发布 BP = **菜单经 manifest 自动进 SYS(禁手工种库)+ 前后端经 ADO pipeline 部署到内网 IIS + 部署后真机逐菜单 E2E 验业务 200**。三道易漏的 backend 隐形闸门(`[NonUnify]` / CORS / JWT key)单独拎出(§3),否则"前端全对仍 401/空菜单"。

---

## 1. 发布全链 7 环节(顺序流 + detail doc + 验收门)

| # | 环节 | 一句话 | detail doc(怎么做) | 验收门 |
|---|---|---|---|---|
| 1 | **前端三件套 + 容器适配** | `routes.config.mjs`(菜单树)→ `generate-manifest.mjs` + postbuild 产 `manifest.json`;BrowserRouter `basename` + hash token bootstrap + postMessage 路由桥(移 wujie) | `subapp-onboarding-guide`(步骤 1-8 + 附录 A/K)·`templates/subapp-migration-checklist` Phase0 | `pnpm build` 出 manifest 节点数 = 菜单数;本地容器冒烟 |
| 2 | **后端 manifest 端点 + IP 白名单** | `MenuController /<app>api/menu/manifest` 裸返 `{AppName,Menus}` + `SubAppManifestIpAllowlistMiddleware`(server-to-server,IP 单边鉴权) | `subapp-menu-manifest-publish` §2-4 ·`subapp-onboarding-guide` 附录 C | 白名单 IP 打端点验 raw body(见 §3 闸门①) |
| 3 | **菜单发布到 SYS(禁手工)** | 应用中心填 `MenuApiUrl` → `ScanMenus` 增量 upsert `SYS_AuthInfo` → 补派生字段(`BGroup/IsPcMenu/BEnd`)+ `ActiveModule` + 工厂绑定 + 角色授权 | `subapp-menu-manifest-publish`(铁律:禁手工改 SYS_AuthInfo) | BP 登录看到菜单树 + 逐目标页可达(ADR-008 #5) |
| 4 | **IIS 站点拓扑 + 部署通道** | 前端 sub-path vdir(SPA web.config)+ 后端站点(**同源子应用 vs 独立站点**,见 §2);凭证 env(占位符 + fail-fast,明文不入库);部署走 MsDepSvc | `cicd-onprem-iis-deploy-standard`(MsDepSvc 通道 + 排错矩阵)·`templates/iis-web.config-spa-subapp` | 前端 sub-path=200 + 后端 swagger=200 |
| 5 | **前后端 CI/CD pipeline** | 各三 stage `Build → Deploy(MsDepSvc) → Verify/E2E`;**后端 Verify=API-Health floor**(swagger 200 + manifest 非空,所有后端必跑);前端 E2E job `timeoutInMinutes ≥ 60`;ADO 变量组按项目隔离;触发分支锁定 | `cicd-e2e-in-pipeline-standard` §7 ·**ADR-045**(分层定级)·`templates/pipeline-e2e/tier-decide.mjs` | `cicd-e2e-stage-guard` 钩子不报缺 stage;push 自动触发绿 |
| 6 | **部署后自动 E2E(分层定级,ADR-045)** | **L0 floor**(每次跑):`critical-boot` + `critical-quality` + `critical-i18n-mix`(中英混杂)+ 核心导航 smoke;**L1 定向**(改动模块)`@module` 逐页;**L2 全量**(首发/共享层/判不准)`critical-menu-walk` 逐页+截图。`tier-decide.mjs` 按 git diff 自动定级,**两个保险**(L0 永远跑 / 判不准默认 L2);`continueOnError:false` | `cicd-e2e-in-pipeline-standard` §7 ·`templates/pipeline-e2e` | 当层全绿,CRASH=0 + 中英混杂=0 |
| 7 | **CI 监控 + 自愈 + 鉴权门真机验收** | 推送后 `cicd-ado-monitor.js watch` 起监控,红走 `cicd-self-heal-sop`;真机从 BP 跨域打带 JWT 的 `[Authorize]` 业务端点验 200(非仅 swagger) | ADR-022 ·`tools/cicd-ado-monitor.js` ·`subapp-onboarding-guide` 附录 L/M | 逐菜单业务 200 + 0 鉴权失败 + 0 错误 toast |

> **顺序约束**:1→2→3 是菜单链(代码→端点→SYS);4→5→6 是部署链(站点→pipeline→E2E);3 与 4 可并行,但 **6 的 menu-walk 要 3(菜单进 BP)+ 5(后端部署)都完成**才能真机验。

---

## 2. 拓扑分支(环节 4 的决策点 —— 选错则 CORS / 寻址全错)

| 拓扑 | 何时选 | 后端站点 | 前端寻址 | CORS |
|---|---|---|---|---|
| **A 同源子应用** | BP 站点下可挂后端子应用(ANCM 自动 `PathBase`) | `BP:8002/<App>WebApi`(同 origin) | 相对同源,`.env.production` API host 留空 | 不需要(同源) |
| **B 后端独立站点** | 后端须独立 IIS 站点(对齐 MDM-Api:5026 / SRM BuyerApi:5028 / **TPM CoreTPMWebApi:5030**) | 独立 `host:port` Site | 前端 host 拆**两变量**:API host(独立站点绝对 URL)+ 门户 host(资源相对)| **必须**配 prod CORS(附录 L) |

- 实证依据:`TPMV2/docs/decisions/ADR-006-tpm-bp-backend-standalone-site-topology.md`(TPM 选 B 的拓扑论证)。
- **B 拓扑专属坑**:dev server CORS 不覆盖 prod;前端勿共用一个 host 变量(否则 Static/i18n 错指后端站点 404)。详 `subapp-onboarding-guide` 附录 L。

---

## 3. 三道 backend 隐形闸门(前端全对仍失败的高发点)

> 这三条不在前端、不报 5xx,极隐蔽,**逐条单验**:

| 闸门 | 症状 | 规则 + 验法 | doc |
|---|---|---|---|
| ① **manifest 响应包装**(ABP/Furion)| ScanMenus 拉空菜单(合法 JSON 但 `Menus:[]`,易误判文件/路径)| manifest action 加 `[NonUnify]` 裸返;**白名单 IP(WinRM/SYS 后端)打端点验 raw body 顶层 `{AppName,Menus}` 无 `{statusCode,data}`**(CI agent 非白名单 manifest 403 验不到)| 附录 C ·manifest-publish 坑#3 |
| ② **prod CORS**(独立站点)| 浏览器拦所有跨域业务请求 | `WithOrigins(BP来源)` + `AllowCredentials()`(不能 `*`);真机验响应头 `acao` 精确 + `acac=true`(swagger 同源证明不了)| 附录 L |
| ③ **JWT 签名 key**(验 BP token)| CORS/token 全对仍**全量业务 401** | 验签 key == SYS 签发 key(**勿用脚手架/模板默认值**);真 token 本地 HS256 反推真 key;`WWW-Authenticate` 头判失败类型 | 附录 M |

---

## 4. TPM 首落地 reference(worked example 索引)

> TPM = 首个 ABP+Furion + 后端独立站点跨域子应用,踩全三道隐形闸门 + 部署链。复用时照此排查:

- spec / 全过程:`TPMV2/docs/superpowers/specs/2026-06-15-tpm-bp-release-cicd/`(progress.md 含逐环节实证 + 坑链)
- 三道闸门实证:① `[NonUnify]`(MenuController.GetManifest)② 独立站点 CORS(`TpmWebApiModule` UseCors 顺序)③ JWT key(`appsettings JwtOptions:SecurityKey` 抄模板残值致 401,改回同族 key 后逐菜单 41×200)
- 部署坑:`ERROR_FILE_IN_USE`(运行 w3wp 锁 DLL)→ msdeploy 加 `-retryAttempts/-retryInterval`(`cicd-onprem-iis-deploy-standard` §6 排错矩阵)

---

## 5. 子应用接入 checklist

落地前逐项打勾:`templates/subapp-migration-checklist.md`(Phase0 参考实现对照 + 端到端链路清单 + E2E production-like 强约束;含 §3 三道 backend 闸门门)。

---

## 6. 关联资源

- **ADR**:ADR-011 / 012 / 038(子应用接入)· ADR-007(鉴权 4 条)· ADR-008 / 024(E2E 8 项核对 + 阶段分级)· **ADR-045(部署后 E2E 分层定级治理 — L0/L1/L2 + 中英混杂门禁 + 后端 floor)**· ADR-022(CI 监控反馈)· ADR-040(MsDepSvc 部署通道)
- **standards**:`subapp-onboarding-guide`(前端接入 + 附录 C/L/M backend 闸门)·`subapp-menu-manifest-publish`(菜单发布)·`cicd-onprem-iis-deploy-standard`(IIS 部署)·`cicd-e2e-in-pipeline-standard`(部署后 E2E)
- **templates / tools**:`templates/subapp-migration-checklist` · `templates/iis-web.config-spa-subapp` · `templates/azure-pipelines-e2e` · `tools/cicd-ado-monitor.js`

---

## 7. 历史与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-06-18 | 1.0 | 首版(TPM 首落地后沉淀,D2):编排 7 环节顺序流 + 拓扑 A/B 分支 + 三道 backend 隐形闸门(`[NonUnify]`/CORS/JWT key)+ TPM reference 索引;引用现有 detail doc 不重复细节 |
