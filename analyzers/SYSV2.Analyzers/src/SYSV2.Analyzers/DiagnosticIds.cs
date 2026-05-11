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

    /// <summary>L3: Controller method 直返 new List&lt;&gt;() 字面量空壳(ADR-008 #6,P4 实现)</summary>
    public const string CONTRACT_001 = "SYSV2_CONTRACT_001";

    /// <summary>L4: 列表 API 返回类型必含 items/totalCount/current/pageSize 4 字段(ADR-008 #2,P4 实现)</summary>
    public const string CONTRACT_002 = "SYSV2_CONTRACT_002";
}
