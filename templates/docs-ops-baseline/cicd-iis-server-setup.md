# 10.8 测试 IIS 服务器初始化手册

> **目标**: 把 `172.21.10.8`(Windows Server 2019)初始化为 SYSV2 测试环境 IIS 部署目标,承载 **5 个应用**(SYS 后端 + MDM 后端 + SYS.3 控制台 + AuditPortal + BusinessPortal,其中 BP 通过 wujie 嵌入 MDM 前端)
> **配套文档**: `docs/ops/cicd-agent-vm-setup.md`(Agent VM 手册)
> **适用对象**: 内网运维 / 涛哥 / Claude 协助
> **关联架构**:
> - SYS 后端: .NET 8 + EF Core,Kestrel 自托管(IIS 反向代理模式)
> - MDM 后端: .NET 8 + EF Core(DM/SqlServer 双驱动),Kestrel 自托管,业务默认 5026 端口
> - 4 个前端: React 18 + Vite,静态 SPA(SYS.3 控制台 / BP 业务门户 / AuditPortal 审计门户 / MDM 前端 wujie 子应用)
> - 数据库: `172.21.10.26/ExtendLibrary`(测试库),通过连接字符串引用
> - 认证: ADR-007 4 条刚性(`[Authorize]` + Policy 注册 + 权限码 + SSO token)

---

## 1. 角色与产出

| 角色 | 职责 |
|---|---|
| 运维 | 按本手册第 3-8 章执行,装 IIS 角色 / Hosting Bundle / 创建站点目录 / 配 Web Deploy |
| 涛哥 | 验证测试账号 `systemadmin/123!@#` 能登录控制台 + 业务门户 |
| Claude | 后续 Pipeline 中调 Web Deploy 推送 publish 产物到本机站点 |

**完工标志**:
- 5 个 IIS 站点全部启动(端口 5000/5026/8001/8002/8003)
- Agent VM 通过 Web Deploy 能 push 一个 hello-world 应用上来
- 测试账号 `systemadmin/123!@#` 在 `http://172.21.10.8:8001/login` 能登录

---

## 2. 站点与端口规划

| 站点 | 类型 | 端口 | 物理路径 | AppPool | 备注 |
|---|---|---|---|---|---|
| **SYS-Api** | .NET 8 后端(反代) | `5000` | `C:\WebSites\SYS-Api` | `SYS-Api` (No Managed Code) | `AL.Extend.SYS.WebApi` publish 产物 |
| **MDM-Api** | .NET 8 后端(反代) | `5026` | `C:\WebSites\MDM-Api` | `MDM-Api` (No Managed Code) | `MDMWebApi` publish 产物 |
| **SYS3-Console** | React SPA 静态 | `8001` | `C:\WebSites\SYS3-Console` | `SYS3-Console` (No Managed Code) | SYS.3 控制台门户 |
| **BusinessPortal** | React SPA 静态 | `8002` | `C:\WebSites\BusinessPortal` | `BP` (No Managed Code) | 业务门户;含子目录 `/MDM/` 挂 MDM 前端 |
| **AuditPortal** | React SPA 静态 | `8003` | `C:\WebSites\AuditPortal` | `AP` (No Managed Code) | 审计门户 |

**MDM 前端嵌入路径**: `BusinessPortal` 站点下增加虚拟目录 `MDM` → `C:\WebSites\MDM-Web`,wujie 子应用从 `http://172.21.10.8:8002/MDM/` 加载(对应 ADR-010 Platform spec `/srm/` → `/MDM/` 路径切换)。

### 2.1 关于 10.8 单盘部署的注意点

10.8 服务器**没有独立 D 盘**,站点全部部署在 `C:\WebSites\*`(系统盘根目录)。本期可接受(单台测试环境,流量低),但需要做 3 件事监控 C 盘空间:

| 监控项 | 推荐做法 |
|---|---|
| **C 盘剩余空间告警** | 设定阈值 **20GB 以下报警**(运维侧用现有监控工具或 PowerShell 计划任务) |
| **IIS 日志路径** | 默认 `C:\inetpub\logs\LogFiles\*` 也在 C 盘;考虑改保留期(本手册第 7.4 节,待补)或定期归档 |
| **Web Deploy 备份** | `TakeAppOfflineFlag=true + RemoveAdditionalFilesFlag=true` 会在站点目录留 backup,大版本部署后清理 |

