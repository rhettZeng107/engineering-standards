# ADR-012: 子应用接入 SOP 强约束 + BrowserRouter 标准

- **Status**: Accepted
- **Date**: 2026-05-07
- **Decider**: 涛哥
- **Scope**: 跨项目(BP 业务门户 + 所有子应用 MDM/SRM/MES/EAM/QC/...)

---

## Context(背景 / 为什么需要决策)

### 触发场景

涛哥 2026-05-07 实操反馈:BPuser 登 BP → 点 MDM 菜单 → 打不开页面 → 实证为 **wujie sync=true + MDM HashRouter 不兼容**(BP 主路由 navigate 通过 history.pushState 触发 wujie sync,但 MDM HashRouter 只读 hash 不读 history,永远停在默认 MaterialIndex 不切页)。

### 当前状态实证

- 子应用接入手册 [`subapp-onboarding-guide.md`](../standards/subapp-onboarding-guide.md) 第 1.8 步明确写"wujie sync + BrowserRouter",**但 MDM 自己用 HashRouter**(`AI.REACT.MDM.1/src/index.jsx:6 import {HashRouter as Router}`)
- MDM `App.jsx:42` 加了 `bus.$on('mdmreact-router-change', routerJump)` bus 事件兼容老接入方式 — **绕开标准的临时方案**
- 接入手册存在,但**没有强约束力** — MDM 是参考实现却破例(历史遗留 CRA 时代 HashRouter)
- 后续 SRM / MES / EAM / QC 接入时,如果各自踩坑、各自绕 hack → **每个子应用都是定制开发** → 项目成本失控,业务上线不可预期
- 同时,P3 Vite 升级(commit `6389f1c`)只解决了工具链,没修 antd v5 + pro-components 老 API 兼容(`hidden:true` x 11 处),涛哥 P-D 验收阶段才被发现

### 决策不做的代价

- SRM/MES/EAM 接入时复读同样问题:wujie sync 不工作 / antd 老 API 触发 throw / 子应用接入流程不一致
- 接入手册是文档摆设,产品标准化承诺破产
- 客户(企业 IT 部门)把 BP 当作 portal 工具时无法预期"接入第 N 个子应用要多久 / 多少风险"

---

## Decision(决策本身)

**一句话**:**子应用接入手册 = 准入 SOP 强约束**;子应用必须用 **BrowserRouter**(配 wujie sync=true)、必须实现 manifest API、必须 IP allowlist 跨进程鉴权;**MDM 作为参考实现先按 SOP 改造**(HashRouter → BrowserRouter)。

**详细**:

### SOP 强约束清单(子应用接入门槛)

| # | 约束 | 强制性 | 检测手段 |
|---|---|---|---|
| 1 | 路由必须用 **BrowserRouter** + basename 对齐 SubApp.VirtualPath(如 `/MDM/`) | **强制** | 接入评审 + grep `HashRouter` 必为 0 |
| 2 | manifest API 实装 + IP allowlist 中间件(参见 ADR-006) | **强制** | curl 从应用中心 IP 200,从其他 IP 403 |
| 3 | axios 拦截器:prod 走 `$wujie.props.token`,dev fallback localStorage | **强制** | 代码审查 + `request.js` 模板比对 |
| 4 | 子应用内部 navigate 走 React Router(相对路径或 absolute 自动加 basename) | **强制** | grep `window.location` 不可有 SPA 跳转用法 |
| 5 | 后端 API base path = `/<appName>api/`(如 `/mdmapi/`)便于 BP vite proxy 配置 | **强制** | manifest API 路径前缀检查 |
| 6 | 子应用 build 产物含 `manifest.json` + 部署到 BP 网关路径(如 `/MDM/`) | **强制** | postbuild 脚本(参考 MDM `generate-manifest.mjs`) |
| 7 | E2E 双层覆盖(API + UI 经 BP wujie 加载)| **强制** | 接入完结前必跑 |
| 8 | antd 5 + pro-components 标准用法(无 `hidden:true` 老 API,改 `hideInTable`/`hideInSearch`)| **建议**(子应用自治) | code-reviewer HIGH |

### MDM 改造作参考实现

