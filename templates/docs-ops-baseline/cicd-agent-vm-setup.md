# CI/CD Agent VM 安装配置手册

> **目标**: 为 SYSV2 CI/CD 流水线部署一台 24/7 运行的 Azure Pipelines Self-hosted Agent VM(以下简称 Agent VM)
> **VMware 宿主**: 公司标准 ESXi/vCenter,7×24 运行
> **适用对象**: 内网运维 / 涛哥 / Claude 协助
> **配套环境**:
> - 代码仓库: 内网 Azure DevOps `JYDevOps/JYPrdCollection`
> - 部署目标(测试): `172.21.10.8`(IIS,待初始化)
> - 数据库(测试 + 模拟生产共用主机): `172.21.10.26/ExtendLibrary` + `ExtendLibrary_Staging`
> - 模拟生产服务器: 待到位(本手册阶段一暂不涉及)

---

## 1. 角色与产出

| 角色 | 职责 |
|---|---|
| 运维 | 划 VM、装 OS、按本手册第 4-7 章执行 |
| 涛哥 | 在 ADO 创建 Agent Pool + 申请 PAT(第 6 章 6.1) |
| Claude | 后续出 `azure-pipelines.yml` 草案 + 联调 |

**完工标志**: ADO Pipelines 跑一个 Hello-World pipeline,Agent VM 显示 Online 并成功执行。

---

## 2. VM 规格

| 项 | 推荐值 | 说明 |
|---|---|---|
| **OS** | Windows Server 2022 Standard(中文版亦可) | 长期支持到 2031;Server 2019 也可,但 2022 优先 |
| **CPU** | 8 vCPU | 4 vCPU 最低可跑,8 留足并发 build 余量 |
| **内存** | 16 GB | 8 GB 最低 |
| **磁盘 C:** | 100 GB SSD | OS + 工具链 |
| **磁盘 D:** | 300 GB SSD | Agent 工作目录 `_work`(build 缓存 + node_modules + Playwright + artifact 临时);**含 100GB 预留给 Phase 2 Docker images**(WMS/EAM 容器化时挂 docker root 到此盘) |
| **网络** | 内网静态 IP(待运维分配,本手册占位 `<AGENT_VM_IP>`) | 见第 3 章 |
| **快照** | 装完工具链后打一次 baseline snapshot | 故障回滚 |
| **主机名** | `SYSV2-CICD-AGENT-01` | 命名约定,便于扩容 |

---

## 3. 网络与安全

### 3.1 网络可达性(防火墙必开)

| 目标 | 方向 | 端口 | 用途 |
|---|---|---|---|
| 内网 ADO Server | 出站 | 80/443 | 拉代码、上报 build 状态、下载 task 包 |
| `172.21.10.8`(测试 IIS) | 出站 | 80/443/8172 | Web Deploy(8172) + HTTP 健康检查 |
| `172.21.10.26`(数据库) | 出站 | 1433 | EF migrations bundle 连库 |
| 制品服务器(后续) | 出站 | 443/SMB | 上传发布包 |
| 公网 | 出站 | 443 | NuGet / npm / Playwright Chromium 下载(初始化 + 后续依赖更新) |
| RDP 入站 | 入站 | 3389 | 运维远程维护(限内网网段) |
| 内网 Harbor 镜像仓库 | 出站 | 443 | **Phase 2 启用** — Docker 化后 push/pull 容器镜像 |
| 测试/客户 Docker Host | 出站 | 22(SSH)/2376(docker daemon TLS) | **Phase 2 启用** — WMS/EAM 容器化部署目标 |

> **注 1**: 如果公司公网出站受限,需要在第 5 章预留 NuGet/npm 内网私服 URL 配置(暂用默认源,后续按需切换)。
> **注 2**: 标注 "Phase 2 启用" 的规则现在不用申请,等 WMS/EAM 立项时一并向网络组报备开通。架构决策已拍板(Linux Container + Harbor + docker-compose,详见 Phase 2 spec)。

### 3.2 DNS

- 内网 DNS 能解析 ADO 域名(如 `tfs.jingyan.com` 或类似)
- 公网 DNS 能解析 `dotnet.microsoft.com` / `nodejs.org` / `playwright.azureedge.net`

