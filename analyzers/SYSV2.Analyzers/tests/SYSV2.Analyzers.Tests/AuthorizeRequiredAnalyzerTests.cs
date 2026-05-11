using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Testing.Verifiers;
using Xunit;
using VerifyCS = Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
    SYSV2.Analyzers.AuthorizeRequiredAnalyzer,
    Microsoft.CodeAnalysis.Testing.Verifiers.XUnitVerifier>;

namespace SYSV2.Analyzers.Tests;

/// <summary>
/// AuthorizeRequiredAnalyzer (L1, SYSV2_AUTH_001) unit tests.
///
/// 覆盖正样本 / 负样本 / abstract / 继承链 / 非 Controller 6 类场景。
///
/// 测试源码统一用 fully-qualified type names(Microsoft.AspNetCore.Mvc.ControllerBase 等)
/// 避免 using 必须在 namespace 之前的 C# 语法限制(CS1529)。
/// </summary>
public class AuthorizeRequiredAnalyzerTests
{
    /// <summary>
    /// ASP.NET Core 类型 stub — 避免引用真实 Microsoft.AspNetCore.* 程序集,
    /// 让 unit test 独立于 ASP.NET 版本。
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
        public string Policy { get; set; }
    }
    [System.AttributeUsage(System.AttributeTargets.Class | System.AttributeTargets.Method)]
    public class AllowAnonymousAttribute : System.Attribute {}
}
";

    [Fact]
    public async Task Controller_With_Authorize_Attribute_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
[Microsoft.AspNetCore.Authorization.Authorize(Policy = ""TestPolicy"")]
public class GoodController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    [Fact]
    public async Task Controller_With_AllowAnonymous_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
[Microsoft.AspNetCore.Authorization.AllowAnonymous]
public class HealthCheckController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    [Fact]
    public async Task Controller_Without_Attribute_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class {|SYSV2_AUTH_001:BadController|} : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    [Fact]
    public async Task Abstract_Controller_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public abstract class BaseController : Microsoft.AspNetCore.Mvc.ControllerBase {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    [Fact]
    public async Task Non_Controller_Class_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class JustAClass {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    [Fact]
    public async Task Derived_Controller_Inherits_Authorize_From_Base_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
[Microsoft.AspNetCore.Authorization.Authorize(Policy = ""Base"")]
public abstract class BaseController : Microsoft.AspNetCore.Mvc.ControllerBase {}

public class DerivedController : BaseController {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    [Fact]
    public async Task Derived_Controller_Without_Inherited_Authorize_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public abstract class PlainBaseController : Microsoft.AspNetCore.Mvc.ControllerBase {}

public class {|SYSV2_AUTH_001:DerivedBadController|} : PlainBaseController {}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }
}
