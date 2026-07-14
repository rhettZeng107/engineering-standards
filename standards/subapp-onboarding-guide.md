# 子应用接入业务门户(BP)标准手册

> **状态**:Reference Verified v2.0(2026-07-15；APS 功能 happy-path 已验证，全协议推广门禁待完成)
> **适用范围**:任何要嵌入业务门户(BP)的子应用 — MDM ✅ 已接入(参考实现)/ SRM / MES / EAM / ...
> **维护规则**:接入流程或契约变更 → 必新建 ADR + 旧条目标 `Superseded by ADR-XXX`,不可改写历史
> **设计标杆**:MDM 子应用(`AI.Extend.MDM.1` 后端 + `AI.REACT.MDM.1` 前端)

---

## 0. 接入前提

| 维度 | 要求 |
|---|---|
| 子应用形态 | 独立 React/Vue 应用(本手册以 React + Vite 为例,Vue/Angular 自行类比) |
| SubApp 注册 | 应用中心管理员已注册子应用(分配 SubApp Id + AuthName + AppName 全小写) |
| 服务器准入 | 子应用所在服务器在应用中心 IP allowlist(参见 ADR-006) |
| 后端运行时 | .NET 8(本手册示例);其他后端语言自行类比 IP allowlist 中间件 |
| 前端工具链 | Vite(推荐)或 CRA;build 产物含 `manifest.json` 静态文件 |

---

## 1. 10 步接入清单(主流程)

> 每步含「操作步骤」+「完成标志」+「失败排查」三段,严格按顺序推进;跳步等于带病上线。

### 步骤 1:子应用注册到应用中心

**操作**

- 管理员登录控制台 → 应用中心 → 注册子应用
- 必填字段:
  - `Name`(中文显示名,2-50 chars)
  - `AppName`(应用标识,**必须全小写**,匹配 manifest 内 appName)
  - `Category`(应用分类,如 "MDM" / "SRM" / "MES")
  - `DeployType`(枚举:`shared_iis` / `external`)
  - `VirtualPath`(部署虚拟路径,以 `/` 开头 + 以 `/` 结尾,如 `/MDM/`)
- DeployType 分流:
  - `shared_iis`(同 BP 共享 IIS 站点):仅填 `VirtualPath`,FullUrl = VirtualPath 相对路径
  - `external`(独立子域 / 跨主机):另填 `ServerUrl` + `Port`(标准 80/443 留空)

**完成标志**:SubApp 表 4 字段非空 + 状态 `draft` + 列表页 "部署目标" 列正确显示

**失败排查**:`AppName` 大小写不一致 → 实体 setter `ToLower()` 强制,数据库层 CI 排序规则等值比较自动忽略大小写;若 prod 部署到 CS 排序规则数据库,**需在应用中心查询时显式 `LOWER()` 包装**(查 `AuthInfoQueryService` 的 HashSet OrdinalIgnoreCase 兜底)。

---

### 步骤 2:子应用实装 manifest API

**操作**

- 子应用后端暴露 `GET /<base>/manifest`
- **`<base>` 命名约定**(本手册标准):`/<appName>api/menu`,全小写,与 `SubApp.AppName` 一致(MDM 例:`/mdmapi/menu` → 完整 endpoint `/mdmapi/menu/manifest`)
- 返回 JSON 格式(`SubAppManifest` schema,**字段命名 PascalCase** — 与 .NET 后端 POCO 默认序列化对齐):

```json
{
  "AppName": "mdm",
  "RootName": "主数据管理",
  "Menus": [
    { "Code": "MdmMaterialList", "Name": "物料档案", "Path": "material/list", "Icon": "DatabaseOutlined", "Children": null },
    { "Code": "MdmCustomerList", "Name": "客户档案", "Path": "customer/list", "Icon": "UserOutlined", "Children": null }
  ],
  "Version": "1.0.0"
}
```

- 字段语义:
  - `AppName` → 稳定应用标识，只用于归属/路由/授权匹配，不作为根菜单展示名
  - `RootName` → 可选的应用根菜单展示名；未提供时，显式应用根节点使用自身 `Name`，合成根节点回退应用中心名称
  - `Code` → 应用中心 `SYS_AuthInfo.AuthTag`(权限码 1:1 对应)
  - `Name` → 中文菜单名(`SYS_AuthInfo.Name`)
  - `Path` → 子应用内部路由(对应 `SYS_AuthInfo.PageUrl`)
  - `Icon` → 可选,antd Icon 名
  - `Children` → 多级菜单递归;扁平结构留 `null`
- 鉴权:`[AllowAnonymous]` + IP allowlist 中间件(只允许应用中心服务器 IP 访问;参见附录 C)

**完成标志**:
- `curl http://子应用/<base>/manifest` 从应用中心服务器 IP 返回 200 + 合法 JSON
- 同 curl 从其他 IP(如开发者本机)返回 403 + 错误信息

> ⚠️ **必须正向断言 `200 + 合法 JSON`,别只看到"非白名单 IP 返 403"就以为端点活了**。后端进程没起来(500.30)或应用池配错(403.18)时从任何 IP 都不可达,而 `403` 极易被误当成"IP allowlist 预期"放过(2026-06-17 TPM 实证:manifest 403 实为后端 500.30 启动失败,被当 allowlist 预期假绿掩盖)。CI 健康校验同理,见 CICD 部署标准 §5。

**失败排查**:
- 405 Method Not Allowed → 检查路由方法 `[HttpGet]`
- 500 → 检查 `wwwroot/menu-manifest.json` 是否存在(prod 路径)或 `menu-manifest.dev.json`(dev fallback)
- **500.30(IIS ANCM "app failed to start")→ 后端进程根本没起来,与 manifest 无关**。常见根因:`appsettings` 连接串 `${ENV_VAR}` 占位符在目标 IIS 读不到 machine env(改后 w3wp 未刷新)→ 启动期 fail-fast。先看 stdout log 或目标机直跑 `dotnet <App>.dll` 定位
- **403 先看 body 分清两种**(改错地方白忙):
  - body 是 **IIS 403.18 HTML 详细错误** = 应用池路由/部署故障(请求没进应用)→ **不是 allowlist,改 `AllowedIPs` 无用**,查 IIS 子应用的 AppPool 配置(独立 AppPool / No Managed Code)
  - body 是中间件**纯文本 `IP not in allowlist: {ip}`** = 真 allowlist 拦截 → 才检查 `appsettings.json` 的 `SubAppManifest:AllowedIPs` 含调用方 IP

---

### 步骤 3:子应用静态备份 manifest.json

**操作**

- 子应用前端 `build` 输出包含 `dist/menu-manifest.json`
- 后端 `wwwroot/menu-manifest.json`(prod 主文件,与前端 build 产物同源)
- dev 环境另存 `wwwroot/menu-manifest.dev.json` 作 fallback(本地无 build 时)
- 推荐做法:前端 `postbuild` 脚本自动生成 + 三处同步落盘(前端 dist + 后端 wwwroot prod + 后端 wwwroot dev)

**完成标志**:
- `pnpm build` 后 `dist/menu-manifest.json` 存在
- 后端 `wwwroot/menu-manifest.json` 存在 + 内容与 dist 一致
- dev 模式启动子应用,`/<base>/manifest` 返回 dev fallback 内容

**失败排查**:
- postbuild 脚本未执行 → 检查 `package.json` 是否有 `postbuild: node scripts/generate-manifest.mjs`
- 路径不一致 → 检查脚本内 `BACKEND_WWWROOT` 相对路径是否对应实际项目目录

---

### 步骤 4:管理员 ScanMenus 扫描菜单 → SYS_AuthInfo

**操作**

- 应用中心 → 子应用详情 → "扫描菜单" 按钮
- 后端 `SubAppController.ScanMenus(subAppId)`:
  1. 读取 SubApp.MenuApiUrl(如 `http://mdm-server:5026/mdmapi/menu/manifest`)
  2. server-to-server HttpClient GET → 拿到 manifest JSON
  3. 反序列化为 `SubAppManifest`
  4. 增量合并到 `SYS_AuthInfo`(范围:`AppName = SubApp.AppName`):
     - 新增:manifest 内有 + DB 内无 → INSERT
     - 更新:manifest 内有 + DB 内有 → UPDATE Name/PageUrl/Icon
     - 删除:DB 内有 + manifest 内无 → 标记 `SYS_AuthInfo.IsActive = false`(不物理删除,保留权限审计;**注**:此处是菜单项失效,与 SubApp 维度的 `SYS_SubApp.IsActive` 是两个独立字段)

**完成标志**:`SYS_AuthInfo` 表查询 `WHERE AppName = '<appName>'` 看到子应用所有菜单条目 + AuthTag 与 manifest.code 1:1

