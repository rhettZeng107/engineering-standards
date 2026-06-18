# ADR-043: On-Prem 部署服务器 SSH 运维通道

- 状态:Accepted
- 日期:2026-06-18
- 关联:ADR-040(CI/CD on-prem IIS 部署通道)/ ADR-041(跨工作区自治协作)/ ADR-035(LSP sub-Claude gateway,同属"Claude 远程取证/操作"能力族)

## Context

CI/CD 自愈、部署后验证、IIS 服务器排障长期靠**人工 RDP 进服务器手贴 PowerShell、再把输出贴回会话**—— 慢、易错、夜间无人值守断链(典型:某 IIS 服务器 WMSvc/msdeploy 503 排查拖了数天,全靠人工往返)。

Claude 的 Bash 跑在涛哥 Mac 上,Mac 与内网部署服务器同网可达。只要服务器开 OpenSSH Server + 装公钥,Claude 即可直接跑远程命令取证/操作,把"人工贴"变"Claude 直跑"。

## Decision

**Claude 经机器级 SSH 密钥直连 on-prem Windows 部署服务器跑远程 PowerShell**,作为跨工作区默认运维通道:

1. **通道 = 原生 `ssh`(经 Bash 工具),不用 SSH MCP**:MCP 只是给 ssh 套壳,不增能力,反增依赖与凭据落地面。
2. **密钥机器级**:私钥 `~/.ssh/id_sys_deploy`(ed25519,无 passphrase)只留 Mac;**所有工作区天然共享**,不每工作区重配。
3. **每服务器一次性 onboarding**:装 OpenSSH Server + 公钥。管理员组账户公钥进 `administrators_authorized_keys` 且 ACL 只留 SYSTEM+Administrators(`icacls /remove:g *S-1-5-11` 去 Authenticated Users,否则严格模式拒钥)。
4. **分层落地**(套现有文档架构,各司其职):
   - 通用方法/SOP → 本 ADR + `standards/onprem-server-ssh-ops-standard.md` + user 级 skill `onprem-server-ssh-ops` + `templates/onprem-ssh-pubkey-install.ps1`。
   - **内网清单(host / 账号 / 环境)→ 各工作区本地 memory `reference_<srv>_ssh_access` + gitignored `docs/ops/deployment-ip-map.md`**,绝不入公开仓。
   - 全局 `~/.claude/CLAUDE.md` 一行指针 + `workspace-bootstrap` skill §6.4 引用 → 保证每会话/每新工作区知道并继承。

## Alternatives considered

| 方案 | 结论 |
|---|---|
| SSH MCP server | 拒。当前无连任何 SSH MCP;套壳不增能力,凭据多一处落地,维护点增加。 |
| 人工 RDP 手贴(现状) | 拒。慢 / 易错 / 夜间断链。 |
| 每工作区会话给提示词手动指导 | 拒。手动、易漏、不 DRY —— 正是 skill 要消灭的;仅偶发一次性才用提示词。 |
| 内网 IP/账号写进公开 standards 仓便于复用 | 拒。engineering-standards 是公开 GitHub 仓,内网信息属泄露面;清单留本地 memory。 |

## Consequences

- ✅ CI/CD 自愈 / 部署验证 / 服务器排障从"人工贴"变"Claude 直跑",大幅提速;夜间自治可用。
- ✅ 跨工作区零额外配置即得能力(私钥机器级);新部署服务器只需一次 onboarding。
- ⚠️ 安全硬约束(写进 standard):私钥只留 Mac、服务器只内网、优先普通部署账号而非管理员、公开仓零内网信息。
- 适用范围:SYSV2 / SRMV2 / MES / WMS / EAM / TPM 等所有有 on-prem 部署服务器的工作区。