**长期建议**: 如果后续业务量上来,运维侧给 10.8 加挂 D 盘(虚拟磁盘扩容),把 `C:\WebSites` 整体迁到 `D:\WebSites`(本手册路径配置改一处即可)。本期不做。

**为什么 AppPool 用 "No Managed Code"**:
- .NET 8 走 out-of-process / Kestrel 自托管,IIS 只做反向代理,不需要加载 .NET CLR
- 前端站点是纯静态文件,更不需要 CLR
- "No Managed Code" 减少 AppPool 启动时间和内存占用

---

## 3. Windows Server 2019 IIS 角色安装

### 3.1 装 IIS 角色(PowerShell 管理员)

```powershell
# 装 IIS Web Server 核心 + 常用功能
Install-WindowsFeature -Name `
  Web-Server, `
  Web-WebServer, `
  Web-Common-Http, `
  Web-Static-Content, `
  Web-Default-Doc, `
  Web-Dir-Browsing, `
  Web-Http-Errors, `
  Web-Http-Redirect, `
  Web-Health, `
  Web-Http-Logging, `
  Web-Custom-Logging, `
  Web-Log-Libraries, `
  Web-Request-Monitor, `
  Web-Performance, `
  Web-Stat-Compression, `
  Web-Dyn-Compression, `
  Web-Security, `
  Web-Filtering, `
  Web-Basic-Auth, `
  Web-Windows-Auth, `
  Web-App-Dev, `
  Web-Net-Ext45, `
  Web-AppInit, `
  Web-ISAPI-Ext, `
  Web-ISAPI-Filter, `
  Web-Mgmt-Tools, `
  Web-Mgmt-Console, `
  Web-Mgmt-Service, `
  Web-Scripting-Tools `
  -IncludeManagementTools

# 验证
Get-WindowsFeature -Name Web-Server | Format-Table Name, InstallState
# InstallState 应为 Installed

# 启动 W3SVC 并设为自动启动
Set-Service -Name W3SVC -StartupType Automatic
Start-Service W3SVC

# 启动 IIS Management Service (Web Deploy 远程部署依赖此服务)
Set-Service -Name WMSVC -StartupType Automatic
Start-Service WMSVC
```

### 3.2 注册表启用 IIS 远程管理

```powershell
# 启用远程连接 (Web Deploy 8172 端口需要)
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\WebManagement\Server" -Name EnableRemoteManagement -Value 1
Restart-Service WMSVC
```

---

## 4. ASP.NET Core 8 Hosting Bundle 安装

> **必装** — .NET 8 后端通过 IIS 反向代理到 Kestrel,**必须**装 Hosting Bundle(包含 AspNetCoreModuleV2 + .NET Runtime + ASP.NET Core Runtime)。

**下载**: https://dotnet.microsoft.com/zh-cn/download/dotnet/8.0 → **Hosting Bundle (x64)**

或 PowerShell 下载安装(注意版本号选最新 8.0.x patch):

```powershell
$url = "https://download.visualstudio.microsoft.com/download/pr/<最新链接>/dotnet-hosting-8.0.x-win.exe"
$dst = "$env:TEMP\dotnet-hosting-8.0.x-win.exe"
Invoke-WebRequest -Uri $url -OutFile $dst
& $dst /install /quiet /norestart

# 装完后必须重启 IIS,否则 AspNetCoreModule 不加载
net stop was /y
net start w3svc
```

**验证**:

```powershell
# 检查 AspNetCoreModuleV2 注册
(Get-Item "C:\Windows\System32\inetsrv\config\applicationHost.config").FullName
Select-String -Path "C:\Windows\System32\inetsrv\config\applicationHost.config" -Pattern "AspNetCoreModuleV2"
# 应找到 <add name="AspNetCoreModuleV2" ... />

# 检查 .NET 8 runtime
dotnet --list-runtimes
# 应包含 Microsoft.AspNetCore.App 8.0.x 和 Microsoft.NETCore.App 8.0.x
```

---

## 5. 其他必装组件

### 5.1 URL Rewrite Module 2.1

