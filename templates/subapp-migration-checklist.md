# BP 子应用迁移/接入前置自检清单(ADR-012 SOP)

> 迁移 / 接入任一 BP 子应用,**先填本清单 Phase 0,再写代码**。
> 沉淀来源:SRMV2 Contract 迁移踩坑(每菜单同页 = 漏 postMessage 路由同步;执行/付款/模板网络异常 = service 漏 baseURL,dev proxy 兜底掩盖;本机 dev「9/9」假 E2E)。
> 机械可检项已 Hook 化(`subapp-frontend-guard.js`),认知部分用本清单兜底。

---

## Phase 0 — 参考实现对照表(机制 1,写代码前必填)

逐条对照**参考实现 MDM**(`~/Projects/SYSV2/AI.REACT.MDM.1`),不靠"应该迁了"的假设:

| # | 契约项 | 参考实现锚点 | 本子应用现状 | 状态 |
|---|---|---|---|---|
| 1 | 入口 hash token 解析(`#sso_token=&plant=`)| `src/index.jsx` bootstrapAuthContext | | ☐ |
| 2 | **postMessage 路由同步监听**(`subapp-router-change`→`navigate`)| MDM `App.jsx` handleMessage / `SubAppRouterBridge.jsx` | | ☐ |
| 3 | postMessage `plant-changed` 更新工厂码 | 同上 | | ☐ |
| 4 | **全部 service 显式 baseURL**(request.js 无默认 baseURL 时)| `purchase.js` `baseURL: VITE_Url` | | ☐ |
| 5 | 嵌入模式隐藏自带 chrome(Header/Sider/Footer)| `isEmbedded` 检测 | | ☐ |
| 6 | menu-manifest `Path` 与 React Router path 逐条匹配 | `public/menu-manifest*.json` | | ☐ |
| 7 | manifest API + IP allowlist 中间件 | 后端 SubAppManifest 中间件 | | ☐ |
| 8 | 路由器与部署模式匹配(external→HashRouter+base'/' / shared_iis→BrowserRouter+basename)| | | ☐ |

---

## 端到端链路清单(机制 3,逐环节实证不抽样)

用户视角链路,**每环节实证**(grep/read/Playwright),不在某一层"看起来对"就推断全链路通:

- [ ] 登录 BP(用 `BPuser`,注意 systemadmin 可能因角色不能登 BP)
- [ ] token 透传(iframe.src hash `sso_token` → 子应用 localStorage)
- [ ] 点菜单 → BP `location` 变 → postMessage → 子应用 `navigate`
- [ ] 路由切到对应页(**逐菜单**,非抽样;多 tab = 多 iframe,按端口+subPath 取对应 frame)
- [ ] service 请求指向正确后端(production iframe origin / VITE_Url,**非相对路径**)
- [ ] API 200 出真实数据(非空表默认态、非「网络异常」toast)
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

- **PostToolUse 自动**:编辑 `src/service/*` 或 `src/App.jsx` 时 `subapp-frontend-guard.js` 即时 warn(漏 baseURL / 漏 postMessage)
- **验收前手动**:`node ~/.claude/hooks/subapp-frontend-guard.js --check <子应用前端仓>`(① service baseURL ② postMessage 路由 ③ 嵌入 chrome ④ E2E production;FAIL 退出码 2)

参见:`decisions/ADR-012`(修订段)/ `standards/subapp-onboarding-guide.md` v1.2 / `standards/legacy-migration-playbook.md`
