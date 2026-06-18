using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace SYSV2.Analyzers;

/// <summary>
/// L2: [Authorize(Policy="X")] 的 Policy 必在 Program.cs 注册(跨文件)。
///
/// 规则:
/// - CompilationStartAction 跨文件:先收集整个 compilation 内所有 AddPolicy("名", ...) → registered set
/// - 再遍历所有 [Authorize(Policy="X")],X 是字符串字面量且 X ∉ registered set → 报诊断
/// - Policy 值非字符串字面量(const/nameof/变量)→ 跳过该处(静态无法解析,避免误报)
/// - 整体跳过:compilation 内存在实现 IAuthorizationPolicyProvider 的类型(动态策略无静态注册点)
///
/// 收集 AddPolicy 时不区分 CORS / RateLimiter 的 AddPolicy(过收集只让规则更宽松,永不误报)。
///
/// remediation 模板见 SYSV2 spec §6.2(4 段)。
/// 参见 ADR-007 鉴权 4 条刚性 #2 / ADR-021 工程标准机制化。
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public class PolicyRegisteredAnalyzer : DiagnosticAnalyzer
{
    private const string Category = "SYSV2.Authorization";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticIds.AUTH_002,
        title: "Policy 未在 Program.cs 注册(ADR-007 #2)",
        messageFormat: "SYSV2_AUTH_002: [Authorize(Policy=\"{0}\")] 的 Policy \"{0}\" 未在 Program.cs 注册(ADR-007 #2);fix:在 Program.cs 加 builder.Services.AddAuthorization(opts => opts.AddPolicy(\"{0}\", policy => policy.RequireXxx(...)));reference:已注册 Policy 清单见 Program.cs 各 AddPolicy(\"...\") 调用;exception:若该项目用自定义 IAuthorizationPolicyProvider 动态策略,本规则整体跳过;see ADR-007 #2",
        category: Category,
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "SYSV2 工程标准 L2: [Authorize(Policy=)] 引用的 Policy 名必在 Program.cs 静态注册,落盘前撞墙,免运行时 500.",
        helpLinkUri: "https://github.com/rhettZeng107/engineering-standards/blob/master/decisions/ADR-007-auth-4-rigidity.md",
        customTags: new[] { WellKnownDiagnosticTags.CompilationEnd }
    );

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterCompilationStartAction(OnCompilationStart);
    }

    private static void OnCompilationStart(CompilationStartAnalysisContext context)
    {
        // 整体跳过:存在自定义 IAuthorizationPolicyProvider 实现(动态策略无静态注册点)
        if (HasAuthorizationPolicyProvider(context.Compilation))
            return;

        // 跨文件收集:已注册 Policy 名 + 待校验的 Authorize(Policy=) 位置
        var registeredPolicies = new ConcurrentDictionary<string, byte>();
        var authorizeUsages = new ConcurrentBag<(string PolicyName, Location Location)>();

        // 第一段:收集所有 AddPolicy("名", ...) 调用
        context.RegisterSyntaxNodeAction(
            ctx => CollectAddPolicy(ctx, registeredPolicies),
            SyntaxKind.InvocationExpression);

        // 第二段:收集所有 [Authorize(Policy="X")] 引用
        context.RegisterSyntaxNodeAction(
            ctx => CollectAuthorizeUsage(ctx, authorizeUsages),
            SyntaxKind.Attribute);

        // 编译结束:registered set 已收齐,校验每个 Authorize Policy 引用
        context.RegisterCompilationEndAction(ctx =>
        {
            foreach (var (policyName, location) in authorizeUsages)
            {
                if (!registeredPolicies.ContainsKey(policyName))
                {
                    ctx.ReportDiagnostic(Diagnostic.Create(Rule, location, policyName));
                }
            }
        });
    }

    /// <summary>
    /// 收集 AddPolicy("名", ...) — 方法名 AddPolicy 且首参字符串字面量或 name: 命名参。
    /// 不区分 CORS / RateLimiter 的 AddPolicy(过收集安全,只会让规则更宽松)。
    /// </summary>
    private static void CollectAddPolicy(
        SyntaxNodeAnalysisContext context,
        ConcurrentDictionary<string, byte> registeredPolicies)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;

        if (!IsMethodNamed(invocation.Expression, "AddPolicy"))
            return;

        var name = ExtractPolicyNameArgument(invocation.ArgumentList);
        if (name is not null)
            registeredPolicies.TryAdd(name, 0);
    }

    /// <summary>
    /// 收集 [Authorize(Policy="X")] — AuthorizeAttribute.Policy,字符串字面量或 Policy= 命名参。
    /// 值非字符串字面量(const/nameof/变量)→ 跳过(静态无法解析,避免误报)。
    /// </summary>
    private static void CollectAuthorizeUsage(
        SyntaxNodeAnalysisContext context,
        ConcurrentBag<(string, Location)> authorizeUsages)
    {
        var attribute = (AttributeSyntax)context.Node;

        var attrSymbol = context.SemanticModel.GetSymbolInfo(attribute).Symbol;
        var attrTypeName = attrSymbol?.ContainingType?.ToDisplayString();
        if (attrTypeName != "Microsoft.AspNetCore.Authorization.AuthorizeAttribute")
            return;

        if (attribute.ArgumentList is null)
            return;

        foreach (var arg in attribute.ArgumentList.Arguments)
        {
            // 只看 Policy= 命名参(AuthorizeAttribute 唯一的 string 命名属性)
            if (arg.NameEquals?.Name.Identifier.ValueText != "Policy")
                continue;

            if (arg.Expression is LiteralExpressionSyntax literal &&
                literal.IsKind(SyntaxKind.StringLiteralExpression))
            {
                var policyName = literal.Token.ValueText;
                authorizeUsages.Add((policyName, arg.Expression.GetLocation()));
            }
            // 非字符串字面量 → 跳过(静态无法解析)
        }
    }

    /// <summary>
    /// 判断 invocation 表达式的方法名(member access `x.AddPolicy` 或裸 `AddPolicy`)。
    /// </summary>
    private static bool IsMethodNamed(ExpressionSyntax expression, string methodName)
    {
        return expression switch
        {
            MemberAccessExpressionSyntax member => member.Name.Identifier.ValueText == methodName,
            IdentifierNameSyntax identifier => identifier.Identifier.ValueText == methodName,
            _ => false,
        };
    }

    /// <summary>
    /// 提取 AddPolicy 的 Policy 名首参 — 位置参首位字符串字面量 或 name: 命名参。
    /// </summary>
    private static string? ExtractPolicyNameArgument(ArgumentListSyntax? argumentList)
    {
        if (argumentList is null || argumentList.Arguments.Count == 0)
            return null;

        // name: 命名参优先
        foreach (var arg in argumentList.Arguments)
        {
            if (arg.NameColon?.Name.Identifier.ValueText == "name" &&
                arg.Expression is LiteralExpressionSyntax namedLiteral &&
                namedLiteral.IsKind(SyntaxKind.StringLiteralExpression))
            {
                return namedLiteral.Token.ValueText;
            }
        }

        // 无命名参 → 取首位位置参(须字符串字面量)
        var first = argumentList.Arguments[0];
        if (first.NameColon is null &&
            first.Expression is LiteralExpressionSyntax firstLiteral &&
            firstLiteral.IsKind(SyntaxKind.StringLiteralExpression))
        {
            return firstLiteral.Token.ValueText;
        }

        return null;
    }

    /// <summary>
    /// compilation 内是否存在实现 Microsoft.AspNetCore.Authorization.IAuthorizationPolicyProvider 的类型。
    /// </summary>
    private static bool HasAuthorizationPolicyProvider(Compilation compilation)
    {
        var providerInterface = compilation.GetTypeByMetadataName(
            "Microsoft.AspNetCore.Authorization.IAuthorizationPolicyProvider");
        if (providerInterface is null)
            return false;

        return TypeImplementsInterface(compilation.GlobalNamespace, providerInterface);
    }

    private static bool TypeImplementsInterface(INamespaceSymbol ns, INamedTypeSymbol target)
    {
        foreach (var type in ns.GetTypeMembers())
        {
            if (TypeOrNestedImplements(type, target))
                return true;
        }

        foreach (var childNs in ns.GetNamespaceMembers())
        {
            if (TypeImplementsInterface(childNs, target))
                return true;
        }

        return false;
    }

    private static bool TypeOrNestedImplements(INamedTypeSymbol type, INamedTypeSymbol target)
    {
        if (type.AllInterfaces.Any(i => SymbolEqualityComparer.Default.Equals(i, target)))
            return true;

        foreach (var nested in type.GetTypeMembers())
        {
            if (TypeOrNestedImplements(nested, target))
                return true;
        }

        return false;
    }
}
