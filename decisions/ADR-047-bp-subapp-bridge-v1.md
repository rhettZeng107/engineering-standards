# ADR-047: BP 子应用认证桥 v1

- **Status**: Accepted
- **Date**: 2026-07-14
- **Decider**: 涛哥
- **Scope**: 跨项目 / BP 与所有嵌入子应用

## Context(背景 / 为什么需要决策)

BP 是 MDM、SRM、MES、TPM、APS 等多企业应用的统一作业入口。历史接入同时存在 Wujie props、URL hash、localStorage、cookie 和无版本 postMessage，多份 token 副本与不同 401 行为使组织切换、迟到请求和“被挤下线”无法可靠归责。

2026-07-14 APS 真实 BP 访问进一步实证：iframe 先从 URL hash 取得 legacy JWT 并开始渲染，随后才收到 v1 内存上下文，会造成首批业务请求 401、后续请求 200；页面因此误报“后端未启动”。这不是后端不可用，而是两套认证通道的竞态。2026-07-15 完成修复后的 APS 功能 happy-path 复验；全协议异常矩阵仍按接入标准 O.4 继续推进。

## Decision(决策本身)

**一句话**：BP 采用版本化、内存态、可确认的 `BpSubAppBridge v1`，BP 独占持久 JWT，子应用只上报认证异常，由 BP 判活并裁决会话。

**详细**:

- BP 是 plant-scoped JWT 的唯一持久真理源；嵌入子应用只在内存保存当前上下文，不把 JWT 写入 localStorage、sessionStorage、cookie、IndexedDB、URL 或日志。
- token 与 PlantCode 作为一个原子上下文下发。子应用先发送 ready，应用成功后回 ACK；未 ACK 不得开始业务请求。
- 双方按 exact `source + origin` 建立 iframe registry。v1 envelope 始终保留 requestId 字段；需要关联应答的 ready/context/ACK/auth-error 使用 UUID，route/session 广播按 schema 允许该字段为空字符串。
- 请求发起时固化完整 context identity。子应用只上报认证错误；BP 先实时判活，再决定重发认证上下文、提示或退出。每个 contextVersion 最多恢复一次，绝不自动重放原业务请求；旧上下文迟到 401 不得影响新会话。
- 采用可逆双栈迁移。组件与 BP 至少兼容当前协议 N 和上一版 N-1；真实 iframe 与授权/API 闭环通过后才关闭 legacy。
- 正向迁移：子应用双栈 → BP 双栈 → 真实 iframe 验证 ready/ACK、401 判活和组织切换 → 关闭 legacy 开关 → 删除 legacy。
- 回滚：重新打开 legacy 开关 → BP 回退到 N-1 → 子应用回退到 N-1。回退期间只恢复认证上下文，不重放已失败业务写请求。

本决策取代 ADR-012 中与 Wujie token、URL hash token、localStorage fallback、无版本 postMessage 和子应用直接处理 401 有关的接入条款。ADR-012 的 manifest、IP allowlist、路由、service baseURL、嵌入 chrome 与真实 BP E2E 约束继续有效。

## Consequences(影响 / 副作用)

### 正向

- 消除子应用域 token 副本，401 不再直接等同于账号被挤下线。
- 组织切换、token 刷新和迟到请求可按上下文版本归责。
- iframe 初始 URL 不再携带 JWT，浏览器历史、日志和截图的泄漏面缩小。

### 负向 / 代价

- BP 与子应用都必须维护握手状态机、精确 iframe registry 和双栈迁移窗口。
- 独立开发模式需要专用内存凭据提供者，不能再复制 BP 生产 token 到 localStorage。
- v1 迁移完成前必须同时验证 N/N-1，发布门禁比历史方案更严格。

### 影响范围

- 标准：`standards/subapp-onboarding-guide.md` 步骤 7-10 与附录 O.1-O.2。
- 参考实现：SYSV2 BP、APSV2 计划排程与库存分析。
- 后续接入：MDM、SRM、MES、TPM、EAM 及新子应用。

## Alternatives Considered(其他选项 + 为什么没选)

### A. 保留 localStorage/hash token 与收到 401 直接退出

- 优点：改动少。
- 缺点：token 副本扩散，组织切换竞态和误下线无法消除。
- 不选原因：不满足 BP 多企业统一入口的会话一致性要求。

### B. 只延长 token 有效期

- 优点：能降低自然过期频率。
- 缺点：无法解决旧请求迟到、组织切换错配、重复 token 副本和错误退出。
- 不选原因：生命周期参数不是协议竞态的修复手段。

### C. 版本化内存桥 + BP 统一判活(选)

- 优点：身份、组织、异常归责和迁移回滚边界明确。
- 缺点：需要主子应用同时升级并维护握手状态机。
- 选定原因：已在 APS 双运行时真实 BP 链路验证可行。

## Related(相关引用)

- 上游 ADR：ADR-007、ADR-008、ADR-011、ADR-012、ADR-037。
- 并列 ADR：ADR-048 应用家族单身份多运行时发布。
- 标准：[subapp-onboarding-guide.md](../standards/subapp-onboarding-guide.md)。
- SYSV2 contract：[contract-lock.md](https://github.com/rhettZeng107/SYSV2-workspace/blob/043523dc585e167888f79cca668838087ab417d0/docs/superpowers/specs/2026-07-14-subapp-auth-bridge/contract-lock.md)。
- APS 功能 E2E 证据：[aps-bp-e2e-2026-07-15.json](https://github.com/rhettZeng107/SYSV2-workspace/blob/043523dc585e167888f79cca668838087ab417d0/docs/superpowers/specs/2026-07-14-subapp-auth-bridge/evidence/aps-bp-e2e-2026-07-15.json)。

## History(变更轨迹)

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-07-14 | Proposed → Accepted | 涛哥批准 BP 统一子应用协议并完成 BP/APS 参考实现 |
| 2026-07-15 | Accepted（证据补充） | APS 真实 BP 功能 happy-path 复验通过；全协议异常矩阵仍按 O.4 推进 |