> **必装** — SPA 前端路由(history mode)需要把所有 404 重写到 `/index.html`。

**下载**: https://www.iis.net/downloads/microsoft/url-rewrite

```powershell
# 或直接装
$url = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_zh-CN.msi"
$dst = "$env:TEMP\urlrewrite.msi"
Invoke-WebRequest -Uri $url -OutFile $dst
msiexec /i $dst /quiet /norestart
```

### 5.2 Web Deploy 4.0 (含远程管理委派)

> **必装** — Agent VM 通过 `msdeploy.exe` 推送 publish 产物到本机。
> **版本说明**: Web Deploy 3.6 微软官方下载页 (`details.aspx?id=43717`) 已下架,**改用 4.0**(向后兼容 + 多语言一体化 MSI,中文系统自动显示中文界面,不需要找单独的 `zh-CN` MSI)。

**安装方式 3 选 1**:

#### 方式 A: Chocolatey(首选,稳定)

```powershell
# Step 1: 装 Chocolatey(管理员 PowerShell)
Set-ExecutionPolicy Bypass -Scope Process -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Step 2: 装 Web Deploy 4.0 完整版(IncludeAdminPack 对应原 3.6 的 "Complete" 安装,含远程管理委派)
choco install webdeploy -y --params="'/IncludeAdminPack'"
```

#### 方式 B: IIS 官网下载

浏览器打开 https://www.iis.net/downloads/microsoft/web-deploy → 找最新 4.0 版本 → 下载 MSI → 双击安装时选 **"Complete"**(关键 — 不完整安装会导致远程 Web Deploy 403)。

#### 方式 C: Microsoft Update Catalog(兜底,公网受限场景)

浏览器在能上网的机器搜 `https://www.catalog.update.microsoft.com/Search.aspx?q=Web+Deploy` → 下载 MSI → U 盘/共享盘拷到 10.8 → 双击安装选 "Complete"。

#### 通用后续步骤

```powershell
# 启动 Web Management Service 并设为自启
Set-Service WMSVC -StartupType Automatic
Restart-Service WMSVC

# 验证(注意路径仍叫 V3 — Web Deploy 4.0 安装路径保留 V3 为历史兼容,不影响功能)
& "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe" -verb:dump -source:contentPath="C:\Windows\Temp" | Select-Object -First 5
# 应输出 Web Deployment 版本信息

# 中文系统验证编码
chcp
# 默认 936 (GBK);如脚本日志乱码可改 65001 (UTF-8): chcp 65001
```

### 5.3 中文 Windows Server 2019 适配注意点

| 点 | 说明 |
|---|---|
| **站点路径全英文** | `C:\WebSites\*` 避免 `C:\应用\` 类中文路径 — Pipeline / msdeploy / dotnet 脚本易踩编码坑 |
| **账号密码无中文** | `cicd-deploy` 密码用 ASCII,避免 Web Deploy 认证编码问题 |
| **EventLog 中英混杂** | Web Deploy 报错可能英文 message + 中文系统组件 — 不影响功能,诊断时拿英文关键词搜更高效 |
| **PowerShell 输出乱码** | 跑英文工具如日志含 emoji/特殊字符 → `chcp 65001` 切 UTF-8 临时解 |
| **Hosting Bundle / Web Deploy / URL Rewrite** | 全部多语言一体化 installer,装到中文系统自动中文界面,无需找 zh-CN 版本 |

### 5.4 SQL Server 客户端工具(可选,本期可跳过)

> **何时需要**: 部署后想从 10.8 本机连 26 数据库做诊断时用。
> **本期建议**: **跳过** — Pipeline 走 Agent VM 跑 EF migrations bundle,10.8 应用进程通过连接字符串连库,本机不需要 sqlcmd。等真有诊断需求时再补装。

**如果运维主动要装,装顺序如下**(sqlcmd 依赖 ODBC Driver 17,**顺序错装会报"需要 ODBC Driver 17"错误**):

**方式 A: Chocolatey(推荐)**

```powershell
# Step 1: 先装 ODBC Driver 17 for SQL Server
choco install sqlserver-odbcdriver -y

# Step 2: 再装 sqlcmd + bcp
choco install sqlserver-cmdlineutils -y

