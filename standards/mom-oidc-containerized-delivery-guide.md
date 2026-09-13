# MOM OIDC 统一认证与容器化部署详细手册

> **状态**：Stable v1.0（2026-09-14）
> **适用范围**：SYS、BP、MDM、SRM、TPM、MES、AIOS 及后续 MOM Web/Api 子应用
> **目标读者**：产品组开发、测试、DevOps、平台管理员
> **决策依据**：[ADR-049](../decisions/ADR-049-mom-oidc-containerized-delivery.md)
> **参考实现**：SYS OIDC 授权服务器 + BP Bridge V1 + MDM OIDC-only 资源服务器 + 10.28 容器 / 10.31 APISIX

本手册给出从旧 `JYInfo` Token、独立 IIS 端口迁移到统一 OIDC 与容器平台的完整执行合同。它不是“加一个 JWT 中间件”和“补一个 Dockerfile”的清单；完成标准必须同时覆盖身份、业务授权、组织数据、前端上下文、镜像、网关、CI、回滚和真实业务 E2E。

## 1. 最终架构与职责

```text
SYS 本地账号 / 可选 LDAP·AD / 可选 Kerberos
                    │
                    ▼
          SYS 统一认证核心（IdP/IAM）
          ├─ OIDC Authorization Code + PKCE
          ├─ Access/Refresh/撤销/JWKS
          ├─ 管理/业务/审计三个会话槽
          └─ Client/Scope/Audience/全局注销
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   SYS.3 / BP / Audit       独立 OIDC Client
          │                   （确有独立登录需求时）
          ▼
 BP Bridge V1（只投递业务槽 Access Token + PlantCode）
          │
          ▼
 MDM / SRM / TPM / MES / AIOS 资源服务器
          │
          ▼
 10.28 容器运行时 ── 10.31 APISIX HTTPS 同源入口
```

### 1.1 组件责任

| 组件 | 必须负责 | 明确不负责 |
|---|---|---|
| SYS IdP | 认证来源、中央会话、Client、授权码、Access/Refresh、签名、撤销、组织与门户职责 claim | 子应用业务 Policy、子应用数据范围 |
| BP | 业务槽登录、菜单/应用/组织授权交集、Token 刷新、Bridge V1、401 判活 | 替子应用签发 Token、替子应用做最终 API 授权 |
| 子应用前端 | 接收并在内存应用上下文、请求携带 Bearer、上报版本化认证错误 | 保存 Refresh Token、把 Access Token 写入 URL/storage/cookie、直接清 BP 会话 |
| 子应用 API | Discovery/JWKS 验签、OIDC 契约校验、业务 Policy、组织数据隔离 | 共享 SYS 私钥、信任可伪造网关身份头 |
| APISIX | TLS 入口、路径路由、上游健康与同源收敛 | 取代 API 的 Token 验签和业务授权 |
| CI/CD | 构建不可变镜像、部署、健康探针、定向 E2E、回滚证据 | 用 SPA 200 或容器 Up 冒充业务验收 |

### 1.2 两种前端接入模式

| 模式 | 适用 | OIDC Client | Token 获取 |
|---|---|---|---|
| BP 嵌入模式（默认） | 用户从 BP 菜单进入 MDM/SRM/TPM/MES/AIOS | 子应用前端无需新增登录 Client；BP 是 `business-portal-web` | BP 通过 Bridge V1 投递业务槽 Access Token |
| 独立门户模式（需单独登记） | 产品必须脱离 BP 独立打开并登录 | 为该前端注册唯一 public client、redirect URI、logout URI、scope/audience | 该前端自己走 Authorization Code + PKCE |

独立门户模式不得复制 BP Refresh Token，也不得通过 URL 从 BP 携带 Access Token。一个前端只能有一个明确的会话所有者；如同一产品同时支持嵌入和独立登录，必须分别建模两种运行上下文并做隔离 E2E，不能自动混用 Token。

## 2. 当前 MOM OIDC 契约

以下是当前演示/集成环境的已锁基线。客户环境的主机名可以变化，但协议字段、验证项和职责边界不得漂移。

