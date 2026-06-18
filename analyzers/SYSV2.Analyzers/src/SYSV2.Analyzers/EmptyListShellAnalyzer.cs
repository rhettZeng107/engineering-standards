using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace SYSV2.Analyzers;

/// <summary>
/// L3: Controller method 直返空列表字面量 new List&lt;&gt;() — 疑似未接 Service/DB 的空壳。
///
/// 规则:
/// - 仅作用于继承 ControllerBase / Controller 的具体类的方法
/// - 命中 return 语句表达式(最多剥一层 Ok(...) / Json(...) 包装)是空初始化 new List&lt;T&gt;()
///   (无构造参、无初始化元素 或 空 { })
/// - 不抓间接路径 return _service.GetAll();(由 E2 eval + E2E smoke 兜底)
/// - 不抓有元素的 new List&lt;T&gt;{ a, b };(非空壳)
///
/// remediation 模板见 SYSV2 spec §6.1(4 段)。
/// 参见 ADR-008 E2E 8 项核对 #6 / ADR-021 工程标准机制化。
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public class EmptyListShellAnalyzer : DiagnosticAnalyzer
{
    private const string Category = "SYSV2.Contract";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticIds.CONTRACT_001,
        title: "Controller 方法直返空列表字面量(ADR-008 #6)",
        messageFormat: "SYSV2_CONTRACT_001: 方法 \"{0}\" 直返空列表字面量 new List<>(),疑似未接 Service/DB 的空壳(ADR-008 #6);fix:接入真实数据源(Service 查询 + EF 落库)返回真实数据;reference:确认 Controller 非空壳 + Service 实装 + EF schema 对齐(8 项核对 #6);exception:确为业务允许的固定空集合(占位端点)→ 加 [SuppressMessage(\"SYSV2.Contract\",\"SYSV2_CONTRACT_001\")] 显式承认;see ADR-008 #6",
        category: Category,
        defaultSeverity: DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        description: "SYSV2 工程标准 L3: Controller 方法直返空 new List<>() 字面量疑似空壳,提示接入真实数据源.",
        helpLinkUri: "https://github.com/rhettZeng107/engineering-standards/blob/master/decisions/ADR-008-e2e-8-checklist.md"
    );

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeMethod, SyntaxKind.MethodDeclaration);
    }

    private static void AnalyzeMethod(SyntaxNodeAnalysisContext context)
    {
        var method = (MethodDeclarationSyntax)context.Node;

        // 仅作用于继承 ControllerBase / Controller 的具体类的方法
        var containingType = context.SemanticModel.GetDeclaredSymbol(method)?.ContainingType;
        if (containingType is null || !InheritsFromController(containingType))
            return;

        // 遍历方法体内 return 语句,剪枝匿名函数 / 本地函数(避免误报方法内 lambda 直返空 List)
        foreach (var returnStmt in method.DescendantNodes(
                     n => n is not AnonymousFunctionExpressionSyntax && n is not LocalFunctionStatementSyntax)
                 .OfType<ReturnStatementSyntax>())
        {
            var expression = returnStmt.Expression;
            if (expression is null)
                continue;

            // 最多剥一层 Ok(...) / Json(...) 包装
            var unwrapped = UnwrapActionResult(expression);

            if (IsEmptyListCreation(unwrapped, context.SemanticModel))
            {
                var diagnostic = Diagnostic.Create(Rule, unwrapped.GetLocation(), method.Identifier.ValueText);
                context.ReportDiagnostic(diagnostic);
            }
        }
    }

    /// <summary>
    /// 最多剥一层 Ok(...) / Json(...) 包装,取其单一实参表达式;非包装则原样返回。
    /// </summary>
    private static ExpressionSyntax UnwrapActionResult(ExpressionSyntax expression)
    {
        if (expression is InvocationExpressionSyntax invocation &&
            invocation.ArgumentList.Arguments.Count == 1)
        {
            var methodName = invocation.Expression switch
            {
                MemberAccessExpressionSyntax member => member.Name.Identifier.ValueText,
                IdentifierNameSyntax identifier => identifier.Identifier.ValueText,
                _ => null,
            };

            if (methodName is "Ok" or "Json")
                return invocation.ArgumentList.Arguments[0].Expression;
        }

        return expression;
    }

    /// <summary>
    /// 判断表达式是否为空初始化 new List&lt;T&gt;() —— 无构造参、无初始化元素 或 空 { }。
    /// 抓:new List&lt;Foo&gt;() / new List&lt;Foo&gt; { } / 目标类型推断 new()(推断为 List&lt;T&gt; 且空)
    /// 不抓:new List&lt;Foo&gt; { a, b }(有元素)/ new List&lt;Foo&gt;(other)(有构造参)
    /// 已知局限:不覆盖 [] 集合表达式(本期不做,由 E2 eval + E2E smoke 兜底)。
    /// </summary>
    private static bool IsEmptyListCreation(ExpressionSyntax expression, SemanticModel semanticModel)
    {
        // 同时处理 new List<T>()(ObjectCreation)与 new()(ImplicitObjectCreation,目标类型推断)
        if (expression is not BaseObjectCreationExpressionSyntax creation)
            return false;

        // 类型须为 System.Collections.Generic.List<T>(new() 经语义模型推断回 List<T>)
        var typeSymbol = semanticModel.GetTypeInfo(creation).Type as INamedTypeSymbol;
        if (typeSymbol is null ||
            typeSymbol.ConstructedFrom?.ToDisplayString() != "System.Collections.Generic.List<T>")
            return false;

        // 有构造参 → 非空壳(如 new List<T>(capacity) / new List<T>(other))
        if (creation.ArgumentList is { Arguments.Count: > 0 })
            return false;

        // 有初始化元素 → 非空壳
        if (creation.Initializer is { Expressions.Count: > 0 })
            return false;

        return true;
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
}