---

## 4. OS 安装与初始化

### 4.1 安装

1. 从 VMware 模板部署 Windows Server 2022 Standard
2. 加入工作组(或域,按公司规范);Agent 不强依赖域账号
3. 配置静态 IP `<AGENT_VM_IP>`,子网/网关/DNS 按公司规范

### 4.2 系统初始化(PowerShell 管理员)

```powershell
# 时区
Set-TimeZone -Id "China Standard Time"

# 语言/区域(可选,影响日志中文乱码)
Set-WinSystemLocale -SystemLocale zh-CN
Set-Culture -CultureInfo zh-CN

# 关闭 IE Enhanced Security(否则后续浏览器下载工具链时弹窗)
$AdminKey = "HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components\{A509B1A7-37EF-4b3f-8CFC-4F3A74704073}"
Set-ItemProperty -Path $AdminKey -Name "IsInstalled" -Value 0

# Windows Update(装完工具前先打完补丁)
# 通过 sconfig → 6 选项,或 GUI 更新

# 重启
Restart-Computer
```

### 4.3 创建专用本地账号

| 账号 | 用途 |
|---|---|
| `cicd-agent` | Agent 服务运行账号(本地账号,Administrators 组) |
| `cicd-deploy` | 部署到 10.8 IIS 的 Web Deploy 账号(后续 10.8 服务器侧配套创建) |

```powershell
# 创建 agent 账号
$Password = ConvertTo-SecureString "<强密码>" -AsPlainText -Force
New-LocalUser -Name "cicd-agent" -Password $Password -PasswordNeverExpires -UserMayNotChangePassword
Add-LocalGroupMember -Group "Administrators" -Member "cicd-agent"
```

> 密码记入公司密码管理工具,**不入 git**。

---

## 5. 必装工具链(按顺序)

> 全部用**管理员 PowerShell**执行;每步装完用验证命令确认版本。

### 5.1 .NET 8 SDK

**下载**: https://dotnet.microsoft.com/zh-cn/download/dotnet/8.0 → SDK x64 Installer

```powershell
# 验证
dotnet --version          # 期望: 8.0.x
dotnet --list-sdks
dotnet --list-runtimes    # 应包含 Microsoft.AspNetCore.App 8.0.x
```

### 5.2 Node.js LTS + pnpm + corepack

> **版本选择**: Node 20 LTS 已于 2026 EOL,**当前可选**:
> - **v24.x LTS**(最新,2025-10 升 LTS,到 ~2027-10) ← 推荐(对齐涛哥本机)
> - **v22.x LTS**(上一代,稳定,生态成熟,到 ~2027-04)
>
> **决策原则**: **与涛哥本机 Node 版本一致**(确保 Agent VM build 产物等价)。装前先在本机 `node -v` 查版本,Agent VM 用同一 LTS 大版本。

**下载**: https://nodejs.org/zh-cn/download → 选择 LTS → Windows Installer (.msi) 64-bit

```powershell
# 验证 Node
node -v                   # 期望: v22.x.x 或 v24.x.x(与涛哥本机一致)
npm -v

# 启用 corepack 并装 pnpm(版本对齐 SYSV2 各 repo package.json 的 packageManager 字段)
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm -v                   # 期望: 10.32.1
```

> **关键**: pnpm 用 `corepack prepare pnpm@10.32.1`(精确版本)而非 `pnpm@latest` — SYSV2 各 repo `package.json` 锁定 `packageManager: pnpm@10.32.1`,Agent VM 必须匹配,否则 `pnpm install --frozen-lockfile` 会拒绝执行。

### 5.3 Git for Windows

**下载**: https://git-scm.com/download/win

安装时勾选:
- 启用 Git Credential Manager(对接 ADO 凭据)
- 行尾: Checkout as-is, commit as-is(避免 CRLF 污染)

```powershell
git --version             # 期望: git version 2.40+
```

### 5.4 EF Core CLI 工具

```powershell
dotnet tool install --global dotnet-ef --version 8.*
# 验证
dotnet ef --version       # 期望: 8.0.x
```

