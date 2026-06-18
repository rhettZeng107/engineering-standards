# On-Prem 部署服务器 SSH 运维标准

> 决策:ADR-043。配套:user 级 skill `onprem-server-ssh-ops`(harness 按需触发的可执行版)+ `templates/onprem-ssh-pubkey-install.ps1`(onboarding 脚本)。
> **本标准只放通用方法,零内网信息。** host / 账号 / 环境清单走各工作区本地 memory `reference_<srv>_ssh_access` + gitignored `docs/ops/deployment-ip-map.md`,**绝不写入本(公开)仓**。

## 1. 适用范围

任何有 on-prem Windows 部署服务器(IIS / Web Deploy)的工作区(SYSV2 / SRMV2 / MES / WMS / EAM / TPM …)。用于 CI/CD 自愈、部署通道诊断、IIS 站点运维、部署后验证 —— 替代人工 RDP 手贴。

## 2. 通道:原生 ssh(不用 MCP)

Claude 的 Bash 跑在涛哥 Mac 上,SSH 私钥机器级(`~/.ssh/id_sys_deploy`,ed25519,无 passphrase),**所有工作区天然共享**。用原生 `ssh`,不用 SSH MCP(套壳不增能力反增维护点,ADR-043)。

```bash
ssh -i ~/.ssh/id_sys_deploy <user>@<host> "<PowerShell>"                                  # 单行
ssh -i ~/.ssh/id_sys_deploy -o BatchMode=yes -o ConnectTimeout=10 <user>@<host> "whoami"  # 测连通(不卡密码)
ssh -i ~/.ssh/id_sys_deploy <user>@<host> "powershell -NoProfile -Command -" < diag.ps1   # 多行走 stdin(避引号地狱)
```

**铁律**:
- 多行/复杂 PowerShell **必走 stdin 管道**,不要内联拼字符串(ssh→cmd→PowerShell 三层引号 + `$`/`*`/`()` 转义极易被吃,实测 `sc.exe`/内联 netsh 反复翻车)。
- 带账户名的命令(icacls / netsh / sc)**用 SID 不用本地化名**(中文 Windows 兼容):`*S-1-5-32-544` Administrators / `*S-1-5-18` SYSTEM / `*S-1-5-11` Authenticated Users / `*S-1-5-19` LocalService;SDDL 用 `BA`/`SY`/`LS`。

## 3. 新服务器一次性 onboarding

### 3.1 开 OpenSSH Server(服务器侧管理员 PowerShell)

```powershell
Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0"
Start-Service sshd; Set-Service -Name sshd -StartupType Automatic
Get-NetFirewallRule -Name *ssh*   # 核对 OpenSSH-Server-In-TCP 入站放行(22)
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
  -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
Restart-Service sshd
```

### 3.2 装公钥(按目标账户类型)

| 账户类型 | authorized_keys 位置 | ACL 要求 |
|---|---|---|
| **管理员组** | `C:\ProgramData\ssh\administrators_authorized_keys`(放个人 `~/.ssh` **不生效**) | **只能** SYSTEM + Administrators |
| **普通用户** | `C:\Users\<user>\.ssh\authorized_keys` | 默认即可,简单 |

**管理员组装钥的坑(必踩)**:`icacls /inheritance:r` 清不掉残留的 `Authenticated Users:(RX)`(它是显式 ACE)→ 必须 `icacls <file> /remove:g "*S-1-5-11"` 显式移除,否则 OpenSSH 严格模式拒钥 `Permission denied (publickey)`,且**不报具体原因**。

一键脚本:`templates/onprem-ssh-pubkey-install.ps1`(填本机 `~/.ssh/id_sys_deploy.pub` 后整段贴服务器跑)。

### 3.3 验连通(Mac 侧)

```bash
nc -z -v -w 5 <host> 22                                                   # 先验网络可达
ssh -i ~/.ssh/id_sys_deploy -o BatchMode=yes <user>@<host> "whoami; hostname"   # exit=0 即通
```

落清单:onboarding 成功后,把 host/账号/环境写进**本工作区** memory `reference_<srv>_ssh_access`(不入本仓)。

## 4. 诊断套路(部署通道/IIS)

| 目的 | 命令 |
|---|---|
| 服务态 | `Get-Service W3SVC,WMSVC,MsDepSvc` |
| IIS 站点+绑定 | `Import-Module WebAdministration; Get-Website` |
| 端口监听 | `Get-NetTCPConnection -LocalPort <p> -State Listen`(owner pid=4=HTTP.sys 正常) |
| HTTP.sys 状态 | `netsh http show servicestate` / `view=requestq`(请求队列↔进程绑定) |
| SSL 绑定 | `netsh http show sslcert ipport=0.0.0.0:<p>` |
| URL 预留 | `netsh http show urlacl`(账户↔URL 授权) |
| TLS 外验 | Mac:`openssl s_client -connect <host>:<p> -tls1_2`(握手成不成、给哪张证书) |
| 应用层日志 | `Get-WinEvent -LogName Application -FilterHashtable @{Level=2,3}` / IIS 站点日志目录 |

诊断纪律走 `superpowers:systematic-debugging`(根因优先,禁先开药)。

### 诊断案例:WMSvc「服务 Running 但请求静默重置」

实战根因链(供同类深层故障参照):症状 = TCP/TLS 握手都成(openssl `-tls1_2` 给得出证书),但一发 HTTP 请求即被重置、应用层**零日志、零 event log、重启不愈**。

逐层证伪法:① 证书有效+私钥(`Cert:\LocalMachine\My`)② SSL binding 存在(`show sslcert`)③ TLS 版本(openssl 分协议)④ 注册表值类型对(历史踩过 `SslCertificateHash` 写成 REG_SZ→应 REG_BINARY)⑤ urlacl 账户匹配(`show urlacl` vs 服务运行账户)⑥ 请求队列绑定(`view=requestq`)。表层全健康仍重置 ⇒ 判定为组件内部深层故障,**及时止损**(若已有可用替代通道则搁置,不为冗余通道停机重装)。

## 5. 安全红线

- 私钥**只留 Mac**,绝不外传 / 不入任何 git。
- 部署服务器**只在内网**,勿暴露公网。
- 长期自动化优先**普通部署账号**而非管理员(权限面最小化)。
- 本标准 / ADR / skill / 模板入的是**公开仓** → **内网 IP / 账号 / 密码绝不写入**;清单只进各工作区本地 memory。
