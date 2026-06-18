using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Testing.Verifiers;
using Xunit;
using VerifyCS = Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
    SYSV2.Analyzers.PolicyRegisteredAnalyzer,
    Microsoft.CodeAnalysis.Testing.Verifiers.XUnitVerifier>;

namespace SYSV2.Analyzers.Tests;

/// <summary>
/// PolicyRegisteredAnalyzer (L2, SYSV2_AUTH_002) unit tests.
///
/// 覆盖跨文件注册命中 / 未注册报警 / name: 命名参 / 非字面量跳过 /
/// IAuthorizationPolicyProvider 整体跳过 / 多 Policy 部分命中 等场景。
///
/// 测试源码统一用 fully-qualified type names,避免 using 必须在 namespace 之前的语法限制(CS1529)。
/// stub 不放具体 Controller 类(会被 L1 analyzer 自检报警,但本测试只跑 L2,无妨;仍按约定保持)。
/// </summary>
public class PolicyRegisteredAnalyzerTests
{
    /// <summary>
    /// ASP.NET Core 类型 stub — AuthorizeAttribute(带 Policy)/ ControllerBase /
    /// AddPolicy 可调用桩(AuthorizationOptions + 扩展方法)/ IAuthorizationPolicyProvider 接口。
    /// 让测试源码独立于真实 Microsoft.AspNetCore.* 程序集且能编译。
    /// </summary>
    private const string AspNetCoreStub = @"
namespace Microsoft.AspNetCore.Mvc
{
    public class ControllerBase {}
}
namespace Microsoft.AspNetCore.Authorization
{
    [System.AttributeUsage(System.AttributeTargets.Class | System.AttributeTargets.Method, AllowMultiple = true)]
    public class AuthorizeAttribute : System.Attribute
    {
        public AuthorizeAttribute() {}
        public AuthorizeAttribute(string policy) { Policy = policy; }
        public string Policy { get; set; }
    }
    public interface IAuthorizationPolicyProvider {}
    public class AuthorizationOptions
    {
        public void AddPolicy(string name, System.Action<object> configurePolicy) {}
    }
}
";

    /// <summary>跨文件:同 compilation 内 AddPolicy 注册 + Authorize 引用命中 → 无诊断。</summary>
    [Fact]
    public async Task Policy_Registered_AddPolicy_Then_Authorize_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class Startup
{
    public void Configure(Microsoft.AspNetCore.Authorization.AuthorizationOptions opts)
    {
        opts.AddPolicy(""AdminOnly"", p => {});
    }
}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = ""AdminOnly"")]
public class ReportController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>未注册 Policy 被 Authorize 引用 → 报 SYSV2_AUTH_002。</summary>
    [Fact]
    public async Task Policy_Not_Registered_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class Startup
{
    public void Configure(Microsoft.AspNetCore.Authorization.AuthorizationOptions opts)
    {
        opts.AddPolicy(""AdminOnly"", p => {});
    }
}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = {|SYSV2_AUTH_002:""MissingPolicy""|})]
public class ReportController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>AddPolicy 用 name: 命名参注册 → Authorize 引用命中无诊断。</summary>
    [Fact]
    public async Task Policy_Registered_Via_Named_Argument_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class Startup
{
    public void Configure(Microsoft.AspNetCore.Authorization.AuthorizationOptions opts)
    {
        opts.AddPolicy(name: ""NamedPolicy"", configurePolicy: p => {});
    }
}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = ""NamedPolicy"")]
public class FooController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>Policy 值为常量(非字符串字面量)→ 跳过该处,无诊断。</summary>
    [Fact]
    public async Task Policy_Non_Literal_Constant_Skipped_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public static class Policies
{
    public const string Admin = ""AdminConst"";
}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = Policies.Admin)]
public class BarController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>存在 IAuthorizationPolicyProvider 实现 → L2 整体跳过,未注册 Policy 也不报。</summary>
    [Fact]
    public async Task Custom_PolicyProvider_Present_Skips_Entire_Rule()
    {
        var source = AspNetCoreStub + @"
public class DynamicPolicyProvider : Microsoft.AspNetCore.Authorization.IAuthorizationPolicyProvider {}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = ""NeverRegistered"")]
public class BazController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>多 Policy 引用,一个已注册一个未注册 → 只报未注册那个。</summary>
    [Fact]
    public async Task Multiple_Policies_Only_Unregistered_Reported()
    {
        var source = AspNetCoreStub + @"
public class Startup
{
    public void Configure(Microsoft.AspNetCore.Authorization.AuthorizationOptions opts)
    {
        opts.AddPolicy(""Known"", p => {});
    }
}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = ""Known"")]
public class KnownController : Microsoft.AspNetCore.Mvc.ControllerBase {}

[Microsoft.AspNetCore.Authorization.Authorize(Policy = {|SYSV2_AUTH_002:""Unknown""|})]
public class UnknownController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>Authorize 无 Policy 参(裸 [Authorize])→ 不参与 L2 校验,无诊断。</summary>
    [Fact]
    public async Task Authorize_Without_Policy_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
[Microsoft.AspNetCore.Authorization.Authorize]
public class PlainController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }
}
