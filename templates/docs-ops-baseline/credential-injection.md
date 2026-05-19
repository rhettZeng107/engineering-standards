# 数据库凭据注入指南

> 本文档对应 SYSV2 等保 2.0 改造 G4·T0.4「凭据保护」机制。所有数据库密码不再以明文 commit 到 git，必须通过环境变量在启动时注入。

## 设计原则

1. **git 仓库 0 明文**:`appsettings.*.json` 中所有连接字符串密码字段必须是 `${VAR}` 占位符
2. **启动 fail-fast**:占位符引用的环境变量缺失 → 应用直接抛 `InvalidOperationException` 启动失败,不允许默默用空密码连库
3. **统一替换**:`Program.cs` 的 ConfigurationProvider 加载完成后,统一扫描 `ConnectionStrings` 段做 `${VAR}` → 环境变量替换
4. **兼容 Consul**:Consul 拉来的连接串如果也用 `${VAR}` 占位符,同样会被本机制替换

## 当前需要的环境变量

| 变量名 | 用途 | 涉及连接串数量 |
|---|---|---|
| `DB_DEFAULT_SA_PASSWORD` | 172.21.10.26 上 sa / xycinfo / jyinfo 等共用账户密码 | 11 |
| `DB_AUDIT_WRITER_PASSWORD` | 172.21.10.26 上 `sys_audit_writer` 独立账户密码（G4·T4.1 创建的账号,仅 INSERT/SELECT 审计 5 张表;由 `AuditWriter` 连接串使用） | 1 |
| `DB_JINCHUANG_U9_PASSWORD` | 172.16.19.24 上 U9 系统 sa 账户密码 | 1 |
| `DB_DM_LOCAL_PASSWORD` | 本地达梦数据库 SYSDBA 账户密码 | 1 |

### 关于 sys_audit_writer 账户

该账户由 SQL 脚本 `docs/sql-scripts/pending/2026-04-18-batch1-g4-audit-writer-account.sql` 创建,权限严格限定:

- ✅ INSERT, SELECT on `SYS_SystemLog` / `JY_SYS_LoginLog` / `SYS_AuthPlantLog` / `AuditExportLog` / `SYS_SensitiveDataAccessLog`
- ❌ DENY UPDATE, DELETE on 上述 5 张表(双保险)
- ❌ 无任何业务表权限(主业务用 sa / 业务账户连接 SysContext)

DBA 创建账户时设置一个**强密码**(建议 16+ 位随机),通过 `DB_AUDIT_WRITER_PASSWORD` 环境变量注入应用;**绝不与 sa 共享密码**,这是审计独立性的核心。

## 不同环境的注入方式

### 本地开发(Development)

#> **重要:本节所有代码块中的 `<your-*-password>` 是占位符,请用真实凭据替换后再执行。绝不要把真实凭据写入本文档或 commit 到 git。**

### 方式 A:`dotnet user-secrets`(推荐)

```bash
cd AI.Extend.SYS/AL.Extend.SYS.WebApi
dotnet user-secrets init
dotnet user-secrets set "DB_DEFAULT_SA_PASSWORD" "<your-sa-password>"
dotnet user-secrets set "DB_JINCHUANG_U9_PASSWORD" "<your-u9-password>"
dotnet user-secrets set "DB_DM_LOCAL_PASSWORD" "<your-dm-password>"
```

注意:user-secrets 存储在 `%APPDATA%\Microsoft\UserSecrets\<UserSecretsId>\secrets.json`(Windows)或 `~/.microsoft/usersecrets/<UserSecretsId>/secrets.json`(Linux/macOS),不进入 git 仓库。但**它们没有自动作为环境变量注入**,需要在 `Program.cs` 调用 `builder.Configuration.AddUserSecrets()` 后,从配置而非 Environment 读取 — 当前实现仍走环境变量,所以本地开发推荐用方式 B。

#### 方式 B:launchSettings.json `environmentVariables`

编辑 `Properties/launchSettings.json`,在每个 profile 下加:

```json
{
  "profiles": {
    "https": {
      "commandName": "Project",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DB_DEFAULT_SA_PASSWORD": "<your-sa-password>",
        "DB_JINCHUANG_U9_PASSWORD": "<your-u9-password>",
        "DB_DM_LOCAL_PASSWORD": "<your-dm-password>"
      }
    }
  }
}
```

