using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Diagnostics;

namespace SYSV2.Analyzers;

/// <summary>
/// L1: Controller 类必须有 [Authorize] 或 [AllowAnonymous] 属性。
///
/// 规则:
/// - 检测继承 ControllerBase / Controller 的具体类
/// - 类或基类链上必须有 [Authorize] 或 [AllowAnonymous] 任一属性
/// - abstract class 跳过(基类不强制,派生类必加)
/// - 例外:跨进程鉴权走 IP allowlist(用 [Authorize(Policy="InternalOnly")])
/// - feature/ww 分支:通过 .csproj Condition 整体跳过 analyzer 引用(不在 analyzer 内处理)
///
/// remediation 模板见 SYSV2 spec §6.2(2 条互斥路径 A/B)。
/// 参见 ADR-007 鉴权 4 条刚性 / ADR-021 工程标准机制化。
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public class AuthorizeRequiredAnalyzer : DiagnosticAnalyzer
{
    private const string Category = "SYSV2.Authorization";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticIds.AUTH_001,
        title: "Controller 缺 [Authorize] 属性(ADR-007 #1)",
        messageFormat: "Controller '{0}' 缺 [Authorize] 或 [AllowAnonymous] 属性;fix 路径 A(需登录):加 [Authorize(Policy=\"<权限码>\")](权限码查 SYS_AuthInfo 表);路径 B(无需登录:健康检查/登录/SSO/公开资源):加 [AllowAnonymous];例外:跨进程走 IP allowlist 用 [Authorize(Policy=\"InternalOnly\")](ADR-006);see ADR-007",
        category: Category,
        defaultSeverity: DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        description: "SYSV2 工程标准 L1: Controller 类必须显式标记 [Authorize] 或 [AllowAnonymous]。落盘前撞墙,免回 reviewer 反馈环.",
        helpLinkUri: "https://github.com/rhettZeng107/engineering-standards/blob/master/decisions/ADR-007-auth-4-rigidity.md"
    );

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSymbolAction(AnalyzeClass, SymbolKind.NamedType);
    }

    private static void AnalyzeClass(SymbolAnalysisContext context)
    {
        var typeSymbol = (INamedTypeSymbol)context.Symbol;

        // 跳过非具体类
        if (typeSymbol.TypeKind != TypeKind.Class || typeSymbol.IsAbstract)
            return;

        // 必须继承 ControllerBase 或 Controller
        if (!InheritsFromController(typeSymbol))
            return;

        // 类或基类链上有 [Authorize] 或 [AllowAnonymous] 任一 → OK
        if (HasAuthorizeOrAllowAnonymousAttribute(typeSymbol))
            return;

        // 违规 — 报诊断到类位置
        var location = typeSymbol.Locations.FirstOrDefault() ?? Location.None;
        var diagnostic = Diagnostic.Create(Rule, location, typeSymbol.Name);
        context.ReportDiagnostic(diagnostic);
    }

    private static bool InheritsFromController(INamedTypeSymbol typeSymbol)
    {
        var current = typeSymbol.BaseType;
        while (current is not null)
        {
            var fullName = current.ToDisplayString();
            if (fullName == "Microsoft.AspNetCore.Mvc.ControllerBase" ||
                fullName == "Microsoft.AspNetCore.Mvc.Controller")
                return true;
            current = current.BaseType;
        }
        return false;
    }

    private static bool HasAuthorizeOrAllowAnonymousAttribute(INamedTypeSymbol typeSymbol)
    {
        var current = typeSymbol;
        while (current is not null)
        {
            foreach (var attr in current.GetAttributes())
            {
                var attrName = attr.AttributeClass?.ToDisplayString();
                if (attrName == "Microsoft.AspNetCore.Authorization.AuthorizeAttribute" ||
                    attrName == "Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute")
                    return true;
            }
            current = current.BaseType;
        }
        return false;
    }
}