- `index.jsx`: `HashRouter` → `BrowserRouter` + `basename="/MDM"`
- App.jsx: 移除或保留 `mdmreact-router-change` bus 监听(保留作 backward compat,新接入子应用不依赖)
- 全部业务页面 navigate 路径核对(已实证只 1-2 处需关注)

### 接入流程治理(ITSM 风格)

参考 ADR-014(候选,子应用全生命周期治理):

1. **申请**:子应用方提交接入申请(子应用 metadata + 部署目标 + 接入手册自检表)
2. **IT 评审**:Architect / 代码 review SOP 8 项检测
3. **业务审批**:涛哥 / 业务负责人确认子应用业务范围
4. **接入实施**:走接入手册 10 步 + IT 配合应用中心注册 / IP allowlist
5. **验收**:E2E 双层 + 涛哥手动 BP 跑通 → GoOnline
6. **监控 / 运维**:子应用监控 + 审计日志
7. **下线 / 迁移**:GoOffline → 数据归档 → 状态机收尾

(本 ADR 仅定 SOP 8 项约束,完整生命周期治理留 ADR-014 独立 spec)

---

## Consequences(影响 / 副作用)

### 正向

- 接入手册从"文档"升级"准入 SOP",有强约束力(接入前 8 项检测必过)
- MDM 改造作参考实现,SRM/MES/EAM 后续接入直接复用(0 定制)
- wujie + BrowserRouter sync 工作,业务用户菜单 click → 真切页 → 业务可用
- 子应用接入项目可估期(企业 IT 部门可决策)

### 负向 / 代价

- MDM 自身需投入 1 spec / 1 plan / 1-2 文件改 + E2E 全回归(本批次推进)
- 接入手册的强约束,新接入团队学习成本提升(但有 MDM 参考实现降低)
- 后续 SOP 8 项更新需要走 ADR Superseded 流程(不可改写历史)

### 影响范围

- 影响 spec:[2026-05-07-mdm-browserrouter-migration/spec.md](../../SYSV2/docs/superpowers/specs/2026-05-07-mdm-browserrouter-migration/spec.md)(本 ADR 推动落盘)
- 影响 plan:[2026-05-07-mdm-browserrouter-migration/plan.md](../../SYSV2/docs/superpowers/plans/2026-05-07-mdm-browserrouter-migration/plan.md)
- 影响代码:`AI.REACT.MDM.1/src/index.jsx:6`(HashRouter → BrowserRouter);`AI.REACT.MDM.1/src/App.jsx:42`(bus 监听保留 backward compat 注释)
- 影响标准文档:[`standards/subapp-onboarding-guide.md`](../standards/subapp-onboarding-guide.md)(SOP 8 项检测段升级,从"建议"改"强制")
- 影响 memory:[`feedback_subapp_onboarding_sop_enforcement.md`](../../SYSV2/.claude/projects/.../memory/...)(新增,跨项目 SOP)

---

## Alternatives Considered

### A. 保留 MDM HashRouter,BpLayout 菜单 click emit `mdmreact-router-change` bus(速决)

- 优点:1 文件改;1 小时落地
- 缺点:**违背接入手册标准**;每个子应用都要复用 hack;hash 不持久(刷新丢失);wujie alive=true 切回时 hash 错;长期债务
- 不选原因:涛哥要"企业管理治理"层面解,不是绕坑

### B. 接入手册作"建议",子应用自治选用 HashRouter / BrowserRouter

- 优点:子应用团队自由度高
- 缺点:每个子应用各自踩坑;接入流程不可预期;BP 集成层每个子应用都要适配
- 不选原因:违背产品标准化承诺,客户决策"接入要多久"无依据

### C. SOP 强约束 + MDM 作参考实现先改造(选)

- 优点:产品标准化;SRM/MES/EAM 0 定制接入;客户可估期;符合企业 ITSM 治理常识
- 缺点:MDM 需 1 批次改造投入(本批次)
- 选定原因:涛哥 2026-05-07 拍板"按推荐组合方案改造更新",MDM 投入可控,长期收益高

### D. 完整重构 BP 子应用集成层(Platform spec v2)

- 优点:架构最优
- 缺点:1-2 周;脱离当前 MDM 已上线的现实
- 不选原因:过度设计;留作 SRM/MES/EAM 大批量接入时启动

