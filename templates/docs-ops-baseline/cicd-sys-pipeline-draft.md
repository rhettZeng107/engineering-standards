# SYS 主线 CI/CD Pipeline 草案

> **类型**: Phase 1.3 草案(等 Agent VM 上线后正式落到 nested repo)
> **覆盖**: SYS 主线 = `AI.Extend.SYS`(后端) + `AI.REACT.SYS.3`(控制台前端)
> **配套基建**:
> - Agent VM: `cicd-agent-vm-setup.md`
> - 10.8 IIS 服务器: `cicd-iis-server-setup.md`
> **目标 ADO 仓**: 内网 ADO `JYDevOps/JYPrdCollection/AI.Extend.SYS` + `JYDevOps/JYPrdCollection/AI.REACT.SYS.3`

---

## 1. 设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 单 yaml 还是各自一份? | **各 repo 一份**(SYS 后端 1 份 + SYS.3 前端 1 份) | 两个 nested repo 是独立 git,push trigger 独立;同一个仓的 yaml 不应跨仓引用 |
| 触发分支 | `master` push | 跟 SYSV2 当前 master 单主干一致(MDM 已收敛) |
| Build 配置 | `Release` | 默认生产构建 |
| EF Migrations | `bundle.exe` 离线可执行 | 适合 CI/CD + 客户离线场景(对应 Phase 2 Docker 也复用) |
| 部署目标 | `172.21.10.8`(IIS 5 站点已就绪) | Phase 1 测试环境 |
| Stage 切分 | Build → Test → Deploy_Test(自动) | 模拟生产 Stage 4-5 留占位,等模拟生产服务器到位再启用 |
| Secret 管理 | ADO Variable Groups + Secret 类型 | 绝不硬编码到 yaml,绝不入 git |

---

## 2. ADO 侧前置手工配置(涛哥操作)

### 2.1 创建 Environment

> ADO → Pipelines → **Environments** → New environment

| Name | 用途 | Approval |
|---|---|---|
| `SYSV2-Test` | 测试环境(10.8)— 自动部署 | 无 |
| `SYSV2-Staging` | 模拟生产 — 需 2 人测试团队点 Approve | 1 人 approval(后续模拟生产到位时配) |

### 2.2 创建 Variable Group

> ADO → Pipelines → **Library** → **+ Variable group** → 名字 `SYSV2-Deploy-Secrets`

| Variable | 类型 | 值 | 说明 |
|---|---|---|---|
| `WEBDEPLOY_USER` | 明文 | `cicd-deploy` | 10.8 部署账号 |
| `WEBDEPLOY_PASSWORD_TEST` | **🔒 Secret(锁图标)** | `lin&wu12a` | 10.8 cicd-deploy 密码,**ADO 自动脱敏** |
| `DB_CONNECTION_TEST` | **🔒 Secret** | `Server=172.21.10.26;Database=ExtendLibrary;User Id=sa;Password=<sa密码>;TrustServerCertificate=True;Encrypt=False` | 测试库连接串 |
| `IIS_TARGET_HOST` | 明文 | `172.21.10.8` | 部署目标 IP |

> **关键**: 加 Variable 时,密码/连接串那行**必须点小锁图标改成 Secret**,否则在 build log 里会明文打印。

### 2.3 授权 Agent Pool 给两个 Repo

> ADO → 项目设置 → **Agent pools** → `SYSV2-OnPrem` → Security → 加 `AI.Extend.SYS` 和 `AI.REACT.SYS.3` 仓库的 build service 账号,角色 `User`

### 2.4 授权 Environment + Variable Group 给两个 Pipeline

> 第一次 pipeline 跑会自动弹窗 "需要授权 environment / variable group",点 Permit 即可。

---

## 3. SYS 后端 yaml(落到 `AI.Extend.SYS/azure-pipelines.yml`)

