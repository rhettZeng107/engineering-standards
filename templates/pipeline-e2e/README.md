# pipeline-e2e 模板 — 部署后 E2E 验证(跨项目复用)

> 标准:`standards/cicd-e2e-in-pipeline-standard.md` · 决策:ADR-024(修订)
> 由来:SYSV2 MDM pipeline-e2e + SRMV2 部署 10.8 踩坑(dev render OK 但 prod build 崩 10 菜单)沉淀。

## 用法(新前端仓 3 步)

1. **拷骨架**:把本目录拷到前端仓根 `pipeline-e2e/`。
2. **改 spec**:
   - 纯壳子验证 → 留 `tests/critical-boot.spec.ts`(开箱即用,配 `E2E_ROOT_PATH`)。
   - 要逐页验渲染(推荐,防共享组件崩) → 用 `tests/critical-render-walk.spec.ts`:改 `helpers/login.ts`(二选一鉴权模式)+ pipeline 注入 `E2E_ROUTES`(曾崩溃 + 核心业务路由)。
3. **接 stage**:把 `templates/azure-pipelines-e2e-stage.snippet.yml` 接到前端 pipeline 的 `DeployTest` 之后,替换 `<E2E_TARGET>/<E2E_API>/<E2E_ROUTES>` 占位。

## 验证什么(断言)

| 检查 | 防的坑 |
|---|---|
| 无致命 JS 错(`is not a function`/读 undefined) | 共享 Table dataSource 收非数组 → 崩整页 |
| 无 ErrorBoundary 兜底页 | 页面级崩溃 |
| `#root` 有子节点 + body 非白屏 | SPA 没 mount / 白屏 |
| 无资源 5xx / 无 .js/.css 返 text/html | IIS SPA fallback hash 残留 / MIME 错配 |

## 关键纪律(否则白做)

- **必须打部署 prod 环境**(`E2E_TARGET` 指部署 URL),**不是 dev server**:dev 掩盖 prod-only 崩溃。
- pipeline 跑这套的 stage `continueOnError: false`,**CRASH 即阻断 deploy 视为失败**。
- Windows 自托管 agent 装 `npx playwright install chromium --with-deps`。

## env 参数

| env | 含义 | 例 |
|---|---|---|
| `E2E_TARGET` | 部署前端 URL | `http://172.21.10.8:8005`(external)/ `http://172.21.10.8:8002/srm`(shared_iis) |
| `E2E_ROOT_PATH` | critical-boot 子路径 | `/`(根)/ `/srm/`(子应用) |
| `E2E_API` | 后端 API 根(登录用) | `http://172.21.10.8:5029` |
| `E2E_ROUTES` | render-walk 路由(逗号分隔) | `/dashboard,/ppm,/otd,...` |
| `E2E_HASH_ROUTER` | HashRouter?默认 true | `false`=BrowserRouter |
| `E2E_USER`/`E2E_PWD`/`E2E_PLANT` | 登录凭据 | — |
| `E2E_JWT_KEY` | 模式 B 自签 key(严禁硬编码,走 Variable Group) | — |