**失败排查**:
- 扫描失败 + 503 → MDM manifest API 503,检查 `wwwroot/` 文件
- 扫描失败 + 403 → IP allowlist 配置错,应用中心服务器 IP 没在 `SubAppManifest:AllowedIPs`
- AppName 不匹配 → manifest.appName 与 SubApp.AppName 大小写不一致(实体 setter `ToLower()` 应已规避)

---

### 步骤 5:管理员 Publish + 选择组织(plantCode)

**操作**

- 应用中心 → 子应用详情 → "发布" → 弹出工厂多选框
- 勾选目标工厂(plantCode)→ 确认
- 后端 `SubAppController.Publish(subAppId, plantCodes[])`:
  1. 校验 SubApp 4 字段完整性(`ValidateDeploymentTarget()`):
     - `AppName` 非空
     - DeployType=`external` 时 `ServerUrl` 必填
     - `Port` 在 1-65535 范围或 NULL(标准 80/443 省略)
     - `VirtualPath` 必填 + 以 `/` 开头 + 以 `/` 结尾
  2. 写入 `SYS_SubAppOrgAccess`(`SubAppId × PlantCode × IsActive=true`)
  3. SubApp 状态 `draft` → `published`

**完成标志**:
- SubApp 状态 `published`
- `SYS_SubAppOrgAccess` 含目标工厂记录
- 状态机不可逆:`published` 状态下 `Update` action 抛 `InvalidOperationException`,改字段必须先 `GoOffline`

**失败排查**:
- 4 字段校验失败 → 回 draft 补全字段
- 重复发布 → 后端幂等,重复 PlantCode 跳过

---

### 步骤 6:管理员 GoOnline + 角色授权 AuthTag

**操作**

- 应用中心 → 子应用详情 → "上线"(状态 `published` → `online`)
- 控制台 → 角色管理 → 给目标角色分配子应用 AuthTag(权限码)
  - 角色 × AuthTag 关联 = 第三方鉴权矩阵的灵魂:控制 BP 用户登录后能看到哪些子应用菜单

**完成标志**:
- SubApp 状态 `online`
- 目标角色已勾选子应用 AuthTag
- 同角色用户登录 BP → `getMenuTree?portalType=bp&plantCode=xxx` 返回结果含子应用菜单

**失败排查**:
- BP 登录后不见菜单 → 检查 4 个环节:
  1. 用户角色是否含子应用 AuthTag(`SYS_RoleAuth` 关联)
  2. SubApp 是否 `online`(`published` 状态 BP 也看不到)
  3. SubApp 是否 `SYS_SubApp.IsActive=true`(SubApp 维度开关)
  4. SubAppOrgAccess 是否含用户当前 plantCode + `SYS_SubAppOrgAccess.IsActive=true`(工厂×子应用授权)
  5. 子应用菜单项是否 `SYS_AuthInfo.IsActive=true`(菜单维度开关,ScanMenus 删除时被置 false)
- 任一环节断,菜单都不会出现(三条件 LEFT JOIN 见附录 J)

---

### 步骤 7:子应用 axios 拦截器实装 token 信任链

**操作**

- 子应用在任何业务请求前启动 `BpSubAppBridge v1`，等待 BP 下发并 ACK 当前 token/PlantCode 原子上下文；未取得上下文时 fail closed，不发匿名请求。
- 嵌入态 JWT 只保存在内存，不写 localStorage、sessionStorage、cookie、IndexedDB、URL 或日志。
- axios/fetch/upload/download 使用同一认证适配层，从请求发起时的上下文快照构造 `Authorization: Bearer <token>` 与 `X-Plant-Code`。
- 请求同时固化 context identity；旧上下文迟到的 401 不得上报为当前会话错误。
- 401 只向 BP 上报版本化 `subapp-auth-error`。子应用不清 BP token、不跳 BP 登录页、不显示“账号被挤下线”，也不自动重放业务请求。

**完成标志**:
- 生产 build 搜索历史 token key 与 `sso_token=` 均为 0 个持久化/URL 写入点。
- BP iframe 首次请求必须发生在 `subapp-context-applied` 之后，且使用同一上下文的 token/PlantCode。
- 同一 contextVersion 401 仅触发一次 BP 判活/上下文恢复；业务 POST/PUT/DELETE 不自动重放。

**失败排查**:
- 首屏先 401 后 200 → 检查 v1 iframe 初始 URL 是否仍夹带 legacy token，或业务 App 是否早于 v1 ACK render。
- 切组织后偶发误下线 → 检查请求是否固化 context identity，以及旧 401 是否错误命中新上下文。
- 所有请求 401 → 先查 `WWW-Authenticate`、JWT issuer/audience/signature/lifetime，再查 BP registry 与上下文 ACK；不要笼统归因“后端未启动”。

---

### 步骤 8:子应用 v1 消息桥与路由同步

**操作(当前默认,强制)**

- 子应用先注册 `message` listener，再发送 `subapp-ready`；消息必须使用 v1 envelope，并按消息 schema 校验 protocol/version/type/appName/requestId/payload。
- 接收消息必须同时校验 `event.source === window.parent` 与 exact allowed origin；BP 侧也必须绑定登记 iframe 的 contentWindow 与 origin。
- `bp-context-sync` 原子应用 token/PlantCode/contextVersion 后回 `subapp-context-applied` ACK；未 ACK 不得开始业务请求。
- `bp-route-sync` 只更新子应用内部路由；`bp-session-clear` 清空内存上下文并阻止后续请求。
- 路由器类型可按部署选择；BrowserRouter 的 basename 必须对齐实际虚拟目录。iframe 初次 src 只含页面路径和业务 query，不含 JWT。
- legacy 无版本消息仅允许在受控双栈迁移期开启；新应用禁止以 Wujie props、URL hash token 或 localStorage 作为终态。

**完成标志**:
- BP 点**每个**菜单(逐菜单,非只验首页)→ 子应用切到对应页面
- 子应用内部跳转(如 `purchase/index` → `purchase/edit/123`)正常
- 切组织 → 新 token/PlantCode 同一 contextVersion 原子生效，旧请求不得污染新页面

**失败排查**:
- **点每个菜单都同一页** → 检查 `bp-route-sync` listener 与实际 basename
- 子应用首页 404 → SubApp.VirtualPath 与子应用路由 base 不一致
- 切组织数据不变 → 检查 `bp-context-sync` ACK、contextVersion 和请求快照

---

### 步骤 9:子应用 dev 调试

> 独立 dev 模式可使用专用测试凭据，但不得把 BP 生产 JWT 复制到子应用 localStorage；嵌入联调按附录 O 走内存协议。

**操作**

- 子应用独立端口启动 `pnpm dev`(如 :3000)
- 两种 dev 模式:
  - **A 独立模式**:浏览器直接访问子应用；通过开发专用内存 provider/测试登录 API 取得短期测试 token，不复用或持久化 BP 生产 JWT
  - **B 嵌入模式**:BP proxy/虚拟目录加载 dev 子应用，完整执行 v1 ready/context/ACK/route/auth-error
- 推荐 A 模式做 UI 联调,B 模式做端到端流程联调

**完成标志**:
- A 模式:开发凭据只在当前进程内存存在，页面功能可用
- B 模式:BP 加载子应用 dev 版，v1 ACK、路由、组织切换和 401 判活正常

**失败排查**:
- B 模式加载失败 → 检查 dev server CORS、BP allowed origin 与 iframe source/origin 绑定
- A 模式接口 401 → 检查开发 token 生命周期和后端签名/issuer/audience，不把 token 写入 localStorage 规避

---

### 步骤 10:E2E 双层验证

**操作**

- **E1 API 契约层**:
  - `GET /api/SubApp/BpApps?plantCode=xxx` 返回数组含子应用 + `FullUrl` 字段
  - `GET /api/AuthInfo/List?portalType=bp&plantCode=xxx` 返回菜单树含子应用菜单(三条件 JOIN 通过)
- **E2 UI 端到端层**:
  - Bpuser 登录 BP @ 8002
  - 看到子应用菜单(顶栏 / 侧栏)
  - 点击菜单 → 原生 iframe 加载正确运行目录，src 不含 JWT
  - 业务路径走通(如 MDM 物料列表 → 编辑 → 保存)
- **5 项异常路径覆盖**:
  1. 子应用加载失败(URL 错 / 网络断)→ ErrorBoundary fallback 显示
  2. 子应用 401 → `subapp-auth-error` → BP 判活；可恢复时只重发认证上下文，终态失效才清会话
  3. 切组织 → token/PlantCode 原子上下文更新 + menuTree/BpApps 重拉
  4. 4 小时未交互 → 应用层 ttl 自实现销毁 + 下次访问重新加载
  5. 浏览器深度链接 `/<appName>/<subPath>` → 直接命中子应用对应页面(刷新页不丢失)

