# 子应用接入业务门户(BP)标准手册

> **状态**:Stable v1.0(2026-05-07,与 Platform spec P-C 同步落盘)
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
  "Menus": [
    { "Code": "MdmMaterialList", "Name": "物料档案", "Path": "material/list", "Icon": "DatabaseOutlined", "Children": null },
    { "Code": "MdmCustomerList", "Name": "客户档案", "Path": "customer/list", "Icon": "UserOutlined", "Children": null }
  ],
  "Version": "1.0.0"
}
```

- 字段语义:
  - `Code` → 应用中心 `SYS_AuthInfo.AuthTag`(权限码 1:1 对应)
  - `Name` → 中文菜单名(`SYS_AuthInfo.Name`)
  - `Path` → 子应用内部路由(对应 `SYS_AuthInfo.PageUrl`)
  - `Icon` → 可选,antd Icon 名
  - `Children` → 多级菜单递归;扁平结构留 `null`
- 鉴权:`[AllowAnonymous]` + IP allowlist 中间件(只允许应用中心服务器 IP 访问;参见附录 C)

**完成标志**:
- `curl http://子应用/<base>/manifest` 从应用中心服务器 IP 返回 200 + 合法 JSON
- 同 curl 从其他 IP(如开发者本机)返回 403 + 错误信息

**失败排查**:
- 405 Method Not Allowed → 检查路由方法 `[HttpGet]`
- 500 → 检查 `wwwroot/menu-manifest.json` 是否存在(prod 路径)或 `menu-manifest.dev.json`(dev fallback)
- 403 → 检查 `appsettings.json` 配置 `SubAppManifest:AllowedIPs` 数组是否包含调用方 IP

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

- 子应用 axios 拦截器实装 dev/prod 双链路 token 信任(详见附录 B)
- 关键约束:
  - prod 模式 token 唯一来源 = `window.$wujie?.props?.token`(BP 主应用初始注入)
  - dev 模式 token 优先 `props.token` > fallback `localStorage[__bp_sso_token__]`
  - prod 模式 token 缺失 → 主动 `throw new axios.Cancel()` + emit bus `subapp-auth-expired`(不发后端请求)
  - response 401 → emit bus `subapp-auth-expired`,BP 主应用统一跳登录

**完成标志**:
- dev 模式独立启动子应用 `pnpm dev` + 手动 `localStorage.setItem('__bp_sso_token__', '<jwt>')` → 业务接口走通
- BP 嵌入模式启动 → wujie 注入 token → 业务接口走通
- BP 嵌入模式 token 过期 → 主应用收到 bus 事件 → 跳登录页 + redirect 保留

**失败排查**:
- 子应用所有请求 401 → 检查 `props.token` 是否注入(浏览器 Console 跑 `window.$wujie?.props?.token` 应非空)
- prod build 仍读 localStorage → Vite dead code elimination 未生效,grep `dist/assets/*.js` 是否含 `__bp_sso_token__` 字符串

---

### 步骤 8:子应用兼容 wujie sync 路由

**操作**

- 子应用 React Router 用 `BrowserRouter`(默认配置)
- wujie 主应用配置 `<WujieReact sync={true} ...>`,主子路由自动同步
- 子应用 mount 路径与 SubApp.VirtualPath 一致(URL 拼接:`{FullUrl}{subPath}`)
- 子应用内部路由变化 → wujie 自动写主应用 URL `location.pathname`(深度链接 + 浏览器前进后退原生支持)

**完成标志**:
- BP `/<appName>/<subPath>` URL 命中子应用对应页面
- 子应用内部跳转(如 `material/list` → `material/edit/123`)→ BP URL 自动更新
- 浏览器后退按钮回到上一页(子应用层级)

**失败排查**:
- 子应用首页 404 → 检查 SubApp.VirtualPath 与子应用 React Router base 是否一致
- 路由不同步 → 检查 wujie `sync` prop 是否 `true`(默认 false)

---

### 步骤 9:子应用 dev 调试

**操作**

- 子应用独立端口启动 `pnpm dev`(如 :3000)
- 两种 dev 模式:
  - **A 独立模式**:浏览器直接访问子应用,localStorage 手动塞 token,完全脱离 BP
  - **B 嵌入模式**:BP `vite.config.js` 加 proxy 转发 `/<appName>/*` 到子应用 dev server,wujie 加载 dev 子应用
- 推荐 A 模式做 UI 联调,B 模式做端到端流程联调

**完成标志**:
- A 模式:子应用页面所有功能可用(token 通过 localStorage fallback)
- B 模式:BP 加载子应用 dev 版,bus 通信、props 注入、路由同步全部正常

**失败排查**:
- B 模式 wujie 加载失败 → 检查子应用 dev server 是否启用 CORS / `Access-Control-Allow-Origin` 头
- A 模式接口 401 → localStorage token 过期或拼写错(`__bp_sso_token__`)

