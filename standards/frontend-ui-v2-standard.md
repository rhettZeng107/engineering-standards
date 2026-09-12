# Frontend UI V2（Atlas）标准

> 状态：正式。适用于 React 18、antd 5 与 `@ant-design/pro-components` 项目。
> 本文只规定 V2 的强制边界；列表交互细则直接引用
> [`frontend-ui-standard.md`](frontend-ui-standard.md) 与
> [`react-ui-guidelines.md`](react-ui-guidelines.md)，不在三份文档中重复维护。
> 共享组件真理源：`references/v2-components/`。

## 1. 适用原则

- 新建、重构和迁移页面默认按 V2 落盘。迁移不得只搬业务功能、旧布局或技术栈，再把 UI V2 留作后续美化。
- 页面必须先判定为列表页、独立业务路由页、短事务 Modal 或看板/报表，再套对应范式；不得用 V2 页头、颜色或卡片替代完整页面范式。
- 业务字段、按钮、校验、请求和保存契约不得因布局升级被删减。真实保存、持久化、回显和失败路径仍按项目验收标准执行。

## 2. Token 与基础组件

- 入口统一引入 `v2-tokens.css`，并将品牌色、语义色、圆角、画布、文字和字体映射到 antd `ConfigProvider`；页面不得硬编码主题色。
- 主动作使用 `type="primary"`；删除、作废、驳回等危险动作使用 `danger`；普通查看、编辑、导出、返回使用默认按钮或链接。操作列不得用无业务含义的多色按钮。
- 业务页复用 `SectionCard`、`StepAnchorNav`、`InlineDetailTable` 和 `V2States`；禁止自造同职能组件或用空卡片冒充业务分区。

## 3. 列表页（强制）

列表页的定义、布局和交互以
[`frontend-ui-standard.md`](frontend-ui-standard.md) 与
[`react-ui-guidelines.md`](react-ui-guidelines.md) 为唯一细则来源，并至少满足：

1. 使用 `ListPage` 四段式：标题与主操作、可选快捷筛选、字段过滤与工具栏、表格与分页。不得用多层 `Card`、手写搜索条或页面级 `Spin` 替代该结构。
2. 主表使用 `ProTable` 或项目自包含的 `AutoHeightProTable`。查询条件声明在 `columns`，使用字段级、带标签的过滤控件；`search.labelWidth="auto"`，提供重置、查询及适用的展开/收起。
3. 显式保留刷新、密度和列设置三图标。`toolBarRender={() => []}`，不得设为 `false`；列设置须支持显隐和拖拽排序，宽表按业务需要支持固定列。
4. 每列声明稳定 `width`；编号、时间、状态等常用列保持一致口径。操作列固定在右侧、宽度统一，查看/编辑/删除及状态动作的顺序和危险色遵循 React 列表标准。
5. 新增、导入、批量操作等页面级动作放在 `ListPage.Title.extra`；不得挤入 ProTable 内部工具栏。空、错、加载使用 `V2States`，接口异常不得伪装成空数据。

普通 antd `Table` 只适用于看板内部摘要表、表单明细表或无分页/无 CRUD 工具栏的非列表型局部表格；不得用于规避列表页标准。

## 4. 新增、编辑、详情与流程页（强制）

- 原 Drawer 或宽 Modal 中的新增、编辑、详情、主从和流程业务，统一改为 Main/门户框架内的子应用路由独立页。列表通过 `navigate(route)` 进入，页面按 route id 重新取数，支持刷新和深链。
- 独立页使用画布背景，利用 Main 可用宽度，左右安全边距 5–15px；顶部包含面包屑、标题、说明和右上角操作区，主体按业务分组使用 `SectionCard`，长页面按需使用 `StepAnchorNav`。
- 新增页右上角为 `[返回][保存]`；编辑页为 `[返回][删除][保存]`；详情页为 `[返回]+已授权业务动作`。返回采用 `navigate(-1)` 或明确来源路由；不得同时提供同义“返回”和“关闭”。
- 保存成功返回来源列表并触发刷新；未保存返回、并发冲突、加载错误和无权限必须有明确反馈。不得只依赖 Drawer 内存或 `location.state` 维持页面数据。
- 确认、提示、导入以及无明细且不超过 10 个字段的短事务可保留普通 Modal；不得把覆盖式全屏 Modal 当作独立页。

## 5. 上传与导入（强制）

- 所有附件上传统一使用 `FileUploader`，所有 Excel/批量导入统一使用 `ImportModal`；底层必须是 antd `Upload.Dragger`，同时支持拖拽和点选。
- 禁止裸 `<input type="file">`、只点选的 plain `<Upload>` 或页面自造上传器。组件必须覆盖文件类型、大小、数量、上传状态、删除、下载/预览和错误反馈。
- `FileUploader` 按场景使用 `action`、`defer` 或 `base64` 数据流；受控值必须在顶层保留 `fileId`。`ImportModal` 必须提供模板、上传、解析/预览、逐行错误和成功后的刷新语义。

## 6. 验收门

- 静态检查：列表页具有 `ListPage`、`ProTable` 字段过滤、三图标和统一操作列；业务 Drawer/宽 Modal 为独立路由；上传入口只使用统一 Dragger 组件。
- 行为检查：从真实门户菜单进入；查询/重置/分页/列设置、CRUD、返回、刷新恢复、上传成功和失败均可操作；关键列使用真实数据且不为空或 `-`。
- 视觉检查：桌面及适用移动端在 100%、125%、150% 缩放下无重叠、截断和无效大留白；固定列、横向滚动和操作区可用。
- 工程检查：build/test 通过，外网字体请求为零，主题 token 无页面级硬编码。任一适用项未覆盖时，页面不得标记为 UI V2 完成。

## 7. 迁移要求

迁移项目必须把“源功能等价”和“目标 UI V2 符合性”作为同一迁移单元的两个并列合同：源页面清单保证不漏业务，本文及其列表细则保证目标形态。两者同批编码、同批提交、同批 E2E；任何一项未通过，迁移状态只能是 `partial`、`pending` 或 `blocked`，不得记为 `complete`。
