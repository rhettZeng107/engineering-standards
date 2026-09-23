# React UI 规范 / 列表页交互标准

> **定位**：跨项目 React + antd 5 + `@ant-design/pro-components` 列表页 / 编辑页统一规约。涛哥 2026-05-04 拍板沉淀，后续 SRM / MOM / EDOC / MDM / APS 等项目均可参考。
>
> **来源**：
> - SYSV2 实证（`src/components/README.md` 三件套 + 2026-05-04 ProTable options spike + HRPerson 等 20 个标杆列表页）
> - HC SRM `srmcolud@hcv2` 实证（`.planning/phases/03.2-srmcolud-react-supplier-frontend-rewrite/03.2-UI-SPEC.md`）
> - 内网老 `systemBase`（`http://<INTERNAL_HOST>/systemBase/#/`）质检检验判定页面操作员视角对照
>
> **使用方式**：新项目搭建列表页/编辑页前过一遍本文档，按各章节模板落地；老项目大版本重构时按"§14 适配清单"逐项核对。

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
│  共 N 条 · 排序说明 [筛选][刷新][密度][列设置]   │  ← 紧凑工具栏
│  筛选打开时：工具栏弹层内显示字段、重置、查询    │
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
  <ListPage.Filters>{/* 按业务需要放快捷业务分组；字段条件收在面板 */}</ListPage.Filters>
  <ListPage.Toolbar search={...} actions={[...]} />
  <ListPage.Table>{/* 单个 ProTable / Table 子节点 */}</ListPage.Table>
</ListPage>
```

**规约**：
- 页面级 Filters 仅放确需常显的业务分组；字段条件进入工具栏筛选弹层，不插入页面流
- Toolbar 留空自动不渲染
- Table 只接受**单个**子节点（不允许包一层 div）

参考实现：[`SYSV2 src/components/ListPage/ListPage.jsx`](../../SYSV2/AI.REACT.SYS.3/src/components/ListPage/ListPage.jsx)

---

## 3. 列表页 5 操作规范

### 3.1 搜索（Search）

**实施载体**：优先把 ProTable 内置 `search` 表单放在工具栏“筛选”按钮触发的弹层内，复用 `columns` 字段声明，不另写重复 `<Form>`。已有定制筛选组件可迁入同一弹层，但请求条件须有单一来源。已落地实现参考 SYSV2 MDM `VFilterProTable`：默认关闭，桌面右下定位，窄屏限制在视口内，提交后关闭。

```jsx
<ProTable
  search={{
    labelWidth: "auto",
    defaultCollapsed: false,                     // 面板内部完整展示
    collapseRender: false,
    optionRender: (cfg, props, dom) => [
      dom[1],   // [重置] 在前
      dom[0],   // [查询] 在后
    ],
  }}
  columns={columns}  // 字段过滤声明在 columns 内
/>
// 项目封装负责：默认隐藏 search、四工具并排、弹层开关、已应用数与清除全部。
```

**字段级过滤声明**（在 `columns` 内）：

| 类型 | 配置 | 例 |
|---|---|---|
| 文本输入 | 默认（`fieldProps.placeholder`）| 单号 / 姓名 |
| 状态多选 | `valueType: 'select' + fieldProps.options` | 状态 / 类型 |
| 日期范围 | `valueType: 'dateRange'` | 创建日期 |
| 不参与过滤 | `search: false` | 序号 / 操作列 |

**默认状态**：整块筛选弹层默认关闭，不占列表纵向空间；打开后覆盖在工作面上显示当前页所有有效字段条件，不得通过条件渲染把筛选块插到表格上方。

**布局与行为**：桌面用定位到筛选按钮右下方的 Popover/等价非路由弹层，窄屏可用受控全宽或底部弹层。字段采用上标签、下控件；宽屏最多两列，窄屏一列，并限制高度使内部滚动。查询/重置在弹层内，提交关闭并保留条件；取消、Esc、点击外部只关闭不误提交，关闭后焦点返回触发按钮。重置与“清除全部”均清空所有已应用条件并回第一页。表头仅给少数低基数枚举列保留快捷筛选，与弹层条件同步并走服务端全集过滤。列表视觉参考为 [`UI V2 明暗列表示例`](../references/ui-v2-theme-examples/list.html)。

### 3.2 重置（Reset）

弹层内优先使用 ProTable 内置重置；`optionRender` 维持 `[重置, 查询]`。四工具中的筛选按钮显示已应用数，并提供不必逐字段操作的“清除全部”。

### 3.3 过滤（Filter）

| 类型 | 处理位置 | 组件 |
|---|---|---|
| **少数低基数枚举** | 表头快捷筛选，同时进入弹层 | `filters` / `filterDropdown` |
| **多列字段过滤** | 筛选弹层内 columns | 见 §3.1 字段级声明 |
| **日期 / 数字区间** | 筛选弹层 | antd 原生 `<RangePicker>` / `<InputNumber>` |
| **级联 / 远端搜索** | 筛选弹层 | antd 原生 `<Cascader>` / `<Select showSearch>` |

> 页面级 FilterChip 只用于必须常显的业务分组；同一字段不同时维护两套筛选状态。

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

**容器**：当前Main/门户框架内的React路由独立页。原`<EditDrawer>`/宽Modal必须迁为路由；不打开新浏览器窗口，字段和保存契约不变。

```jsx
const navigate = useNavigate();
const [searchParams] = useSearchParams();
const editId = searchParams.get("id");