# 验证
sqlcmd -? | Select-Object -First 3
sqlcmd -S "172.21.10.26" -U "sa" -P "<密码>" -Q "SELECT @@VERSION" -l 10
```

**方式 B: 离线下载**

1. 下载 ODBC Driver 17 MSI: `https://learn.microsoft.com/zh-cn/sql/connect/odbc/download-odbc-driver-for-sql-server` → 找 **ODBC Driver 17 for SQL Server** 直链
2. 下载 sqlcmd MSI: 同页或相邻页找 **Command Line Utilities for SQL Server** → `MsSqlCmdLnUtils.msi`
3. **先双击 ODBC MSI 装完,再装 sqlcmd MSI**(顺序不能反)

---

## 6. 站点目录 + 账号创建

### 6.1 创建站点根目录

```powershell
$sites = @("SYS-Api", "MDM-Api", "SYS3-Console", "BusinessPortal", "AuditPortal", "MDM-Web")
$root = "C:\WebSites"
New-Item -Path $root -ItemType Directory -Force | Out-Null
foreach ($s in $sites) {
    $path = Join-Path $root $s
    New-Item -Path $path -ItemType Directory -Force | Out-Null
}

# 验证
Get-ChildItem $root | Format-Table Name, FullName
```

### 6.2 创建 cicd-deploy 本地账号

> 用途: Agent VM 通过 Web Deploy 推送时使用的目标账号;独立于 RDP 维护账号,**最小权限**。

```powershell
# 密码必须满足 Windows Server 2019 复杂度策略:
#   - 长度 ≥ 8(企业域可能要求 ≥ 14,先跑 net accounts 查实际生效策略)
#   - 4 类字符中至少 3 类:大写 / 小写 / 数字 / 特殊符号(!@#$%^&*-_+=)
#   - 不能包含账号名 "cicd-deploy"
#   - 必须 ASCII(不要中文/全角符号)
# 示例(实际请改成自己的,记入公司密码管理工具,绝对不入 git)
$Password = ConvertTo-SecureString "Sysv2-CICD@Deploy#2026" -AsPlainText -Force
New-LocalUser -Name "cicd-deploy" -Password $Password -PasswordNeverExpires -UserMayNotChangePassword -Description "CI/CD Web Deploy account for SYSV2"

# 加入必要组(不加 Administrators,只给 IIS 部署最小权限)
Add-LocalGroupMember -Group "IIS_IUSRS" -Member "cicd-deploy"

# 给站点目录读写权限
foreach ($s in $sites) {
    $path = Join-Path "C:\WebSites" $s
    $acl = Get-Acl $path
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "cicd-deploy",
        "Modify",
        "ContainerInherit,ObjectInherit",
        "None",
        "Allow"
    )
    $acl.SetAccessRule($rule)
    Set-Acl -Path $path -AclObject $acl
}

# 验证
(Get-Acl "C:\WebSites\SYS-Api").Access | Where-Object {$_.IdentityReference -like "*cicd-deploy*"}
```

### 6.3 IIS Manager 给 cicd-deploy 授权 Web Deploy

> **必做** — Web Deploy 远程部署除了 Windows 账号,还要在 IIS 层面给账号挂"管理用户",否则推送 403。

GUI 操作(IIS Manager):
1. 打开 IIS Manager → 选服务器节点 `172.21.10.8`
2. **Management Service** → 启用 **Windows credentials** 和 **IIS Manager credentials** 两种登录方式
3. **IIS Manager Users** → **Add User** → 用户名 `cicd-deploy` + 密码(与 Windows 账号同密码)
4. 后续每个站点配 Web Deploy 时,**IIS Manager Permissions** → Allow User `cicd-deploy`

或 PowerShell(简化版,只配 Management Service 启用):

```powershell
# 启用 Windows 凭据登录(对 cicd-deploy 用 Windows 账号即可)
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\WebManagement\Server" -Name IdentityType -Value 1
Restart-Service WMSVC
```

---

## 7. 创建 5 个 AppPool + 5 个站点

### 7.1 AppPool 批量创建