**完成标志**:
- E1 + E2 全链通
- 5 项异常路径覆盖
- 性能基线:首次加载 < 3s,后续切菜单 < 500ms(alive=true 复用)

**失败排查**:
- E1 通 + E2 不通 → 检查 BP registry、iframe exact source/origin 与 v1 ACK
- 切组织菜单不变 → 检查 BP 是否刷新 BpApps/menuTree 并发送新原子上下文
- 深度链接 404 → 检查 BP 路由 `/:appName/*` 通配是否在白名单后注册

> ⚠ **E2 验证环境强约束(2026-05-21 教训,假验收硬伤)**:E2 UI 层**必须在真实 BP iframe + production(或 production-like 部署)环境**跑,**禁用本机 dev 直访 / vite proxy 作为验收依据**。原因:
> 1. **dev vite proxy 会兜底子应用 service 漏的 `baseURL`** → production iframe(无 proxy)才暴露「网络异常:无法连接服务器」
> 2. **单应用直接访问(非 iframe)时,HashRouter 直接改 URL 能切页** → 掩盖 postMessage 路由同步缺失(BP iframe 里点菜单才暴露「每个菜单同一页」)
>
> **必做两条硬验证**:
> - **逐菜单点击**:BP 里点**每一个**子应用菜单 → 确认切到对应页面(不是抽验首页/列表)
> - **每页 API 真实调通**:每页进去后看该页业务请求是否 200 出真实数据(不是 toast 网络异常 / 空表默认态),且请求 URL 指向正确后端端口

---

## 2. 高级附录

### 附录 A. wujie 通信契约清单

> **历史条目，Superseded by ADR-047 / 附录 O**。不得以本附录表格作为新接入验收依据。

> ⚠ **wujie 1.x 关键约束(Spike 实证 2026-05-06)**:
> 1. props **不是 reactive**(官方文档明确未实现响应式)→ 主应用后续改 props 不会推到子应用
> 2. **没有原生 ttl 配置**(20+ 个 startApp 选项里无 `ttl` / `aliveTtl` / `degradeAttrs.ttl`)→ 4h 销毁必须应用层自实现
> 3. `bus` 从 wujie 核心包导入(`import { bus } from 'wujie'`),`wujie-react` 不 re-export

| 通道 | 方向 | payload | 用途 |
|---|---|---|---|
| `props.token` | 主 → 子 | `string` | BP SSO JWT 初始注入(prod 唯一信任源) |
| `props.plantCode` | 主 → 子 | `string` | 当前工厂初始上下文(后续切工厂走 bus) |
| `bus.subapp-auth-expired` | 子 → 主 | `{ from: appName, reason }` | 401 通知主应用跳登录 |
| `bus.plant-changed` | 主 → 子 | `{ plantCode }` | 切工厂广播,**plantCode 真理源** |
| `bus.<appName>-router-change` | 子 → 主 | `{ path }` | 子应用内部路由变化(老桥接,可选;wujie sync=true 后实际不需要) |
| 路由 sync | 双向自动 | — | wujie `sync=true` 主子路由自动同步,0 代码 |

**bus 命名约定**:全 kebab-case;允许 `<scope>-<noun>-<verb>` 三段式(子应用主动通知,需带来源 scope,如 `subapp-auth-expired`)或 `<noun>-<state/verb>` 二段式(主应用全局广播,如 `plant-changed`)。范本:子→主用 `subapp-<noun>-<verb>` 标识来源;主→子用 `<noun>-<state>` 状态广播;子应用内部路由通知用 `<appName>-router-change` 区分应用。

#### A.1 历史 G 方案 postMessage 契约(迁移期兼容)

> **历史过渡协议，Superseded by ADR-047 / 附录 O**。其中 URL hash token 与无版本消息不得进入新发布包。

> 上表是 wujie 历史方案。BP 曾于 2026-05-07 切到 **G 方案(原生 iframe + URL hash token + postMessage)**；以下仅记录当时契约，现行实现见步骤 7-10 与附录 O。

| 通道 | 方向 | payload | 用途 | 子应用必做 |
|---|---|---|---|---|
| URL hash `#sso_token=&plant=` | 主 → 子 | string | iframe 初始 token + 工厂注入(子应用入口解析后清 hash) | 入口 `bootstrapAuthContext` 解析 |
| `postMessage subapp-router-change` | 主 → 子 | `{ type, subPath }` | BP 点菜单 → 子应用 `navigate(subPath)`(iframe 不重 mount) | **监听 + navigate(头号易漏)** |
| `postMessage plant-changed` | 主 → 子 | `{ type, plantCode }` | 切工厂 → 子应用更新 `__bp_plant_code__` | 监听 + 更新工厂码 |
| `postMessage cross-subapp-navigate` | 子 → 主 | `{ type, target, subPath }` | 跨子应用跳转(子应用发 `window.parent.postMessage`) | 需要跨应用跳时实现发送端 |

**校验**:子应用监听端必须校验 `event.origin`(白名单 BP origin + `localhost:8002`),拒绝非白名单消息。

---

### 附录 B. token 信任链 dev/prod 分流

> **历史实现，Superseded by ADR-047 / 附录 O**。生产子应用不得持久化 BP JWT，也不得直接决定 BP 退出登录。

| 环境 | 优先级 | 实现 |
|---|---|---|
| dev (`import.meta.env.MODE === 'development'`) | `$wujie.props.token` > `localStorage[TOKEN_KEY]` | axios 拦截器双 fallback,支持子应用独立调试 |
| prod | `$wujie.props.token` ONLY | 不读 cookie / localStorage,防跨子应用 token 泄漏;props 缺失主动 throw + emit bus |

**完整代码示例**(参考 MDM `AI.REACT.MDM.1/src/utils/request.js`):

```js
import { message } from 'antd';
import axios from 'axios';

const isDev = import.meta.env.MODE === 'development';
const DEV_TOKEN_KEY = '__bp_sso_token__';
const APP_NAME = 'mdm'; // 子应用标识

const instance = axios.create({ timeout: 180000 });

instance.interceptors.request.use((config) => {
  let token = window.$wujie?.props?.token;

  if (!token && isDev) {
    token = localStorage.getItem(DEV_TOKEN_KEY); // dev fallback
  }

  if (!token && !isDev) {
    // prod 硬断言:props.token 缺失即拒发请求 + 通知主应用
    if (window.$wujie?.bus) {
      window.$wujie.bus.$emit('subapp-auth-expired', {
        from: APP_NAME,
        reason: 'no-token',
      });
    }
    // 用 Promise.reject + axios.Cancel,上层业务 catch 通过 axios.isCancel(err) 判断跳过错误 toast
    return Promise.reject(new axios.Cancel('[' + APP_NAME + '] No SSO token in props'));
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

instance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (window.$wujie?.bus) {
        window.$wujie.bus.$emit('subapp-auth-expired', {
          from: APP_NAME,
          reason: '401',
        });
      } else if (isDev) {
        window.location.href = '/login'; // 独立 dev 模式 fallback
      }
    }
    return Promise.reject(err);
  }
);

export default instance;
```

**prod build 防 localStorage 残留检查**(postbuild 脚本):

```js
// scripts/generate-manifest.mjs 内追加 dead code elimination 检查
const TOKEN_KEY = '__bp_sso_token__';
// 递归扫描 dist/assets/ 下所有 .js 文件,grep TOKEN_KEY 应 0 命中
// 命中即报告(Vite tree-shaking 未生效)
```

---

### 附录 C. IP allowlist 中间件实装(.NET 8 示例)

> ⚠ **跨进程鉴权语境**:`/manifest` endpoint 没有 user JWT(server-to-server 调用),改用 IP 单边鉴权;其他 endpoint 仍严守 `[Authorize]`(参见 ADR-006 / ADR-007)。

**中间件示例**(参考 MDM `MDMWebApi/Middleware/SubAppManifestIpAllowlistMiddleware.cs`):

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace SubApp.Middleware;

/// <summary>
/// 子应用 manifest IP 白名单中间件 — 跨进程鉴权(server-to-server)
///   - 仅对 manifest 路径生效,其他 endpoint 走 [Authorize]
///   - dev 环境自动放行 localhost
///   - prod 环境精确 IP 匹配 Configuration["SubAppManifest:AllowedIPs"]
///   - 非 allowlist 返回 403
/// </summary>
public class SubAppManifestIpAllowlistMiddleware
{
    private const string ProtectedPath = "/<base>/manifest"; // 替换为实际路径
    private static readonly string[] DevLocalhostIps = { "127.0.0.1", "::1", "::ffff:127.0.0.1" };

    private readonly RequestDelegate _next;
    private readonly string[] _allowedIps;
    private readonly bool _allowLocalhost;