return (
  <BusinessRoutePage
    breadcrumb={["业务管理", editId ? "编辑 XXX" : "新增 XXX"]}
    title={editId ? `单号: ${recordNo}` : "单号: 保存后自动生成"}
    onBack={() => navigate(-1)}
    onDelete={editId ? handleDelete : undefined}
    onSave={handleSave}
  >
    <StepAnchorNav items={anchorItems} />
    <SectionCard no={1} title="基本信息">...</SectionCard>
  </BusinessRoutePage>
);
```

**页头按钮**：新增`[返回][保存]`；编辑`[返回][删除][保存]`，删除使用Popconfirm/Modal.confirm。不再增加同义“关闭”。页面占满Main可用宽度，左右安全边距5–15px；确认、提示、导入等短事务仍使用普通Modal。

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

## 4. ProTable 工具栏四图标（强制）

### 4.1 必须开启

有可过滤字段的列表页在 ProTable 原生三工具前增加“筛选”；无有效字段的局部表不造空面板。每个列表页仍须显式配置 `options`：

| 图标 | 功能 |
|---|---|
| **筛选** | 打开字段级独立面板，显示已应用条件数，提供清除全部 |
| **刷新** (`reload`) | 一键 reload，不需手动 |
| **密度** (`density`) | 默认 / 中等 / 紧凑切换，长列表用户必备 |
| **列设置** (`setting`) | 列**显隐勾选** + **拖拽改位置** + **固定列**，宽列表必备 |

工具区左侧显示真实结果数及适用的排序说明，右侧四个图标按上表顺序独立排列；每个图标提供可访问名称、悬停提示及可见键盘焦点。桌面边框盒统一 32×32px、图形约 14×14px，触控视口命中区不小于 44×44px。刷新按当前查询、排序和分页重新取数，不清空条件；业务主动作仍位于页头。单层面包屑与标题同名时只显示标题。

### 4.2 关键陷阱（必读）

**强制** `dataSource` 数组守卫(否则单点崩全站)。Table/ProTable 的 `dataSource` 必须保证是数组:

```jsx
<Table dataSource={Array.isArray(rows) ? rows : []} />   // ✅ 守卫
// <Table dataSource={rows} />                            // ❌ rows 为 API 错误体/undefined → dataSource.map is not a function → ErrorBoundary 崩整页
```

- ProTable `request` 回调:`return { data: Array.isArray(d) ? d : [], total, success: true }`;catch 分支 `return { data: [], success: false }`。
- Select/ProFormSelect `request` 里对结果 `.map`:先 `const arr = Array.isArray(res) ? res : [];` 再 `arr.map(...)`。
- **共享/dashboard 组件尤其**:它渲染在多页,崩它=崩一片(SRMV2 10.8 实证:一个共享 Table 调失败崩 10 个菜单)。
- 兜底闸:部署后 E2E render-walk(`standards/cicd-e2e-in-pipeline-standard.md`)拦截漏网。

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
// 现状：toolBarRender={false} 会把整个 toolbar 区域禁用，连带原生三个工具一起没了
// 为什么改：用户需要刷新/密度/列设置（含拖拽位置 + 显隐 + 固定列）能力
// 改成什么样：传 () => [] 保留 toolbar，由 options 渲染原生三工具；有查询字段时在前方增加独立筛选工具
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

## 5. 同构多行记录与可编辑表格（强制）

同一集合内各记录共享字段结构时，使用 `Table`/`EditableProTable` 或项目统一的 `EditableRecordTable`，而不是 `Form.List` 重复卡片或分块表单。服务范围、证照、人员/车辆关系、途经点、兼容关系、费率阶梯和业务单据明细均按此判断；当前只有一条记录也不改变结构。

```jsx
<EditableRecordTable
  rowKey={(row) => row.id ?? row.clientKey}
  columns={columns}
  value={rows}
  onChange={setRows}
  editable={{ editableKeys, onChange: setEditableKeys }}
  recordCreatorProps={{ record: () => ({ clientKey: crypto.randomUUID() }) }}
