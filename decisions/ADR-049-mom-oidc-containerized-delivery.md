# ADR-049：MOM 子应用统一 OIDC 与容器化交付

- **Status**：Accepted
- **Date**：2026-09-14
- **Decider**：平台架构负责人
- **Scope**：跨项目 / SYS、BP、MDM、SRM、TPM、MES、AIOS 及后续 MOM 子应用
- **配套手册**：[MOM OIDC 统一认证与容器化部署详细手册](../standards/mom-oidc-containerized-delivery-guide.md)

## Context（背景）

MOM 子应用历史上同时存在 `JYInfo` 对称 JWT、共享签名密钥、URL fragment 传 Token、子应用本地持久化 Token、IIS 独立端口和容器网关等多套认证与部署方式。SYS 已具备原生 OpenID Connect 授权服务器、三门户会话槽和 BP Bridge V1；MDM 迁移时进一步实证，资源服务器即使收到合法 OIDC Token，也会因沿用旧 claim 名或旧 `JYInfo` 验签逻辑而全量返回 401。

容器化后的 SYS、BP、AuditPortal、MDM、SRM 已由 `172.21.10.28` 承载，并统一经 `172.21.10.31` APISIX 暴露；继续向 `172.21.10.8` IIS 重复发布会形成双运行真相、回滚歧义和额外凭据面。TPM、MES、AIOS 等由其它产品组维护，需要一份可独立执行的统一升级标准。

## Decision（决策）

**一句话**：MOM 新增和完成迁移的子应用统一信任 SYS OIDC，使用可公开验签的签名 Access Token 与 BP Bridge V1；统一构建不可变容器并由平台网关发布，完成容器化后退出 10.8 IIS 发布链。

详细约束：

- SYS 是 MOM 身份提供方；Keycloak 不进入生产认证链。登录客户端使用 Authorization Code + PKCE，不使用 implicit flow，不在 URL 传 JWT。
- OIDC Access Token 为签名 JWS，`typ=at+jwt`；资源服务器通过 HTTPS Discovery/JWKS 获取公钥并严格校验 signature、issuer、audience、lifetime、type、scope 和门户职责 claim。授权码与 Refresh Token 不下发给子应用。
- BP 嵌入应用统一使用业务槽 Token：`aud=business-portal`、scope 含 `sys.api`，并校验 `portal=business`、`BusinessPortalAccess=true`、非空 `PlantCode`。claim 名大小写属于契约，不得自行改名。
- Bridge V1 只负责在已授权 iframe 与 BP 之间，以 exact source/origin 和版本化 ACK 将当前 Access Token、PlantCode、contextVersion 同步到子应用内存；不签发 Token，不把 Token 写入 URL、storage、cookie 或日志。
- 每个业务 API 保留自身角色、权限码和数据范围 Policy。认证成功不等于业务授权成功；APISIX 不通过可伪造身份头代替后端验签。
- `JYInfo` 仅作为未迁移消费者的限时兼容面。新应用禁止接入；单个应用完成 OIDC、真实业务 E2E 和回滚验证后即关闭自身 legacy 开关。SYS 仅在消费者清单归零后删除旧端点与密钥。
- 容器镜像按 CI build 与 Git SHA 生成不可变 tag，非 root 运行，提供健康检查，不内置生产秘密；10.28 运行容器，10.31 APISIX 提供 HTTPS 同源入口。
- 已容器化应用不再发布到 10.8 IIS。尚未容器化应用在迁移完成前仍可使用 ADR-040 的 IIS 通道，但该通道不是新应用目标架构。
- 交付顺序为本地定向验证 → commit/双推 → 后端容器部署 → 前端容器部署 → 网关探针 → 受影响页面部署态 E2E。后端鉴权契约变化必须触发消费前端定向 E2E。

## Consequences（影响）

### 正向

- 子应用不再共享对称签名密钥或持有 SYS 私钥，密钥轮换和信任边界集中到 Discovery/JWKS。
- 一个公开入口、一个当前容器版本和一个回滚来源，消除 10.8/10.28 双发布漂移。
- 登录、组织、权限和业务数据链可由同一套 Token/Policy/E2E 契约验证。

### 代价

- 存量应用需要逐个盘点旧 Token 读取、claim、401 行为、API Policy、网关路由和 IIS 发布链，不能一次切断 SYS 兼容端点。
- BP Bridge V1 与子应用需共同维护 N/N-1 迁移窗口；部署期间必须协调单会话测试账号，避免 CI 与本地 E2E 相互撤销会话。
- 其它产品组必须补齐容器健康、不可变镜像、网关路由、回滚和部署态业务验证，而不只是增加 Dockerfile。

## Alternatives Considered（替代方案）

### A. 继续共享 `JYInfo` HS256 密钥

- 改动最小，但所有资源服务器都持有可签发同族 Token 的秘密，密钥泄漏与轮换影响面过大；不选。

### B. 让 APISIX 注入身份头，子应用只信网关

- 后端改动较少，但一旦路由或网络边界配置错误便可伪造身份，也无法独立验证 audience、scope 和 Token 撤销语义；不选。

### C. 统一使用 Keycloak

- 产品能力完整，但会形成 SYS 与 Keycloak 双 IAM/双治理真相，不符合 SYS 逐步承担 SSO/IAM 的产品方向；保留容器备用但不启用。

### D. SYS OIDC + 子应用标准资源服务器 + 10.28/10.31 容器平台

- 迁移工作量较大，但身份、授权、部署和验收边界统一，且已由 SYS/BP/MDM 链路验证；采用。

## Related（相关引用）

- [ADR-007：鉴权 4 条刚性](ADR-007-auth-4-rigidity.md)
- [ADR-045：部署后 E2E 分层定级](ADR-045-post-deploy-e2e-tiered-scoping-governance.md)
- [ADR-046：跨仓契约驱动 E2E](ADR-046-cross-repo-contract-driven-e2e-trigger.md)
- [ADR-047：BP 子应用认证桥 v1](ADR-047-bp-subapp-bridge-v1.md)
- [ADR-040：存量 IIS 部署通道](ADR-040-cicd-onprem-iis-deploy-channel.md)

## History（变更轨迹）

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-09-14 | Proposed → Accepted | 形成跨产品组 OIDC 与容器化统一标准 |