```yaml
# AL.Extend.SYS 后端 CI/CD Pipeline
# 触发: master push → Build + Test + Deploy to 测试环境 (172.21.10.8)
# Self-hosted Agent: SYSV2-OnPrem
# 配套文档: docs/ops/cicd-sys-pipeline-draft.md

trigger:
  branches:
    include:
      - master
  paths:
    exclude:
      - '**/*.md'
      - 'docs/**'
      - '.gitignore'

pool:
  name: SYSV2-OnPrem

variables:
  - group: SYSV2-Deploy-Secrets
  - name: solutionPath
    value: 'AL.Extend.SYS.sln'
  - name: webApiProject
    value: 'AL.Extend.SYS.WebApi/AL.Extend.SYS.WebApi.csproj'
  - name: infrastructureProject
    value: 'AL.Extend.SYS.Infrastructure/AL.Extend.SYS.Infrastructure.csproj'
  - name: testProject
    value: 'AL.Extend.SYS.Tests/AL.Extend.SYS.Tests.csproj'
  - name: buildConfiguration
    value: 'Release'
  - name: targetSite
    value: 'SYS-Api'

stages:

# ========== Stage 1: Build ==========
- stage: Build
  displayName: 'Build & Package'
  jobs:
    - job: BuildBackend
      displayName: '.NET 8 Build + Publish + EF Bundle'
      steps:
        - checkout: self
          fetchDepth: 1

        - task: UseDotNet@2
          displayName: 'Use .NET 8 SDK'
          inputs:
            packageType: 'sdk'
            version: '8.x'

        - task: DotNetCoreCLI@2
          displayName: 'Restore NuGet'
          inputs:
            command: 'restore'
            projects: '$(solutionPath)'

        - task: DotNetCoreCLI@2
          displayName: 'Build Release'
          inputs:
            command: 'build'
            projects: '$(solutionPath)'
            arguments: '--configuration $(buildConfiguration) --no-restore'

        - task: DotNetCoreCLI@2
          displayName: 'Publish WebApi → $(Build.ArtifactStagingDirectory)/SYS-Api'
          inputs:
            command: 'publish'
            projects: '$(webApiProject)'
            arguments: '--configuration $(buildConfiguration) --no-build --output $(Build.ArtifactStagingDirectory)/SYS-Api'
            zipAfterPublish: false
            publishWebProjects: false
            modifyOutputPath: false

        - script: |
            dotnet tool install --global dotnet-ef --version 8.* 2>nul || dotnet tool update --global dotnet-ef --version 8.*
            dotnet ef migrations bundle ^
              --project $(infrastructureProject) ^
              --startup-project $(webApiProject) ^
              --configuration $(buildConfiguration) ^
              --output $(Build.ArtifactStagingDirectory)/efbundle.exe ^
              --force
          displayName: 'Generate EF Migrations Bundle'

        - task: PublishBuildArtifacts@1
          displayName: 'Publish Artifact: drop'
          inputs:
            PathtoPublish: '$(Build.ArtifactStagingDirectory)'
            ArtifactName: 'drop'
            publishLocation: 'Container'

# ========== Stage 2: Test ==========
- stage: Test
  displayName: 'Unit Tests (xUnit)'
  dependsOn: Build
  condition: succeeded()
  jobs:
    - job: UnitTest
      displayName: 'dotnet test + coverage'
      steps:
        - task: UseDotNet@2
          inputs:
            packageType: 'sdk'
            version: '8.x'

        - task: DotNetCoreCLI@2
          displayName: 'Run xUnit Tests'
          inputs:
            command: 'test'
            projects: '$(testProject)'
            arguments: '--configuration $(buildConfiguration) --logger trx --collect:"XPlat Code Coverage" --results-directory $(Agent.TempDirectory)/TestResults'
            publishTestResults: true

# ========== Stage 3: Deploy to Test (10.8 IIS) ==========
- stage: DeployTest
  displayName: 'Deploy to Test (172.21.10.8)'
  dependsOn: Test
  condition: succeeded()
  jobs:
    - deployment: DeploySysApi
      displayName: 'Deploy SYS-Api'
      environment: 'SYSV2-Test'
      strategy:
        runOnce:
          deploy:
            steps:
              - download: current
                artifact: drop

              # 用 PowerShell + msdeploy 直接推,不依赖 IISWebAppDeploymentOnMachineGroup@0 (后者需要 Deployment Group)
              - powershell: |
                  $msdeploy = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"
                  & $msdeploy `
                    -verb:sync `
                    -source:contentPath="$(Pipeline.Workspace)\drop\SYS-Api" `
                    -dest:contentPath="$(targetSite)",computerName="https://$(IIS_TARGET_HOST):8172/msdeploy.axd?site=$(targetSite)",userName="$(WEBDEPLOY_USER)",password="$(WEBDEPLOY_PASSWORD_TEST)",authType="Basic" `
                    -allowUntrusted `
                    -enableRule:AppOffline `
                    -enableRule:DoNotDeleteRule
                  if ($LASTEXITCODE -ne 0) { throw "msdeploy failed with exit $LASTEXITCODE" }
                displayName: 'Web Deploy → SYS-Api @ 10.8'

              - powershell: |
                  $efbundle = "$(Pipeline.Workspace)\drop\efbundle.exe"
                  & $efbundle --connection "$(DB_CONNECTION_TEST)"
                  if ($LASTEXITCODE -ne 0) { throw "EF migrations failed with exit $LASTEXITCODE" }
                displayName: 'Run EF Migrations to ExtendLibrary'

              - powershell: |
                  try {
                    $r = Invoke-WebRequest "http://$(IIS_TARGET_HOST):5000/swagger/index.html" -UseBasicParsing -TimeoutSec 30
                    Write-Host "Smoke OK: HTTP $($r.StatusCode)"
                  } catch {
                    Write-Host "Smoke check failed: $_"
                    exit 1
                  }
                displayName: 'Smoke Check: SYS-Api'
                continueOnError: false
```

