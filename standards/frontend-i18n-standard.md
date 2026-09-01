# 前端中英 i18n 标准 / Frontend i18n Standard

> **2026-05-10 涛哥拍板,跨项目通用国际化范围标准**
>
> **触发**:SYSV2 i18n 落地实战(SYS.3 / BP / AP / MDM 4 前端 + SYS 后端)2026-05-10 范围争议拨乱 — 涛哥明确"用户输入数据不双语 / 平台固定 UI 必双语"。
>
> **适用**:所有 AI Coding Harness 协作的前端项目(React / Vue / Angular)+ 配套后端(.NET / Java / Node)i18n 落地。
>
> **核心原则**:用户写啥就显示啥,平台固定 UI 必双语;不翻译用户业务数据,不翻译客户自定义字典。

---

## 1. 必 i18n 范围 / MUST translate

### 1.1 平台固定 UI 元素(平台代码硬编码的所有用户可见文案)

| 类别 | 例子 | t() 落点 |
|---|---|---|
| **页面框架** | 列表标题、副标题、Tab labels、卡片 title、弹窗 title、Drawer title | `t('page.title')` / `t('page.tab.xxx')` |
| **列定义** | ProTable / Table 列头(`columns[].title`)、操作列按钮(编辑/删除/授权/导出/详情) | `t('page.columnXxx')` / `t('page.btnEdit')` |
| **表单元素** | Form item label、placeholder("请输入"/"请选择")、rules.message(必填/格式错/长度错)、Form.Item help | `t('page.fieldLabel')` / `t('page.placeholderXxx')` / `t('common.required')` |
| **交互反馈** | `message.success/error/warning/info` 文案、`Modal.confirm` 标题+内容、`notification` 标题+描述 | `t('page.saveSuccess')` |
| **状态标签** | `Tag` children(在用/已下线/已发布/已审批/启用/停用)、`Switch` checkedChildren+unCheckedChildren、Badge text | `t('common.statusActive')` |
| **空状态文案** | `Empty` description、`fallback` 占位(如"未填写"/"无数据"/"加载中") | `t('common.emptyDesc')` |
| **导航元素** | 面包屑、菜单 item label(平台预设)、按钮组 toolbar | `t('common.breadcrumb.xxx')` |

### 1.2 平台预设字典(代码或 DB 中固定枚举,跨客户共用)

| 类别 | 例子 | 实现方式 |
|---|---|---|
| **平台菜单名** | "员工档案"/"组织授权"/"采购订单"等平台标准模块 | DB 字段双语(`AuthName` + `AuthNameEN`)+ 前端按 `i18n.language` 选 |
| **系统级角色码** | systemadmin / auditadmin / securityadmin / normaluser | 前端 t('role.systemadmin') 等 namespace |
| **平台业务枚举** | 组织类型(集团/公司/虚拟工厂/工厂)/单据类型/审批状态/性别枚举 | 前端 t() namespace 维护 |
| **后端业务消息** | 平台代码 throw new Exception("用户不存在")/"密码错误"/"订单已审批" | 后端 IStringLocalizer + zh-CN/en-US resx |

### 1.3 fallback 占位文案(包含变量插值)

