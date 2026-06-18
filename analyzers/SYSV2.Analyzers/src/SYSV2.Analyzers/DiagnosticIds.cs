namespace SYSV2.Analyzers;

/// <summary>
/// SYSV2 工程标准诊断 ID 常量。
/// 编号规则:SYSV2_&lt;DOMAIN&gt;_&lt;NNN&gt;,DOMAIN ∈ { AUTH, CONTRACT, QWEN }
/// </summary>
public static class DiagnosticIds
{
    /// <summary>L1: Controller 缺 [Authorize] 或 [AllowAnonymous] 属性(ADR-007 #1)</summary>
    public const string AUTH_001 = "SYSV2_AUTH_001";

    /// <summary>L2: [Authorize(Policy="X")] X 必在 Program.cs 注册(ADR-007 #2,P4 实现)</summary>
    public const string AUTH_002 = "SYSV2_AUTH_002";

    /// <summary>L3: Controller method 直返 new List&lt;&gt;() 字面量空壳(ADR-008 #6)</summary>
    public const string CONTRACT_001 = "SYSV2_CONTRACT_001";

    /// <summary>
    /// L4: 列表 API 分页 4 字段 — DEFERRED(2026-06-18 P3 砍除,实证反转)。
    /// SYS 主力 Pagination&lt;T&gt; 不合规 + MDM 匿名对象 return-type analyzer 看不见 →
    /// 降级 E2E 8 项核对 #2 + contract-lock 兜底,不实现 analyzer。常量保留占位。
    /// 见 ADR-021 ## 修订 2026-06-18。
    /// </summary>
    public const string CONTRACT_002 = "SYSV2_CONTRACT_002";
}
