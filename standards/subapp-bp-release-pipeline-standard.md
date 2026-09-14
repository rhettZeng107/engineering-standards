# 子应用发布业务门户(BP)+ CI/CD 流水线标准(编排总纲)

> **状态**:Stable v2.1(2026-09-15,Gitea Actions主交付链升级)
> **适用范围**:任何要发布到业务门户(BP)并接入内网 CI/CD 的子应用；新建/完成迁移的应用走10.28容器+10.31网关，未容器化存量应用临时保留IIS分支
> **定位**:**总纲 = 把发布全链 7 环节串成顺序流,每环节一句话 + 指向其 detail doc,不重复细节**。照本文走一遍即"从代码就位到 BP 真机逐菜单 200"全闭环。
> **维护规则**:流程/契约变更 → 新建 ADR + 旧条目标 `Superseded by`,不改写历史。

---

## 0. 一句话

子应用发布 BP = **菜单经 manifest 自动进 SYS(禁手工种库)+ API按SYS OIDC Discovery/JWKS验签+前后端经Gitea Actions部署不可变容器到容器平台和统一网关+部署后定向E2E验证真实业务数据**。完整执行合同见 [MOM OIDC 统一认证与容器化部署详细手册](mom-oidc-containerized-delivery-guide.md)及[Gitea Actions内网容器CI/CD标准](gitea-actions-onprem-container-cicd-standard.md)。

---

## 1. 发布全链 7 环节(顺序流 + detail doc + 验收门)

