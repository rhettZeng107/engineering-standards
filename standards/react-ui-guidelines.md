# React UI 规范 / 列表页交互标准

> **定位**：跨项目 React + antd 5 + `@ant-design/pro-components` 列表页 / 编辑页统一规约。涛哥 2026-05-04 拍板沉淀，后续 SRM / MOM / EDOC / MDM / APS 等项目均可参考。
>
> **来源**：
> - SYSV2 实证（`src/components/README.md` 三件套 + 2026-05-04 ProTable options spike + HRPerson 等 20 个标杆列表页）
> - HC SRM `srmcolud@hcv2` 实证（`.planning/phases/03.2-srmcolud-react-supplier-frontend-rewrite/03.2-UI-SPEC.md`）
> - 内网老 `systemBase`（`http://<INTERNAL_HOST>/systemBase/#/`）质检检验判定页面操作员视角对照
>
> **使用方式**：新项目搭建列表页/编辑页前过一遍本文档，按各章节模板落地；老项目大版本重构时按"§13 适配清单"逐项核对。

---

## 1. 技术栈基线

| 层 | 选型 | 版本 |
|---|---|---|
| UI 库 | `antd` | 5.x |
| Table / Form 增强 | `@ant-design/pro-components` | 3.x |
| 路由 | `react-router-dom` | 6.x |
| 表单 | antd `Form` + `Form.useForm()`（**不引入 Formik / RHF**）|
| 日期 | `dayjs` |
| 图标 | `@ant-design/icons` 单一（**禁第二套**）|
| 主题 | CSS 变量 `var(--sys-*)` + `body[data-theme]` 切换 |

> 跨项目允许差异：色值 token 可项目化（HC 主蓝 `#346CB0` / SYSV2 主青 `#0891b2` light / `#00e5ff` dark），但**变量层结构**（`--sys-text-primary` / `--sys-bg-layout` 等命名族）保持一致。

---

## 2. 列表页四段式结构（强制）

> 所有列表页**禁止**在外壳层叠 `Card` / `Collapse` / `Spin` / 嵌套 `Row/Col`。统一为四段式平铺：

```
┌─ ListPage ─────────────────────────────────────┐
│  Title              [+ 新增]                    │  ← Title.extra
├────────────────────────────────────────────────┤
│  [字段 1] [字段 2] [字段 3] | [重置][查询][展开] │  ← 过滤区(ProTable.search)
├────────────────────────────────────────────────┤
│                       [刷新][密度][列设置]      │  ← 工具栏(ProTable.options)
├────────────────────────────────────────────────┤
│  序号 | 字段... | 操作                         │  ← 表格列头
│  ...                                           │  ← 数据行
│  [分页]                                        │
└────────────────────────────────────────────────┘
```

### 2.1 容器 API（推荐封装）

```jsx
<ListPage>
  <ListPage.Title title="..." subtitle="..." extra={...} banner={...} />
  <ListPage.Filters>{/* ≤6 个 FilterChip */}</ListPage.Filters>
  <ListPage.Toolbar search={...} actions={[...]} />
  <ListPage.Table>{/* 单个 ProTable / Table 子节点 */}</ListPage.Table>
</ListPage>
```

**规约**：
- Filters 最多 6 个 chip，超过改路由子页
- Toolbar 留空自动不渲染
- Table 只接受**单个**子节点（不允许包一层 div）

参考实现：[`SYSV2 src/components/ListPage/ListPage.jsx`](../../AI.REACT.SYS.3/src/components/ListPage/ListPage.jsx)

---

## 3. 列表页 5 操作规范

### 3.1 搜索（Search）

**实施载体**：ProTable 内置 `search` prop，不另写 `<Form>` 包裹。

```jsx
<ProTable
  search={{
    labelWidth: "auto",
    collapsed: !filterExpanded,                   // 受控展开
    onCollapse: (c) => setFilterExpanded(!c),
    collapseRender: (c) => (
      <a onClick={() => setFilterExpanded(!c)}>
        {filterExpanded ? '收起' : '展开'}
      </a>
    ),
    optionRender: (cfg, props, dom) => [
      dom[1],   // [重置] 在前
      dom[0],   // [查询] 在后
    ],
  }}
  columns={columns}  // 字段过滤声明在 columns 内
/>
```

**字段级过滤声明**（在 `columns` 内）：

