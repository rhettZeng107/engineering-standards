# 标准 — 子应用菜单发布(manifest + 应用中心 ScanMenus)

> 决策:ADR-012(子应用接入 SOP)修订。由来:SRMV2 采购迁移踩坑 —— 手工改 SYS_AuthInfo 维护菜单(绕过 manifest 铁律)+ console 菜单泄漏 BP 404。
> 标杆实现:SYSV2 `AI.REACT.MDM.1`(前端三件套)+ `AI.Extend.MDM.1`(后端)+ `AI.Extend.SYS` 应用中心 ScanMenus。

## 0. 铁律(所有 BP 子应用)

**子应用菜单的真理源 = 前端 `routes.config.mjs`,经 manifest + 应用中心 ScanMenus 自动同步到 `SYS_AuthInfo`。禁手工 INSERT/UPDATE SYS_AuthInfo 维护菜单。**

手工改 DB 是反模式:无版本控制、漂移、下次扫描被覆盖/冲突。

## 1. 发布机制全链路

```
前端 src/routes.config.mjs(菜单树真理源)
  → scripts/generate-manifest.mjs(postbuild 钩子)
  → menu-manifest.json(写 dist/ + 后端 wwwroot/)
  → 后端 MenuController GET /<app>api/Menu/manifest(读 wwwroot)
  → SYS 应用中心 ScanMenus(server-to-server 拉 manifest)
  → 增量合并写 ExtendLibrary.dbo.SYS_AuthInfo(按 Code/AuthTag upsert)
  → BP 门户 BuildBpMenuAsync 渲染
```

## 2. 子应用三件套(照 MDM 复用)

### ① 前端菜单树源 `src/routes.config.mjs`
导出 `ROUTES` 嵌套树(组 → 叶,支持多级):
```js
export const ROUTES = [{ authCode, menuName, manifestPath, children:[...] }]
// authCode→AuthTag/Code,menuName→菜单名,manifestPath→PageUrl(路由)
```

### ② 生成器 `scripts/generate-manifest.mjs` + package.json `postbuild`
- 读 routes.config → 转 SubAppManifest schema `{AppName, Menus:[{Code,Name,Path,Icon,Children}]}`
- 写 3 处:`dist/menu-manifest.json` + 后端 `wwwroot/menu-manifest.json` + `menu-manifest.dev.json`
- 嵌套树需**递归映射** children(MDM 原版扁平,多级菜单要改递归)

### ③ 后端 `MenuController` + IP 白名单中间件
- `MenuController` `[Route("<app>api/[controller]")]` `GET manifest` `[AllowAnonymous]` 读 wwwroot
- ⚠️ **ABP / Furion(UnifyResult)项目必须给 manifest action 加 `[NonUnify]` 豁免全局响应包装**(2026-06-18 TPM 实证,首个 ABP+Furion 子应用接 BP):`AddFurionUnifyResultApi()` / ABP wrapping 会把裸 `Content()` JSON 包成 `{statusCode,data}` envelope → SYS `ScanMenus` 的 `GetFromJsonAsync<SubAppManifest>` 顶层无 `Menus` → **拉到空菜单(合法 JSON 但 `Menus:[]`,非 403/500,极隐蔽,误判成文件/物理路径问题排查极耗时)**。MDM/SRM 非 Furion 故无此坑、同款 MenuController 却工作。`using <Unify命名空间>`(TPM=`JY.Framework.AspNetCore.UnifyResult`,项目内 grep 现有 `[NonUnify]` 用法确认命名空间);prod 缺文件分支用 `return StatusCode(503,...)` 而非 `throw`(throw 走 FriendlyExceptionFilter 仍被 envelope 包)。
- `SubAppManifestIpAllowlistMiddleware` 仅守 `/<app>api/menu/manifest`(server-to-server 跨进程,无 user JWT,IP 白名单单边鉴权,参 ADR-006/007 第5条)
- `Program.cs`:`UseMiddleware<...>()`(在 UseAuthorization 前)+ `UseStaticFiles()`

### ④ 应用中心注册(部署侧,BP 应用中心 UI)
- 注册子应用 + 配 `MenuApiUrl` = 后端 manifest URL → 触发 ScanMenus。

## 3. 迁移→发布衔接(老项目升级复用)

老 MVC 一体 / 老 React 迁到 BP 子应用时,**菜单必须随代码迁移建 manifest 三件套**,不要只搬页面、菜单手工塞 DB。迁移清单:
1. 页面/路由迁移(代码,真理源在源仓如 HC srmctest@hcv2)
2. **同步建 routes.config.mjs**(声明本应用菜单树)
3. 三件套(②③)+ 应用中心注册
4. 跨应用复用叶(指向别 app 现成页,如 SRM 菜单指 MDM 黑名单):AppName=目标 app,**ScanMenus 按 AppName 隔离不碰**,这类叶单独 DB 种子维护(manifest per-app 表达不了)

## 4. 两条根因教训

| # | 坑 | 规则 |
|---|---|---|
| 1 | **手工 DB 维护菜单**(绕过 manifest)| 菜单真理源 = routes.config + manifest 扫描;手工 DB 仅限跨应用复用叶 |
| 2 | **console 菜单泄漏 BP 404** | BP `BuildBpMenuAsync` 仅按 `AppName+BShow` 过滤 → 老 console 菜单(BShow=true)成孤儿顶层显示、点击 404。修:老 console 菜单 BShow=false 下线(注:BP 真实可见性闸门是 `IsPcMenu/BGroup/ActiveModule/BEnd` 等,`PortalScope` 经 SYSV2 LSP 实证为 0 引用死列,勿依赖) |
| 3 | **ABP/Furion 全局响应包装吞 manifest**(2026-06-18 TPM)| ABP+Furion `AddFurionUnifyResultApi()` 把 manifest 端点 `Content()` 包成 `{statusCode,data}` envelope → ScanMenus 拉空(合法 JSON 但 `Menus:[]`,极隐蔽,易误判文件/路径,排查耗时数轮)。规则:manifest action 加 `[NonUnify]` 裸返 + prod 缺文件用 `return StatusCode(503)` 非 `throw`;验收**从白名单 IP(WinRM/SYS 后端)打端点验 raw body 顶层是 `{AppName,Menus}` 无 `statusCode/data`**(CI agent 非白名单 manifest 403 验不到,见自查清单) |

## 5. 自查清单(子应用接入/迁移交付前)

- [ ] 有 `src/routes.config.mjs`(菜单树)
- [ ] 有 `scripts/generate-manifest.mjs` + package.json postbuild
- [ ] 后端有 `MenuController /menu/manifest` + IP 白名单中间件 + Program.cs 注册
- [ ] 应用中心注册 + MenuApiUrl 配置 + ScanMenus 跑通
- [ ] **未**手工改 SYS_AuthInfo 维护本应用菜单(除跨应用复用叶)
- [ ] **(ABP+Furion 项目)manifest action 已加 `[NonUnify]`** + 白名单 IP 打端点验 raw body 裸返 `{AppName,Menus}`(无 `{statusCode,data}` 外层)
- [ ] BP 无 console 菜单泄漏(老 console 菜单 BShow=false 下线)
