# ADR-023: 前端统一 4 标准(i18n / Auth 401 / hostMap / web.config)

- **Status**: Accepted
- **Date**: 2026-05-14
- **Decider**: 涛哥
- **Scope**: 跨项目(SYS.3 / BP / AP / MDM 现有 + SRM/MES/WMS/EAM 未来)

---

## Context

10.8 部署 SYSV2 4 前端期间(2026-05-11 ~ 2026-05-14),84 commits / ~30 类问题,其中 **i18n / .env.production / hostMap / web.config 4 类同质问题在 4 个项目各踩 1 遍** — 共 ~29 commits(占 35%),全是"早知道有统一标准就不会重复踩"。

实证案例:
- **i18n**:4 前端 default 语言都默认 navigator.language → headless / 英文 Win 误判英文(SYS.3 commit c2b3465 / BP c4715f2 / AP 6ae4683 / MDM 591adb9~7117d12 命名 ns 全家桶)
- **.env.production**:SYS.3 缺 → 登录 fail(0044c5e);BP 缺 → t is not defined(12ccf9a);AP 缺 → vite base 错(913db6c);MDM 走代理不直连 5026(45b3c77)
- **hostMap**:BP my-orgs/org-switch 漏前缀(16398cf);SYS.3 SubApp 漏(97be807);MDM 9 services leading slash 双前缀(8de0a87)
- **web.config**:SYS.3 SPA fallback 拦子 application(4c80fc5);MDM 子 VDir 没自己的 web.config 被父级 SPA fallback 接管(0f64d4d / fe79dd2 / 76ff7a6 三连修)

不做的代价:WMS/EAM/SRM/MES 接入时会**再踩一遍 4×4=16 次**。

## Decision

**一句话**:前端 4 项基础设施统一标准,4 模板已落 `engineering-standards/templates/`,违反 = code-reviewer HIGH。

**详细 4 标准**:

### 1. i18n 初始化

- 模板:`templates/frontend-i18n-init.template.js`
- 关键约束:
  - 单 ns `'translation'`(嵌套结构 + 全路径 t('namespace.key'))
  - `lng: detectInitialLng()` — Cookie['lng'] → zh-CN 兜底(禁 navigator.language)
  - `react.useSuspense: false`(组件 lazy load 期间显示 key,加载完 re-render)
  - BASE_URL 自适应主/子应用部署
- 完整规范:`standards/frontend-i18n-standard.md`

### 2. Auth 401 grace window

- 标准:axios 拦截器收到 401 / `SessionRevokedByNewLogin` 时 **加 10s grace window**,window 内不跳 login,window 外才跳
- 触发原因:多 tab race / token 续期瞬间的并发请求
- 实证:BP 759d241 / 47309ae;后续 SYS.3 / AP 一并对齐

### 3. hostMap 前缀

- 标准:**所有 API 调用走 `Api.<Module>Api.<Action>` 常量**,常量内部用 hostMap('<HOST_NAME>') 拼前缀
- 禁:硬编码 URL 字符串 / 在 axios baseURL 之外再加 leading slash(双前缀)
- 实证:MDM 9 services leading slash(8de0a87);BP my-orgs(16398cf);SYS.3 SubApp(97be807)

### 4. IIS web.config

- 模板:
  - 主应用根:`templates/iis-web.config-spa-root.template.xml`(含 `<location inheritInChildApplications="false">` 防穿透)
  - wujie 子应用:`templates/iis-web.config-spa-subapp.template.xml`
- 关键约束:
  - SPA Fallback rule 必 exclude 后端 API regex(`/api` / `/swagger` / `/JYCoreSysWebApi` 等)
  - 子 VDir 必有自己的 web.config(否则被父级 SPA fallback 接管 → MIME 错配 500.52)
  - msdeploy 部署加 `-skip:Directory='\\web\\.config$'` 防 Re-run 旧 artifact 覆盖

## Consequences

### 正向

- WMS/EAM/SRM/MES 接入时直接复制模板,0 重复踩坑
- code-reviewer 拦得住违反,新人改不动也回得来
- pipeline pre-check(P3-2)能静态校验大部分约束

### 负向 / 代价

- 已有 SYS.3 / BP / AP / MDM 4 前端需要对齐(主要是 i18n init / web.config 模板对照)
- 模板更新需同步通知 4 项目(治理流程,见 templates/README.md)

### 影响范围

- 影响 spec:无(本 ADR 是治理类,不直接落业务 spec)
- 影响 plan:后续子应用 onboarding plan 必引用本 ADR
- 影响 memory:[[feedback_frontend_unified_4_standards]](待落)
- 影响代码:
  - `templates/frontend-i18n-init.template.js`
  - `templates/frontend-env-production.template`
  - `templates/iis-web.config-spa-root.template.xml`
  - `templates/iis-web.config-spa-subapp.template.xml`
  - 已对齐:MDM `src/utils/i18n.js`(commit 7117d12)+ MDM web.config(0f64d4d)

## Alternatives Considered

### A. 每项目特化,不强制统一

- 优点:灵活度高,各项目可演化
- 缺点:84 commits 已证明 = 重复踩坑,新项目接入痛苦
- 不选原因:涛哥要"易于维护",这是反面教材

### B. 一项目一 ADR,4 个 ADR

- 优点:粒度细
- 缺点:ADR 编号膨胀,4 个标准强相关(都是前端基础设施)
- 不选原因:单 ADR 含 4 节更紧凑

## Related

- 上游 ADR:ADR-007(鉴权 4 条刚性)/ ADR-008(端到端 8 项)/ ADR-012(SubApp Onboarding SOP)
- 下游:`templates/README.md` / `standards/frontend-i18n-standard.md` / `standards/frontend-ui-standard.md`
- 实证案例:见本 ADR Context 章节列出的 commit 列表

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-14 | Proposed → Accepted | 涛哥拍板执行 Phase 1/2/3 改造 |