| # | 环节 | 一句话 | detail doc(怎么做) | 验收门 |
|---|---|---|---|---|
| 1 | **前端三件套 + Bridge/容器适配** | `routes.config.mjs`→`generate-manifest.mjs`产manifest；BrowserRouter `basename`；Bridge V1只在内存接收OIDC Access Token/PlantCode，禁URL JWT | `subapp-onboarding-guide`步骤1-8/附录O · OIDC容器手册§4-5 | `pnpm build`菜单数一致；Bridge单测；本地容器冒烟 |
| 2 | **后端 manifest 端点 + IP 白名单** | `MenuController /<app>api/menu/manifest` 裸返 `{AppName,Menus}` + `SubAppManifestIpAllowlistMiddleware`(server-to-server,IP 单边鉴权) | `subapp-menu-manifest-publish` §2-4 ·`subapp-onboarding-guide` 附录 C | 白名单 IP 打端点验 raw body(见 §3 闸门①) |
| 3 | **菜单发布到 SYS(禁手工)** | 应用中心填 `MenuApiUrl` → `ScanMenus` 增量 upsert `SYS_AuthInfo` → 补派生字段(`BGroup/IsPcMenu/BEnd`)+ `ActiveModule` + 工厂绑定 + 角色授权 | `subapp-menu-manifest-publish`(铁律:禁手工改 SYS_AuthInfo) | BP 登录看到菜单树 + 逐目标页可达(ADR-008 #5) |
| 4 | **容器拓扑 + 网关** | 前后端不可变镜像部署到10.28，10.31 APISIX提供同源path；容器化后退出10.8 IIS。未容器化存量应用才走MsDepSvc | OIDC容器手册§5-6 · `cicd-onprem-iis-deploy-standard`（仅存量） | 容器healthy + 10.31静态/API探针 + upstream不含10.8 |
| 5 | **前后端 CI/CD pipeline** | `本地定向验证 → Build/Test → 10.28容器Deploy → 10.31 Verify → 定向E2E`；后端鉴权契约变化触发消费前端 | OIDC容器手册§7 · ADR-045/046 | 精确SHA镜像、消费者触发和业务E2E全绿 |
| 6 | **部署后自动 E2E(影响面定向,ADR-045)** | **L0 floor**每次跑；再按本次 diff 执行改动页面及共享消费者、菜单/接口关联页的 `@module` 用例。未知影响直接失败并补映射；全菜单走查仅为独立专项，不进入常规提交门禁；`continueOnError:false` | `cicd-e2e-in-pipeline-standard` §7 ·`templates/pipeline-e2e` | 本次影响面全绿,CRASH=0 + 中英混杂=0 |
| 7 | **CI 监控 + 自愈 + 鉴权门真机验收** | 推送后通过Gitea Actions页面/API监控Run、Jobs、日志和制品到终态，红走`cicd-self-heal-sop`;真机从 BP 跨域打带 JWT 的`[Authorize]`业务端点验200(非仅 swagger) | ADR-022/050 ·Gitea CI/CD标准§8 ·`subapp-onboarding-guide` 附录 L/M | 逐菜单业务 200 + 0 鉴权失败 + 0 错误 toast |

> **顺序约束**:1→2→3 是菜单链(代码→端点→SYS);4→5→6 是部署链(站点→pipeline→E2E);3 与 4 可并行,但 **6 的 menu-walk 要 3(菜单进 BP)+ 5(后端部署)都完成**才能真机验。

---

## 2. 拓扑分支（环节4）

| 拓扑 | 何时选 | 后端运行 | 前端/API寻址 | 状态 |
|---|---|---|---|---|
| **C 容器+网关（目标）** | 所有新建或完成迁移的MOM应用 | 10.28 Docker容器 | 10.31 APISIX同源path，如`/tpm/`+`/tpmapi/` | 强制；完成后退出10.8 IIS |
| **A IIS同源子应用（存量）** | 尚未容器化且BP站点可挂ANCM子应用 | 10.8 IIS子应用 | 旧BP origin相对路径 | 仅迁移期 |
| **B IIS独立站点（存量）** | 尚未容器化且后端必须独立端口 | 10.8独立IIS Site | 旧绝对API地址，需精确CORS | 仅迁移期 |

- A/B仅用于读取旧项目和迁移排错，不是TPM/MES/AIOS升级目标。容器目标拓扑、镜像、SSH、网关和回滚见OIDC容器手册§5-8。

---

## 3. 三道 backend 隐形闸门(前端全对仍失败的高发点)

> 这三条不在前端、不报 5xx,极隐蔽,**逐条单验**:

| 闸门 | 症状 | 规则 + 验法 | doc |
|---|---|---|---|
| ① **manifest 响应包装**(ABP/Furion)| ScanMenus 拉空菜单(合法 JSON 但 `Menus:[]`,易误判文件/路径)| manifest action 加 `[NonUnify]` 裸返;**白名单 IP(WinRM/SYS 后端)打端点验 raw body 顶层 `{AppName,Menus}` 无 `{statusCode,data}`**(CI agent 非白名单 manifest 403 验不到)| 附录 C ·manifest-publish 坑#3 |
| ② **prod CORS**(独立站点)| 浏览器拦所有跨域业务请求 | `WithOrigins(BP来源)` + `AllowCredentials()`(不能 `*`);真机验响应头 `acao` 精确 + `acac=true`(swagger 同源证明不了)| 附录 L |
| ③ **OIDC资源服务器契约** | CORS/token全对仍全量业务401 | Discovery/JWKS严格验签；核对issuer/audience/typ/scope及大小写精确的`BusinessPortalAccess`/`PlantCode`；禁止共享HS256密钥 | 附录M · ADR-049 |

---

## 4. TPM 首落地 reference(worked example 索引)

> 本节是2026-06-18 TPM旧IIS/JYInfo历史案例，只用于识别迁移前故障；认证与部署结论已由ADR-049取代，不得作为新实现模板。

- spec / 全过程:`TPMV2/docs/superpowers/specs/2026-06-15-tpm-bp-release-cicd/`(progress.md 含逐环节实证 + 坑链)
- 历史三道闸门:①`[NonUnify]`②独立站点CORS③旧共享JWT key。迁移后第③项必须替换为OIDC Discovery/JWKS，不再反推或分发共享密钥。
- 部署坑:`ERROR_FILE_IN_USE`(运行 w3wp 锁 DLL)→ msdeploy 加 `-retryAttempts/-retryInterval`(`cicd-onprem-iis-deploy-standard` §6 排错矩阵)

---

## 5. 子应用接入 checklist

落地前逐项打勾:`templates/subapp-migration-checklist.md`(Phase0 参考实现对照 + 端到端链路清单 + E2E production-like 强约束;含 §3 三道 backend 闸门门)。

---

## 6. 关联资源

- **ADR**:ADR-011 / 012 / 038(子应用接入)· ADR-007(鉴权 4 条)· ADR-008 / 024(E2E 8 项核对 + 阶段分级)· **ADR-045(部署后 E2E 分层定级治理 — L0/L1/L2 + 中英混杂门禁 + 后端 floor)**· ADR-022(CI 监控反馈)· ADR-040(MsDepSvc 部署通道)· ADR-050(Gitea Actions主交付链)
- **standards**:`mom-oidc-containerized-delivery-guide`（OIDC与容器目标）·`gitea-actions-onprem-container-cicd-standard`（主CI/CD链）·`subapp-onboarding-guide`（菜单/Bridge）·`subapp-menu-manifest-publish`·`cicd-onprem-iis-deploy-standard`（仅未容器化存量）·`cicd-e2e-in-pipeline-standard`
- **templates / tools**:`templates/subapp-migration-checklist` · `templates/iis-web.config-spa-subapp` · `templates/pipeline-e2e`

---

## 7. 历史与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-06-18 | 1.0 | 首版(TPM 首落地后沉淀,D2):编排 7 环节顺序流 + 拓扑 A/B 分支 + 三道 backend 隐形闸门(`[NonUnify]`/CORS/JWT key)+ TPM reference 索引;引用现有 detail doc 不重复细节 |
| 2026-09-14 | 2.0 | ADR-049：目标拓扑升级为SYS OIDC、Bridge V1、10.28容器和10.31网关；JYInfo/HS256及10.8 IIS降为存量迁移参考 |
| 2026-09-15 | 2.1 | ADR-050：已迁移仓改用Gitea Actions主交付链、独立Runner与Gitea API监控；ADO降为历史只读 |
