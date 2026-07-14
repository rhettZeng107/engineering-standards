# BP 子应用迁移/接入前置自检清单(ADR-012 + ADR-047)

> 迁移 / 接入任一 BP 子应用,**先填本清单 Phase 0,再写代码**。
> 沉淀来源:SRMV2 Contract 路由/baseURL 迁移踩坑，以及 2026-07-14 APS legacy URL token 与 v1 上下文竞态造成首批 401 的实证。
> 旧 Hook 只能辅助检查 baseURL、路由、嵌入 chrome 与 production E2E，不能证明 v1 ready/ACK、精确 source/origin 或内存 JWT 正确；认知与协议项用本清单兜底。

---

## Phase 0 — 参考实现对照表(机制 1,写代码前必填)

逐条对照当前 **BP + MDM v1 参考实现**，不靠“应该迁了”的假设：

| # | 契约项 | 参考实现锚点 | 本子应用现状 | 状态 |
|---|---|---|---|---|
| 1 | **v1 listener 先注册，再发送 `subapp-ready`** | 子应用 `bpSubAppBridge` | | ☐ |
| 2 | **`bp-context-sync` 原子应用 token/PlantCode/contextVersion 并回 ACK** | 子应用 `embeddedAuthContext` / bridge | | ☐ |
| 3 | **双方精确校验 source + origin，BP registry 绑定当前账号/组织授权** | BP registry / 子应用 allowed origins | | ☐ |
| 4 | **全部 service 显式 baseURL**(request.js 无默认 baseURL 时)| `purchase.js` `baseURL: VITE_Url` | | ☐ |
| 5 | 嵌入模式隐藏自带 chrome(Header/Sider/Footer)| `isEmbedded` 检测 | | ☐ |
| 6 | menu-manifest `Path` 与 React Router path 逐条匹配 | `public/menu-manifest*.json` | | ☐ |
| 7 | manifest API + IP allowlist 中间件 | 后端 SubAppManifest 中间件 | | ☐ |
| 8 | 路由器与部署模式匹配(external→HashRouter+base'/' / shared_iis→BrowserRouter+basename)| | | ☐ |
| 9 | iframe src、localStorage/sessionStorage/cookie/IndexedDB/日志均不含 BP JWT | production build + Browser | | ☐ |
| 10 | 401 只上报当前 context identity；BP 判活后至多重发一次认证上下文，不重放业务请求 | bridge tests + Browser | | ☐ |

---

## 端到端链路清单(机制 3,逐环节实证不抽样)

用户视角链路,**每环节实证**(grep/read/Playwright),不在某一层"看起来对"就推断全链路通:

- [ ] 登录 BP(用 `BPuser`,注意 systemadmin 可能因角色不能登 BP)
- [ ] v1 握手完成(`subapp-ready` → `bp-context-sync` → `subapp-context-applied`)，首个业务请求发生在 ACK 后
- [ ] token/PlantCode 只存在于 BP 持久态与子应用内存；iframe src/hash、子应用 storage 和日志无 JWT
- [ ] 点菜单 → BP `location` 变 → `bp-route-sync` → 子应用 `navigate`
- [ ] 路由切到对应页(**逐菜单**,非抽样;多 tab = 多 iframe,按端口+subPath 取对应 frame)
- [ ] service 请求指向正确后端(production iframe origin / VITE_Url,**非相对路径**)
- [ ] API 200 出真实数据(非空表默认态、非「网络异常」toast)
- [ ] 旧上下文迟到 401 不影响新上下文；当前 401 由 BP 判活，不直接把账号挤下线
- [ ] (独立站点跨域)后端 prod CORS 配 BP 来源 + `AllowCredentials`,真机响应头 `acao` 精确(非 `*`)+ `acac=true`(onboarding 附录 L)
- [ ] 后端 JWT 验签 key == SYS 同族签发 key(**勿用脚手架/模板默认值**);业务 401 先读响应 `WWW-Authenticate` 头判失败类型(签名 key 错 / 过期 / 缺 token)再修(onboarding 附录 M)
- [ ] 渲染无双层外框、无 ErrorBoundary

---

## E2E 验收(机制 2,production-like 强约束)

- [ ] 验收脚本打**真实 BP iframe + production(或 production-like 部署)**,**禁 localhost / dev vite proxy** 作验收依据
- [ ] **逐菜单**点击 + 每页 API 真实调通(非抽验首页/列表)
- [ ] 取 iframe frame 时按子应用端口 + 预期 subPath 过滤(BP 主 frame URL 也会含 subPath,多 tab 多 iframe)

---

## 机械自检(Hook + CLI)

- **历史 Hook 辅助**:编辑 `src/service/*` 或 `src/App.jsx` 时 `subapp-frontend-guard.js` 可提示漏 baseURL / 旧路由桥；不得把 Hook 通过当作 v1 协议通过
- **验收前手动**:`node ~/.claude/hooks/subapp-frontend-guard.js --check <子应用前端仓>`后，仍须补 bridge 单测、生产 build 检查与真实 BP iframe E2E

参见：`decisions/ADR-012`(准入 SOP)、`decisions/ADR-047`(认证桥)、`standards/subapp-onboarding-guide.md` v2.0、`standards/legacy-migration-playbook.md`