---

### 步骤 10:E2E 双层验证

**操作**

- **E1 API 契约层**:
  - `GET /api/SubApp/BpApps?plantCode=xxx` 返回数组含子应用 + `FullUrl` 字段
  - `GET /api/AuthInfo/List?portalType=bp&plantCode=xxx` 返回菜单树含子应用菜单(三条件 JOIN 通过)
- **E2 UI 端到端层**:
  - Bpuser 登录 BP @ 8002
  - 看到子应用菜单(顶栏 / 侧栏)
  - 点击菜单 → wujie 加载子应用页面
  - 业务路径走通(如 MDM 物料列表 → 编辑 → 保存)
- **5 项异常路径覆盖**:
  1. 子应用加载失败(URL 错 / 网络断)→ ErrorBoundary fallback 显示
  2. token 过期 → bus `subapp-auth-expired` → 主应用跳登录 + redirect 保留
  3. 切工厂(plantCode 改)→ bus `plant-changed` 广播 → 子应用切数据源 + menuTree 重拉
  4. 4 小时未交互 → 应用层 ttl 自实现销毁 + 下次访问重新加载
  5. 浏览器深度链接 `/<appName>/<subPath>` → 直接命中子应用对应页面(刷新页不丢失)

**完成标志**:
- E1 + E2 全链通
- 5 项异常路径覆盖
- 性能基线:首次加载 < 3s,后续切菜单 < 500ms(alive=true 复用)

**失败排查**:
- E1 通 + E2 不通 → 检查 BP `<SubAppHost>` 组件 props 注入与 wujie 配置
- 切工厂菜单不变 → 检查 BP 是否 emit `plant-changed` + 调 `refreshApps()` + `loadMenus()`
- 深度链接 404 → 检查 BP 路由 `/:appName/*` 通配是否在白名单后注册

---

## 2. 高级附录

### 附录 A. wujie 通信契约清单

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

---

### 附录 B. token 信任链 dev/prod 分流

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

占位 — 留待后续 spec:

- 子应用 A 跳子应用 B 菜单(`bus.$emit('navigate', { appName: 'srm', path: '/order/123' })`)
- 主应用广播事件给所有子应用(`bus.$emit('global-refresh')` → 子应用各自处理)
- 子应用间状态共享(慎用,违反低耦合原则;优先回主应用聚合层中转)

---

### 附录 I. MDM 接入实战(模板示例)

MDM 子应用作为本手册的参考实现,具体配置 1:1 抄即可接新子应用,改 appName / 路径常量即可。

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
| 切换工厂菜单不变 | BP 是否调 `loadMenus()` + emit `plant-changed` bus? |
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

#### 自检清单(新子应用接入前)

- [ ] BpLayout / TabsContext / 任何 Provider 的 useEffect deps 不含 `[navigate]` `[location]` 等不稳定引用
- [ ] main.jsx 没用 `<React.StrictMode>` 包裹 BP 容器(子应用本体不限)
- [ ] SubAppHostPool 任何 Fragment 子节点数量在所有 state 下保持稳定(用占位 div + 内部条件渲染)
- [ ] 容器层未使用 React 18 `useTransition` / `useDeferredValue` 包业务 Tab 切换(可能引入新一轮 unmount/remount)

---

## 3. 历史与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-07 | 1.0 | 首版落地(Platform spec P-C 同步);MDM 作首个参考实现 |
| 2026-05-08 | 1.1 | 加附录 K — BP 容器层 React 陷阱清单(BP 菜单 2 天踩坑教训沉淀);后续 SRM/WMS/MES 接入前必扫 K.5 自检清单 |

---

## 4. 关联资源

- [ADR-002:四层文档结构](../decisions/ADR-002-four-layer-doc-structure.md) — Spec / Plan / Tasks / ADR 边界
- [ADR-007:鉴权 4 条刚性](../decisions/ADR-007-auth-4-rigidity.md) — `[Authorize]` / Policy / 权限码 / SSO token
- [ADR-008:端到端交付 8 项核对](../decisions/ADR-008-end-to-end-8-checks.md) — 技术契约 4 + 业务连通 4
- **ADR-006:SubApp 跨进程鉴权 IP allowlist** — 当前为 SYSV2 项目级 ADR(`SYSV2/docs/decisions/ADR-006-...md`,该项目内可达);其他项目接入时**沿用同模式**(IP allowlist 中间件 + 本手册附录 C 范式),若多项目实际接入后存在共性需求,由后续 ADR 升级到本仓 `decisions/`
- [frontend-ui-standard.md](frontend-ui-standard.md) — antd 5 + ProTable 列表页统一标准(子应用 UI 一致性)
- [doc-conventions.md](doc-conventions.md) — spec/plan/ADR 命名约定
