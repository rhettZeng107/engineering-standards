# ADR-051：MOM 三门户独立登录与业务空闲续会话

- **Status**：Accepted
- **Date**：2026-09-15
- **Decider**：产品负责人
- **Scope**：跨项目 / SYS、BP、AuditPortal、MDM 及后续 BP 嵌入子应用
- **上游决策**：[ADR-049：MOM OIDC 与容器化交付](ADR-049-mom-oidc-containerized-delivery.md)

## Context（背景）

三个门户服务不同职责：SYS.3 的系统管理员、BP 的普通业务用户和 AuditPortal 的安全审计员不能借用彼此的登录槽。BP 首次打开时跳到 SYS 控制台登录页，既误导用户，也使业务 Client 的授权上下文与控制台登录入口混在一起。固定的后端 30 分钟空闲、8 小时绝对上限又会让持续作业的 BP 用户遇到 401；但后台轮询和 Token 刷新不能冒充真实用户活动。

浏览器 Refresh Token 必须有界。不能通过轮换同一固定到期的令牌族，让其超越初次授权的期限；继续活跃的业务会话需要重新取得一组经 Client、中央会话和权限校验的授权码与令牌，而不是无限延长原 Refresh Token。

## Decision（决策）

**一句话**：三个门户保留独立登录页和独立中央 Cookie 槽；Standard 档 BP 以真实用户操作滑动四小时空闲会话，短期 Access 无感刷新，固定 Refresh 族到期后在仍有效的业务槽中重新走同源 Code+PKCE，不跨槽、不跳走当前业务页面。

- 规范 BP 登录地址为小写路径 `/bp/#/login`。业务 Client 的未登录授权请求只回该入口；`returnUrl` 必须仍属于同源 SYS 授权端点，并精确匹配 `business-portal-web`、回调 URI、授权码、PKCE S256 和 state。授权码回调、管理和审计入口仍各自独立。
- Standard 档：Access 15 分钟；管理槽中央会话最多 12 小时，审计槽最多 8 小时；业务槽最长空闲 4 小时，不设置另一个固定绝对上限。业务槽仅由 BP 页面或已完成 Bridge V1 exact source/origin/contextVersion 握手的活动子应用的真实键盘/鼠标操作滑动；API 轮询和 Token 定时刷新不滑动业务空闲计时。
- 浏览器 Refresh Token 初次授权族固定 12 小时并轮换；未满四小时空闲且会话、Client、职责、权限版本和组织仍有效时无感取得新 Access。固定 Refresh 族失效后，只能在当前业务中央 Cookie 仍有效时，使用同源隐藏回调完成一次新的 `prompt=none` Authorization Code + PKCE；state、PKCE verifier、回调来源和消息来源均精确绑定。失败或空闲达到四小时则停在 BP 独立登录入口，不能借其它门户槽静默续期。
- SYS 后端 Refresh 签发前重新核对中央会话、当前账号槽、权限版本和业务职责。注销、角色/权限变化或四小时空闲后，旧 Access/Refresh 不能恢复会话。
- `MlpsLevel2` 等保档位继续执行更严格的全局空闲与绝对时长参数上限，不被 Standard 业务滑动规则覆盖；部署档位与三员模式的关联保持原契约。AuditPortal 的审计角色校验不因共享认证身份放宽。
- Bridge V1 子应用只报告真实操作事件并接收更新后的短期 Access/PlantCode；不得取得 BP Refresh Token，不得将 Token 写入 URL。

## Consequences（影响）

- 持续作业的业务用户不会仅因 Access 15 分钟到期而被踢出；关闭标签页不视为注销，但重新打开时仍受四小时空闲与当前权限约束。
- 子应用必须增加可校验的真实操作信号。仅 BP 及 MDM 已有实现不能代表 SRM、TPM、MES 等其它产品组完成四小时语义；未升级者保持 `pending`。
- 当前 BP public client 仅在本页JavaScript内存持有轮换的 Refresh Token，不写 Web Storage、URL或Cookie；页面重载后凭有效业务中央槽重新走同源授权。这仍要求严格 XSS/CSP、来源与回调约束。后续若采用 BFF，可把 Refresh 保管移到服务端，但不得改变本 ADR 的 Client 槽、四小时空闲和注销边界。

## Alternatives Considered（替代方案）

- 固定 30 分钟空闲、8 小时绝对上限：会中断正常 BP 作业；仅保留给较严格部署档位。
- 将同一 Refresh Token 族无限滑动：违背固定有效期边界；不选。
- 无 Token 时自动跳 SYS 控制台登录页或借管理/审计槽：会混淆门户职责与 returnUrl；不选。
- 后台轮询自动续业务空闲：不能证明用户仍在作业；不选。

## Related（相关引用）

- [MOM OIDC 与容器化手册](../standards/mom-oidc-containerized-delivery-guide.md)
- [BP 子应用发布总纲](../standards/subapp-bp-release-pipeline-standard.md)
- [BP Bridge V1](ADR-047-bp-subapp-bridge-v1.md)
- [RFC 10017：Refresh Token 固定有效期边界](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.3.2.3)