> 用途: Pipeline 中执行 `dotnet ef migrations bundle` 产出离线迁移可执行。

### 5.5 Web Deploy 4.0 (MSDeploy)

> **版本说明**: Web Deploy 3.6 微软下载页 (`details.aspx?id=43717`) 已下架,改用 4.0(向后兼容,多语言一体化 MSI)。
> **详细安装方式**: 见 `cicd-iis-server-setup.md` 第 5.2 节(同样适用于 Agent VM)。

**推荐 Chocolatey 装法**:

```powershell
# 装 Chocolatey(如未装)
Set-ExecutionPolicy Bypass -Scope Process -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 装 Web Deploy 4.0 客户端
choco install webdeploy -y --params="'/IncludeAdminPack'"

# 验证(路径仍叫 V3,历史兼容,不影响功能)
& "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe" -verb:dump -source:contentPath="C:\Windows\Temp"
```

> 用途: Pipeline 通过 msdeploy 推前后端到 10.8 IIS。
> **Agent VM 侧只需客户端**(用 msdeploy 命令行),不需要启 Management Service(WMSVC);Management Service 是 10.8 接收端的事。

### 5.6 SQL Server 命令行工具

**下载 sqlcmd + bcp**:
- 选 1(推荐): 装 `Microsoft Command Line Utilities for SQL Server` (sqlcmd.msi + msodbcsql.msi)
  - https://learn.microsoft.com/zh-cn/sql/tools/sqlcmd/sqlcmd-utility
- 选 2: 装 SSMS(管理工具完整版,体积大)

```powershell
sqlcmd -? | Select-Object -First 5
# 连接测试(从 Agent VM 测能否访问数据库)
sqlcmd -S "172.21.10.26" -U "sa" -P "<密码>" -Q "SELECT @@VERSION" -l 10
```

### 5.7 Playwright + Chromium(deploy 后 E2E 双层验证用)

> 前端 Pipeline 在 `pipeline-e2e/` 子目录跑 Playwright,Chromium 浏览器需要预热到 Agent 服务账号 profile 的缓存目录。

#### 5.7.1 在线安装(若 Agent VM 外网通 cdn.playwright.dev)

```powershell
# 以 ADO Agent 服务跑的账号登录(查账号:Get-Service vstsagent* | ForEach-Object ...)
cd $env:TEMP
npm install -g playwright
npx playwright install chromium

# 验证
Get-ChildItem $env:LOCALAPPDATA\ms-playwright\ | Select-Object Name
# 期望 5 个目录:chromium-1223 / chromium_headless_shell-1223 / ffmpeg-1011 / winldd-1007 / .links
```

#### 5.7.2 离线安装(外网封 cdn.playwright.dev — 2026-05-14 涛哥实证)

国内 Agent VM 大概率走这条。本机下载 4 个 zip → 上传 Agent VM → 解压 + 打 marker。

**4 个组件 + 下载 URL**(版本号跟 Playwright `package.json` 走,以下为 @playwright/test@1.60.0 对应):

| 组件 | URL | 大小 | 目标解压目录 |
|---|---|---|---|
| Chrome for Testing | `https://cdn.playwright.dev/builds/cft/148.0.7778.96/win64/chrome-win64.zip` | ~181 MB | `%LOCALAPPDATA%\ms-playwright\chromium-1223` |
| Chrome Headless Shell ⭐ headless 必需 | `https://cdn.playwright.dev/builds/cft/148.0.7778.96/win64/chrome-headless-shell-win64.zip` | ~150 MB | `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1223` |
| FFmpeg(视频录制)| `https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-win64.zip` | ~3 MB | `%LOCALAPPDATA%\ms-playwright\ffmpeg-1011` |
| Winldd(Win 依赖检查)| `https://cdn.playwright.dev/dbazure/download/playwright/builds/winldd/1007/winldd-win64.zip` | ~1 MB | `%LOCALAPPDATA%\ms-playwright\winldd-1007` |

**安装命令**(每个组件 4 行,逐个跑;以 ADO Agent 服务跑的账号执行):