| 类型 | 配置 | 例 |
|---|---|---|
| 文本输入 | 默认（`fieldProps.placeholder`）| 单号 / 姓名 |
| 状态多选 | `valueType: 'select' + fieldProps.options` | 状态 / 类型 |
| 日期范围 | `valueType: 'dateRange'` | 创建日期 |
| 不参与过滤 | `search: false` | 序号 / 操作列 |

**展开/收起默认**：默认收起 1 行；超过 1 行的过滤条件点击"展开"显示全部。

### 3.2 重置（Reset）

由 ProTable 内置搜索表单提供，**不自建**。**强制** `optionRender` 调换为 `[重置, 查询]` 顺序（重置在前，让用户改完字段先一键清空再查询）。

### 3.3 过滤（Filter）

| 类型 | 处理位置 | 组件 |
|---|---|---|
| **枚举单/多选**（≤ 6 项）| `<ListPage.Filters>` 段 | `<FilterChip>` 自定义芯片 |
| **多列字段过滤** | `<ProTable.search>` 内 columns | 见 §3.1 字段级声明 |
| **日期 / 数字区间** | `<ListPage.Toolbar actions>` 段 | antd 原生 `<RangePicker>` / `<InputNumber>` |
| **级联 / 远端搜索** | 同上 | antd 原生 `<Cascader>` / `<Select showSearch>` |

> FilterChip 仅处理枚举筛选，不与 ProTable.search 重复。

### 3.4 新增（Create）

**位置**：`<ListPage.Title.extra>` 顶栏右侧（**不放 ProTable.toolBarRender 内**，外置可视性高）。

```jsx
<ListPage.Title
  title="人员中心"
  extra={
    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
      新增
    </Button>
  }
/>
```

**多操作场景**（如批量导入 / 从已有数据引入）用 `<Space>` 包裹：

```jsx
<Space>
  <Button type="primary" icon={<PlusOutlined/>}>新增</Button>
  <Button type="primary" icon={<ImportOutlined/>}>批量导入</Button>
</Space>
```

### 3.5 编辑（Edit）

**容器**：右侧 `<EditDrawer>`（**不用 antd Modal**，除非历史原因或字段联动深度耦合）。

```jsx
<EditDrawer
  open={open}
  title={editId ? "编辑 XXX" : "新增 XXX"}
  size="sm" | "md" | "lg"           // 480 / 720 / 1080，默认 sm
  onClose={...}
  onSubmit={...}
  submitting={saving}
  loading={loadingDetail}
>
  <Form form={form} layout="vertical">
    {/* 表单内容 */}
  </Form>
</EditDrawer>
```

**底部按钮**：固定 `[取消][保存]`，提交中 `maskClosable=false`。

参考实现：[`SYSV2 src/components/EditDrawer/EditDrawer.jsx`](../../AI.REACT.SYS.3/src/components/EditDrawer/EditDrawer.jsx)

### 3.6 删除 / 危险操作（Destructive）

**列表行内**：

```jsx
<Popconfirm title="确定删除该 XXX？此操作不可恢复" onConfirm={() => handleDelete(record.id)}>
  <Button danger size="small">删除</Button>
</Popconfirm>
```

**多步骤场景 / 业务名词强化**（HC 03.2 模板，跨项目推荐）：

```jsx
<Modal.confirm
  title="删除确认"
  content="确认删除该报价？此操作不可恢复。"
  okText="确认删除"
  okButtonProps={{ danger: true }}
  cancelText="取消"
  onOk={...}
/>
```

> 文案强制"动词+业务名词"（"确认删除"而非"确认"）。

---

## 4. ProTable 工具栏三图标（强制）

### 4.1 必须开启

每个列表页**必须**显式配置 `options`，渲染右上角三图标：

| 图标 | 功能 |
|---|---|
| **刷新** (`reload`) | 一键 reload，不需手动 |
| **密度** (`density`) | 默认 / 中等 / 紧凑切换，长列表用户必备 |
| **列设置** (`setting`) | 列**显隐勾选** + **拖拽改位置** + **固定列**，宽列表必备 |

### 4.2 关键陷阱（必读）

**禁止** `toolBarRender={false}`（pro-table 3.21 实证：会把整个 `.ant-pro-table-list-toolbar` 区域不渲染，options 失效）。

**正确写法** — 传**空数组**：

