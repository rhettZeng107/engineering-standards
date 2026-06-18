using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Testing.Verifiers;
using Xunit;
using VerifyCS = Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
    SYSV2.Analyzers.EmptyListShellAnalyzer,
    Microsoft.CodeAnalysis.Testing.Verifiers.XUnitVerifier>;

namespace SYSV2.Analyzers.Tests;

/// <summary>
/// EmptyListShellAnalyzer (L3, SYSV2_CONTRACT_001) unit tests.
///
/// 覆盖直返空列表 / Ok 包裹空列表 / 空初始化 { } / 有元素不抓 /
/// 间接路径不抓 / 非 Controller 不抓 / 有构造参不抓 等场景。
///
/// 测试源码统一用 fully-qualified type names,避免 using 必须在 namespace 之前的语法限制(CS1529)。
/// </summary>
public class EmptyListShellAnalyzerTests
{
    /// <summary>
    /// ASP.NET Core 类型 stub — ControllerBase 提供 Ok / Json 包装方法(返回 object 即可,L3 只看语法)。
    /// </summary>
    private const string AspNetCoreStub = @"
namespace Microsoft.AspNetCore.Mvc
{
    public class ControllerBase
    {
        protected object Ok(object value) { return value; }
        protected object Json(object value) { return value; }
    }
}
";

    /// <summary>直返空 new List&lt;T&gt;() → 报 SYSV2_CONTRACT_001。</summary>
    [Fact]
    public async Task Direct_Return_Empty_List_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class FooController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    public System.Collections.Generic.List<string> GetAll()
    {
        return {|SYSV2_CONTRACT_001:new System.Collections.Generic.List<string>()|};
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>Ok(new List&lt;T&gt;()) 包一层 → 报诊断(剥一层 Ok)。</summary>
    [Fact]
    public async Task Return_Ok_Wrapped_Empty_List_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class BarController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    public object GetAll()
    {
        return Ok({|SYSV2_CONTRACT_001:new System.Collections.Generic.List<int>()|});
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>空初始化 new List&lt;T&gt; { } → 报诊断。</summary>
    [Fact]
    public async Task Return_Empty_Initializer_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class BazController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    public System.Collections.Generic.List<string> GetAll()
    {
        return {|SYSV2_CONTRACT_001:new System.Collections.Generic.List<string> { }|};
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>有元素的 new List&lt;T&gt; { a, b } → 非空壳,不抓。</summary>
    [Fact]
    public async Task Return_List_With_Elements_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class QuxController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    public System.Collections.Generic.List<int> GetAll()
    {
        return new System.Collections.Generic.List<int> { 1, 2, 3 };
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>间接路径 return _service.GetAll() → 不抓(由 E2 eval + E2E 兜底)。</summary>
    [Fact]
    public async Task Return_Indirect_Service_Call_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class Service
{
    public System.Collections.Generic.List<string> GetAll() { return new System.Collections.Generic.List<string>(); }
}

public class IndirectController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    private readonly Service _service = new Service();
    public System.Collections.Generic.List<string> GetAll()
    {
        return _service.GetAll();
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>非 Controller 类直返空 List → 不抓(规则仅作用于 Controller)。</summary>
    [Fact]
    public async Task Non_Controller_Empty_List_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class PlainService
{
    public System.Collections.Generic.List<string> GetAll()
    {
        return new System.Collections.Generic.List<string>();
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>有构造参 new List&lt;T&gt;(other) → 非空壳,不抓。</summary>
    [Fact]
    public async Task Return_List_With_Constructor_Arg_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class CtorArgController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    public System.Collections.Generic.List<string> GetAll(System.Collections.Generic.List<string> seed)
    {
        return new System.Collections.Generic.List<string>(seed);
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>方法内 lambda 直返空 List,但方法本身返回 Service 调用 → 剪枝 lambda,不抓。</summary>
    [Fact]
    public async Task Lambda_Returning_Empty_List_Inside_Method_No_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class LambdaService
{
    public System.Collections.Generic.List<int> Get() { return new System.Collections.Generic.List<int> { 1 }; }
}

public class LambdaController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    private readonly LambdaService _service = new LambdaService();
    public object GetAll()
    {
        System.Func<System.Collections.Generic.List<int>> f = () => new System.Collections.Generic.List<int>();
        return Ok(_service.Get());
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }

    /// <summary>target-typed new()(推断为 List&lt;T&gt; 且空)→ 报 SYSV2_CONTRACT_001。</summary>
    [Fact]
    public async Task Return_Target_Typed_New_Empty_List_Reports_Diagnostic()
    {
        var source = AspNetCoreStub + @"
public class TargetTypedController : Microsoft.AspNetCore.Mvc.ControllerBase
{
    public System.Collections.Generic.List<string> Get()
    {
        return {|SYSV2_CONTRACT_001:new()|};
    }
}
";
        await VerifyCS.VerifyAnalyzerAsync(source);
    }
}