    public SubAppManifestIpAllowlistMiddleware(
        RequestDelegate next,
        IConfiguration config,
        IWebHostEnvironment env)
    {
        _next = next;
        _allowedIps = config.GetSection("SubAppManifest:AllowedIPs").Get<string[]>()
            ?? System.Array.Empty<string>();
        // dev 自动放行 localhost;prod 部署时通过环境变量显式配置 AllowedIPs
        _allowLocalhost = env.IsDevelopment()
            || config.GetValue<bool>("SubAppManifest:AllowLocalhost", false);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments(ProtectedPath))
        {
            await _next(context);
            return;
        }

        var remoteIp = context.Connection.RemoteIpAddress?.ToString();
        var devLocalhost = _allowLocalhost && remoteIp != null
            && System.Array.IndexOf(DevLocalhostIps, remoteIp) >= 0;
        var inAllowlist = remoteIp != null
            && System.Array.IndexOf(_allowedIps, remoteIp) >= 0;

        if (!devLocalhost && !inAllowlist)
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsync($"IP not in allowlist: {remoteIp}");
            return;
        }

        await _next(context);
    }
}
```

**注册位置**(`Program.cs`,**`UseAuthorization()` 之前**调用):

```csharp
app.UseRouting();
app.UseMiddleware<SubAppManifestIpAllowlistMiddleware>(); // ← 在 UseAuthorization 之前
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

**`appsettings.json` 配置**(入仓版本,IP 留空):

```json
{
  "SubAppManifest": {
    "AllowedIPs": [],
    "AllowLocalhost": false
  }
}
```

> ⚠ **不要把真实 IP 写入仓**:`appsettings.json` 入仓版本 `AllowedIPs` 一律留空数组。具体 IP 通过 prod 环境变量 `SubAppManifest__AllowedIPs__0` / `__1` 注入(.NET Configuration 数组语法)。或者拆 `appsettings.json`(空)+ `appsettings.Production.json.example`(模板,实际 prod 文件加 `.gitignore`)两段。

**MenuController 示例**(`[AllowAnonymous]` 标记):

```csharp
[Route("<base>/menu")]
[ApiController]
public class MenuController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    public MenuController(IWebHostEnvironment env) => _env = env;

    /// <summary>
    /// 返回菜单元数据 manifest JSON。
    /// prod 优先读 wwwroot/menu-manifest.json;dev fallback 到 menu-manifest.dev.json。
    /// 鉴权例外:由 SubAppManifestIpAllowlistMiddleware 单边 IP 白名单接管。
    /// </summary>
    [AllowAnonymous]
    // ⚠️ ABP/Furion(UnifyResult)项目必加 [NonUnify] 豁免全局响应包装,否则裸 JSON 被包 {statusCode,data} → ScanMenus 拉空(2026-06-18 TPM)
    // [NonUnify]  // using <Unify 命名空间>,如 JY.Framework.AspNetCore.UnifyResult;prod 缺文件分支用 return StatusCode(503) 而非 throw(throw 走异常 filter 仍被包)
    [HttpGet("manifest")]
    public IActionResult GetManifest()
    {
        var wwwroot = Path.Combine(_env.ContentRootPath, "wwwroot");
        var prodPath = Path.Combine(wwwroot, "menu-manifest.json");

        if (System.IO.File.Exists(prodPath))
            return Content(System.IO.File.ReadAllText(prodPath), "application/json");

        if (_env.IsDevelopment())
        {
            var devPath = Path.Combine(wwwroot, "menu-manifest.dev.json");
            if (System.IO.File.Exists(devPath))
                return Content(System.IO.File.ReadAllText(devPath), "application/json");

            return StatusCode(503,
                "menu-manifest 不存在 — 请先 build 前端或创建 dev fallback。");
        }

        // prod fail-fast:部署遗漏 wwwroot 复制步骤
        throw new InvalidOperationException(
            "menu-manifest.json 在 prod 环境不存在 — 部署遗漏。");
    }
}
```

---

### 附录 D. CI/CD 集成

**子应用 build pipeline**:

1. `pnpm install`
2. `pnpm build`(触发 postbuild 自动生成 menu-manifest.json,3 路径同步)
3. 部署产物上传到子应用服务器(包含 wwwroot/menu-manifest.json)
4. 重启子应用进程

**应用中心同步流程**:

| 模式 | 触发 | 实现 |
|---|---|---|
| **手动**(本期默认) | 管理员点击 "扫描菜单" 按钮 | `SubAppController.ScanMenus(subAppId)` server-to-server 拉 manifest |
| **自动**(spec v2) | CI 部署完成 webhook 通知 | SignalR / 消息队列推送给应用中心,自动触发 ScanMenus |

**生成 manifest 脚本示例**(参考 MDM `AI.REACT.MDM.1/scripts/generate-manifest.mjs`):

```js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ROUTES } from '../src/routes.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, '..');
const BACKEND_WWWROOT = resolve(FRONTEND_ROOT, '..', '<backend-name>', 'wwwroot');

const manifest = {
  AppName: '<appName>',
  RootName: '<用户可见的应用根名称>',
  Menus: ROUTES
    .filter((r) => r.authCode != null)
    .map((r) => ({
      Code: r.authCode,
      Name: r.menuName,
      Path: r.manifestPath ?? null,
      Icon: r.icon ?? null,
      Children: r.children ?? null,
    })),
};

const manifestJson = JSON.stringify(manifest, null, 2);

// 输出 1:前端 dist
const distDir = resolve(FRONTEND_ROOT, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
writeFileSync(resolve(distDir, 'menu-manifest.json'), manifestJson, 'utf8');

// 输出 2 / 3:后端 wwwroot prod + dev fallback
if (!existsSync(BACKEND_WWWROOT)) mkdirSync(BACKEND_WWWROOT, { recursive: true });
writeFileSync(resolve(BACKEND_WWWROOT, 'menu-manifest.json'), manifestJson, 'utf8');
writeFileSync(resolve(BACKEND_WWWROOT, 'menu-manifest.dev.json'), manifestJson, 'utf8');

console.log(`[generate-manifest] OK — ${manifest.Menus.length} 条菜单写入 3 个文件`);
```

`package.json` 配置:

```json
{
  "scripts": {
    "build": "vite build",
    "postbuild": "node scripts/generate-manifest.mjs",
    "build:manifest": "node scripts/generate-manifest.mjs"
  }
}
```

---

### 附录 E. 性能调优(wujie alive 内存兜底 ttl 自实现)

> **历史实现，Superseded by ADR-047 / 附录 O**。以下 Wujie 宿主、token props 与 destroyApp 示例不得用于新接入；现行宿主使用登记 iframe、内存上下文和 v1 会话清理。仅通用的分页、虚拟滚动、懒加载和资源清理建议仍可参考。

> ⚠ wujie 1.x **没有原生 ttl** — 4h 销毁必须应用层 setInterval + lastInteractionRef 自实现。

**SubAppHost 组件示例**(主应用一侧):

```jsx
import WujieReact from 'wujie-react';
import { useState, useRef, useEffect, useMemo } from 'react';

// 错误兜底组件最小实现(自行实现,推荐含 retry 按钮)
function ErrorFallback({ error }) {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p style={{ fontSize: 16 }}>子应用加载失败</p>
      <p style={{ color: '#999', wordBreak: 'break-all' }}>{error?.url}</p>
      <p style={{ color: '#c00' }}>{error?.err?.message}</p>
      <button onClick={() => window.location.reload()}>刷新重试</button>
    </div>
  );
}

export default function SubAppHost({ appName, fullUrl, plantCode, token }) {
  const [error, setError] = useState(null);
  const lastInteractionRef = useRef(Date.now());
  const wujieInstanceRef = useRef(null);

  // url 重算锁:仅 fullUrl/appName/plantCode 变化才重算,子应用内部跳转不触发
  const wujieUrl = useMemo(
    () => `${fullUrl}`,
    [fullUrl, appName, plantCode]
  );

  // props useMemo 稳定引用,防止 wujie 误判 remount
  const wujieProps = useMemo(
    () => ({ token, plantCode }),
    [token, plantCode]
  );

  // 应用层 ttl:4h 未交互主动销毁
  useEffect(() => {
    const TTL = 4 * 60 * 60 * 1000; // 4h
    const interval = setInterval(() => {
      if (Date.now() - lastInteractionRef.current > TTL) {
        window.__POWERED_BY_WUJIE__?.destroyApp?.(appName);
        lastInteractionRef.current = Date.now(); // 重置防重复触发
      }
    }, 60 * 1000); // 每分钟检查
    return () => clearInterval(interval);
  }, [appName]);

  // 用户交互更新 lastInteractionRef
  useEffect(() => {
    const events = ['click', 'keydown', 'scroll', 'touchstart'];
    const handler = () => { lastInteractionRef.current = Date.now(); };
    events.forEach(e => window.addEventListener(e, handler));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, []);

  if (error) return <ErrorFallback error={error} />;

  return (
    <WujieReact
      name={appName}
      url={wujieUrl}
      sync={true}
      alive={true}
      degrade={false}
      props={wujieProps}
      loadError={(url, err) => setError({ url, err })}
      afterMount={(appWindow) => { wujieInstanceRef.current = appWindow; }}
    />
  );
}
```

