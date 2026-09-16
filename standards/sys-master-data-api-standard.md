# SYS 主数据基础设施接口标准 — 子应用统一调用规约

> **状态**:Active v2.0(2026-09-16；OIDC/JWKS与统一网关口径)
> **适用**:所有嵌入 BP 业务门户的子应用(MDM / SRM / MES / WMS / EAM / TPM 及后续),需消费 SYS 控制台**人员 / 岗位主数据**时,**统一按本标准调用,不得直查 SYS 库表、不得对接已下线的 HRIS**。
> **真理源后端**:新 SYS 管理控制台 `AI.Extend.SYS`(.NET 8,三层 + MediatR/CQRS,**非 ABP**)。旧 `AI.Extend.HRIS`(`/HRISWebApi/`,EmpController/PositionController)已下线,**禁引用/对接/抄**。
> **首个落地案例**:TPM 设备组织迁移(`TPMV2/.../2026-06-15-eam-organization-migration/sys-api-contract.md`)。
> **配套**:`subapp-onboarding-guide.md`(子应用接入 SOP)、ADR-006(跨进程鉴权)、ADR-007(鉴权 4 条)。

---

## 1. 目的

子应用频繁需要「按当前登录工厂取人员 / 岗位」(挂载、选人、下拉、岗位选择等)。这类主数据由 SYS 单一控制,子应用**消费 API,不重建、不直查表**,避免:
- 主数据多份真理源漂移;
- 误连已下线 HRIS;
- 跨工厂数据泄漏(鉴权/工厂隔离绕过)。

本标准锁定**接口清单 + 参数 + 返回字段(大小写)+ 鉴权范式 + 调用示例**,使任意子应用按统一方式接入。

---

## 2. 调用总则(全端点通用)

| 项 | 规约 | SYS 实证锚 |
|---|---|---|
| **鉴权** | 透传当前业务槽的 SYS OIDC Access Token：子应用后端 HttpClient 调 SYS 时带 `Authorization: Bearer <token>`。Token 由 SYS IdP 签发；消费方按 HTTPS Discovery/JWKS 校验签名、issuer、audience、`typ=at+jwt`、scope、`portal=business`、`BusinessPortalAccess` 与 `PlantCode`，禁止共享 HMAC 密钥或 SYS 私钥。 | `Program.cs`(OpenIddict/JwtBearer)；`SysOidcProtocolContract` |
| **当前工厂语义** | SYS 读 token 的 `PlantCode` claim 作当前工厂。HR 接口入参 `orgCode`/`OrgCode` **省略即落当前工厂**;显式传值时仅放行「当前工厂 / 用户 AuthPlant 授权工厂 / 其祖先链公司·集团」,否则抛「无权操作该组织数据」。**子应用一般省略,按登录工厂取数最安全。** | `ICurrentUser.PlantCode`;`HrTargetOrgResolver.ResolveAsync` |
| **`orgCode` == 工厂编码** | HR 接口的 `orgCode`/`OrgCode` 即库列 `PlantCode`(工厂级组织编码)。 | `BaseEmpDto` OrgCode 注释「库列 PlantCode」 |
| **分页壳** | `Pagination<T> = { Data: T[], Total: int }`(**后端→后端壳**,字段名 `Data`/`Total`,非前端 ProTable 的 `items/totalCount`)。子应用解包后再包自身前端信封。 | `Application/Dtos/Pagination.cs` |
| **响应体** | 现有 HR 端点**直接返业务对象 / 数组**(无 `{IsSuccess,Data,Message}` 包裹)。 | 各 action 签名 |
| **访问基址** | 容器化生产/集成环境统一走网关同源路径：`https://<gateway>/sys/JYCoreSysWebApi`；开发环境按项目 `launchSettings`/dev proxy。已容器化 SYS API 不再把 10.8 IIS 端口作为默认基址。 | APISIX route；BP/子应用运行配置；SYS `launchSettings.json` |
| **跨进程** | 子应用后端 → SYS 为 server-to-server,**CORS 不适用**(CORS 仅浏览器);网络可达 + 路由前缀由运维保障。 | — |
| **鉴权属性** | 端点继承 `BaseApiController [Authorize]`,无 AllowAnonymous → 必带有效 token。 | `BaseApiController.cs` |