```jsx
<ProTable
  search={{...}}
  // toolBarRender={false}  ← ❌ 不要这样写
  toolBarRender={() => []}                    // ✅ 空数组保留区域，左空
  options={{
    reload: true,
    density: true,
    setting: { draggable: true, checkable: true },
    fullScreen: false,                        // 按需，默认关
    search: false,                            // 关闭关键字快搜（搜索已用 search prop）
  }}
/>
```

**注释模板**（强制加，避免误改回 false）：

```jsx
// 现状：toolBarRender={false} 会把整个 toolbar 区域禁用，连带 options 三图标一起没了
// 为什么改：用户需要刷新/密度/列设置（含拖拽位置 + 显隐 + 固定列）能力
// 改成什么样：传 () => [] 空数组保留 toolbar 区域渲染（左空），由 options 渲染右侧三图标
toolBarRender={() => []}
```

### 4.3 自动高度补偿

如果用 `JYProTableAutoHeight` 类的高度自适应封装，工具栏区从不渲染（false）→ 渲染（空数组）多出约 56px。多数封装内部用 `querySelector('.ant-pro-table-list-toolbar')` 自动测量，不需手动调；如发现底部分页器被挡，给 `customOffsetHeight` 加 ~56：

```jsx
customOffsetHeight={baseOffsetHeight + 170 + 56}
```

### 4.4 与 toolBarRender 内置按钮共存

**推荐**：新增 / 批量操作按钮放 `<ListPage.Title.extra>`（外置），ProTable.toolBarRender 留空。

**不推荐**：把新增按钮迁回 `toolBarRender={() => [<Button>新增</Button>]}` 内 — 会让顶栏 Title.extra 和工具栏左侧两处按钮区重复，视觉重。

---

## 5. 行内操作（columns 最后一列）

**两种风格**（跨项目允许差异，**项目内必须统一**）：

| 风格 | UI | 适用 |
|---|---|---|
| **按钮风**（SYSV2）| `<Button type="primary" ghost size="small">编辑</Button>` + `<Button danger size="small">删除</Button>` | 控制台 / 后台管理类 |
| **链接风**（HC SRM）| `<a>详情</a>` `<a>评标</a>` `<a style={{color:'#ff4d4f'}}>关闭</a>` | 业务流转 / 状态多动作类 |

**通用规约**：

```jsx
{
  title: "操作",
  key: "action",
  fixed: "right",
  width: 160,                            // 项目内统一宽度，禁止 65 / 80 / 150 混用
  search: false,
  render: (_, record) => (
    <Flex gap="small" wrap>              // 或 <Space>
      <Button type="primary" ghost size="small" onClick={() => handleEdit(record)}>编辑</Button>
      {record.status === 1 && (         // 状态条件渲染（可选）
        <Button size="small" onClick={() => handleAudit(record)}>评分</Button>
      )}
      <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
        <Button danger size="small">删除</Button>
      </Popconfirm>
    </Flex>
  ),
}
```

**操作列宽**：固定 160px + `fixed: 'right'`（项目内统一）。

---

## 6. 批量操作（rowSelection）

**触发条件**：列表页确有"批量删除 / 批量启用 / 批量推送"等多选场景才用。

```jsx
<ProTable
  rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
  toolBarRender={() => [
    <Popconfirm
      key="batch-delete"
      title="确认批量删除选中项？"
      onConfirm={handleBatchDelete}
      disabled={selectedRowKeys.length === 0}
    >
      <Button
        icon={<DeleteOutlined />}
        disabled={selectedRowKeys.length === 0}     // 强制 disabled 守卫
      >
        批量删除
      </Button>
    </Popconfirm>,
  ]}
/>
```

**强制规约**：
- `disabled={selectedRowKeys.length === 0}` 守卫（无选中即禁用）
- 危险批量操作必须 `<Popconfirm>` 二次确认
- 选中状态**不放 ListPage.Title.extra**（外置看不到选了几条），放 toolBarRender 内贴近选中区

---

## 7. 文案契约

### 7.1 主 CTA 强制"动词+业务名词"

**禁止**裸用"提交" / "保存" / "确认" / "Submit" / "Save" / "OK"；必须替换业务名词：

| 模板 | 例 |
|---|---|
| `提交{业务名词}` | 提交报价 / 提交评分 / 提交注册 |
| `保存{业务名词}` | 保存草稿 / 保存配置 |
| `确认{业务名词}` | 确认接受变更 / 确认收货 |
| `下一步：{下一步名词}` | 下一步：公司资料 |

