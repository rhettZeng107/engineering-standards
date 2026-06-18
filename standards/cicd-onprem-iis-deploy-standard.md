# 自托管 Agent → 内网 IIS 部署标准(On-Prem IIS Deploy Standard)

> 决策依据:[ADR-040](../decisions/ADR-040-cicd-onprem-iis-deploy-channel.md)。
> 适用:所有「ADO self-hosted Agent → 内网 IIS」部署的项目 —— SYSV2(6 仓)/ MES(2 仓)/ 未来 WMS / EAM / TPM。
> 用法:各工作区 Claude 按本标准改 `azure-pipelines.yml` 部署步骤;MES 团队共享同一份。
> **本文不含任何密码 / 密钥**;凭据一律走 ADO 变量组 secret。

---

## 0. 一句话

部署通道走 **Web Deploy 远程代理服务 MsDepSvc**(`http://<IIS_HOST>/MsDeployAgentService` + `authType=NTLM` + 目标机本地管理员凭据),**不用 WMSvc Handler(`:8172/msdeploy.axd`)**。dest 用 **IIS 站点/应用路径**,不用盘符物理路径。

---

## 1. 拓扑前提(为什么必须远程通道)

| 角色 | 示例(SYSV2) | 说明 |
|---|---|---|
| ADO Server | `172.21.10.30:8090` | git origin + 流水线编排 |
| Self-hosted Agent VM | `172.21.10.15` | 流水线执行节点,**与 IIS 不同机** |
| IIS 部署目标 | `172.21.10.8`(机器名 `JYSYSV2DEMO`) | 前后端 IIS 站点 |

Agent ≠ IIS 同机 → 不能本地拷文件 → 必须远程部署通道。

---

## 2. IIS 目标机一次性准备(运维 / 管理员执行一次)

1. **装 Web Deploy «Complete»**(含 Remote Agent Service)。确认服务在:
   ```powershell
   Get-Service MsDepSvc        # 期望 Running(Web Deployment Agent Service)
   Set-Service MsDepSvc -StartupType Automatic; Start-Service MsDepSvc
   ```
2. **建本地管理员部署账号**(示例 `rhett.zeng`):加入本地 `Administrators` 组。
3. **放行远程本地管理员令牌**(工作组机器必需,否则远程管理员被 UAC 降权 → C$/管理操作 access denied):
   ```powershell
   New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" `
     -Name "LocalAccountTokenFilterPolicy" -Value 1 -PropertyType DWord -Force
   ```
4. **防火墙**:放行 80(MsDepSvc)。(SMB 445 不需要 —— 本标准不走文件直拷。)

> WMSvc(8172)**无需修复、无需使用**。它坏了也不影响本通道。

## 3. ADO 一次性准备(每个项目各做一次 —— 变量组按项目隔离!)

在该项目的部署变量组(SYSV2 = `SYSV2-Deploy-Secrets`)加两个变量:

| 变量名 | 值 | secret? |
|---|---|---|
| `DEPLOY_ADMIN_USER` | `<MACHINE>\<account>`(如 `JYSYSV2DEMO\rhett.zeng`) | 否 |
| `DEPLOY_ADMIN_PWD` | 目标机**本地账号**的密码 | **是 🔒** |
| `IIS_TARGET_HOST` | IIS 主机 IP(如 `172.21.10.8`) | 否(多数项目已有) |

> ⚠️ ADO 变量组是**项目级**的。给一个项目加了,其它项目仍要各自加。

---

## 4. yml 部署步骤模板

> 只改部署(Deploy)那一步;Build / Test / EF Bundle / Smoke 不动。
> 密码经 `env:` 注入(避免内联 `$(secret)` 在日志泄露)。

### 4.1 后端(部署到 IIS 子应用,如 SYS 后端)

```yaml
- powershell: |
    $msdeploy = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"
    & $msdeploy `
      -verb:sync `
      -retryAttempts:20 `
      -retryInterval:3000 `
      -source:contentPath="$(Pipeline.Workspace)\drop\<App>" `
      -dest:contentPath="<Site>/<SubApp>",computerName="http://$($env:IIS_HOST)/MsDeployAgentService",userName="$($env:ADMIN_USER)",password="$($env:ADMIN_PWD)",authType="NTLM" `
      -enableRule:AppOffline `
      -enableRule:DoNotDeleteRule
    if ($LASTEXITCODE -ne 0) { throw "msdeploy failed with exit $LASTEXITCODE" }
  displayName: 'Web Deploy (MsDepSvc) → <Site>/<SubApp> @ IIS'
  env:
    IIS_HOST: $(IIS_TARGET_HOST)
    ADMIN_USER: $(DEPLOY_ADMIN_USER)
    ADMIN_PWD: $(DEPLOY_ADMIN_PWD)
```
SYSV2 SYS 实例:`contentPath="SYS3-Console/JYCoreSysWebApi"`。