**子应用内存优化建议**:

- 大型 state 优先 `store2` / `sessionStorage` 持久化,而非 React state
- 列表分页 + 虚拟滚动(antd `Table` `virtual` prop)
- 图表懒加载(`React.lazy` + `Suspense`)
- 销毁回调清理 setInterval / setTimeout / WebSocket 连接

---

### 附录 F. dev 环境联调

> **历史实现，Superseded by ADR-047 / 步骤 9**。禁止把 BP JWT 写入 localStorage，也不得以 Wujie fallback 作为新接入调试方案；现行独立/嵌入调试按步骤 9 使用内存 provider 与完整 v1 握手。

**A 模式:子应用独立调试**

```bash
# 1. 启动子应用
cd <subapp-frontend>
pnpm dev  # 默认端口,如 :3000

# 2. 浏览器访问 http://localhost:3000
# 3. Console 塞 token
localStorage.setItem('__bp_sso_token__', '<dev-jwt>');
# 4. 刷新页面,所有接口走 dev 后端
```

**B 模式:wujie 嵌入调试**

BP `vite.config.js` 加 proxy 转发:

```js
export default defineConfig({
  server: {
    port: 8002,
    proxy: {
      '/<appName>': {
        target: 'http://localhost:3000', // 子应用 dev server
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/<appName>/, ''),
      },
    },
  },
});
```

或子应用配 `degradeAttrs.alive=false` + dev fallback localStorage token。

**子应用 dev server CORS 配置**:

```js
// 子应用 vite.config.js
export default defineConfig({
  server: {
    cors: {
      origin: ['http://localhost:8002'], // BP dev server
      credentials: true,
    },
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:8002',
    },
  },
});
```

---

### 附录 G. 多租户(子应用按 plantCode 区分数据源)

> **历史实现，Superseded by ADR-047 / 附录 O.1-O.2**。以下 `$wujie.props.plantCode` 与 `plant-changed` bus 只解释旧实现；现行 token/PlantCode 必须由 `bp-context-sync` 原子下发并 ACK，请求从同一 context snapshot 构造。

**子应用接口携带 plantCode**:

```js
// axios 拦截器(在 token 拦截器后追加)
instance.interceptors.request.use((config) => {
  // plantCode 从 props 读取(初始注入)+ bus 监听更新
  const plantCode = window.$wujie?.props?.plantCode;
  if (plantCode) {
    config.headers['X-Plant-Code'] = plantCode;
  }
  return config;
});

// bus 监听切工厂(plant-changed 真理源)
let plantChangedHandler = null;

export function setupPlantChangedListener() {
  if (!window.$wujie?.bus || plantChangedHandler) return;
  plantChangedHandler = ({ plantCode }) => {
    instance.defaults.headers.common['X-Plant-Code'] = plantCode;
    // 可选:emit 内部事件触发列表/详情数据重拉
  };
  window.$wujie.bus.$on('plant-changed', plantChangedHandler);
}

export function teardownPlantChangedListener() {
  if (!window.$wujie?.bus || !plantChangedHandler) return;
  window.$wujie.bus.$off('plant-changed', plantChangedHandler);
  plantChangedHandler = null;
}

setupPlantChangedListener(); // 模块级自动 setup(BP 嵌入场景下立即生效)
```

**子应用 service 层 plantCode 路由**(可选):

- 单数据源 + plantCode 列过滤(默认推荐)
- 多数据源连接池 + plantCode 路由(高隔离需求,如客户独立 DB 实例)

---

### 附录 H. 跨子应用通信(spec v2,本期不实装)

> **历史占位，Superseded by ADR-047**。不得新增 Wujie bus 通信；当前跨应用导航走受信 iframe 上报、BP 按当前账号/组织授权裁决的 v1 消息，新的全局广播仍需独立 spec。

占位 — 留待后续 spec:

- 子应用 A 跳子应用 B 菜单(`bus.$emit('navigate', { appName: 'srm', path: '/order/123' })`)
- 主应用广播事件给所有子应用(`bus.$emit('global-refresh')` → 子应用各自处理)
- 子应用间状态共享(慎用,违反低耦合原则;优先回主应用聚合层中转)

---

### 附录 I. MDM 接入实战(模板示例)

> **历史模板，认证与宿主部分 Superseded by ADR-047 / 附录 O**。MDM 的 manifest、IP allowlist 和生成链仍可参考；下列 Wujie token/401 bus 与 `WujieReact` 宿主代码不得 1:1 复制。新应用必须按步骤 7-10 实装 v1。

MDM 子应用是 manifest 与 IP allowlist 的参考实现；认证桥与 BP 宿主以当前 BP/MDM v1 代码为准。

**仓库结构**:

```
AI.Extend.MDM.1/                   # 后端
├── MDMWebApi/
│   ├── Controllers/
│   │   └── MenuController.cs      # /mdmapi/menu/manifest endpoint
│   ├── Middleware/
│   │   └── SubAppManifestIpAllowlistMiddleware.cs  # IP 白名单
│   ├── Program.cs                 # 中间件注册位置
│   └── wwwroot/
│       ├── menu-manifest.json     # prod 主文件(前端 build 产物)
│       └── menu-manifest.dev.json # dev fallback

AI.REACT.MDM.1/                    # 前端
├── src/
│   ├── routes.config.mjs          # 28 路由真理源(authCode + menuName + path + icon)
│   ├── utils/
│   │   └── request.js             # axios 拦截器(token 信任链 + 401 bus + plant-changed)
│   └── App.jsx                    # 业务路由
├── scripts/
│   └── generate-manifest.mjs      # postbuild 生成 manifest(3 路径同步)
└── package.json                   # postbuild hook
```

**关键配置点**:

| 配置点 | 文件 | 内容 |
|---|---|---|
| 后端中间件注册 | `Program.cs` | `app.UseMiddleware<SubAppManifestIpAllowlistMiddleware>()` 在 `UseAuthorization` 之前 |
| 后端 manifest endpoint | `Controllers/MenuController.cs` | `[AllowAnonymous] [HttpGet("manifest")]` |
| 后端 wwwroot 配置 | `Program.cs` | `app.UseStaticFiles()` 启用 |
| 后端 IP 白名单配置 | `appsettings.<env>.json` | `SubAppManifest:AllowedIPs` 数组 |
| 前端 axios 拦截器 | `src/utils/request.js` | dev/prod token 信任链 + bus 401/plant-changed |
| 前端 manifest 生成 | `scripts/generate-manifest.mjs` | 3 路径同步:dist + 后端 wwwroot prod + dev |
| 前端 build hook | `package.json` | `"postbuild": "node scripts/generate-manifest.mjs"` |
| 前端路由真理源 | `src/routes.config.mjs` | 28 路由 + authCode + menuName |

**主应用 BP 引用方式**(参考 `AI.REACT.SYS.BusinessPortal/src/components/SubAppHost.jsx`):

```jsx
// BP 路由配置(routes.jsx)
const routes = [
  { path: "/login", element: <Login /> },
  { path: "/", element: <AuthRoute><Workbench /></AuthRoute> },
  { path: "/placeholder/:appId", element: <AuthRoute><Placeholder /></AuthRoute> },
  { path: "/bp/*", element: <AuthRoute><Placeholder appId="bp" /></AuthRoute> },
  { path: "/:appName/*", element: <AuthRoute><SubAppHost /></AuthRoute> }, // 通配兜底
];

// SubAppHost 组件内
const { apps, appsLoading } = useApps();
const { appName } = useParams();
const app = apps?.find(a => a.appName === appName);
const fullUrl = app?.fullUrl;

return <WujieReact name={appName} url={fullUrl} sync alive degrade={false} props={{ token, plantCode }} />;
```

---

### 附录 J. 三条件 LEFT JOIN(BP 菜单可见性)

> **现行有效**：本附录只定义 BP 菜单/组织授权可见性，不传递 JWT，也不替代 BpSubAppBridge v1。认证上下文与 iframe 消息仍以步骤 7-10、附录 O 和 ADR-047 为准。

**业务约束**:BP 用户只能看到「已上线 + 自己工厂可访问」的子应用菜单。

**SQL 逻辑**(后端 `AuthInfoQueryService.List` BP 分支):