| 项 | 当前值 / 规则 |
|---|---|
| Issuer / Authority | `https://172.21.10.31/sys` |
| Discovery | `https://172.21.10.31/sys/.well-known/openid-configuration` |
| 登录流程 | Authorization Code + PKCE（S256） |
| BP client_id | `business-portal-web` |
| BP API audience | `business-portal` |
| 必需业务 scope | `sys.api` |
| Access Token | 签名 JWS；当前 `alg=RS256`、`typ=at+jwt`；资源 API 可经 JWKS 公钥验签 |
| Authorization Code / Refresh Token | 继续由授权服务器保护；不得下发给嵌入子应用 |
| 业务门户职责 | `portal=business`、`BusinessPortalAccess=true` |
| 组织上下文 | `PlantCode` 非空；显式请求组织必须与 claim 一致 |
| Token V2 追踪 | `sub`、`sid`、`jti`、`pv` 等由 SYS 维护，子应用不得伪造或重签 |

OpenIddict 对 JWT access token 使用 `typ=at+jwt`；为第三方资源服务器互操作，可关闭 Access Token 加密，同时保持授权码和 Refresh Token 的保护。远程 API 应通过 Discovery 获取 issuer 配置与公开签名密钥，而不是共享授权服务器私钥：

- [OpenIddict Token formats](https://documentation.openiddict.com/configuration/token-formats)
- [OpenIddict API token validation](https://documentation.openiddict.com/guides/getting-started/implementing-token-validation-in-your-apis)
- [OpenIddict choosing the right flow](https://documentation.openiddict.com/guides/choosing-the-right-flow.html)

### 2.1 claim 大小写是契约

当前业务准入 claim 是 `BusinessPortalAccess`，不是 `business_portal_access`；组织 claim 是 `PlantCode`。资源服务器必须用契约测试锁住精确名称。禁止各产品组自行做 snake_case、camelCase 或框架默认映射后再猜字段。

推荐资源服务器设置 `MapInboundClaims=false`，直接按 OIDC/JWT 原始 claim 名判断。若所用框架必须映射 claim，映射表必须有自动化测试，并在团队手册中显式记录。

### 2.2 门户会话槽与职责

| 会话槽 | Client / audience | 准入身份 | 使用范围 |
|---|---|---|---|
| 管理槽 | `sys-console-web` / `sys-console` | 系统管理员 | SYS.3 管理控制台 |
| 业务槽 | `business-portal-web` / `business-portal` | 普通业务用户 | BP 及 MDM/SRM/TPM/MES/AIOS 等嵌入应用 |
| 审计槽 | `audit-portal-web` / `audit-portal` | 安全审计员 | AuditPortal |

同一浏览器可以并存三个槽，但各 client 只能读取自己的槽。关闭标签页不等于注销；退出当前门户只撤销本槽，显式“退出全部门户”才清除全部槽。系统管理员不能因管理权限自动取得 AuditPortal 审计权限，业务子应用也不得读取管理槽或审计槽 Token。

### 2.3 401 与 403 语义

| 场景 | 结果 | 说明 |
|---|---|---|
| 无 Token、坏签名、过期、错 issuer、错 audience、错 typ | 401 | 身份凭证无效，返回标准 `WWW-Authenticate: Bearer` |
| Token 有效但缺 scope、错门户职责、无业务权限、组织不允许 | 403 | 已识别身份，但无权执行目标操作 |
| 上游服务不可用 | 503 | 不得伪装成 401 或空数据 |
| 合法查询没有业务记录 | 200 + 明确空集合/业务空态 | 不能用 mock 或固定空壳冒充成功 |

## 3. 子应用 API 改造

### 3.1 开工前盘点

逐个 API 仓输出以下矩阵，任何未知项保持 `blocked`，不得猜配置：

| 盘点项 | 搜索重点 | 迁移结果 |
|---|---|---|
| 旧认证 Scheme | `JYInfo`、`JwtOptions`、`SecurityKey`、`AddJwtBearer`、自定义 middleware | 列出所有运行入口与默认 Scheme |
| 对称密钥 | appsettings、环境变量、Consul、CI 变量、代码常量 | 标记读取点；禁止把值写进报告 |
| Token 来源 | URL/hash/query、localStorage、cookie、Wujie props、postMessage | 列出每个前端和移动端 |
| Claim/Policy | issuer、audience、scope、角色、AuthTag、PlantCode、数据范围 | 区分认证门与业务授权门 |
| API base | 10.8 独立端口、10.31 同源路径、dev proxy | 标出生产真实调用链 |
| 401 行为 | 自动刷新、重放、跳登录、清 storage、toast | 找出会误清 BP 会话的逻辑 |
| 业务证据 | 有数据的查询、可回读写操作、403 账号、切厂数据 | 准备真实验收数据 |

### 3.2 ASP.NET Core 8 参考配置

以下示例使用系统 `JwtBearer` 通过 Discovery/JWKS 验签。团队也可以使用 OpenIddict Validation；无论选择哪个库，验收合同相同。

```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var oidc = builder.Configuration.GetSection("Authentication:SysOidc");
var authority = oidc["Authority"]
    ?? throw new InvalidOperationException("Authentication:SysOidc:Authority is required.");
var audience = oidc["Audience"]
    ?? throw new InvalidOperationException("Authentication:SysOidc:Audience is required.");

builder.Services
    .AddAuthentication("SysOidcBearer")
    .AddJwtBearer("SysOidcBearer", options =>
    {
        options.Authority = authority;
        options.Audience = audience;
        options.RequireHttpsMetadata = true;
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = authority,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            ValidTypes = new[] { "at+jwt" }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SysBusinessPortal", policy =>
    {
        policy.AddAuthenticationSchemes("SysOidcBearer");
        policy.RequireAuthenticatedUser();
        policy.RequireAssertion(context =>
        {
            var scopes = context.User.FindAll("scope")
                .SelectMany(c => c.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries));

            return context.User.FindFirst("portal")?.Value == "business"
                && string.Equals(
                    context.User.FindFirst("BusinessPortalAccess")?.Value,
                    "true",
                    StringComparison.OrdinalIgnoreCase)
                && scopes.Contains("sys.api", StringComparer.Ordinal)
                && !string.IsNullOrWhiteSpace(context.User.FindFirst("PlantCode")?.Value);
        });
    });
});
```

Controller 不能只写裸 `[Authorize]` 就结束迁移。至少叠加门户准入与原业务权限：

```csharp
[Authorize(AuthenticationSchemes = "SysOidcBearer", Policy = "SysBusinessPortal")]
[Authorize(Policy = "Tpm.WorkOrder.Read")]
[HttpGet("work-orders")]
public Task<IActionResult> GetWorkOrders(...) => ...;
```

如框架不允许同名多个 Policy 直接叠加，应注册组合 Policy；不得删除原角色、AuthTag、数据范围或审批状态约束来换取 200。

### 3.3 非 .NET 技术栈

Java/Spring、Node、Go 等资源服务器必须使用成熟 OIDC/JWT 库并完成同一验证矩阵：

1. 从 HTTPS Discovery 读取 `issuer` 和 `jwks_uri`。
2. 缓存并按 `kid` 刷新 JWKS；未知 `kid` 时重新取一次，仍未知则 401。
3. 只允许批准的非对称算法；不得接受 `alg=none`，不得把 Token 自报算法直接当信任配置。
4. 严格校验 issuer、audience、expiration/not-before、`typ=at+jwt`。
5. 校验 `sys.api`、业务门户职责与 `PlantCode`。
6. 再执行产品自己的角色、菜单权限和数据范围授权。

### 3.4 TLS 与证书

- Discovery/JWKS 必须走 HTTPS 并严格验证服务端证书。
- 内网 CA 的根证书可以加入容器 trust store；只放公开根证书，不放 SYS 签名私钥、AD 私钥或任意共享 HMAC 密钥。
- 禁止生产代码使用 `DangerousAcceptAnyServerCertificateValidator`、`verify=false`、`NODE_TLS_REJECT_UNAUTHORIZED=0` 或自定义“全部接受”回调。
- 证书轮换应由标准 CA 链承接；镜像只在根 CA 变化时重建，叶子证书正常续签不应要求每个子应用重新发版。

### 3.5 必需自动化测试

每个资源服务器至少覆盖：

- 正例：正确签名、issuer、audience、typ、scope、`portal=business`、`BusinessPortalAccess=true`、有效 PlantCode。
- 反例：无 Token、坏签名、过期、错 issuer、错 audience、错 typ、缺 scope、错门户、缺业务准入、缺 PlantCode。
- 授权：有身份无 AuthTag/角色返回 403；不得因迁移把业务 Policy 变成只校验登录。
- 组织：header/query/body 中的 PlantCode 与 Token claim 不一致返回 403；查询只能读授权组织数据。
- 可用性：Discovery/JWKS 不可达时 fail closed，并输出无 Token 内容的结构化诊断。

## 4. 子应用前端与 Bridge V1

### 4.1 强制消息顺序

```text
子应用注册 message listener
        ↓
subapp-ready(requestId, capabilities)
        ↓
BP 校验 appName + 授权 registry + exact source/origin
        ↓
bp-context-sync(accessToken, PlantCode, contextVersion)
        ↓
子应用原子写入内存上下文
        ↓
subapp-context-applied(requestId, contextVersion)
        ↓
允许发起第一笔业务 API
```

必须支持的消息族：`subapp-ready`、`bp-context-sync`、`subapp-context-applied`、`bp-route-sync`、`bp-session-clear`、`subapp-auth-error`。schema、requestId、N/N-1 兼容和恢复规则以 [ADR-047](../decisions/ADR-047-bp-subapp-bridge-v1.md) 与 [子应用接入手册附录 O](subapp-onboarding-guide.md#附录-o-bpsubappbridge-v1-与单身份多运行时发布标准) 为准。

### 4.2 Token 保存与请求

- Access Token、PlantCode、contextVersion 只保存在当前 iframe JavaScript 内存。
- axios/fetch/upload/download 必须共用一个认证适配层；每笔请求从同一 context snapshot 同时取 Token 与 PlantCode。
- Token 不得进入 query、fragment、浏览器 storage、cookie、IndexedDB、错误对象、console、APM、截图或下载文件名。
- 子应用不接收 Refresh Token，不直接调用 SYS token endpoint 刷新 BP 会话。
- `bp-session-clear` 到达后立即清空内存并阻止新请求；已在途响应必须按旧 contextVersion 丢弃，不能污染新组织页面。

### 4.3 401 恢复

1. 子应用在同一 contextVersion 第一次收到 401，向 BP 发送 `subapp-auth-error`。
2. BP 调自身会话判活；有效则刷新/重发上下文，无效才结束业务槽。
3. 一个 contextVersion 最多恢复一次。
4. GET 是否重试由 BP/子应用协议显式决定；POST/PUT/PATCH/DELETE 默认不自动重放。
5. 旧 contextVersion 的迟到 401 不得退出当前新会话。

## 5. 容器化标准

### 5.1 运行拓扑

当前 MOM 集成环境：

| 层 | 地址 | 职责 |
|---|---|---|
| Docker 主机 | `172.21.10.28` | 运行前后端容器、APISIX 及平台依赖 |
| 统一入口 | `https://172.21.10.31` | 用户和浏览器访问；APISIX 按 path 转发 |
| 旧 IIS | `172.21.10.8` | 仅未容器化应用的过渡发布目标；容器化应用退出此链 |

客户部署必须把这些地址参数化；禁止把演示 IP 写死在源码。推荐同源路径：

| 产品 | 前端 | API |
|---|---|---|
| TPM | `/tpm/` | `/tpmapi/` |
| MES | `/mes/` | `/mesapi/` |
| AIOS | `/aios/` | `/aiosapi/` |

路径最终以 SYS 应用中心 `VirtualPath`、manifest 和 APISIX route 三方一致为准。

### 5.2 镜像硬要求

- 多阶段构建；builder 与 runtime 分离。
- 基础镜像使用受支持版本并锁 digest；升级 digest 走依赖更新批次。
- runtime 以非 root 用户运行；只开放容器内部必要端口。
- 生产配置来自环境变量/挂载 secret/受控配置文件；源码和镜像层不含密码、PAT、私钥、数据库生产凭据。
- 后端提供 `/health/live`；依赖就绪另用 `/health/ready`。前端至少提供静态入口健康探针。
- 日志写 stdout/stderr；不得把 Access Token、Cookie、Authorization header 写日志。
- 镜像 tag 不可变，格式推荐 `ci-<buildId>-<gitSha12>`；禁止只用 `latest` 作为发布和回滚证据。
- 容器设置 restart policy、资源限制和合理的 stop grace period；写操作服务必须正确处理 SIGTERM。

.NET 8 官方基础镜像已支持非 root `app` 用户和 `$APP_UID`，可直接作为项目 Dockerfile 基线：[Microsoft .NET 8 containers](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-8/containers)。

### 5.3 .NET API Dockerfile 骨架

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0-noble@sha256:<approved-digest> AS build
WORKDIR /src
COPY . .
RUN dotnet restore Product.Api/Product.Api.csproj
RUN dotnet publish Product.Api/Product.Api.csproj \
    --configuration Release --no-restore --output /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0-noble@sha256:<approved-digest> AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Container \
    DOTNET_EnableDiagnostics=0

# 只安装公开根 CA；不得复制 SYS/AD 私钥。
COPY deploy/certs/mom-platform-root-ca.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates

COPY --from=build --chown=$APP_UID:0 /out/ ./
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /health/live HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" >&3 && grep -q " 200 " <&3'
ENTRYPOINT ["dotnet", "Product.Api.dll"]
```

`<approved-digest>` 必须由产品组在更新时填写真实 digest；禁止直接复制占位符进入 CI。

### 5.4 前端容器要求

- Vite/React/Vue 构建时 base 与 SYS `VirtualPath` 完全一致。
- Nginx/静态服务器要为 SPA 深路由回退到对应 base 下的 `index.html`，同时放行真实 JS/CSS/JSON/locale/manifest 文件。
- 资源 URL、API base 和 OIDC Authority 通过环境档位或运行时配置注入；生产调用统一使用 10.31 同源路径。
- `/menu-manifest.json` 或后端 manifest API 必须返回 JSON，不能被 SPA fallback 变成 HTML 200。
- 安全响应头、缓存策略和压缩按前端工程标准执行；`index.html` 不长缓存，带内容哈希的 assets 可长期缓存。

### 5.5 配置键建议

后端：

```json
{
  "Authentication": {
    "SysOidc": {
      "Authority": "https://172.21.10.31/sys",
      "Audience": "business-portal",
      "RequireHttpsMetadata": true
    }
  }
}
```

容器环境变量使用双下划线：

```text
Authentication__SysOidc__Authority=https://172.21.10.31/sys
Authentication__SysOidc__Audience=business-portal
Authentication__SysOidc__RequireHttpsMetadata=true
```

禁止保留生效中的 `JwtOptions:SecurityKey` 或 `JYInfo` 默认 Scheme 来做“自动 fallback”。迁移期如必须双栈，应使用显式开关、默认关闭、独立 Scheme、可观测命中计数，并在真实 E2E 后删除。

### 5.6 10.28 SSH 部署账户

- 统一部署用户名：`webdeploy`。
- 当前集成主机已创建该账户（UID 1001），属于 `sudo` 组但不属于 `docker` 组；容器管理必须通过受控 `sudo` 执行。不得仅为省去 `sudo` 把账户加入 `docker` 组，因为 Docker daemon 权限等价于主机 root 能力。
- 首选认证方式：由平台管理员把产品组 SSH 公钥安装到 10.28 的 `webdeploy` 账户，并按最小权限配置 Docker 部署能力。
- 必须使用密码的自动化场景：从 ADO Secret 变量 `DEPLOY_SSH_PASSWORD` 或企业密码库在运行时注入；禁止写入仓库、Dockerfile、compose、流水线明文、日志或交接文档。
- 开发机临时运维：凭据存本机系统 Keychain/凭据管理器，执行时即时读取；不得复制到 shell history。
- 手册只登记账户名和凭据获取渠道，不登记实际密码。密码轮换不需要修改代码或重写 Git 历史。

## 6. APISIX 发布标准

### 6.1 路由原则

- 对外只暴露 10.31 HTTPS；容器端口默认不直接提供给终端用户。
- 前端和 API 使用不同 path，后端 API path 不得被 SPA fallback 捕获。
- upstream 指向容器 DNS 名和内部端口，不回落到 10.8 IIS。
- route/upstream 变更必须幂等；更新前备份当前配置，更新后同时探测容器直连和 10.31 网关。
- APISIX 可以做限流、TLS、追踪和基础路由，但不得删除 `Authorization`，不得用 `X-User-*` 等头替代 API 验签。
- 对网关传入的身份相关 header 先清理或覆盖；后端身份只来自经验证的 Token。

### 6.2 最小探针

| 探针 | 预期 |
|---|---|
| `GET https://<gateway>/<app>/` | 200，加载真实静态资源 |
| `GET https://<gateway>/<app>/menu-manifest.json` | 200 + JSON（如采用静态 manifest） |
| `GET https://<gateway>/<app>api/health/live` | 200 |
| 匿名访问受保护 API | 401，不是 200/302/502 |
| 合法业务 Token 访问代表 API | 200 + 真实数据/业务空态 |
| 错 audience 或错门户 Token | 401/403，按第 2.3 节稳定返回 |

## 7. CI/CD 标准流程

### 7.1 顺序

```text
本地 unit/contract/build
        ↓
本地受影响页面 E2E（有隔离账号和可用环境时）
        ↓
commit → pull/rebase → ADO + GitHub 双推
        ↓
CI 构建/测试/产出不可变容器上下文
        ↓
上传 10.28 → 远程 build/tag → candidate 替换 → health
        ↓
10.31 APISIX smoke
        ↓
L0 floor + 按 affectedModules 的定向部署态 E2E
        ↓
记录精确 commit/build/image/业务证据
```

本地先做定向 E2E 可以减少唯一 ADO Agent 的无效排队，但不能替代部署态 E2E。若 SYS 配置为同账号单会话，本地与 CI 禁止并发使用同一账号；应使用隔离账号，或等待当前 CI 终态后再跑本地浏览器测试。

### 7.2 后端契约触发消费者

后端仓维护 `ci/contract-consumers.json`（名称可按项目约定），至少把以下路径视为消费契约：

- Controllers、DTO、ViewModel、OpenAPI/schema。
- Authentication、Authorization、Program/Startup。
- OIDC appsettings、部署配置、Dockerfile、根 CA。
- 菜单 manifest 与网关 API base。

后端部署成功且 diff 命中上述路径后，自动 queue BP/独立前端的 `e2eOnly=true` 定向流水线，并传 `affectedModules`。触发失败必须告警；不得因“后端 CI 自己是绿的”忽略消费者未验证。

### 7.3 E2E 分层

| 层 | 何时 | 最小内容 |
|---|---|---|
| L0 floor | 每次 CI | 登录/会话、入口健康、关键静态资源、匿名 401 |
| L1 定向 | 改动路径能映射模块 | 改动页面 + 关联菜单/API/共享消费者 + 代表真实数据链 |
| L2 全量 | 共享基座大改、映射未知或专项验收 | 全菜单/全角色/全异常矩阵 |

常规改动不要求每次全量 E2E，但不能只测修改文件的孤立组件。认证中间件、Token claim、Bridge、API base、APISIX route 属于共享基础变化，至少扩大到所有实际消费者。

### 7.4 失败判定

以下均为失败，不得标绿：

- 只拿到 SPA HTML 200，没有真实业务 API。
- iframe 能打开，但目标 API 401/403/5xx。
- API 200 但固定空数组，而数据库/业务应有数据。
- 容器 `Up` 但 health 为 unhealthy，或网关仍指 10.8。
- E2E 忽略 iframe 网络错误、console error 或错误 toast。
- 流水线部署的是非当前 SHA、`latest` 或无法回滚的临时 tag。

## 8. 从 JYInfo/IIS 迁移的执行批次

### 批次 0：锁定现状

- 完成第 3.1 节盘点；列出所有 PC、移动端、API、定时任务和第三方消费者。
- 建立旧 Token 命中计数，但日志不得记录 Token 内容。
- 准备 BP 业务用户、无权限用户、至少两个 PlantCode（如业务支持）和真实数据。
- 确认共享 10.28 是否有其它会话正在部署，先取得当前镜像/路由/容器证据。

### 批次 1：API OIDC-only 候选

- 新增标准 OIDC Scheme 与业务准入 Policy。
- 保留并逐项迁移原业务 Policy，不改变数据权限。
- 先写正反例测试，再改实现。
- 迁移候选默认不把 JYInfo 设为 fallback；确需双栈时必须显式开关和命中遥测。

### 批次 2：前端 Bridge V1

- listener 先于 `subapp-ready`。
- Token/PlantCode/contextVersion 原子应用并 ACK。
- 所有 HTTP 客户端、上传下载和 WebSocket（如有）统一读取内存上下文。
- 删除 URL fragment/query、localStorage/cookie 读写；保留 N-1 仅限已批准迁移窗。

### 批次 3：容器与网关

- 前后端各自构建不可变镜像，非 root、健康检查、无秘密。
- 在 10.28 用 candidate 容器验证，不覆盖无法回滚的现有 live。
- 创建/更新 10.31 route，并确认 upstream 不含 10.8。
- 匿名 401、合法 Token 200、错职责 403、health 200。

### 批次 4：CI 与部署态 E2E

- 本地定向测试通过后提交、双推。
- CI 部署精确 SHA；后端鉴权变化触发 BP 消费者 E2E。
- 从 BP 真实登录，逐业务模块至少进入一个代表叶子页，断言真实 API、真实数据/业务空态、URL 无 Token。
- 验证刷新、切厂、撤销、单门户退出、全局退出和 401 恢复。

### 批次 5：切换与退出旧链

- 关闭该应用 JYInfo/fragment legacy 开关。
- 连续观察期内旧 Token 命中为零；业务与错误率正常。
- 从该应用 CI 删除 10.8 IIS Deploy stage，保留历史回滚文档而非活动双发。
- 删除 APISIX 对 10.8 的 fallback/upstream。
- 更新 SYS 应用中心 URL、菜单 manifest、运维手册和产品组恢复入口。

### 批次 6：全局移除 JYInfo

只有当消费者清单全部满足下列条件，SYS 才删除旧 Token endpoint、cookie、共享密钥与兼容代码：

- PC、移动端、API、作业和第三方调用全部迁移或正式下线。
- 旧 Token 遥测在批准观察窗内为零。
- 各应用 OIDC/容器/网关/部署态 E2E 均有精确版本证据。
- 回滚方案不再依赖重新启用共享对称密钥。

## 9. 产品组交付清单

每个 TPM/MES/AIOS 工作区最终必须提交以下证据：

| 类别 | 交付物 |
|---|---|
| 决策 | 本产品迁移范围、嵌入/独立模式、AppName、API audience、legacy 退出条件 |
| 源码 | OIDC 配置、业务 Policy、Bridge V1、Dockerfile、健康端点、网关/部署脚本 |
| 测试 | 鉴权正反例、组织隔离、原业务 Policy、Bridge 单测、真实 BP 定向 E2E |
| Git | 当前分支、commit SHA、ADO 与 GitHub 远端一致、无未说明脏改 |
| CI | buildId、结果、触发的 affectedModules、部署镜像 tag |
| 运行 | 10.28 容器 healthy、10.31 route/upstream、匿名 401、合法业务 API 200 |
| 业务 | BP 菜单权限正确、代表页面有真实数据/明确空态、保存则必须 fresh GET 回读 |
| 安全 | URL/storage/log 无 Token，镜像无秘密，严格 TLS，私钥未共享 |
| 退出 | JYInfo 命中归零、legacy 开关关闭、10.8 IIS stage 删除、回滚到上一容器镜像可用 |

状态统一使用：`covered`、`pending`、`blocked`、`approved-defer`。只完成 Dockerfile 或只拿到 HTTP 200 必须保持 `partial/pending`，不能宣称迁移完成。

## 10. 故障排查矩阵

| 症状 | 优先检查 | 常见根因 |
|---|---|---|
| 所有 API 401 | `WWW-Authenticate`、Token header/claims 元数据、Discovery/JWKS、容器时间 | 仍认 JYInfo、错 issuer/audience、claim 大小写、CA 不受信、未知 kid |
| SYS API 200、子应用 API 401 | 子应用 Scheme/Policy 与实际 Token 契约对比 | 资源服务器仍使用共享 HS256 或私有 claim 名 |
| 首屏先 401 后 200 | Bridge ready/context/ACK 时序 | 业务 render 早于 context-applied，或 legacy URL Token 与 v1 竞态 |
| 切厂后读到旧数据 | contextVersion、请求快照、PlantCode 一致性 | 新 Token + 旧 PlantCode 混用、旧请求响应未丢弃 |
| 页面能开但无数据 | iframe 网络、API response body、组织数据、业务过滤 | SPA 假 200、API 401 被吞、固定空壳、错 PlantCode |
| Discovery TLS 失败 | 容器 trust store、证书 SAN/链/有效期 | 未安装内网根 CA；禁止用跳过校验绕过 |
| 网关 502/503 | route、upstream DNS/port、容器 health/log | 仍指 10.8、容器名不一致、服务未 ready |
| 本地登录突然被撤销 | CI 队列和相同测试账号 | 同账号单会话策略导致并发 E2E 互踢 |
| CI 绿但 BP 仍异常 | build SHA、运行镜像、消费者触发、部署态 E2E | 只构建未部署、触发 glob 漏 Authentication、E2E 未看 iframe |

## 11. 回滚

回滚必须按“入口 → 运行版本 → 认证兼容”逆序控制：

1. 暂停新的菜单扫描和发布，记录当前 route、容器、镜像 tag。
2. APISIX route 指回上一版健康容器，不直接回落到未验证的 10.8。
3. 恢复上一不可变镜像，验证 health、匿名 401 与代表业务 API。
4. 如处于批准的双栈迁移窗，才可临时恢复该应用自己的 legacy 开关；不得因此重新给新消费者接入 JYInfo。
5. 对写操作不自动重放；由业务幂等键、审计记录和 fresh GET 判断实际状态。
6. 回滚后重跑受影响 BP 定向 E2E，并记录失败版本、回滚版本和根因。

## 12. 与旧标准的关系

- [ADR-047 / Bridge V1](../decisions/ADR-047-bp-subapp-bridge-v1.md) 继续有效；本手册补充其 OIDC Token 格式、资源服务器和容器交付合同。
- [子应用接入业务门户标准](subapp-onboarding-guide.md) 的 manifest、菜单、权限、路由、Bridge 和真实 BP E2E 继续有效；其中附录 M 的 `JYInfo/HS256 共享密钥`已由 ADR-049 取代。
- [IIS 部署标准](cicd-onprem-iis-deploy-standard.md) 仅适用于尚未容器化的存量应用。应用完成本手册验收后必须退出 10.8 IIS 发布链。
- [部署后 E2E 分层](../decisions/ADR-045-post-deploy-e2e-tiered-scoping-governance.md) 和[跨仓消费者触发](../decisions/ADR-046-cross-repo-contract-driven-e2e-trigger.md)继续作为 CI 门禁。

## 13. 版本记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-14 | 1.0 | 以 SYS/BP/MDM 实证形成跨产品组 OIDC、Bridge V1、10.28 容器、10.31 APISIX、定向 CI/E2E 与 JYInfo 退出标准 |