```powershell
$zip = "C:\path\to\<组件>.zip"          # 改成实际 zip 路径
$dst = "$env:LOCALAPPDATA\ms-playwright\<目标目录名>"
Expand-Archive -Path $zip -DestinationPath $dst -Force
New-Item -ItemType File -Path "$dst\INSTALLATION_COMPLETE" -Force
```

**验证**(无 `Downloading` 输出 = 缓存就绪):

```powershell
npx --yes @playwright/test@1.60.0 install chromium
# 直接退出无下载 = 成功
```

#### 5.7.3 账号一致性检查(关键坑)

ADO Agent 服务运行账号决定缓存读取位置,**预装账号 ≠ Agent 服务账号 → 缓存读不到 → Pipeline 仍下载**。

查 Agent 服务账号:

```powershell
Get-Service -Name "vstsagent*" | ForEach-Object { $n = $_.Name; $s = Get-WmiObject Win32_Service -Filter "Name='$n'"; Write-Host "$n -> LogOn: $($s.StartName)" }
```

- `.\rhett.zeng` / `<DOMAIN>\<account>` → 用该账号登录 Agent VM 预装 5.7.2 步骤
- `LocalSystem` / `NT AUTHORITY\NetworkService` → 缓存目录 `C:\Windows\System32\config\systemprofile\AppData\Local\ms-playwright\`,需 `runas /user:SYSTEM`(用 PSExec)预装或改 Pipeline 用 `PLAYWRIGHT_BROWSERS_PATH` 环境变量统一指向共享路径

> Playwright 升级时(`@playwright/test` 版本变),chromium revision 也变(1223 → 1xxx),需重装新版本对应的 5 个组件;build 日志的 `Downloading Chrome for Testing X.Y.Z ... v<revision>` 给出新版本号 + revision。

### 5.8 IIS 管理命令(可选,用于远程诊断 10.8)

只需 PowerShell 模块,不需要装完整 IIS:

```powershell
Install-WindowsFeature -Name Web-Mgmt-Console, Web-Scripting-Tools
```

---

## 6. Azure Pipelines Agent 安装与注册

### 6.1 ADO 侧前置(涛哥操作)

1. 登录内网 ADO → 右上头像 → **Personal Access Tokens** → New Token
   - Name: `cicd-agent-sysv2-vm01`
   - Scope: **Agent Pools (Read & manage)** + **Code (Read)** + **Build (Read & execute)**
   - 有效期: 1 年
   - 复制 PAT(只显示一次)
2. ADO Organization → **Organization Settings** → **Agent pools** → **Add pool**
   - Name: `SYSV2-OnPrem`
   - Pool type: Self-hosted
   - Pipeline permissions: 所有 SYSV2 仓库授权

### 6.2 Agent VM 侧安装

**下载 Agent 包**(在 ADO 创建 pool 后页面有"New Agent"按钮,给的下载链接;或直接):
https://github.com/microsoft/azure-pipelines-agent/releases → 选 `vsts-agent-win-x64-<version>.zip`(当前 4.x)

```powershell
# 用 cicd-agent 账号登录 RDP 后操作
mkdir D:\agent
Set-Location D:\agent
Expand-Archive -Path "$env:USERPROFILE\Downloads\vsts-agent-win-x64-*.zip" -DestinationPath .

# 交互式注册(填写信息)
.\config.cmd
```

注册时填写:

| 提示 | 填写 |
|---|---|
| Server URL | `http://<内网 ADO 域名>:<端口>/<IIS app path>/<collection>`(完整 Collection URL,如 `http://172.21.10.30:8090/JYDevOps/JYPrdCollection`)|
| Authentication type | **必须明确输入 `PAT`**(中文版 ADO Server 默认是 Integrated,直接回车会用 Windows 集成认证导致 401) |
| Personal access token | 粘贴 6.1 拿到的 PAT(粘贴时屏幕不显示是正常的) |
| Agent pool | `SYSV2-OnPrem` |
| Agent name | `SYSV2-CICD-AGENT-01`(与主机名一致) |
| Work folder | `D:\agent\_work`(默认 `_work` 改成 D 盘) |
| Run agent as service? | **Y** |
| Service account | `.\cicd-agent` |
| Service account password | <cicd-agent 密码> |
| Enable autologon? | N |