```sql
SELECT a.*
FROM SYS_AuthInfo a
LEFT JOIN SYS_SubApp s ON a.AppName = s.AppName  -- CI 排序规则自动忽略大小写
LEFT JOIN SYS_SubAppOrgAccess o ON s.Id = o.SubAppId
WHERE
  (a.AppName IS NULL)  -- 平台菜单(Console)无条件返回
  OR (
    s.PublishStatus = 'online'
    AND s.IsActive = 1
    AND o.IsActive = 1
    AND o.PlantCode = @plantCode
    AND s.AppName IS NOT NULL
  )
```

**应用层 HashSet 兜底**(防 prod CS 排序规则):

```csharp
// AuthInfoQueryService.cs BP 分支
var allowedAppNames = onlineSubApps
    .Where(s => s.IsActive && s.AppName != null)
    .Select(s => s.AppName!)
    .ToHashSet(StringComparer.OrdinalIgnoreCase); // 应用层兜底大小写忽略

var menuTree = allAuthInfos
    .Where(a => a.AppName == null || allowedAppNames.Contains(a.AppName))
    .ToList();
```

**断链场景排查表**:

| 现象 | 排查点 |
|---|---|
| 子应用菜单完全不显示 | SubApp.PublishStatus 是否 `online`? |
| 部分工厂用户看不到 | `SYS_SubAppOrgAccess` 是否含用户 plantCode + IsActive=true? |
| 切换工厂菜单不变 | BP 是否重拉 BpApps/menuTree，并通过 v1 `bp-context-sync` 下发新 token/PlantCode 且收到 ACK? |
| 大小写敏感断链 | DB 排序规则:CI(默认)自动忽略;CS 必须实体 setter `ToLower()` + 应用层 HashSet OrdinalIgnoreCase |

---

### 附录 K. BP 容器层 React 陷阱清单(踩坑沉淀)

> 后续接入 SRM/WMS/MES 等子应用时**容器层 BpLayout / TabsContext / SubAppHostPool 不再大改**,仅子应用本体改造。本附录列已发现的容器层陷阱,**接入新子应用前先扫一遍代码确认这些陷阱没回归**。

#### K.1 useEffect deps 误填导致状态被覆盖(2026-05-08 BP 菜单 2 天踩坑)

**反模式**:
```jsx
// TabsContext.jsx — 启动恢复 Tab 列表
const navigate = useNavigate();
useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    // ... 读 localStorage 旧值 setTabs([WORKBENCH_TAB, ...businessTabs])
}, [navigate]);  // ❌ deps 写 [navigate]
```

**根因链**:
1. React Router 6 的 `useNavigate()` 在 `location` 变化后**返回新函数引用**(内部依赖 NavigationContext)
2. 用户点新菜单 → openTab 设新 Tab + setActiveKey + `navigate(path)` → location 变化
3. → BpLayout 重 render → TabsProvider 重 render → useNavigate 返回新引用
4. → `useEffect [navigate]` deps 变化 → effect 重跑
5. → 读 localStorage **旧值**(写入 effect 还没跑) → `setTabs([WORKBENCH_TAB, ...旧 Tab 列表])`
6. → 覆盖刚 openTab 设的新 Tab → React diff 发现新 Tab 消失 → unmount 新 iframe
7. **症状**:点新菜单后页面空白,需要再点一次同菜单(此时 localStorage 已写入新 Tab)才显示

**正确写法**:
```jsx
useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    // ... mount 时一次性恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);  // ✅ 空 deps,只 mount 时跑一次
```

**判断规则**:
- effect 体内**未使用 navigate** → deps 必空数组,加 eslint-disable 注释
- effect 体内**实际使用 navigate**(如 navigate('/login'))→ 用 `useRef(navigate)` + 空 deps,避免 effect 在 navigate 变化时重跑
- **任何"启动恢复 / mount-once 副作用"**都必须空 deps

#### K.2 React.StrictMode 双 mount 让 iframe.onLoad 不触发

**反模式**:
```jsx
// main.jsx
ReactDOM.createRoot(...).render(
  <React.StrictMode>  // ❌ dev 双 mount
    <App />
  </React.StrictMode>
);
```

**根因**:
- Strict Mode 在 dev 让组件经历 `mount → unmount → remount` 模拟副作用清理
- iframe DOM 第一次 mount 后 `src` 设置 → 浏览器开始 fetch
- Strict Mode unmount → iframe DOM 销毁 → fetch 中断 → `onLoad` 永不触发
- Strict Mode remount → 新 iframe + `src` 设置 → 但浏览器认为是同一 src 重复请求 → `onLoad` 也可能不触发
- 结果:`iframeLoaded` 永远 false,Spin 卡住

**修法**:**dev 关掉 Strict Mode**(prod 本来就没)
```jsx
ReactDOM.createRoot(...).render(<App />);
```

**为啥不用 Strict Mode 的"标准"修法**:
- 让 iframe 脱离 React lifecycle(`useRef + useEffect` imperative 创建)— 大改动 ~150 行
- 接受"Strict Mode 关掉 → 失去 dev 副作用检测"的代价 — BP 容器复杂度低,可接受

#### K.3 React Fragment 子节点数量不稳定导致整树 unmount/remount

**反模式**:
```jsx
function PreloadHost() {
    const { apps } = useApps();  // 异步加载
    if (apps.length === 0) return null;  // ❌ 渲染从 null 变 <div>
    return <div>{...preload iframes...}</div>;
}

function SubAppHostPool() {
    return (
        <>
            <PreloadHost />            {/* 0 → 1 个元素 */}
            <div>{业务 iframe pool}</div>  {/* React diff 时位置错乱 */}
        </>
    );
}
```

**根因**:
- `apps` 异步加载,加载前 PreloadHost return null,加载后 return `<div>`
- React Fragment 子节点数量从 1 变 2 → diff 算法把 `<div>{业务 iframe pool}</div>` 当成新元素
- → 业务 iframe pool 整体 unmount + remount → iframe 加载中断

**修法**:**Fragment 子节点必须数量稳定**
```jsx
function PreloadHost() {
    const { apps } = useApps();
    return (
        <div style={{ display: 'none' /* 或绝对定位 hidden */ }}>
            {apps.length > 0 && apps.map(...)}
        </div>
    );  // ✅ 永远返回 <div>,内部条件渲染
}
```

#### K.4 跨子组件 React bug 必须配 mount/render trace + 自动化复现

**反模式**:
- 浏览器肉眼看 console + 截屏诊断
- 在子组件层(SubAppHostPool / iframe)反复改方案
- 涛哥肉眼一次只看一个截屏,**第二次 render 缺某子组件日志这种关键证据看不出来**

**正确流程**:
1. **每个关键组件加 `[XXX-DIAG] render` trace**(mount/render/unmount/state 关键值)
2. 加 mount age = `Date.now() - mountTimeRef.current` 看是否 unmount/remount
3. **配 Playwright 全自动复现**(headless,跑出完整 console 时间线)
4. **看缺失的 render 日志** — 第二次 render 缺某子组件 = 该子组件被 unmount 的硬证据

#### 自检清单 —— BP 容器层(新子应用接入前)

- [ ] BpLayout / TabsContext / 任何 Provider 的 useEffect deps 不含 `[navigate]` `[location]` 等不稳定引用
- [ ] main.jsx 没用 `<React.StrictMode>` 包裹 BP 容器(子应用本体不限)
- [ ] SubAppHostPool 任何 Fragment 子节点数量在所有 state 下保持稳定(用占位 div + 内部条件渲染)
- [ ] 容器层未使用 React 18 `useTransition` / `useDeferredValue` 包业务 Tab 切换(可能引入新一轮 unmount/remount)

#### 自检清单 —— 子应用侧 BpSubAppBridge v1(接入/迁移前必扫)

- [ ] **v1 握手已实装**:先注册 listener，再发送 `subapp-ready`；收到原子上下文后回 `subapp-context-applied` ACK，未 ACK 前不发业务请求
- [ ] **精确信任边界**:子应用校验 `event.source === window.parent` 与 exact origin；BP 绑定登记 iframe 的 `contentWindow + origin`
- [ ] **路由与会话消息已实装**:`bp-route-sync` 驱动内部路由，`bp-session-clear` 清内存并阻止请求
- [ ] **生产嵌入无 JWT 副本**:iframe URL/hash、localStorage、sessionStorage、cookie、IndexedDB 和日志都不写 BP JWT
- [ ] **全部 service baseURL 显式指向后端**:`grep -L "baseURL\|VITE_" src/service/*` 必为空;dev vite proxy 会兜底掩盖缺失,**production iframe 无 proxy 必网络异常**(对照已知正确的 service 逐文件核)
- [ ] **嵌入模式隐藏自带 chrome**:iframe/wujie 嵌入时**在 layout 层**按 `isEmbedded`(`__POWERED_BY_WUJIE__` / `window.self!==window.top`)门控,不渲染子应用自己的 Header/Sider/Footer/退出登录(避免双层外框 + 空 Sider 留白 + 多余退出登录)。范本 `AI.REACT.SRM.Contract.2/src/layout/index.jsx`。⚠️ token 仅出现在 `index.jsx` 入口不算 —— 必须是 layout 真隐藏外壳(钩子 2026-05-24 已层级化,见 ADR-012 修订)
- [ ] **menu-manifest 的 Path 与 React Router path 逐条匹配**
- [ ] **manifest API + IP allowlist 中间件**(步骤 2)
- [ ] **验收在真实 BP iframe + production-like 环境逐菜单跑**(禁 dev proxy / 单应用直访假通过,见步骤 10 强约束)