---

## 4. SYS.3 前端 yaml(落到 `AI.REACT.SYS.3/azure-pipelines.yml`)

```yaml
# AI.REACT.SYS.3 前端 CI/CD Pipeline
# 触发: master push → Build + Deploy to 测试环境 (172.21.10.8:8001)

trigger:
  branches:
    include:
      - master
  paths:
    exclude:
      - '**/*.md'
      - 'docs/**'
      - '.gitignore'

pool:
  name: SYSV2-OnPrem

variables:
  - group: SYSV2-Deploy-Secrets
  - name: targetSite
    value: 'SYS3-Console'

stages:

# ========== Stage 1: Build ==========
- stage: Build
  displayName: 'pnpm Build (Vite)'
  jobs:
    - job: BuildFrontend
      displayName: 'pnpm install + build'
      steps:
        - checkout: self
          fetchDepth: 1

        - task: NodeTool@0
          displayName: 'Use Node 20'
          inputs:
            versionSpec: '20.x'

        - script: |
            corepack enable
            corepack prepare pnpm@10.32.1 --activate
            pnpm -v
          displayName: 'Activate pnpm 10.32.1'

        - script: |
            pnpm install --frozen-lockfile
          displayName: 'pnpm install'

        - script: |
            pnpm build
          displayName: 'pnpm build (Vite)'

        # 把 SPA web.config 复制进 dist(覆盖默认)
        # 如果 repo 里已有 public/web.config 或 vite copy 已配,可省这一步
        - powershell: |
            $webConfig = @'
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
                      </conditions>
                      <action type="Rewrite" url="/index.html" />
                    </rule>
                  </rules>
                </rewrite>
              </system.webServer>
            </configuration>
            '@
            $webConfig | Out-File -FilePath "dist/web.config" -Encoding utf8 -Force
          displayName: 'Inject SPA web.config'

        - task: PublishBuildArtifacts@1
          displayName: 'Publish Artifact: dist'
          inputs:
            PathtoPublish: 'dist'
            ArtifactName: 'sys3-dist'
            publishLocation: 'Container'

# ========== Stage 2: Deploy to Test ==========
- stage: DeployTest
  displayName: 'Deploy to Test (172.21.10.8:8001)'
  dependsOn: Build
  condition: succeeded()
  jobs:
    - deployment: DeploySys3Console
      displayName: 'Deploy SYS3-Console'
      environment: 'SYSV2-Test'
      strategy:
        runOnce:
          deploy:
            steps:
              - download: current
                artifact: sys3-dist

              - powershell: |
                  $msdeploy = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"
                  & $msdeploy `
                    -verb:sync `
                    -source:contentPath="$(Pipeline.Workspace)\sys3-dist" `
                    -dest:contentPath="$(targetSite)",computerName="https://$(IIS_TARGET_HOST):8172/msdeploy.axd?site=$(targetSite)",userName="$(WEBDEPLOY_USER)",password="$(WEBDEPLOY_PASSWORD_TEST)",authType="Basic" `
                    -allowUntrusted `
                    -enableRule:DoNotDeleteRule
                  if ($LASTEXITCODE -ne 0) { throw "msdeploy failed with exit $LASTEXITCODE" }
                displayName: 'Web Deploy → SYS3-Console @ 10.8'

              - powershell: |
                  try {
                    $r = Invoke-WebRequest "http://$(IIS_TARGET_HOST):8001/" -UseBasicParsing -TimeoutSec 30
                    Write-Host "Smoke OK: HTTP $($r.StatusCode), Content length: $($r.Content.Length)"
                  } catch {
                    Write-Host "Smoke check failed: $_"
                    exit 1
                  }
                displayName: 'Smoke Check: SYS3-Console index.html'
```

---

## 5. 第一次 dry-run 操作顺序(等 Agent VM 就绪后)

1. **运维确认 Agent VM 状态 Online**(`cicd-agent-vm-setup.md` 第 8 章自检全 PASS)
2. **涛哥 ADO 操作**: 按本文第 2 章建 Environment + Variable Group + 授权 Agent Pool
3. **Claude 落 yaml 到两个 nested repo**:
   ```powershell
   # SYS 后端
   Copy-Item "docs\ops\cicd-sys-pipeline-draft.md 里的 yaml 段" `
             "AI.Extend.SYS\azure-pipelines.yml"
   # SYS.3 前端
   Copy-Item "..." "AI.REACT.SYS.3\azure-pipelines.yml"
   ```