**例外**：取消 / 关闭 / 返回 / 上一步 等导航单词允许裸用。

### 7.2 空状态

```
"暂无数据"                                            （标题）
"当前没有{业务名词}，请先{下一步动作}"                  （副标题，可选）
```

例：`"当前没有待处理的报价单，请等待采购员发送"`

### 7.3 错误反馈

| 场景 | 文案 |
|---|---|
| 401 未授权 | `"401 未授权，请重新登录"` |
| 网络超时 | `"请求超时，请刷新重试"` |
| 500 通用 | `"500 服务器异常，请联系系统管理员或稍后重试"` |
| 业务校验 | 后端返 `errors` 字段直接展示，不用通用文案兜底 |

### 7.4 危险操作二次确认

```
标题：{动作名}确认                       （如"删除确认" / "驳回确认"）
正文：确认{动作}该{业务名词}？此操作{不可恢复 / 可重新提交}。
确认按钮：确认{动作名}（红色）             （如"确认删除"）
取消按钮：取消
```

---

## 8. 主题与色值

### 8.1 CSS 变量层（强制）

**禁止**在新组件 / 页面 CSS 里硬编码颜色值。所有 CSS 必须读：

```css
/* 文本 */
color: var(--sys-text-primary);     /* 主文 */
color: var(--sys-text-secondary);   /* 次要文 */
color: var(--sys-text-tertiary);    /* 辅助说明 */

/* 背景 */
background: var(--sys-bg-layout);     /* 页面层 */
background: var(--sys-bg-container);  /* 容器层 */
background: var(--sys-bg-elevated);   /* 卡片 / 抽屉 */

/* 边框 */
border: 1px solid var(--sys-border-default);
border-bottom: 1px solid var(--sys-border-subtle);

/* 主色 */
color: var(--sys-primary);
background: var(--sys-primary-bg);

/* 阴影 */
box-shadow: var(--sys-shadow-card);
box-shadow: var(--sys-shadow-elevated);
```

### 8.2 双主题（推荐）

`body[data-theme="light"]` / `body[data-theme="dark"]` 两套 CSS 变量定义，业务页 0 改动即跟随。参考 [`SYSV2 src/styles/theme-variables.css`](../../AI.REACT.SYS.3/src/styles/theme-variables.css)。

### 8.3 可访问性

文字与背景**对比度 ≥ 4.5:1**（WCAG AA）。新增主色或菜单选中态时用 Chrome DevTools Lighthouse 抽查，不达 AA 就调深 / 调浅。

---

## 9. 间距 / 字体 / 圆角 / 阴影

继承 antd 5 默认 token，避免自定义。

| 项 | 值 | 用途 |
|---|---|---|
| 间距 | 4 / 8 / 16 / 24 / 32 / 48 / 64 | antd 默认 8pt 栅格 |
| Body | 14px / 400 / 1.5 行高 | 正文 / 表单 / 表格 |
| Heading | 20px / 600 | 页头 / 卡片标题 |
| Display | 28px / 600 | 关键指标数字 |
| 圆角 | 2 / 4 / 6 / 8 | tag / button / card / 大块 |
| 阴影 | antd 三档 | card / modal / 浮窗 |

**字体**：默认系统中文栈（`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`），**禁止内网项目引入 Google Fonts CDN**（无外网访问）；如有强烈视觉需求引入 `Fraunces` / `JetBrains Mono` 等需自托管。

---

## 10. 路由与导航

### 10.1 路由模式

按项目原有模式（不改架构）：
- 集中扁平（`React.lazy` + `<Routes>`）→ 简单系统
- 嵌套配置（`@loadable/component` + 路由配置数组）→ 复杂系统含权限守卫

### 10.2 权限守卫

每个需登录路由用 `<PermissionRoute auth={true}>` 包裹；无权时跳登录页。

### 10.3 菜单种子

侧栏菜单走后端动态拉取（`/api/.../SideMenu`），不前端硬编码菜单结构。新增页面同步 INSERT 菜单种子 SQL。

---

## 11. 鉴权

### 11.1 Token 存储

`localStorage[<TOKEN_KEY>]` 或 `cookie[<TOKEN_KEY>]` — 具体 key 由各项目内统一,跨项目允许差异。