---

## Related

- 上游 ADR:[ADR-011 BP 业务门户边界](./ADR-011-bp-business-portal-boundary.md)(决定 BP 是业务用户工作台 → 必须打通子应用集成)
- 配套 ADR:[ADR-006 SubApp 跨进程鉴权 IP allowlist](../../SYSV2/docs/decisions/ADR-006-subapp-cross-process-auth-ip-allowlist.md)(子应用接入 SOP 第 2 项依赖)
- 上游 ADR:[ADR-008 端到端交付 8 项核对](./ADR-008-end-to-end-8-checks.md)(接入手册 SOP 与 8 项核对呼应)
- 下游 ADR(候选):ADR-014(子应用全生命周期治理 ITSM)
- 标准文档:[`standards/subapp-onboarding-guide.md`](../standards/subapp-onboarding-guide.md)
- spec:[`2026-05-07-mdm-browserrouter-migration/spec.md`](../../SYSV2/docs/superpowers/specs/2026-05-07-mdm-browserrouter-migration/spec.md)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-07 | Proposed → Accepted | 涛哥拍板;MDM 作参考实现先改造,SOP 8 项强约束 |
| 2026-05-21 | Accepted（修订） | SRMV2 Contract 迁移踩坑 → 补 G 方案 postMessage 路由同步 + service baseURL 两项强约束(见下修订段) |

---

## 修订 / Revision(2026-05-21)

**触发**:SRMV2 Contract 子应用迁移到 BP,production iframe 暴露**两个迁移漏掉的 SOP 契约** —— ① 漏 postMessage 路由同步监听 → BP 点每个菜单都停在同一页;② 多个 service 漏 `baseURL` → 执行/付款/模板页报「网络异常:无法连接服务器」。本机 dev E2E「9/9 通过」是**假通过**(dev vite proxy 兜底 baseURL 缺失 + 单应用直访掩盖路由同步缺失)。

**根因**:本 ADR 原 SOP 第 1/4 项基于 **wujie sync=true 自动同步**,但 BP 实际已于 2026-05-07 切 **G 方案(原生 iframe + URL hash token + postMessage 路由同步,见 BP `SubAppHost.jsx`)**,SOP 与接入手册未同步反映 G 方案契约 → 按"wujie sync 0 代码自动同步"理解必漏监听。

**SOP 清单补充(G 方案,external/native iframe 子应用强制)**:

| # | 约束(修订/新增) | 强制性 | 检测手段 |
|---|---|---|---|
| 1（校正） | 路由器 HashRouter / BrowserRouter 均可(G 方案靠 postMessage `navigate`,不强依赖 BrowserRouter+wujie sync);external 独立站点 HashRouter + `base='/'` 可接受 | 强制 | 接入评审 |
| **9（新增）** | 子应用必装 **postMessage 路由同步桥**:`subapp-router-change` → `navigate(subPath)`;`plant-changed` → 更新工厂码。范本 `SubAppRouterBridge.jsx` / MDM `App.jsx` handleMessage | **强制** | grep 子应用有 `addEventListener('message'` 路由同步监听 |
| **10（新增）** | 全部 service 显式 `baseURL` 指向正确后端(dev proxy 掩盖缺失,production iframe 暴露) | **强制** | `grep -L "baseURL\|VITE_" src/service/*` 必为空 |
| 7（校正 E2E） | E2 UI 必须真实 BP iframe + production-like 环境**逐菜单**跑 + 每页 API 真实调通,**禁 dev proxy / 单应用直访作验收依据** | **强制** | 验收前逐菜单点击截图 |

**落地**:`standards/subapp-onboarding-guide.md` v1.2(步骤 8 / 附录 A.1 / 步骤 10 / 子应用侧自检清单)+ `standards/legacy-migration-playbook.md`(迁移轨子应用 SOP 对照)。

---

## 修订 / Revision(2026-05-24)— 检查 ③ 嵌入 chrome 钩子两层漏网修正

**触发**:SRMV2 采购子应用部署 BP,涛哥反馈页面多一层外框 + 左菜单与内容大段留白 + 右上角多余「退出登录」。根因 `AI.REACT.SRM.Buyer.2/src/layout/index.jsx` 无条件渲染自带 `Header(含 Logout)+ Sider(空 240px)+ 外框`,迁移时漏套嵌入门控。问题是:**本 ADR 检查 ③(嵌入隐藏 chrome)早已存在,钩子却没拦住**。