> **HttpClient 范式**:复刻 SYSV2/TPM 既有外部客户端范式(如 `MesApi.cs`):统一 `BaseAddress` + `ITokenProvider` 注入透传 token + 解包 `Pagination<T>` / 裸数组。

---

## 3. 接口清单 — 人员(`AI.Extend.SYS` `HREmpController` / `HrEmpController`)

> 底层真理源:`HrEmp→BaseEmp`、`HrEmpInterfaceView→视图 BaseHRInterfaceView`、`HrStaff→BaseStaff`(SYS 库 SYS 控制);**子应用只经 API 消费,不直查**。

| # | 端点 | 动词 | 入参 | 返回 |
|---|---|---|---|---|
| E1 | `/api/v1/hr/emp/EmpList` | POST(body) | `HrEmpListQuery` | `Pagination<BaseEmpDto>` |
| E2 | `/api/HREmp/List` | GET | `orgCode?`(query) | `BaseEmpDto[]` |
| E3 | `/api/v1/hr/emp/DropDownData` | GET | `orgCode?`(query) | `[{ value:int, text:string, EmpCode:string }]` |
| E4 | `/api/HREmp/List2` | GET | `OrgCode? / EmpId?:int / Keyword?`(query) | `BaseEmpDto[]`(≤30) |

- **`HrEmpListQuery`**(E1 body):`OrgCode?:string`(省略=当前工厂)、`Keyword?:string`(工号/姓名模糊)、`Current:int=1`、`PageSize?:int=10`、`PositionId?:int`。
- **推荐**:列表/搜索用 **E1**;轻量全量用 **E2**;下拉用 **E3**。

---

## 4. 接口清单 — 岗位(`AI.Extend.SYS` `HRPositionController` / `HrPositionController`)

> 底层真理源:`HrPosition→BasePosition`(SYS 库 SYS 控制);旧 HRIS Position 已下线。

| # | 端点 | 动词 | 入参 | 返回 |
|---|---|---|---|---|
| P1 | `/api/v1/hr/position/PositionList` | POST(body) | `HrPositionListQuery` | `Pagination<HrPosition>`(完整实体) |
| P2 | `/api/HRPosition/List` | GET | 无(当前工厂) | `BasePositionDto[]` = `[{Code,Name}]` |
| P3 | `/api/v1/hr/position/DropDownData` | GET | `orgCode?`(query) | 下拉项数组 |

- **`HrPositionListQuery`**(P1 body):`OrgCode?:string`(省略=当前工厂)、`Keyword?:string`、`Current:int=1`、`PageSize?:int=10`。
- **推荐**:需全字段(含 ShortName/DeptName)用 **P1**;只要编码/名称用 **P2**。

---

## 5. DTO 字段(大小写锁死 — 调用方直接读取键)

### 5.1 `BaseEmpDto`(人员)
| 字段 | 类型 | 说明 |
|---|---|---|
| `OrgCode` | string? | 组织编码(=PlantCode) |
| `OrgType` | int | 1 集团 / 2 公司 / 3 工厂 |
| `GroupCode`/`GroupName` | string? | 集团编码/名称 |
| `CompanyCode`/`CompanyName` | string? | 公司编码/名称 |
| `FactoryCode`/`FactoryName` | string? | 工厂编码/名称 |
| `EmpId` | int | 员工 Id |
| `EmpCode` | string? | 工号 |
| `EmpName` | string? | 姓名 |
| `ItemSelectText` | string | 派生只读 `[EmpCode]EmpName` |
| `RealName` | string? | 真实姓名 |
| `PostCode`/`PostName` | string? | 岗位编码/名称 |
| `GwType` | string? | main / parttime |
| `LoginUserName` | string? | 用户账号 |
| `LinkedLoginUserId` | int? | 关联企业账号主键 |
| `LinkedUserAccount` | string? | 企业账户登录账号 |
| `Cell` | string? | 手机/联系电话 |
| `Email` | string? | 邮箱 |
| `ImgId` | string? | **头像 Id(非 URL,见 §7)** |
| `DeptId` | int? | 部门 Id |
| `DeptName` | string? | 部门名称 |