### 4.2 前端(部署到顶级站点,如 SYS.3 / BP / AuditPortal / MDM 前端)

```yaml
-dest:contentPath="<Site>",computerName="http://$($env:IIS_HOST)/MsDeployAgentService",userName="$($env:ADMIN_USER)",password="$($env:ADMIN_PWD)",authType="NTLM"
```
`<Site>` = 站点名(如 `BusinessPortal`)。前端是站点名、非盘符路径,天然不踩 §6 的「站点C」坑。

### 4.3 从旧 WMSvc 写法迁移(对照改 3 处)

| | 旧(WMSvc,弃) | 新(MsDepSvc) |
|---|---|---|
| computerName | `https://$(IIS_TARGET_HOST):8172/msdeploy.axd?site=<site>` | `http://$($env:IIS_HOST)/MsDeployAgentService` |
| authType | `Basic` | `NTLM` |
| userName/password | `$(WEBDEPLOY_USER)` / `$(WEBDEPLOY_PASSWORD_TEST)` | `$($env:ADMIN_USER)` / `$($env:ADMIN_PWD)`(经 env) |
| `-allowUntrusted` | 有(HTTPS) | 删(HTTP 无需) |
| contentPath | 不变(IIS 路径) | 不变 —— **切勿改成盘符路径** |

---

## 5. 验证(部署后必做)