> **机械自检工具(历史辅助)**:`node ~/.claude/hooks/subapp-frontend-guard.js --check <子应用前端仓>`仍可检查 service baseURL、历史 postMessage 路由、嵌入 chrome 与 E2E production，但它不证明 v1 ready/ACK、精确 source/origin 或内存态 JWT 已正确实现；v1 必须另走代码评审与真实 BP E2E。完整对照表 + 端到端链路清单见 `templates/subapp-migration-checklist.md`。

---

### 附录 L. 独立站点后端 prod CORS(前端 BP 跨域调后端独立站点)

> 2026-06-18 TPM B 方案沉淀。**前端挂 BP(:8002)+ 后端独立 IIS 站点(TPM CoreTPMWebApi:5030 / MDM-Api:5026 / SRM BuyerApi:5028)= 跨域**,后端必须配 prod CORS,否则浏览器拦所有业务请求。附录 F 的 dev server CORS **不覆盖 prod**。

**后端(.NET)CORS 注册**(ABP 在 Module / 非 ABP 在 Program):
- `AddCors` policy `WithOrigins(读 App:CorsOrigins)` + `AllowAnyHeader/AllowAnyMethod` + **`AllowCredentials()`**(JWT 跨域必需);`UseCors` 在 `UseRouting` 之后、`UseAuthentication/UseAuthorization` 之前。
- ⚠️ `AllowCredentials` 与 `AllowAnyOrigin('*')` **互斥** → 必须 `WithOrigins(具体 BP 来源)`,不能 `*`。
- `appsettings App:CorsOrigins` 加 BP 来源(如 `http://172.21.10.8:8002`);入仓留占位/本地值,prod 经 env 覆盖。

**前端寻址**(独立站点跨域):前端 host 映射**拆两个变量** —— ①后端 API host(独立站点 `host:port` 绝对 URL)②BP 门户 host(Static/i18n/子应用资源,prod 留空=相对同源)。业务 API 指后端独立站点,门户资源走相对;**勿共用一个 host 变量**(否则 Static/i18n 跟着错指后端站点 404)。

**验收(CR HIGH + 真机)**:从 BP origin 跨域打带 JWT 的 `[Authorize]` 业务端点,断言响应头 `Access-Control-Allow-Origin: <BP来源>`(精确非 `*`)+ `Access-Control-Allow-Credentials: true` 回写 + 业务 200。**只验 swagger 200 证明不了跨域链路**(swagger 同源无 CORS)。TPM 2026-06-18 真机实证:`acao=http://172.21.10.8:8002 + acac=true`。

---

### 附录 M. 子应用后端 JWT 签名 key 与 SYS 同族对齐(验 BP token)

> 2026-06-18 TPM B 方案沉淀。BP 业务请求带的是 **SYS 签发的 BP token**(BP 登录走 SYS `OAuthController`,HS256,claims `iss=aud=JYInfo`+PlantCode+LoginUserName)。子应用后端 `[Authorize]` 必须用**与 SYS 同族的签名 key** 验签,否则 **CORS 全对、token 全带,业务请求仍 401**(附录 L 与本附录是 BP 业务 200 的两道独立闸门:CORS 过 ≠ 鉴权过)。

**规则**:
- 子应用后端验签 key(`JwtOptions:SecurityKey` → `IssuerSigningKey`)必须 == SYS 签发 BP token 的 key(JY 同族共享)。**勿沿用脚手架/模板默认值** —— TPM 首落地即因 `SecurityKey` 抄自老仓模板残值致**全量业务 401**(CORS/token 链全对,极易误判)。
- `ValidIssuer`/`ValidAudience` 也须 = SYS 签发值(默认 `JYInfo`);`ValidateLifetime` 默认开。
- 真 key 由 SYS 运行时从 **Consul `Jwt:SecretKey`** 取(子应用仓读不到);基准对照**已工作子应用后端**硬编码 `IssuerSigningKey`(如 MDM `Program.cs`)。明文 key 全族共享属已知 compliance-debt,接入文档不复述明文。
- 字符串编码坑:SYS 签发用 `Encoding.ASCII`、子应用验签常用 `Encoding.UTF8` —— 纯 ASCII 字符 key 两者字节相同无碍;含非 ASCII 字符时须一致。

**确诊/对齐方法(确定性,不依赖 Consul)**：通过隔离测试账号的登录 API 或 BP 顶层运行时内存临时取得 JWT，本地逐 candidate key 重算 HS256(`HMAC-SHA256(header.payload, key)` base64url 比 token 末段 sig)，**命中者即真 key**。禁止从子应用 localStorage 取 token，也禁止把 token 写入日志、截图或文档。

**401 边界取证(不臆测哪一层)**:JwtBearer 把失败原因写进响应 **`WWW-Authenticate`** 头 —— `error_description="The signature key was not found"`=key 错 / `"The token expired"`=过期 / 无该头=没带 token。配 token claims 解码(iss/aud/exp)一次定位是签名 key 还是 iss/aud/exp/缺 token。

**验收(CR HIGH + 真机)**:BP 真机逐菜单 walk,业务 `[Authorize]` 端点返 **200**(非仅 swagger);若 401,先读 `WWW-Authenticate` 头判失败类型再修。TPM 2026-06-18:改回同族 key 后逐菜单 41×业务 200、0 鉴权失败。

---

### 附录 N. 子应用 i18n locale 自托管(中英混杂防坑)

> 2026-06-18 TPM 沉淀。子应用 `i18next-http-backend` 的 `loadPath` 必须指**自己 base**(`import.meta.env.BASE_URL`,如 `/sub-tpm/`)+ **自带 locale 文件**(`public/plugins/i18next/locales/{zh-CN,en-US}/<ns>.json` 随 build 进 dist)。

**反模式**:loadPath 指 BP 门户 `/Static` —— 门户**不服务**任何子应用 locale,返 SPA fallback HTML(非 JSON)→ i18next 解析失败 → **所有 `t()` key 裸显**(硬编码中文部分正常 = 中英混杂)。TPM 首落地即栽于此(状态过滤 `common.all`/`enable`/`disable` 裸显)。

**验收**:部署后 `curl <base>/plugins/i18next/locales/zh-CN/<ns>.json` 必须 `content-type: application/json`(返 `text/html` = 没服务到);SPA `web.config` rewrite 须 `{REQUEST_FILENAME} IsFile negate=true` 放行真实文件 + `.json` MIME。E2E 加 i18n 视觉校验(截图核中文 value,ADR-024 ⑥;Playwright 跨 iframe 读文本不可靠)。详 `frontend-i18n-standard` §4.1 + §6.5。

---

### 附录 O. BpSubAppBridge v1 与单身份多运行时发布标准

> 本附录是生产嵌入的当前标准。认证桥决策依据见 ADR-047，应用家族多运行时发布依据见 ADR-048。旧 Wujie、URL hash token、子应用 localStorage token 和无版本 `postMessage` 仅用于双栈迁移，不得作为新应用终态。

#### O.1 token 与组织上下文

- BP 是 plant-scoped access JWT 的唯一持久拥有者；嵌入子应用只在内存保存当前上下文，不写 localStorage、sessionStorage、cookie、IndexedDB 或 URL。
- BP JWT 的业务 claims 至少包含 `LoginUserName`、`PlantCode`、`BusinessPortalAccess`、`EmpId`、`EmpCode`、签发/受众/到期信息；没有实际员工编号时 `EmpCode` 必须是空字符串，不得省略或伪造。
- 子应用后端必须验证 JWT 签名、issuer、audience、lifetime、`BusinessPortalAccess=true` 与非空 `PlantCode`；显式 `X-Plant-Code` 与 claim 不一致时返回 403。
- 组织切换时 token 与 PlantCode 必须作为同一个原子上下文发送；子应用不得把新 token 与旧 PlantCode 拼接使用。

#### O.2 v1 握手与消息边界

