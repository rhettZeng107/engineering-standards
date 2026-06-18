; Unshipped analyzer release
; https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.Analyzers/ReleaseTrackingAnalyzers.Help.md

### New Rules

Rule ID | Category | Severity | Notes
--------|----------|----------|--------------------
SYSV2_AUTH_001 | SYSV2.Authorization | Warning | Controller 缺 [Authorize] 或 [AllowAnonymous] 属性(ADR-007 #1)
SYSV2_AUTH_002 | SYSV2.Authorization | Error | [Authorize(Policy="X")] X 必在 Program.cs 注册(ADR-007 #2)
SYSV2_CONTRACT_001 | SYSV2.Contract | Warning | Controller method 直返空 List<>() 字面量空壳(ADR-008 #6)