```powershell
Import-Module WebAdministration

$pools = @{
    "SYS-Api"        = $null
    "MDM-Api"        = $null
    "SYS3-Console"   = $null
    "BP"             = $null
    "AP"             = $null
}

foreach ($name in $pools.Keys) {
    if (-not (Test-Path "IIS:\AppPools\$name")) {
        New-WebAppPool -Name $name
    }
    # 设置为 No Managed Code (因为后端是 out-of-process,前端是静态)
    Set-ItemProperty -Path "IIS:\AppPools\$name" -Name "managedRuntimeVersion" -Value ""
    # 启动模式: AlwaysRunning(防止 idle 时挂起)
    Set-ItemProperty -Path "IIS:\AppPools\$name" -Name "startMode" -Value "AlwaysRunning"
    # 进程身份: ApplicationPoolIdentity (推荐) 或 cicd-deploy
    Set-ItemProperty -Path "IIS:\AppPools\$name" -Name "processModel.identityType" -Value "ApplicationPoolIdentity"
    # 回收设置: 关闭定时回收(.NET 8 应用不需要日级回收)
    Set-ItemProperty -Path "IIS:\AppPools\$name" -Name "recycling.periodicRestart.time" -Value "00:00:00"
}

# 验证
Get-WebAppPoolState -Name "SYS-Api"
Get-ItemProperty "IIS:\AppPools\SYS-Api" | Select-Object name, managedRuntimeVersion, startMode
```

### 7.2 5 个站点创建

```powershell
$sites = @(
    @{Name="SYS-Api";        Port=5000; Path="C:\WebSites\SYS-Api";        Pool="SYS-Api"},
    @{Name="MDM-Api";        Port=5026; Path="C:\WebSites\MDM-Api";        Pool="MDM-Api"},
    @{Name="SYS3-Console";   Port=8001; Path="C:\WebSites\SYS3-Console";   Pool="SYS3-Console"},
    @{Name="BusinessPortal"; Port=8002; Path="C:\WebSites\BusinessPortal"; Pool="BP"},
    @{Name="AuditPortal";    Port=8003; Path="C:\WebSites\AuditPortal";    Pool="AP"}
)

foreach ($s in $sites) {
    if (Get-Website -Name $s.Name -ErrorAction SilentlyContinue) {
        Remove-Website -Name $s.Name
    }
    New-Website -Name $s.Name -Port $s.Port -PhysicalPath $s.Path -ApplicationPool $s.Pool -Force
}

# 删除默认站点(可选)
Remove-Website -Name "Default Web Site" -ErrorAction SilentlyContinue

# 验证
Get-Website | Format-Table Name, State, PhysicalPath, ApplicationPool, @{n="Bindings"; e={$_.Bindings.Collection.bindingInformation}}
```

### 7.3 BusinessPortal 下挂 MDM 虚拟目录

```powershell
# /MDM/ → C:\WebSites\MDM-Web (wujie 子应用加载入口)
New-WebVirtualDirectory -Site "BusinessPortal" -Name "MDM" -PhysicalPath "C:\WebSites\MDM-Web" -Force

# 验证: 浏览器访问 http://172.21.10.8:8002/MDM/ 应能加载 MDM 前端
```

---

## 8. SPA 前端 URL Rewrite 规则

> React Router history mode 需要把所有未匹配静态文件的请求重写到 `/index.html`,否则刷新页面 404。

每个前端站点的根目录(`C:\WebSites\SYS3-Console` 等)放一个 `web.config`,内容:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA Fallback" stopProcessing="true">
          <match url="(.*)" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/(api|swagger|hangfire)" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <!-- 修正 .json / .webmanifest MIME 类型 -->
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".webmanifest" />
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
    <httpProtocol>
      <customHeaders>
        <!-- 缓存策略: index.html 不缓存,其他静态资源长缓存 -->
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
```

> **首次部署时**: Pipeline 会把 `dist/web.config` 一起 push 进来(在前端 repo 里加这个文件)。手册阶段先在 5 个前端目录放一份占位 `web.config`,避免 Pipeline 第一次推之前出现 404。

复制 web.config 到 4 个前端目录:

```powershell
$content = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA Fallback" stopProcessing="true">
          <match url="(.*)" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/(api|swagger|hangfire)" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
'@

