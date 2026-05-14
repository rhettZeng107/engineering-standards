// C# .NET 8 List Controller 标准模板 — JObject body 入参 + 分页契约
//
// 适用:SYSV2 所有后端 List API(EF Core + ProTable 前端)
// 关联标准:ADR-008 端到端 8 项 ②(分页结构契约)+ ADR-023 前端统一标准
//
// 关键决策(违反 = code-reviewer HIGH):
// 1. JObject 入参必带 ? 可空 + 方法体首加 `obj ??= new JObject();` null guard
//    踩坑:[ApiController] 默认行为下 frontend POST 无 body 时 obj 是 null,
//          后续 obj.Value<int?>("xxx") NPE → 500(MDM 2026-05-14 serial/warehouse 实战)
// 2. 分页响应契约固定 4 字段:items / totalCount / current / pageSize
//    前端 ProTable 直接消费,禁自创字段名(d / Data / list 等)
// 3. PlantCode 过滤走 NowPlantCode(controller base 属性),禁前端传 plantCode
// 4. 排序字段必白名单(防 SQL 注入风险 + 防 EF 翻译失败)
//
// 替换占位:
//   {{Entity}} = 实体类(如 MDM_Supplier)
//   {{EntityDbSet}} = DbSet 属性名(如 MDM_Suppliers)
//   {{Action}} = HTTP action 名(如 SupplierList)
//   {{SORT_WHITELIST}} = 允许排序字段列表(如 "SupplierNo", "SupplierName")
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;

[ApiController]
[Route("mdmapi/[controller]")]
[Authorize]
public class {{Entity}}Controller : BaseApiController
{
    [HttpPost("{{Action}}")]
    public IActionResult Get{{Entity}}List([FromBody] JObject? obj)
    {
        // 1. null guard — frontend 无 body 时不 NPE
        obj ??= new JObject();

        // 2. 解析分页参数(默认 1/100)
        int current = obj.Value<int?>("current") ?? 1;
        int pageSize = obj.Value<int?>("pageSize") ?? 100;
        if (current < 1) current = 1;
        if (pageSize < 1 || pageSize > 500) pageSize = 100;

        // 3. 排序字段白名单
        string sortField = obj.Value<string>("sortField") ?? "";
        string sortOrder = obj.Value<string>("sortOrder") ?? "";
        var sortWhitelist = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { {{SORT_WHITELIST}} };
        if (!sortWhitelist.Contains(sortField)) sortField = "";

        // 4. 关键字搜索(可选)
        string keyword = (obj.Value<string>("keyword") ?? "").Trim();

        // 5. 基础 query — 必带 PlantCode 过滤
        var q = _context.{{EntityDbSet}}
            .AsNoTracking()
            .Where(x => x.PlantCode == NowPlantCode);

        if (!string.IsNullOrEmpty(keyword))
        {
            q = q.Where(x => x.Name.Contains(keyword) || x.Code.Contains(keyword));
        }

        // 6. 排序 + 分页
        // 默认按 Id 倒序(防 EF 在无 Order 时报警);若指定排序字段走动态 OrderBy
        // 实际项目用 System.Linq.Dynamic.Core 或显式 switch 处理 sortField
        var totalCount = q.Count();
        var items = q.OrderByDescending(x => x.Id)
                     .Skip((current - 1) * pageSize)
                     .Take(pageSize)
                     .ToList();

        // 7. 标准响应契约
        return Ok(new
        {
            items,
            totalCount,
            current,
            pageSize,
        });
    }
}

/*
前端 ProTable request 函数对接:

request={async (params, sort) => {
    const res = await Post('mdmapi/<Entity>/<Action>', {
        current: params.current,
        pageSize: params.pageSize,
        keyword: params.keyword ?? '',
        sortField: Object.keys(sort)[0] ?? '',
        sortOrder: sort[Object.keys(sort)[0]] ?? '',
    });
    return {
        data: res.items,
        success: true,
        total: res.totalCount,
    };
}}
*/