```powershell
# 启动服务
.\svc.cmd start
.\svc.cmd status          # 期望: Running

# 验证: ADO Organization Settings → Agent pools → SYSV2-OnPrem → Agents
# 应显示 SYSV2-CICD-AGENT-01 状态 Online
```

### 6.3 Agent 服务持久化

ADO Agent 已经注册为 Windows Service `vstsagent.<org>.SYSV2-OnPrem.SYSV2-CICD-AGENT-01`,自启动。

```powershell
Get-Service -Name "vstsagent.*"
# StartType 应为 Automatic
```

---

## 7. 服务账号与权限对照表

| 账号 | 创建位置 | 权限 |
|---|---|---|
| `cicd-agent`(Agent VM 本地) | Agent VM | 本地 Administrators,运行 agent 服务 |
| `cicd-deploy`(10.8 本地) | 待 10.8 IIS 初始化时创建 | 10.8 IIS 站点目录读写 + Web Deploy 部署权限 |
| `cicd_db_writer`(SQL Server) | 26 数据库,dba 创建 | `ExtendLibrary` + `ExtendLibrary_Staging` 的 `db_owner`(测试库自由 DDL) |
| ADO PAT(`cicd-agent-sysv2-vm01`) | ADO | Agent Pools + Code + Build |

> Pipeline YAML 中的连接字符串、PAT、Web Deploy 密码全部放 **ADO Variable Groups (Secrets)**,不写进 yaml。

---

## 8. 验证清单(交付前自检)

运维交付前,在 Agent VM 上跑完以下命令,**全部 PASS** 才算完工:

```powershell
# === 工具链版本 ===
dotnet --version                     # 8.0.x
node -v                              # v20.x
pnpm -v                              # 9.x+
git --version                        # 2.40+
dotnet ef --version                  # 8.0.x
& "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe" -? | Select-String "Web Deployment"
sqlcmd -?  | Select-Object -First 3
npx playwright --version

# === 网络可达性 ===
Test-NetConnection -ComputerName "172.21.10.8"  -Port 8172   # Web Deploy
Test-NetConnection -ComputerName "172.21.10.26" -Port 1433   # SQL Server
Test-NetConnection -ComputerName "<ADO 域名>"    -Port 443

# === Agent 状态 ===
Get-Service -Name "vstsagent.*" | Format-Table Name, Status, StartType
# Status: Running / StartType: Automatic
```

ADO 侧验证:
1. ADO → Pipelines → New Pipeline → 选一个 SYSV2 仓库
2. 用最简 yaml(下方)跑一次:

```yaml
pool:
  name: SYSV2-OnPrem
steps:
  - script: |
      echo "Agent: $(Agent.Name)"
      echo "OS: $(Agent.OS)"
      dotnet --version
      node -v
      pnpm -v
    displayName: 'Smoke check'
```

跑通即视为 Agent VM 交付完成。

---

## 9. 维护与升级

### 9.1 Agent 自升级

ADO Server 升级后,Agent 会自动升级(只要 Agent 是 Online 状态);通常无需手动干预。

### 9.2 工具链升级周期

| 工具 | 升级触发 | 操作 |
|---|---|---|
| .NET 8 SDK | 月度补丁(8.0.x patch) | 装新 SDK installer,旧 SDK 保留 |
| Node 20 LTS | 季度 | nvm-windows 或重装 |
| pnpm | corepack 自动跟随 package.json `packageManager` | 无需手动 |
| Playwright Chromium | 跟随各 repo `package.json` | Pipeline 内自动 `npx playwright install` |
| ADO Agent 主版本(4.x → 5.x) | 年度 | 提前 1 周通知,停服务、覆盖二进制、重启 |

### 9.3 快照策略

- **Baseline snapshot**: 工具链全部装完 + Smoke check 通过后打一次
- **季度 snapshot**: 重大补丁日打一次
- 保留最近 3 个 snapshot,旧的清理

### 9.4 日志位置