1. **流水线绿**:Deploy stage + Smoke 通过(`build 绿 ≠ 已部署`,要看 Deploy stage)。
2. **应用真起来**:打目标站点健康端点(后端 swagger / 前端首页)= `200`。
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://<IIS_HOST>:<port>/<path>/swagger/index.html
   ```
   > ⚠️ **健康门禁必须正向断言 `== 200`,严禁把非 2xx(尤其 `403`)当"预期/容忍"放过**。反例(2026-06-17 TPM):pipeline Verify 把跨进程子应用 manifest 的 `403` 判为「IP allowlist 拦截 agent,属预期非故障」→ 后端 `500.30`(连接串 `${ENV}` 占位符未设)被假绿掩盖,直到下游实测才暴露。`403.18`(IIS 应用池/部署故障)与中间件 allowlist `403` body 不同(IIS HTML vs 纯文本),但**都不算健康** —— 一律要求 200,后端无 /health 用 `swagger/index.html`。
3. **凭据自检(改 yml 前可先验,省 CI 往返)**:能直连内网时,
   ```bash
   curl --ntlm -u '<MACHINE>\<account>:<pwd>' -s -o /dev/null -w "%{http_code}\n" http://<IIS_HOST>/MsDeployAgentService
   # 401=认证失败(密码/账号/权限) ; 500=认证通过(GET 非 msdeploy 请求才 500)= 凭据 OK
   ```
4. **监控**(SYSV2):`node docs/ops/cicd-ado-monitor.js watch <repo>` 取 build 最终结果。

---

## 6. 排错矩阵

| 现象 | 病因 | 处置 |
|---|---|---|
| `503 / ERROR_COULD_NOT_CONNECT_TO_REMOTESVC` 指向 8172 | 还在用 WMSvc Handler | 按 §4 换 MsDepSvc 端点 |
| `ERROR_SITE_DOES_NOT_EXIST 站点 C` | dest 用了盘符路径 `C:\...`,被当成站点名 | dest 改 IIS 站点/应用路径(§4) |
| `401 / ERROR_USER_UNAUTHORIZED`(MsDepSvc) | 账号/密码错,或未设 `LocalAccountTokenFilterPolicy=1`,或非本地管理员 | 查 §2.2/2.3 + 变量组密码;curl 对照(§5.3) |
| `ERROR_COULD_NOT_CONNECT`(MsDepSvc :80) | MsDepSvc 未启 / 80 被防火墙挡 | §2.1 启服务 + §2.4 放行 80 |
| 站点显示「维护中 / app_offline」 | AppOffline 部署中途失败遗留 | 删目标站点物理目录下 `app_offline.htm` |
| `ERROR_FILE_IN_USE`(更新某 DLL 时) | 运行中 w3wp 持 DLL 锁;`-enableRule:AppOffline` 虽停机,但 ASP.NET Core 释放文件句柄有延迟,msdeploy 已开始 copy = 偶发竞态(同一 pipeline 偶尔过偶尔失败) | msdeploy 加 `-retryAttempts:20 -retryInterval:3000`(锁文件重试至释放 ~60s),已内置 §4 模板(2026-06-18 TPM #758)|
| 变量 `$(DEPLOY_ADMIN_USER)` 原样未展开 | 该项目变量组没加这两个变量 | §3 给该项目变量组补变量 |
| `403` 且 body 是 IIS 403.18 HTML | 应用池路由错(请求没进应用),**非 allowlist** | 查 IIS 子应用 AppPool(独立 AppPool / No Managed Code);别去改 manifest `AllowedIPs` |
| `500.30`(ANCM app failed to start) | 后端进程启动崩,常见连接串 `${ENV}` 占位符读不到 machine env(改后 w3wp 未刷新) | stdout log / 目标机直跑 `dotnet <App>.dll` 定位;给 AppPool 加 env 或重启机 + `iisreset` |

---

## 7. 各工作区 Claude 执行清单(按标准更新 pipeline)

1. grep 本仓 `azure-pipelines.yml` 是否还有 `:8172/msdeploy.axd` —— 有则需迁移。
2. 确认目标机已完成 §2 一次性准备(MsDepSvc Running + 本地管理员 + LocalAccountTokenFilterPolicy=1);未完成 → 升报涛哥/运维。
3. 确认本项目变量组已有 §3 两变量;无 → 提示涛哥补(变量组按项目隔离)。
4. 按 §4.3 对照表改部署步骤(后端用 §4.1 / 前端用 §4.2);dest 保持 IIS 路径,**不得改盘符路径**。
5. commit + 双推 → master 自动触发;**随即 `cancel-old <repo>` 清掉被取代的在途 build(§9)**;按 §5 验证 Deploy stage + 健康端点 200。
6. 红 → 按 §6 排错矩阵自愈。

---

## 8. 给 MES 团队的共享说明

- MES 两仓(`AI.Extend.MESSolution2_Api` / `_Admin`)与 SYSV2 **共用同一 Agent 池 + 同一台 IIS(10.8)**,其 `azure-pipelines.yml` 当前也是旧 WMSvc(`:8172`)写法 → **部署即撞同样 503**。
- 迁移动作与 §4.3 完全一致:换 MsDepSvc 端点 + NTLM + 本地管理员凭据;dest 用 MES 站点名(如 `MES-Api`)。
- 前置:MES 各自的 ADO 项目变量组按 §3 补 `DEPLOY_ADMIN_USER`/`DEPLOY_ADMIN_PWD`。
- 凭据请走各自变量组 secret,**勿在群里/文档明文传密码**。

---

## 9. 队列卫生 — push 后 cancel-old(单 worker Agent 必做)

> 决策:[ADR-022 修订(2026-06-17)build 去重铁律](../decisions/ADR-022-cicd-monitor-feedback.md#修订2026-06-17)。

self-hosted Agent 单 worker 串行处理队列;被更新提交取代的在途 build 继续占 Agent = 浪费。**每次 push 触发构建后,对该 pipeline 跑 `cancel-old`,只留最新一个**:

```bash
node docs/ops/cicd-ado-monitor.js cancel-old <repo>   # 保留 queueTime 最新,取消其余在途(含 inProgress)
```

- 无论被取代的旧 build 是 1 个还是多个、`notStarted` 还是 `inProgress`,一律取消(不为已跑一半的过时 build 等结果)。
- Claude 双推后**自动执行**,Tier 1 自主(可逆 + 队列管理),不问涛哥;节奏 = `push → cancel-old → watch 最新`。
- 适用所有 ADO self-hosted 单/少 worker pipeline(SYSV2 / SRMV2 / MES / TPM / 未来工作区)。

---

*Owner: 涛哥 / 落地参考实例:SYSV2 `AI.Extend.SYS/azure-pipelines.yml`(2026-06-17 #724 验证通过)。*