**重要**:`launchSettings.json` 默认进 git。**不要**在共享分支提交带真实密码的 launchSettings。建议:
- 把 `Properties/launchSettings.json` 加入 `.gitignore`(如团队接受)
- 或保留为占位符版本,本地复制为 `launchSettings.local.json`(后者 .gitignore)

#### 方式 C:操作系统环境变量

```powershell
# Windows PowerShell (当前会话)
$env:DB_DEFAULT_SA_PASSWORD = "<your-sa-password>"
$env:DB_JINCHUANG_U9_PASSWORD = "<your-u9-password>"
$env:DB_DM_LOCAL_PASSWORD = "<your-dm-password>"
dotnet run

# Windows (永久)
[System.Environment]::SetEnvironmentVariable('DB_DEFAULT_SA_PASSWORD','<your-sa-password>','User')
```

```bash
# Linux/macOS
export DB_DEFAULT_SA_PASSWORD="<your-sa-password>"
export DB_JINCHUANG_U9_PASSWORD="<your-u9-password>"
export DB_DM_LOCAL_PASSWORD="<your-dm-password>"
dotnet run
```

### 生产环境(Production)

生产配置走 Consul,但 Consul 上的 `ConnectionStrings` 也建议使用 `${VAR}` 占位符。

#### 方式 A:systemd EnvironmentFile(Linux 部署推荐)

```ini
# /etc/systemd/system/sys-webapi.service
[Service]
EnvironmentFile=/etc/sys-webapi/secrets.env
ExecStart=/usr/bin/dotnet /opt/sys-webapi/AL.Extend.SYS.WebApi.dll
```

```bash
# /etc/sys-webapi/secrets.env (chmod 600, owner = service user)
DB_DEFAULT_SA_PASSWORD=<生产环境密码>
DB_JINCHUANG_U9_PASSWORD=<生产环境密码>
DB_DM_LOCAL_PASSWORD=<生产环境密码>
```

#### 方式 B:Docker secrets

```yaml
# docker-compose.yml
services:
  webapi:
    environment:
      - DB_DEFAULT_SA_PASSWORD_FILE=/run/secrets/db_default_sa
    secrets:
      - db_default_sa
secrets:
  db_default_sa:
    external: true
```

注意:Docker secrets 默认作为文件挂载,需要在 Program.cs 适配从 `*_FILE` 变量读取文件内容(本期未实现,如需走此路径要扩展替换逻辑)。

#### 方式 C:Azure Key Vault / AWS Secrets Manager / 阿里云 KMS

通过对应的 .NET SDK 或 sidecar 把秘密拉取后注入为环境变量,Program.cs 不需要改动。

### CI/CD

GitHub Actions / Azure Pipelines / Jenkins 等设置 secret 后,在 build/test job 中以环境变量形式提供。**绝不在 CI 日志中 echo 任何密码值**。

## 历史明文凭据轮换建议

由于 `appsettings.Development.json` 在改造前已含明文密码并 commit 到 git,git 历史里依然能看到旧凭据(`<your-sa-password>` / `<your-u9-password>` / `<your-dm-password>`)。建议:

1. **必须做**:`scripts/security/scan-git-history-secrets.sh`(T0.5)运行扫描,确认历史泄露范围
2. **强烈建议做**:轮换 `<your-sa-password>` 等已暴露的数据库密码 — 因为 git 仓库已推到 GitHub `rhettZeng107/AI.Extend.SYS`(private)和内网 ADO,凡是能 clone 仓库的人都能从历史看到
3. **可选**:用 `git filter-repo` 或 BFG Repo-Cleaner 重写 git 历史移除密码 — 但操作高风险,会改变所有 commit hash,需要所有协作者重新 clone

## 测试用法验证

启动应用,在缺少环境变量时应直接看到:

```
Unhandled exception. System.InvalidOperationException: 启动失败：连接字符串 'DefaultDatabase' 引用环境变量 ${DB_DEFAULT_SA_PASSWORD}，但该变量未设置。请检查部署环境配置（参见 docs/ops/credential-injection.md）。
```

设置环境变量后正常启动,EF 连接成功 = 验收通过。

## 相关 Plan

- `docs/superpowers/plans/2026-04-18-mlps2-level2-compliance-roadmap.md` 第十二节 G4 / T0.4 / T0.5