@("SYS3-Console", "BusinessPortal", "AuditPortal", "MDM-Web") | ForEach-Object {
    $path = "C:\WebSites\$_\web.config"
    Set-Content -Path $path -Value $content -Encoding UTF8
}
```

---

## 9. .NET 8 后端 web.config(说明,部署时由 publish 自带)

> 不需要手工写 — `dotnet publish` 会自动生成 `web.config` 注册 AspNetCoreModuleV2。

publish 后的典型内容(供运维理解,无需手工放):

```xml
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath="dotnet" arguments=".\AL.Extend.SYS.WebApi.dll" stdoutLogEnabled="false" hostingModel="inprocess" />
    </system.webServer>
  </location>
</configuration>
```

**关键点**: SYSV2 后端的 `hostingModel` 默认 `inprocess`(IIS 进程内托管),性能优于 `outofprocess`;Hosting Bundle 装好后此模式自动可用。

---

## 10. 防火墙端口

```powershell
# 入站规则
New-NetFirewallRule -DisplayName "SYSV2 SYS-Api"        -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
New-NetFirewallRule -DisplayName "SYSV2 MDM-Api"        -Direction Inbound -Protocol TCP -LocalPort 5026 -Action Allow
New-NetFirewallRule -DisplayName "SYSV2 SYS3-Console"   -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow
New-NetFirewallRule -DisplayName "SYSV2 BusinessPortal" -Direction Inbound -Protocol TCP -LocalPort 8002 -Action Allow
New-NetFirewallRule -DisplayName "SYSV2 AuditPortal"    -Direction Inbound -Protocol TCP -LocalPort 8003 -Action Allow
New-NetFirewallRule -DisplayName "Web Deploy 8172"      -Direction Inbound -Protocol TCP -LocalPort 8172 -Action Allow

# 验证
Get-NetFirewallRule -DisplayName "SYSV2*" | Format-Table DisplayName, Enabled, Action
```

---

## 11. 数据库连接(给开发/测试参考)

5 个站点共用一个测试库 `172.21.10.26/ExtendLibrary`,Pipeline 部署时通过 ADO Variable Group 注入连接字符串到 `appsettings.Production.json`(覆盖 `appsettings.json` 默认值)。

| 应用 | 连接字符串(Pipeline 注入) |
|---|---|
| SYS-Api | `Server=172.21.10.26;Database=ExtendLibrary;User Id=<cicd_db_writer>;Password=<secret>;TrustServerCertificate=True` |
| MDM-Api | 同上(或 MDM 专属库,按 dba 规划) |

**测试账号**(部署后涛哥验证):
- 控制台: `http://172.21.10.8:8001/login` → systemadmin / 123!@#
- 业务门户: `http://172.21.10.8:8002/login` → BPuser(测试库已建,见 SYSV2 memory `feedback_bpuser_permissions_self_managed.md`)

---

## 12. 验证清单(交付前自检)

```powershell
# === IIS 角色 ===
Get-WindowsFeature -Name Web-Server | Select-Object Name, InstallState

# === Hosting Bundle ===
dotnet --list-runtimes
# 应包含 Microsoft.AspNetCore.App 8.0.x

# === AspNetCoreModuleV2 注册 ===
Select-String -Path "C:\Windows\System32\inetsrv\config\applicationHost.config" -Pattern "AspNetCoreModuleV2" | Select-Object -First 1

# === URL Rewrite ===
Test-Path "C:\Windows\System32\inetsrv\rewrite.dll"  # 应 True

# === Web Deploy ===
& "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe" -verb:dump -source:contentPath="C:\Windows\Temp" | Select-Object -First 3

# === 服务状态 ===
Get-Service W3SVC, WMSVC | Format-Table Name, Status, StartType

# === 站点状态 ===
Get-Website | Format-Table Name, State, ApplicationPool

# === AppPool 状态 ===
Get-ChildItem IIS:\AppPools | Format-Table Name, State

# === 端口监听 ===
Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in 5000,5026,8001,8002,8003,8172} | Format-Table LocalPort, State

# === 本机访问站点(放占位 index.html 后) ===
"5000","5026","8001","8002","8003" | ForEach-Object {
    try {
        $r = Invoke-WebRequest "http://localhost:$_" -UseBasicParsing -TimeoutSec 5
        Write-Host "Port $_ : HTTP $($r.StatusCode)"
    } catch {
        Write-Host "Port $_ : ERROR $($_.Exception.Message)"
    }
}
```