### 5.2 `HrPosition`(岗位,P1 返回;常用子集)
`Id:int`、`OrgCode:string?`、`PostCode:string?`、`PostName:string?`、`ShortName:string?`、`DeptName:string?`、`DeptId:int?`、`GradeID:int?`、`FStatus:int`、`BUse:bool`、`BDelete:bool`(+ 完整实体其余列)。

### 5.3 `BasePositionDto`(岗位轻量,P2 返回)
`Code:string?`(=PostCode)、`Name:string?`(=PostName)。

---

## 6. 调用示例(C# HttpClient,复刻 `MesApi` 范式)

```csharp
// 子应用后端外部客户端:透传当前用户 token + 解包
public sealed class SysApi
{
    private readonly HttpClient _http;          // BaseAddress = <SYS基址>
    private readonly ITokenProvider _token;     // 取当前请求的业务槽OIDC Access Token

    public async Task<List<BaseEmpDto>> GetEmpsByPlantAsync(string? keyword, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/hr/emp/EmpList")
        {
            // OrgCode 省略 → SYS 按 token 的 PlantCode claim 落当前工厂
            Content = JsonContent.Create(new { Keyword = keyword, Current = 1, PageSize = 50 })
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token.Current);
        var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        var page = await resp.Content.ReadFromJsonAsync<Pagination<BaseEmpDto>>(ct);
        return page?.Data?.ToList() ?? new();
    }
}

public sealed class Pagination<T> { public List<T>? Data { get; set; } public int Total { get; set; } }
```

> 关系过滤(如「排除已挂某岗位的人员」)由**子应用本地**用自身关系表完成,**不下放 SYS**(避免 SYS 反依赖子应用业务表)。

---

## 7. 边界 / 不在本标准范围

- **头像 URL**:SYS 只提供 `ImgId`,**不提供 `ImgUrl`**。真实头像走强鉴权 `GET /api/ExtendDoc/Download/{ImgId}`,native `<img src>` 不带 token 会 401。需真实头像的子应用自行用「fetch 带 token → blob URL → `<img>`」组件;无此能力前用占位头像。
- **设备类别 / 物料标签树**:**不属本主数据标准**。属 MDM 域;子应用按各自方案处理(API 消费或直查 MDM 底表,视底表是否同库,需 dba precheck)。
- **组织树(`SYS_Organization*`)**:不属本标准。归对应业务方(如 TPM 设备组织自管 Equipment 切片)。
- **写操作**:本标准仅覆盖**人员/岗位只读消费**。涉及写主数据须单独立项(SYS 控制台维护,子应用不写)。

---

## 8. 联调前置 + 维护

**接入前置(运维/实证确认)**:
1. SYS OIDC Discovery/JWKS 通过受信 HTTPS 可达，Access Token 的issuer、audience、type、lifetime和签名均通过；不得通过复制共享密钥解决401。
2. `/sys/JYCoreSysWebApi` 网关路由对子应用后端可达(server-to-server)，匿名请求按契约返回401而非SPA HTML。
3. BP 登录/选厂后 Token 必含`sys.api`、`portal=business`、`BusinessPortalAccess=true`与非空`PlantCode`；显式组织参数与claim不一致返回403。
4. CI/E2E使用专用业务测试身份，不与人工业务账号并发建立单活动会话；真实数据、菜单与组织授权从SYS回读。

**维护**:新增/调整端点须回写本标准 + 对应子应用 `sys-api-contract.md`;字段大小写变更视为破坏性契约变更,需通知所有消费子应用。横向影响 ≥2 子应用的基线变更,落 ADR。
