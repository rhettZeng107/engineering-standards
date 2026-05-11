# SYSV2.Analyzers

> Build-time Roslyn analyzer enforcing SYSV2 工程标准。配套 [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)。

## 项目结构

```
SYSV2.Analyzers/
├── README.md                    本文档
├── .gitignore
├── SYSV2.Analyzers.sln
├── src/SYSV2.Analyzers/         analyzer 包
│   ├── SYSV2.Analyzers.csproj
│   ├── DiagnosticIds.cs         诊断 ID 常量
│   └── AuthorizeRequiredAnalyzer.cs   L1 实现
├── tests/SYSV2.Analyzers.Tests/
│   ├── SYSV2.Analyzers.Tests.csproj
│   └── AuthorizeRequiredAnalyzerTests.cs   L1 unit test
└── local-feed/                  本地 NuGet feed(.gitignore 排除)
```

## 规则清单(v0.1.0-spike)

| ID | 规则 | 严重度 | ADR |
|---|---|---|---|
| `SYSV2_AUTH_001` | Controller 缺 `[Authorize]` 或 `[AllowAnonymous]` 属性(L1) | Warning(spike 阶段) | ADR-007 #1 |

## 后续(P4 计划)

- `SYSV2_AUTH_002`:`[Authorize(Policy="X")]` X 必在 `Program.cs` 注册(L2 跨文件 SymbolAnalyzer)
- `SYSV2_CONTRACT_001`:Controller 直返 `new List<>()` 字面量空壳(L3)
- `SYSV2_CONTRACT_002`:列表 API 返回类型必含 `items/totalCount/current/pageSize` 4 字段(L4)
- pre-commit hook L5:qwen 标记 commit 含 `.cs` 阻塞

## 开发命令

```powershell
# 构建
dotnet build SYSV2.Analyzers.sln

# 跑 unit test
dotnet test SYSV2.Analyzers.sln

# 打包(本地 NuGet feed)
dotnet pack src/SYSV2.Analyzers/SYSV2.Analyzers.csproj -c Release -o local-feed/
```

## 本地 NuGet feed 配置(消费方接入)

在消费项目(如 `AL.Extend.SYS.WebApi.csproj`)同级或全局 `NuGet.config` 加:

```xml
<configuration>
  <packageSources>
    <add key="sysv2-local" value="C:\Users\Rhett\Projects\engineering-standards\analyzers\SYSV2.Analyzers\local-feed" />
  </packageSources>
</configuration>
```

然后在 `.csproj` 加:

```xml
<ItemGroup>
  <PackageReference Include="SYSV2.Analyzers" Version="0.1.0-spike" PrivateAssets="all" />
</ItemGroup>
```

## 接入策略(P2.6 涛哥拍板)

| 仓 | .csproj | 引用? | 备注 |
|---|---|---|---|
| `AI.Extend.SYS` | `AL.Extend.SYS.WebApi.csproj` | ✅ 首期 | P2 baseline 跑这里 |
| `AI.Extend.SYS` | `AL.Extend.SYS.Domain.csproj` | ❌ | 无 Controller |
| `AI.Extend.SYS` | `AL.Extend.SYS.Infrastructure.csproj` | ❌ | 无 Controller |
| `AI.Extend.SYS` | `AL.Extend.SYS.Tests.csproj` | ❌ | mock controller 全是误报 |
| `AI.Extend.MDM.1` | `MDMWebApi.csproj` | ✅ P4 | P4.6 接入(Tier 2,`feature/ww` 例外) |
| `AI.Extend.MDM.1` | `MDM.BaseModel.csproj` | ❌ | 无 Controller |

## 例外

- **`feature/ww` 鉴权阉割版分支**(MDM 后端,**永不推 GitHub**):`.csproj` 加 `Condition` 跳过 PackageReference,或根目录 `.editorconfig` 关 `SYSV2_AUTH_*` 诊断
- **跨进程鉴权**:用 `[Authorize(Policy="InternalOnly")]`(见 ADR-006 IP allowlist)
- **abstract class**:analyzer 自动跳过(基类不强制属性,派生类必加)

## Severity 演进路径

- **v0.1.0-spike**:首批 Warning(legacy false positive 多,先 baseline 后决策)
- **v0.2.0**:Baseline 跑出后,legacy 加 `[SuppressMessage]` 列表 + warning,**new code Error 阻塞 build**
- **v1.0.0**:全面 Error(扩量阶段 L2-L5 完成 + 月度 eval baseline 稳定后)

## 参见

- [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)(主决策)
- [ADR-007](../../decisions/ADR-007-auth-4-rigidity.md)(鉴权 4 条刚性)
- [ADR-008](../../decisions/ADR-008-end-to-end-8-checks.md)(8 项核对)
- SYSV2 spec/plan:`docs/superpowers/specs/2026-05-10-harness-mechanization-lint-eval/`