| 日志 | 路径 |
|---|---|
| Agent 主日志 | `D:\agent\_diag\` |
| 单次 build 日志 | `D:\agent\_work\<build_id>\` |
| Windows Service 事件 | Event Viewer → Applications and Services Logs |

磁盘满前定期清理 `_work` 下旧 build:

```powershell
# Pipeline 通常自带 cleanup,但 _work 下 _temp/_tasks 可能积累
Get-ChildItem D:\agent\_work -Directory | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | Remove-Item -Recurse -Force
```

---

## 10. 常见问题

| 症状 | 排查 |
|---|---|
| Agent 状态 Offline | `Get-Service vstsagent.*` 是否 Running;PAT 是否过期 |
| Build 报 `npm/pnpm not found` | Agent 服务运行账号的 PATH 没刷新 → 重启 agent 服务或重启 VM |
| Playwright 报 `Executable doesn't exist` | 切到 agent 服务账号 `cicd-agent` 跑一次 `npx playwright install chromium` |
| Web Deploy 报 403 | 10.8 侧 Management Service 未启 / cicd-deploy 账号无权限 |
| EF migrations bundle 报连接超时 | 防火墙 1433 / sa 账号密码 / sqlcmd 已测试通过? |
| Pipeline 卡 `Waiting for agent` | Agent Pool 没授权给该 Pipeline → ADO 仓库 Settings → Pipeline permissions |

---

## 11. 附:后续手册(占位)

### Phase 1 — IIS 路径(本期推进)

- [x] `cicd-iis-server-setup.md` — 10.8 测试 IIS 服务器初始化手册(已完成 2026-05-12,cicd-deploy 账号在该手册第 6.2 节创建)
- [ ] `cicd-artifact-server-setup.md` — 制品服务器初始化(支撑公网拉 + U 盘拷)
- [ ] `azure-pipelines-template.md` — 公共 pipeline template 设计(放 `engineering-standards` 仓)
- [ ] 各 nested repo 的 `azure-pipelines.yml` 草案(SYS 主线先行 → MDM → 4 个前端)

### Phase 2 — Docker 扩展(WMS/EAM 立项时启动)

> **架构决策已拍板**(2026-05-12 涛哥): Linux Container + Harbor 镜像仓库 + docker-compose 客户编排;特殊客户(不愿装 Docker / 军工受限)继续走 IIS 模式
> **配套评估文档**: `C:\Users\Rhett\.claude\plans\windwos-11-b-s-net-8-react-claude-warm-bunny.md`

- [ ] `cicd-harbor-registry-setup.md` — 内网 Harbor 镜像仓库初始化(可与制品服务器合并到一台 Linux VM,8C16G/500GB)
- [ ] `cicd-docker-host-setup.md` — 测试/客户侧 Docker Host 初始化(Linux + docker-compose)
- [ ] `engineering-standards/pipelines/docker-build-push.yml` — Docker 构建推送 pipeline template
- [ ] `cicd-customer-offline-package.md` — 客户离线包打包规范(`docker save` tar + docker-compose.yml + install.sh)
- [ ] 本手册增量 patch — Agent VM 装 Docker Desktop + WSL2 章节

### 已预留的零成本扩展点(无需 Phase 2 时回头改 VM 配置)

| 预留项 | 当前手册位置 | Phase 2 启用方式 |
|---|---|---|
| D 盘 300GB(含 100GB Docker images 预留) | 第 2 章 VM 规格 | 装 Docker 时挂 docker root 到 `D:\docker` |
| Harbor / Docker daemon 防火墙条目 | 第 3.1 节 | 向网络组报备开通 443/22/2376 |
| 后续手册占位 | 本节 | 按 checklist 逐项交付 |

---

**文档版本**: v1.1 / 2026-05-12(v1.0 → v1.1:Phase 2 Docker 扩展点零成本预留)
**维护**: 涛哥 + Claude
**配套**:
- Phase 2 决策: `windwos-11-b-s-net-8-react-claude-warm-bunny.md`(plan 文件)
- ADR-?(后续 CI/CD 总 spec 立项时统一落 ADR — 涵盖 IIS 路径 + Docker 路径 + 双轨分发)