```jsx
// ✅ 占位 fallback 是固定 UI 文案,需 t()
const label = name ? `${name} (#${id})` : t('hrEmp.personFallback', {id});
// translation.json: zh-CN { hrEmp.personFallback: '人员 #{{id}}' }
//                   en-US { hrEmp.personFallback: 'Person #{{id}}' }
```

---

## 2. 不 i18n 范围 / MUST NOT translate

### 2.1 用户输入字段值(用户填啥显示啥)

| 类别 | 例子 | 原因 |
|---|---|---|
| **用户填写的实体名** | 岗位名(测试工程师)/姓名(王工)/部门名(研发部)/物料名(涤纶丝 PE-450)/客户名(宝钢)/订单号(PO-20260510-001) | 用户输入数据不可翻译;前端 `dataIndex: 'xxx'` 直接展示 record 字段 |
| **用户填写的描述/备注** | Form 中 textarea 输入的备注/说明/规格描述 | 用户内容,与平台无关 |
| **用户上传的内容** | 文件名/图片描述/附件标题 | 用户上传,直传直显 |

### 2.2 客户自定义字典(客户专属,非平台预设)

| 类别 | 例子 | 处理 |
|---|---|---|
| **客户自定义岗位** | SYS_AuthPosition(总经理/工程师等用户填写) | DB 字段不加 EN 列,展示中文兜底 |
| **客户自定义字典项** | PUB_DictionaryItem 客户业务字典 | 同上 |
| **客户自定义菜单** | 客户在管理后台自配的非平台菜单 | DB 不强制 AuthNameEN,展示中文兜底 |

### 2.3 历史业务数据

| 类别 | 例子 | 处理 |
|---|---|---|
| **DB 已存中文业务数据** | 历史订单/工单/合同/报表内容/审批意见 | 不动,保留原中文 |
| **第三方系统返回的数据** | ERP/SAP 集成返回字段值 | 直传直显,不翻译 |

### 2.4 系统级原始消息

| 类别 | 例子 | 处理 |
|---|---|---|
| **DB 唯一索引/外键约束原始消息** | "Cannot insert duplicate key in object 'dbo.User'"(SQL Server)/"FOREIGN KEY constraint failed"(PostgreSQL) | 通常英文,不动;**只翻平台代码 throw 的业务文案** |
| **HTTP/网络栈原始错误** | "ECONNREFUSED"/"timeout"/"500 Internal Server Error" | 不动 |
| **第三方 SDK 异常** | OAuth provider 错误/支付网关错误 | 视情况包装为平台业务消息再 i18n |

---

## 3. 边界判定速查

| 场景 | 落点 |
|---|---|
| `<span>{record.empName}</span>` 渲染用户姓名 | ❌ 不 t(),直接展示 |
| `<Button>{t('page.add')}</Button>` 操作按钮 | ✅ t() |
| `placeholder={t('page.searchByName')}` 搜索框占位 | ✅ t() |
| `placeholder={record.lastSearchValue}` 上次搜索值回填 | ❌ 不 t() |
| `message.error('保存失败')` 平台硬编码消息 | ✅ t('page.saveFailed') |
| `message.error(err.response.data.message)` 后端返回业务消息 | ❌ 前端不翻;后端 IStringLocalizer |
| `Tag.children = '已审批'` 平台状态枚举 | ✅ t('common.statusApproved') |
| `Tag.children = record.customStatus` 客户自定义状态 | ❌ 不 t() |

---

## 4. 实现规范

### 4.1 前端(React + react-i18next)

**库选型**:`react-i18next` + `i18next` + `i18next-http-backend`(2026-05-10 SYSV2 实证版本 23.16.8 / 15.7.4 / 2.7.3)

**目录结构**:

```
public/plugins/i18next/locales/
├── zh-CN/
│   └── translation.json        # 主翻译资产
└── en-US/
    └── translation.json
```

**loadPath 必自托管(子应用尤其,2026-06-18 TPM 实证)**:locale 文件随子应用 build 进 `dist/`,`i18next-http-backend` 的 `loadPath` 必须指**子应用自己的 base**,不能指门户/别的 host:

```js
// ✅ 自托管:从子应用自己 base(vite base,如 /sub-tpm/)加载,locale 随 dist 部署
function i18nLoadPath() {
  let b = import.meta.env.BASE_URL ?? '/';
  if (b === './' || b === '.') b = '/';
  return `${b.endsWith('/') ? b : b + '/'}plugins/i18next/locales/{{lng}}/{{ns}}.json`;
}
// ❌ 反模式:loadPath 指 BP 门户 /Static(门户不服务子应用 locale)→ 见 §6.5
```

- 子应用必须**自带** locale 文件(`public/plugins/...`),不能假设门户/别处有(MDM 自带 = 基准)。
- **部署后确定性回归验**:`curl <base>/plugins/i18next/locales/zh-CN/<ns>.json` 必须 `content-type: application/json` 且 body 真 JSON;返 `text/html`(SPA fallback)= 没服务到,所有 key 会裸显。SPA `web.config` 的 rewrite 必须 `{REQUEST_FILENAME} IsFile negate=true` 放行真实文件 + `.json` MIME=application/json。
- 只声明实际用到的 `ns`(未用的别留,避免预载 404/fallback 解析噪音)。

**namespace 命名约定**:页面英文 camelCase,与路由 path 一一对应:

| 路由 | namespace | 翻译 key 前缀 |
|---|---|---|
| `/role` | `role` | `t('role.title')` `t('role.add')` |
| `/operationLog` | `operationLog` | `t('operationLog.operUser')` |
| `/hrDept` | `hrDept` | `t('hrDept.deptCode')` |

**通用元素归 `common` namespace**:

```json
{
  "common": {
    "save": "保存",
    "cancel": "取消",
    "edit": "编辑",
    "delete": "删除",
    "confirm": "确认",
    "required": "请填写此项",
    "loading": "加载中...",
    "noData": "暂无数据",
    "operation": "操作"
  }
}
```

### 4.2 后端(.NET / IStringLocalizer)

```csharp
// Controllers / Services
public class LoginController : ControllerBase
{
    private readonly IStringLocalizer<LoginController> _L;

    public LoginController(IStringLocalizer<LoginController> localizer) {
        _L = localizer;
    }

    public IActionResult Login(LoginDto dto) {
        var user = _userService.Find(dto.Account);
        if (user == null) {
            throw new BusinessException(_L["UserNotFound"]);
        }
        // ...
    }
}
```

**resx 文件**:

```
Resources/
├── Controllers.LoginController.zh-CN.resx
└── Controllers.LoginController.en-US.resx
```

**Program.cs 配置**:

```csharp
builder.Services.AddLocalization(opts => opts.ResourcesPath = "Resources");
var supportedCultures = new[] { new CultureInfo("zh-CN"), new CultureInfo("en-US") };
app.UseRequestLocalization(new RequestLocalizationOptions {
    DefaultRequestCulture = new RequestCulture("zh-CN"),
    SupportedCultures = supportedCultures,
    SupportedUICultures = supportedCultures,
});
```

### 4.3 跨子域 Cookie 同步

子应用(wujie / iframe)与主应用共享语言:

```js
// 设置 lng cookie 在父域生效,子应用读取
document.cookie = `lng=${lang};path=/;domain=.example.com;max-age=31536000`;
```

后端通过 `Accept-Language` 头或 `Cookie['lng']` 解析 `CultureInfo.CurrentUICulture`。

---

## 5. 落地检查清单

### 5.1 前端 t() 化自审

- [ ] 所有 antd `columns[].title` / `Button text` / `Modal.title-content` / `Form.label` / `placeholder` / `rules.message` 都用 t() 包装
- [ ] 没有 `t('中文')` 把中文当 key 的错误用法(必须 `t('namespace.key')`)
- [ ] `record.xxx` / `dataIndex` 引用的用户数据**未被 t() 包装**
- [ ] `map(item => item.name)` 业务字段值**未被 t() 包装**
- [ ] map/filter/reduce 回调参数名**避免使用 `t`**(防变量遮蔽 useTranslation 返回的 t 函数)
- [ ] zh-CN + en-US translation.json 中每个 namespace key 都成对存在(无孤儿 key)
- [ ] zh-CN + en-US translation.json JSON.parse 通过

### 5.2 后端 IStringLocalizer 自审

- [ ] 所有平台 `throw new Exception("中文")` / `return BadRequest("中文")` 改为 `_L["Key"]`
- [ ] zh-CN + en-US resx 配套
- [ ] `RequestLocalization` 中间件配置正确(默认 zh-CN,支持 zh-CN + en-US)
- [ ] DB 唯一约束/系统级原始消息**不强制翻译**

### 5.3 平台预设字典 i18n

- [ ] 平台菜单 DB 字段双语(`AuthName` + `AuthNameEN`)
- [ ] 平台预设角色码前端 namespace 化
- [ ] 平台业务枚举(组织类型/审批状态等)前端 namespace 化
- [ ] 客户自定义字典/岗位/菜单**保留中文兜底,不强制双语**

---

## 6. 反例(2026-05-10 SYSV2 i18n 实战教训)

### 6.1 范围理解偏离

**症状**:Claude 把"先整体跑通"误读为"切语言链路通,内层中文可保留",涛哥实际期望"切英文整个 UI 全英文";导致 v1 P1 落盘后涛哥回"那这个偏离太多了"。

**根因**:范围未在 spec discuss 阶段拆清"链路 vs UI vs 数据"3 层。

**修复**:本标准明确"必 i18n / 不 i18n"边界,spec 启动前对照清单逐条确认。

### 6.2 用户输入数据被错翻

**症状**:Claude 给客户自定义岗位名(SYS_AuthPosition.AuthPositionName)加 EN 列扩展。

**根因**:把"客户自定义"当"平台预设"。

**修复**:本标准 §2.2 明确客户自定义部分兜底中文。

### 6.3 t 变量遮蔽

**症状**:`todos.filter(t => t.tag === '超期')` 把 useTranslation 返回的 t 函数遮蔽,后续在同作用域调用 `t(...)` 静默失效。

**修复**:本标准 §5.1 加自审项 — map/filter/reduce 回调参数名避免使用 `t`。

### 6.4 子组件遗漏

**症状**:OperationLog/index.jsx 完成 t() 化,但 components/Detail/index.jsx 子组件遗漏,切语言后 Drawer 详情仍中文。

**修复**:t() 化范围必须覆盖整个页面包(主 index + 所有 components/* 子组件 + 引用的工具函数)。

### 6.5 子应用 loadPath 指门户 /Static → locale 全没加载(2026-06-18 TPM)

**症状**:TPM 子应用发布 BP 后,状态过滤框/状态列显示裸 key `common.all`/`enable`/`disable`,硬编码中文部分正常 = 中英混杂。

**根因**:`i18n.js` loadPath 指 BP `hostMap("Static")/Static`,且前端没带本地 locale。curl 实测门户 `/Static/plugins/i18next/locales/zh-CN/*.json` 对**任何**子应用(mdm/sys/mes 同测)都返 BP **SPA fallback HTML**(711 字节,非 JSON)→ i18next-http-backend 解析失败 → **所有 `t()` key 裸显**(只是大部分页面硬编码中文,才没全垮)。

**修复**:loadPath 改子应用自己 base 自托管(§4.1)+ 自带 locale 文件;部署后 curl 验返 `application/json`。

**E2E 教训(ADR-024 ⑥)**:网络层断言(业务 200/无 toast)**看不到视觉 i18n** —— 必加 zh-CN value 校验:① curl locale 端点验 `application/json`(确定性,直抓本类根因)② 截图核中文 value 非裸 key(Playwright 跨 iframe 读文本不可靠,**截图是地面真值**)。

---

## 7. 工作流嵌入

### 7.1 spec discuss 阶段

涉及前端 / 后端 i18n 的 spec 启动时,主动对照本标准 §1-2 清单与涛哥拍板:
- 哪些范围必 i18n
- 哪些范围用户输入兜底
- 哪些范围客户自定义兜底

### 7.2 plan / 落盘阶段

派 qwen / dotnet-developer 时,prompt 必须显式包含:

```
**范围硬约束**(参见 engineering-standards/standards/frontend-i18n-standard.md):
✅ t() 范围:固定 UI 元素(列表标题/列头/Form/Button/message/Modal/Tag/Switch)
❌ 绝对禁止 t():record.xxx 用户输入字段值 / map(item => item.name) 业务字段 / dataIndex 数据
```

### 7.3 code-reviewer 收尾

`code-reviewer` 审查 i18n 落盘时,严格按本标准 §5 检查清单出具 HIGH/MED/LOW 报告。

---

## 8. 历史 / Versioning

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-10 | v1.0 | 涛哥拍板初版;SYSV2 实战拨乱后抽离;明确"用户输入不双语 / 平台 UI 必双语"边界;反例 4 条 |
| 2026-06-18 | v1.1 | **TPM 子应用 i18n 沉淀**:§4.1 加 loadPath 自托管规则(子应用必指自己 base + 自带 locale,勿指门户 /Static)+ 部署后 curl locale=application/json 确定性回归 + 只声明实用 ns;§6.5 反例(loadPath 指 BP /Static → SPA fallback → 全 key 裸显)+ E2E i18n 视觉校验补 ADR-024 ⑥(截图是地面真值) |

## 9. 配套引用

- 上游决策:ADR-020(候选)— 前端中英 i18n 范围边界
- 工程标准:[`frontend-ui-standard.md`](frontend-ui-standard.md)— UI 设计标准(含 i18n 配套段)
- 工程标准:[`subapp-onboarding-guide.md`](subapp-onboarding-guide.md)— 子应用接入手册(wujie 跨子域 Cookie 同步)
- SYSV2 实证:`docs/superpowers/specs/2026-05-10-frontend-i18n-zh-en-default/spec.md`(v3 完整方案)