4. **commit + 双推**(分别在两个 nested repo):
   ```powershell
   cd AI.Extend.SYS
   git add azure-pipelines.yml
   git commit -m "ci: 首条 SYS 后端 CI/CD pipeline"
   git push origin master
   git push github master

   cd ..\AI.REACT.SYS.3
   git add azure-pipelines.yml
   git commit -m "ci: 首条 SYS.3 前端 CI/CD pipeline"
   git push origin master
   git push github master
   ```
5. **ADO 创建两条 Pipeline**:
   - ADO → Pipelines → New pipeline → 选 Azure Repos Git → 选 `AI.Extend.SYS` → 用现有 yaml
   - 重复一次给 `AI.REACT.SYS.3`
6. **手工触发第一次 run**(或推一个空提交触发):
   - 第一次会弹 environment/variable group 授权确认 → 全 Permit
7. **观察 build log**:
   - Stage 1 Build → 看 `dotnet publish` 产出 + `pnpm build` 产出 + `efbundle.exe` 生成
   - Stage 2 Test → 看 xUnit 结果
   - Stage 3 Deploy → 看 msdeploy 推送 + EF 迁移 + Smoke
8. **验证 10.8**:
   - 浏览器 `http://172.21.10.8:5000/swagger`(后端) + `http://172.21.10.8:8001/`(前端)
   - 用 systemadmin / 123!@# 登录确认链路通

---

## 6. 第一次跑预期会遇到的问题

| 症状 | 原因 | 处理 |
|---|---|---|
| msdeploy 报 401 | cicd-deploy IIS 管理器用户没加 / 站点没授权 | 回 `cicd-iis-server-setup.md` 6.3 节 + Step 4 |
| msdeploy 报 403 | Web Deploy 没装 Complete / 远程连接没启 | `cicd-iis-server-setup.md` 5.2 节重装 |
| efbundle.exe 报连接超时 | Agent VM → 26 数据库 1433 防火墙 / sa 密码错 | Agent VM 手册第 3.1 / 8 章 |
| Smoke 报 502.5 | publish 产物名 dll 不对 / Hosting Bundle 没装 | 10.8 检查 `dotnet --list-runtimes`,WebApi web.config 自动生成的 dll 名 |
| Stage 卡 `Waiting for agent` | Agent VM Offline / Pool 没授权该 repo | Agent VM 服务状态 + ADO Agent pool security |
| 前端 Smoke 报 404 | dist 推到了错的目录 / IIS 站点物理路径不对 | 10.8 检查 `C:\WebSites\SYS3-Console\` 是否有 index.html |

---

## 7. 后续 horizontal 扩展(其他 5 个 repo)

| repo | yaml 复用 | 关键差异 |
|---|---|---|
| `AI.Extend.MDM.1`(MDM 后端) | 复用 SYS 后端模板 | 端口 5026 + DM 驱动 + MDM 测试库 |
| `AI.REACT.MDM.1`(MDM 前端) | 复用 SYS.3 前端模板 | 端口 8002/MDM 虚拟目录(部署到 `C:\WebSites\MDM-Web`)+ pnpm |
| `AI.REACT.SYS.BusinessPortal` | 复用 SYS.3 模板 | 端口 8002 / 部署到 `BusinessPortal` 站点 |
| `AI.REACT.SYS.AuditPortal` | 复用 SYS.3 模板 | 端口 8003 / 部署到 `AuditPortal` 站点 |

**后续优化**:把 yaml 公共部分抽到 `engineering-standards` 仓的 `pipelines/` 目录(template),各 repo 用 `extends` 或 `template` 关键字引用,减少重复 — 待 SYS 主线跑稳后启动。

---

## 8. 关于 Pipeline 不入 git 前的留存策略

**当前**: yaml 草案在本文档里,**未 commit 到 nested repo**。

**等 Agent VM 上线 + ADO 配置就绪后**:
1. 提取本文档第 3 章 yaml → 落到 `AI.Extend.SYS/azure-pipelines.yml`
2. 提取本文档第 4 章 yaml → 落到 `AI.REACT.SYS.3/azure-pipelines.yml`
3. 各自 commit + 双推
4. 本文档保留为"设计决策 + ADO 配置手册",不删除

---

**文档版本**: v1.0 / 2026-05-12
**维护**: 涛哥 + Claude
**配套**:
- `cicd-agent-vm-setup.md`(Agent VM 基建)
- `cicd-iis-server-setup.md`(10.8 IIS 基建)
- Phase 2 Docker 评估: `~/.claude/plans/windwos-11-b-s-net-8-react-claude-warm-bunny.md`
