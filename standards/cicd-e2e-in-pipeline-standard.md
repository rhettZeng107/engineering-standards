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

## 2. 四条根因教训(本标准要堵的坑)

| # | 坑 | 规则 |
|---|---|---|
| 1 | **dev render OK ≠ prod render OK** | E2E 必须打**部署后的 prod 环境**(`E2E_TARGET` = 部署 URL),禁只用 dev server 验。dev 掩盖 minify/ErrorBoundary/数据态差异。 |
| 2 | **CI smoke ≠ 页面渲染** | smoke 之外必须有页面级 render 断言(boot 壳子 + render-walk 逐页)。 |
| 3 | **共享 Table dataSource 无数组守卫 → 单点崩全站** | 前端编码标准:Table/列表 dataSource 必 `Array.isArray(x)?x:[]`(见 `react-ui-guidelines.md`);E2E render-walk 兜底拦截。 |
| 4 | **POST 被 IIS 降级 / 端点 5xx** | 部署后验关键 POST verb 不被重定向降级;E2E 捕获业务 5xx。 |

## 3. 验证 SOP(E2E_Verify stage 内)

1. **critical-boot**(每仓必跑):部署壳子健康 — bundle 加载 / `#root` 挂载 / 无资源 5xx / 无 .js·.css 返 text/html(IIS hash 残留 MIME 错配)/ 无 ErrorBoundary。
2. **critical-render-walk**(有业务页必跑):登录 + 逐路由(**曾崩溃 + 核心业务**)断言 — 无致命 JS 错(`is not a function`/读 undefined)/ 无 ErrorBoundary / `#root` 有子节点 / body 非白屏。
3. **失败诊断**:`helpers/diag.ts` 在 CI log 直出 pageError/console/network/DOM(不用下 trace)。
4. **CRASH > 0 = 阻塞**,根因到 file:line 再修;修后重跑(CI 自愈 SOP `cicd-self-heal-sop.md`)。

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
- [ ] Table dataSource 数组守卫(编码标准)
- [ ] 钩子 `cicd-e2e-stage-guard` 未报缺 stage