**两层漏网根因**:
1. **判定太窄** — `isSubAppRepo` 仅认 `public/menu-manifest*.json`(合同域特性)。采购是 Wujie 子应用但不发布 menu-manifest → 钩子对采购**整仓跳过**,四项检查一项没跑。
2. **检查太浅** — 检查 ③ 原实现是 `presence-only`:只要 `__POWERED_BY_WUJIE__`/`isEmbedded` token 在 src **任意文件**出现就算过。采购 `src/index.jsx` 有该 token(Wujie 生命周期取 props 用)→ **误判通过**,而真正的 layout 层根本没用它隐藏外壳。

**修正(`templates/hooks/subapp-frontend-guard.js`)**:
- 新增 `isWujieSubApp`(menu-manifest **或** src 入口含 `__POWERED_BY_WUJIE__`/`window.$wujie`)。检查 ③ 用它收范围(Wujie 子应用都查);①②④ 契约仍限 menu-manifest 子应用(避免对采购误报 router/service)。
- 检查 ③ 改**层级感知**:layout 层(`layout/` 下或文件名含 layout)有任一文件渲染外壳(`<Header>+<Sider>` 或 `<Logout>`/退出登录),则该层必须有 embedded 门控;**判定到「层」不是「单文件」**(父子拆分 `index 门控 + HeaderContent/Sider 渲染` 是常态,逐文件要求自带门控会误报合同 `HeaderContent.jsx`)。token 仅在入口出现不算过。升为 **FAIL**(原为 warn)。例外注释 `// embedded-gated-by-parent`。
- 实测:采购修复前 ❌ 抓到(`src/layout/index.jsx`)、采购修复后 ✅、合同标杆 ✅(不再误报 `HeaderContent.jsx`)、供应商 external 站点跳过。

**教训**:**「规则存在」≠「规则生效」**。机械自检的判定范围(谁进检查)+ 检查深度(presence vs 真实层级语义)任一偷工,规则就形同虚设、踩坑照旧。新增/强化机械自检必须配「修复前能抓到 + 修复后能放行 + 标杆不误报」三向实测。

---

## 修订 / Revision(2026-05-24)— 菜单发布走 manifest(禁手工 DB)+ console 泄漏 404

**触发**:SRMV2 采购迁移自 HC srmctest(老 React,无 manifest 机制)→ 采购菜单一直靠**手工 INSERT/UPDATE SYS_AuthInfo** 维护(phaseA 种子 + 248 对齐),绕过 ADR-012 manifest 铁律。另:BP 门户散落老菜单点击 404。

**两条根因**:
1. **手工 DB 维护菜单 = 反模式**:采购缺 manifest 三件套(routes.config + generate-manifest + 后端 MenuController),菜单无版本化真理源、易漂移、与 ScanMenus 冲突。
2. **console 菜单泄漏 BP**:`AI.Extend.SYS` `AuthInfoQueryService.BuildBpMenuAsync` 仅按 `AppName + BShow` 过滤,**漏 `PortalScope`** → 老 console 域 SRM 菜单(BShow=true)成孤儿顶层显示、点击 404(指向老路由,SRMV2 前端无此页)。

**决策**:
- 菜单发布**强制走 manifest + 应用中心 ScanMenus**,真理源 = 前端 `routes.config.mjs`;**禁手工 DB 维护菜单**(跨应用复用叶例外,按目标 AppName 单独种子)。复用配方见新标准 `standards/subapp-menu-manifest-publish.md`(MDM 三件套蓝本)。
- **迁移轨衔接**:老项目(MVC/老 React)迁 BP 子应用,菜单必须随代码建 manifest 三件套,不只搬页面。
- BP 菜单查询应按 `PortalScope='bp'` 隔离;老 console 菜单 BShow=false 下线(防 404 泄漏)。

**关联**:`standards/subapp-menu-manifest-publish.md`(配方)/ ADR-028(老项目迁移)/ ADR-006-007(manifest IP 白名单跨进程鉴权)。