/>
```

- 一套表头、一行一记录；查看/编辑/复制/删除集中在最右操作列。
- 既有行使用业务 ID，新增行使用稳定临时 key；禁止数组索引作为持久编辑键。
- 校验错误定位到行/单元格；提交失败保留全部输入并聚焦首个错误。
- 大型异构行可用“当前选中行”的单一辅助区或短编辑弹窗，但集合浏览层仍是共享表头表格。
- 宽表使用横向滚动并按需固定关键列/操作列；窄屏不改成卡片堆叠。
- 保存验收至少覆盖两条真实记录的添加、编辑、删除、持久化回读和一个重复/重叠/无效反例。

---

## 6. 行内操作（columns 最后一列）

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

## 7. 批量操作（rowSelection）

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

## 8. 文案契约

### 8.1 主 CTA 强制"动词+业务名词"

**禁止**在一般动作中裸用"提交" / "保存" / "确认" / "Submit" / "Save" / "OK"；必须替换业务名词：

| 模板 | 例 |
|---|---|
| `提交{业务名词}` | 提交报价 / 提交评分 / 提交注册 |
| `保存{业务名词}` | 保存草稿 / 保存配置 |
| `确认{业务名词}` | 确认接受变更 / 确认收货 |
| `下一步：{下一步名词}` | 下一步：公司资料 |

**例外**：取消 / 关闭 / 返回 / 上一步等导航单词允许裸用；§3.5 Main框架内新增/编辑路由页的统一页头动作按契约使用“保存”。

### 8.2 空状态

```
"暂无数据"                                            （标题）
"当前没有{业务名词}，请先{下一步动作}"                  （副标题，可选）
```

例：`"当前没有待处理的报价单，请等待采购员发送"`

### 8.3 错误反馈

| 场景 | 文案 |
|---|---|
| 401 未授权 | `"401 未授权，请重新登录"` |
| 网络超时 | `"请求超时，请刷新重试"` |
| 500 通用 | `"500 服务器异常，请联系系统管理员或稍后重试"` |
| 业务校验 | 后端返 `errors` 字段直接展示，不用通用文案兜底 |

### 8.4 危险操作二次确认

```
标题：{动作名}确认                       （如"删除确认" / "驳回确认"）
正文：确认{动作}该{业务名词}？此操作{不可恢复 / 可重新提交}。
确认按钮：确认{动作名}（红色）             （如"确认删除"）
取消按钮：取消
```

---

## 9. 主题与色值

### 9.1 CSS 变量层（强制）

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

### 9.2 双主题与宿主同步

`body[data-theme="light"]` / `body[data-theme="dark"]` 两套 CSS 变量定义，antd `ConfigProvider` 的算法和 token 须与实际主题一致；不能仅更换页面背景。支持系统模式时，由 `prefers-color-scheme` 求实际浅/深值，系统变化即时生效；用户明确选择浅/深后不被系统变化覆盖。参考 [`SYSV2 src/styles/theme-variables.css`](../../SYSV2/AI.REACT.SYS.3/src/styles/theme-variables.css)。iframe 子应用有独立文档和样式上下文，宿主须通过已验证的消息契约同步实际主题；子应用独立访问仍能自行选择或继承系统模式。

主题持久化只保存外观偏好；切换不能刷新页面、重挂载业务组件或丢弃未保存输入。页面色值用语义 token 表示画布/容器/浮层/表头/文字/边界/焦点/状态，产品品牌色可覆盖默认值，业务状态色不得随品牌色改变含义。

### 9.3 可访问性

普通文字与背景**对比度 ≥ 4.5:1**，非文字控件边界、焦点及状态图形至少 3:1。浅色和深色分别检查；状态还须有文字、图标或形状，不以颜色单独传达。新增主色或菜单选中态时用渲染后的实际色值检查，不达标就调整 token。

---

## 10. 间距 / 字体 / 圆角 / 阴影

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

## 11. 路由与导航

### 11.1 路由模式

按项目原有模式（不改架构）：
- 集中扁平（`React.lazy` + `<Routes>`）→ 简单系统
- 嵌套配置（`@loadable/component` + 路由配置数组）→ 复杂系统含权限守卫

### 11.2 权限守卫

每个需登录路由用 `<PermissionRoute auth={true}>` 包裹；无权时跳登录页。

### 11.3 菜单种子

侧栏菜单走后端动态拉取（`/api/.../SideMenu`），不前端硬编码菜单结构。新增页面同步 INSERT 菜单种子 SQL。

---

## 12. 鉴权

### 12.1 Token 存储

`localStorage[<TOKEN_KEY>]` 或 `cookie[<TOKEN_KEY>]` — 具体 key 由各项目内统一,跨项目允许差异。

### 12.2 axios 拦截器

```js
const token = getToken();
if (token && token !== "null" && token !== "undefined") {
  config.headers.Authorization = `Bearer ${token}`;
}
// 不发 "Bearer null" 字面值（防 401 字符串 truthy bug）
```

### 12.3 antd Upload 等 native XHR

antd `Upload` / `Image` / `<img>` 不走 axios 拦截器！需手动注入鉴权头：

```jsx
<Upload action="/api/upload" headers={{ Authorization: `Bearer ${token}` }}>
```

或对 `<img>` 私密资源走 axios + `URL.createObjectURL(blob)` 渲染。

---

## 13. 不变量（违反即代码评审拒收）

- ❌ 新组件 / 页面 CSS 不允许硬编码颜色值（必须 `var(--sys-*)`）
- ❌ 列表页禁止 `toolBarRender={false}`（用 `() => []`）
- ❌ 筛选不得常驻或以内联展开块推挤列表；必须由工具栏按钮打开弹层
- ❌ 同构多行记录不得用重复 Card、块或字段标签代替共享表头表格
- ❌ 列表页 columns 操作列宽不允许混用（项目内必须统一，160 / 项目自定）
- ❌ 新增、编辑、详情或流程业务页禁止使用侧滑Drawer、固定窄宽Modal或覆盖式全屏Modal（统一为Main框架内路由独立页）
- ❌ 一般主 CTA 文案禁止裸用"提交" / "保存"（必须"动词+业务名词"）；§3.5统一新增/编辑页头的“保存”除外
- ❌ 删除 / 危险动作禁止无二次确认（Popconfirm 或 Modal.confirm）
- ❌ 常显 Filters 段超过 6 个 chip（更多字段收进工具栏触发的筛选弹层）
- ❌ 引入第二套图标库（`@ant-design/icons` 单一）
- ❌ 引入新状态管理库 / 升级 antd / pro-components 主版本
- ❌ 改字段名 / 接口 URL / 请求/响应 payload（属业务契约）

---

## 14. 适配清单（老项目重构对照）

新接入本规范时，按以下顺序逐项核对：

- [ ] 是否用 `<ListPage>` 四段式（或等价封装）？
- [ ] 列表页 `toolBarRender` 是否为 `() => []`（不是 `false`）？
- [ ] 是否配置 `options={{reload, density, setting:{draggable, checkable}}}`？
- [ ] 有字段条件的列表是否让筛选与上述原生三工具同排，桌面 32×32px、触控至少 44×44px，表头单行约 38px？
- [ ] 过滤区 `optionRender` 是否调换为 `[重置, 查询]`？
- [ ] 筛选弹层是否默认关闭、打开后不推挤表格，可查询/重置/Esc关闭/焦点恢复，且条件数和清除全部同步？
- [ ] 同构多行记录是否使用共享表头的只读/可编辑表格，并覆盖至少两行保存回读与行级反例？
- [ ] 表头快捷筛选是否只用于少数枚举字段，并与面板和服务端分页同步？
- [ ] 原Drawer/宽Modal业务页是否已使用Main框架内路由独立页，且新增/编辑/详情页头按契约显示返回、删除、保存或已授权业务动作？
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

## 15. 引用与扩展

- SYSV2 项目内组件实现：[`AI.REACT.SYS.3/src/components/README.md`](../../SYSV2/AI.REACT.SYS.3/src/components/README.md)
- HC SRM 借鉴文档：`HC/.planning/phases/03.2-srmcolud-react-supplier-frontend-rewrite/03.2-UI-SPEC.md`
- ProTable 三图标 spike 闭环：[`SYSV2 docs/superpowers/specs/2026-05-04-protable-options-toolbar-icons/spec.md`](../../SYSV2/docs/superpowers/specs/2026-05-04-protable-options-toolbar-icons/spec.md)
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