### 12.1 Agent VM 远程 Web Deploy 烟测

在 Agent VM 上跑(初次验证 cicd-deploy 远程权限):

```powershell
# 准备一个最小测试包
mkdir C:\tmp\hello
Set-Content C:\tmp\hello\index.html "<h1>Hello from Agent VM</h1>"

# 推送到 10.8 的 SYS3-Console 站点
$msdeploy = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"
& $msdeploy `
    -verb:sync `
    -source:contentPath="C:\tmp\hello" `
    -dest:contentPath="SYS3-Console",computerName="https://172.21.10.8:8172/msdeploy.axd?site=SYS3-Console",userName="cicd-deploy",password="<密码>",authType="Basic" `
    -allowUntrusted

# 验证: 浏览器打开 http://172.21.10.8:8001/ 应看到 "Hello from Agent VM"
```

---

## 13. 常见问题

| 症状 | 排查 |
|---|---|
| Web Deploy 403 Forbidden | ① Management Service 未启 → `Start-Service WMSVC`<br>② cicd-deploy 没加 IIS Manager Users → 见 6.3 GUI 步骤<br>③ 站点 IIS Manager Permissions 没授权该账号 |
| Web Deploy 找不到 msdeploy.axd | Web Deploy 安装时没选 "Complete" → 卸载重装勾完整 |
| .NET 8 站点启动报 500.19 | Hosting Bundle 没装 / 装完没重启 IIS → 跑 `net stop was /y && net start w3svc` |
| .NET 8 站点启动报 502.5 | publish 产物路径不对,或 csproj 名字不匹配 web.config 里的 dll 名 |
| SPA 刷新页面 404 | web.config 没放或 URL Rewrite 模块没装 |
| Agent VM 推送时连不上 8172 | 防火墙没开 / WMSVC 没起 / 网络组没放 Agent VM 到 10.8 的 8172 |
| 站点能起但访问空白 | 站点目录还没 push 内容,正常 — 等 Pipeline 跑一次就好 |
| `/MDM/` 路径 404 | BusinessPortal 站点下没建虚拟目录 → 7.3 步骤遗漏 |

---

## 14. 后续 Pipeline 集成

本手册完成后,Agent VM 侧的 `azure-pipelines.yml` 在 Deploy 阶段调用 Web Deploy 任务:

```yaml
- task: IISWebAppDeploymentOnMachineGroup@0
  displayName: 'Deploy SYS-Api to 10.8'
  inputs:
    WebSiteName: 'SYS-Api'
    Package: '$(Pipeline.Workspace)/drop/SYS-Api.zip'
    TakeAppOfflineFlag: true
    RemoveAdditionalFilesFlag: true
    XmlTransformation: false
    XmlVariableSubstitution: true
```

> 完整 pipeline 模板待 Phase 1.3 出 SYS 主线首条 pipeline 时落到 `engineering-standards/pipelines/iis-deploy.yml`。

---

## 15. 与 Agent VM 手册的契合点

| 项 | Agent VM 手册位置 | 本手册位置 |
|---|---|---|
| cicd-deploy 账号 | 第 7 节服务账号权限对照(预留) | 第 6.2 节(实际创建) |
| Web Deploy 8172 防火墙 | 第 3.1 节出站规则(Agent 出站) | 第 10 节入站规则(10.8 入站) |
| SQL Server 1433 防火墙 | 第 3.1 节出站(Agent → 26) | 不涉及(10.8 不直连 26,后端应用进程才连) |
| msdeploy 命令 | 第 5.5 节 Agent 装 Web Deploy | 第 12.1 节烟测 |

---

**文档版本**: v1.0 / 2026-05-12
**维护**: 涛哥 + Claude
**配套**:
- Agent VM 手册: `cicd-agent-vm-setup.md`
- Phase 2 Docker 评估: `windwos-11-b-s-net-8-react-claude-warm-bunny.md`(plan 文件)
- ADR-007 鉴权 4 条刚性 / ADR-010 MDM 路径 `/MDM/`