### 11.2 axios 拦截器

```js
const token = getToken();
if (token && token !== "null" && token !== "undefined") {
  config.headers.Authorization = `Bearer ${token}`;
}
// 不发 "Bearer null" 字面值（防 401 字符串 truthy bug）
```

### 11.3 antd Upload 等 native XHR

antd `Upload` / `Image` / `<img>` 不走 axios 拦截器！需手动注入鉴权头：

```jsx
<Upload action="/api/upload" headers={{ Authorization: `Bearer ${token}` }}>
```

或对 `<img>` 私密资源走 axios + `URL.createObjectURL(blob)` 渲染。

---

## 12. 不变量（违反即代码评审拒收）

- ❌ 新组件 / 页面 CSS 不允许硬编码颜色值（必须 `var(--sys-*)`）
- ❌ 列表页禁止 `toolBarRender={false}`（用 `() => []`）
- ❌ 列表页 columns 操作列宽不允许混用（项目内必须统一，160 / 项目自定）
- ❌ 编辑容器禁止用 antd Modal（必须 EditDrawer，除历史耦合）
- ❌ 主 CTA 文案禁止裸用"提交" / "保存"（必须"动词+业务名词"）
- ❌ 删除 / 危险动作禁止无二次确认（Popconfirm 或 Modal.confirm）
- ❌ Filters 段超过 6 个 chip（改路由子页）
- ❌ 引入第二套图标库（`@ant-design/icons` 单一）
- ❌ 引入新状态管理库 / 升级 antd / pro-components 主版本
- ❌ 改字段名 / 接口 URL / 请求/响应 payload（属业务契约）

---

## 13. 适配清单（老项目重构对照）

新接入本规范时，按以下顺序逐项核对：

- [ ] 是否用 `<ListPage>` 四段式（或等价封装）？
- [ ] 列表页 `toolBarRender` 是否为 `() => []`（不是 `false`）？
- [ ] 是否配置 `options={{reload, density, setting:{draggable, checkable}}}`？
- [ ] 过滤区 `optionRender` 是否调换为 `[重置, 查询]`？
- [ ] 是否提供 `collapseRender` 自定义中文"展开/收起"文案？
- [ ] 编辑是否用 `<EditDrawer>`（不用 Modal）？
- [ ] 删除 / 危险动作是否 `<Popconfirm>` 包裹？
- [ ] 主 CTA 文案是否"动词+业务名词"？
- [ ] 行内操作列宽是否项目内统一？
- [ ] 操作列是否 `fixed: 'right'`？
- [ ] CSS 是否全走 `var(--sys-*)` 变量？
- [ ] 主色 / 文字对比度是否 ≥ 4.5:1？
- [ ] 是否单一 `@ant-design/icons` 图标库（无第二套）？
- [ ] 操作列状态条件渲染是否一致（`record.status === X && <action>`）？
- [ ] 批量操作是否 `disabled={selectedRowKeys.length === 0}` 守卫？

---

## 14. 引用与扩展

- SYSV2 项目内组件实现：[`AI.REACT.SYS.3/src/components/README.md`](../../AI.REACT.SYS.3/src/components/README.md)
- HC SRM 借鉴文档：`HC/.planning/phases/03.2-srmcolud-react-supplier-frontend-rewrite/03.2-UI-SPEC.md`
- ProTable 三图标 spike 闭环：[`docs/superpowers/specs/2026-05-04-protable-options-toolbar-icons/spec.md`](../superpowers/specs/2026-05-04-protable-options-toolbar-icons/spec.md)
- 内网老 systemBase 操作员视角对照：`http://<INTERNAL_HOST>/systemBase/#/`

后续扩展（视项目需求）：

- **响应式断点**（≥1280px PC 主战场 / ≤576px 移动兼容）
- **Print 模板**（`@media print` + `@page A4 portrait`）
- **国际化**（i18n key + zh-CN/en-US 切换）
- **可访问性深化**（WCAG 2.2 AA 全集 / 触控目标 44px / ARIA 完整）

> 这些扩展项各项目按需启用，不强制本规范一刀切覆盖。

---

## 修订记录

| 日期 | 修订 | 来源 |
|---|---|---|
| 2026-05-04 | 初版沉淀（涛哥拍板，跨项目可参考）| SYSV2 ProTable options spike 闭环 + HC 03.2 借鉴 |