- 消息使用带 `protocol`、`version`、`type`、`appName`、`requestId`、`payload` 的 v1 envelope；requestId 字段始终存在。需要关联应答的 ready/context/ACK/auth-error 使用 UUID；route/session 广播按 schema 允许该字段为空字符串。
- 子应用先发送 `subapp-ready` 和 capabilities；BP 只向已登记 iframe 的精确 `contentWindow` 与 exact origin 发送上下文。子应用应用成功后回 `subapp-context-applied` ACK；未 ACK 不得宣称 v1 ready。
- iframe registry 必须同时满足：当前组织 BpApps 在线、菜单/AuthTag 已授权、`appName` 匹配、消息 `event.source + event.origin` 都命中。仅校验 origin 不足以信任消息。
- `contextVersion` 只在 token/PlantCode 元组变化时递增。请求发起时固化完整 context identity；旧上下文的迟到 401 不得影响新上下文。
- 同一 contextVersion 最多恢复并重发一次认证上下文，绝不自动重放原业务请求。子应用 401 只上报 `subapp-auth-error`；BP 先调用自身会话判活，再决定刷新上下文、给出提示或清理会话，禁止子应用直接把用户“挤下线”。
- 发布顺序：子应用双栈 → BP 双栈 → 真实 iframe 验证 v1 ACK/401/组织切换 → 关闭 legacy 开关 → 删除 legacy。任一步都必须可回滚。

#### O.3 单 AppName 多模块、多运行时

- 只有同时满足以下边界的模块才合并为一个业务家族：授权命名空间一致、审计责任主体一致、租户/组织语义一致、业务负责人及生命周期一致、合规分级一致。任一边界不同，即使业务相关也必须拆成独立 `AppName`；仅“独立发布”本身不构成拆分理由。
- 一个已确认的业务家族在授权和应用中心中保持一个稳定 `AppName`、一个 `SYS_SubApp` 和一个门户根；不同后端或虚拟目录不等于不同子应用身份。
- 每个一级模块可以有独立前端虚拟目录和独立业务后端。BP 依据菜单 AuthTag/运行时映射选择 iframe base；tab/registry key 必须包含实际运行时路径，避免同名内部路由串页。
- 应用中心 `MenuApiUrl` 只指向一个原子聚合 manifest。组件 manifest 可作为内部输入，但不得分别发布成多个门户根。
- 聚合器必须 fail closed：任一组件不可达、`AppName` 不一致、菜单为空或 Code 冲突即返回 503；不得发布半份菜单。跨组件 AuthTag 全局唯一。
- 聚合端只负责菜单结构，不代理其他模块的业务 API。各业务后端独立验 JWT、CORS 和 PlantCode，并独立构建、部署、回滚。
- 组件 manifest、聚合器和 BP 运行时映射必须支持当前版 N 与上一版 N-1。正向顺序：组件后端/虚拟目录 → 聚合 manifest → BP 运行时映射 → SYS 扫描/重发布/上线 → 按既有模块权限补新模块授权 → 真实 BP iframe E2E。
- 回滚顺序：停止新扫描/发布 → 恢复上一版菜单快照或重发 N-1 manifest → 恢复 BP N-1 运行时映射 → 回退聚合器 → 回退组件。任何阶段不得让半份菜单继续在线。

APS 参考实现：`AppName=aps`、门户根“APS高级计划排程”；5041 聚合“计划排程”与“库存分析”两个模块，页面分别运行于 `/aps` 与 `/aps-inventory`，业务 API 分别落到 5041 与 5042。2026-07-15 在 BP 9999 组织实测计划四个主数据页面命中 5041、库存物料页面命中 5042，均为 200，iframe URL 无 JWT，未发生跨后端串线；该证据是功能 happy-path，不等同于 O.4 全协议门禁完成。

#### O.4 发布验收硬门

> APS 当前只完成上述真实 BP 功能 happy-path 与 bridge 单测；ready/ACK requestId、实际 source/origin、伪造消息拒绝、组织切换、iframe reload、401/403/CORS/网络异常等生产证据矩阵仍待补齐。在该矩阵完成前，v2 可作为实现参考，不得宣称所有在线子应用已完成协议推广。

- DB：同一 `AppName` 只有一个 active/online `SYS_SubApp`；manifest 当前菜单与可见菜单一致；授权仅复制给已有家族模块权限的账号/组织组合，不默认扩大范围。
- API：使用同一枚 plant-scoped BP JWT，分别访问每个业务后端的 `[Authorize]` 端点并断言 200；无 token 401，PlantCode 不一致 403。
- Browser：隔离浏览器从 BP 登录目标组织，逐模块点击至少一个真实叶子页；断言 iframe path 指向正确虚拟目录、业务请求命中正确后端、无 4xx/5xx、无 console/page error、未跳回登录页。
- 构建/发布：组件、聚合器、BP 的 CI 全部到达成功终态后，才能执行菜单扫描和授权更新。

---

## 3. 历史与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-07 | 1.0 | 首版落地(Platform spec P-C 同步);MDM 作首个参考实现 |
| 2026-05-08 | 1.1 | 加附录 K — BP 容器层 React 陷阱清单(BP 菜单 2 天踩坑教训沉淀);后续 SRM/WMS/MES 接入前必扫 K.5 自检清单 |
| 2026-05-21 | 1.2 | **手册口径校正 + 防迁移再踩坑**(SRMV2 Contract):步骤 8 改为 G 方案 postMessage 路由同步强制(原"wujie sync 0 代码"已停用,误导致漏监听 → 每菜单同页);附录 A.1 加 G 方案 postMessage 契约表;步骤 10 加 E2 production-like + 逐菜单 + service baseURL 强约束;新增子应用侧 G 方案自检清单 |
| 2026-06-18 | 1.3 | **TPM B 方案沉淀**(首个 ABP+Furion + 后端独立站点跨域子应用):附录 C MenuController 加 ABP/Furion `[NonUnify]` 警示(否则 manifest 被包 `{statusCode,data}` envelope → ScanMenus 拉空,极隐蔽);新增**附录 L 独立站点 prod CORS**(前端 BP + 后端独立站点跨域必需,dev CORS 不覆盖 prod;CORS 头 `acao 精确+acac=true` 真机验收) |
| 2026-06-18 | 1.4 | **新增附录 M 子应用 JWT 签名 key 与 SYS 同族对齐**(TPM P5 实证:`JwtOptions:SecurityKey` 抄模板残值致 CORS/token 全对仍全量业务 401):验签 key 须 == SYS 签发 BP token 的 key(勿用脚手架默认值);真 token 本地 HS256 反推确诊 + `WWW-Authenticate` 头判失败类型;与附录 L CORS 为 BP 业务 200 两道独立闸门 |
| 2026-06-18 | 1.5 | **新增附录 N 子应用 i18n locale 自托管**(TPM 实证:loadPath 指 BP 门户 /Static → SPA fallback → 全 t() key 裸显中英混杂):loadPath 须指子应用自己 base + 自带 locale 文件;部署后 curl 验 application/json;E2E 加 i18n 视觉校验(截图地面真值,ADR-024 ⑥) |
| 2026-07-14 | 2.0 | **ADR-047/048 + 附录 O**：生产嵌入升级为 BpSubAppBridge v1；BP 独占持久 JWT，子应用内存态、精确 source/origin、ready/ACK、版本化上下文与 401 判活；新增单 AppName 多模块/多运行时原子发布标准，并以 APS 5041/5042 双后端真实 BP E2E 作参考实现 |

---

## 4. 关联资源

- [ADR-002:四层文档结构](../decisions/ADR-002-four-layer-doc-structure.md) — Spec / Plan / Tasks / ADR 边界
- [ADR-007:鉴权 4 条刚性](../decisions/ADR-007-auth-4-rigidity.md) — `[Authorize]` / Policy / 权限码 / SSO token
- [ADR-008:端到端交付 8 项核对](../decisions/ADR-008-end-to-end-8-checks.md) — 技术契约 4 + 业务连通 4
- [ADR-047:BP 子应用认证桥 v1](../decisions/ADR-047-bp-subapp-bridge-v1.md) — token/组织上下文、401 判活与 N/N-1 协议迁移
- [ADR-048:应用家族单身份多运行时发布](../decisions/ADR-048-app-family-multi-runtime-publishing.md) — AppName 合并边界、原子 manifest 与发布回滚
- **ADR-006:SubApp 跨进程鉴权 IP allowlist** — 当前为 SYSV2 项目级 ADR(`SYSV2/docs/decisions/ADR-006-...md`,该项目内可达);其他项目接入时**沿用同模式**(IP allowlist 中间件 + 本手册附录 C 范式),若多项目实际接入后存在共性需求,由后续 ADR 升级到本仓 `decisions/`
- [frontend-ui-standard.md](frontend-ui-standard.md) — antd 5 + ProTable 列表页统一标准(子应用 UI 一致性)
- [doc-conventions.md](doc-conventions.md) — spec/plan/ADR 命名约定
