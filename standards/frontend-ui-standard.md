# 前端 UI 设计标准 / Frontend UI Design Standard

> **⚠ 2026-05-21 降级为 V1 备用基线**:公司前端 UI 已确立 **V2 统一工程标准「Atlas」(ADR-032)** 为新默认;本文档(V1)保留作备用基线 —— 存量未重构页面继续可用,特殊场景(快速交付/第三方嵌入)可降级用 V1。新建/重构/迁移默认套 V2。效果图 `SYSV2/docs/mockups/v2/`。
>
> **2026-05-05 涛哥拍板,跨前端通用设计标准**
> **2026-05-09 涛哥校准**:适用范围精确限定 **List Page**(含 Table + Toolbar + Pagination 的 CRUD Index Page),非列表型页面只做技术栈迁移 + 功能骨架等价

## 适用范围(精确判定)

### ✅ 强制套用 — List Page(列表型页面)

也称 Index Page / Master List / Resource Grid,**同时满足**:
1. 含表格组件(`ProTable` / `Table` / `DataGrid`)
2. 含工具栏(Toolbar with action buttons,如新增/导出/批量操作)
3. 含分页(Pagination)

通常是 **CRUD Index Page**(`material/index.jsx` / `supplier/index.jsx` / `HREmp/index.jsx`)。

### ❌ 不适用 — 非列表型页面

只做技术栈迁移(craco→Vite / antd 4→5 / class→hooks)+ 功能骨架等价(详 ADR-014 + memory `feedback_skeleton_equivalent_migration.md`),**不强制**套用本标准:

| 页面类型(术语) | 特征 | 示例 |
|---|---|---|
| **Form Page**(Single Form / Edit Route / Detail Route / Master-Detail Form) | Main框架内单/多form路由页；短事务可用Modal | `material/edit.jsx` / `supplier/edit.jsx` |
| **Dashboard**(KPI Board / Analytics Page) | 卡片网格 + 图表 + 数据可视化 | `Dashboard/index.jsx` / `Workbench` |
| **Wizard**(Multi-step Flow / Stepper Page) | 多步骤 Step + Next/Prev | 数据导入向导 |
| **Upload Page**(File Upload / Import / Export) | Dropzone + FileList + Progress | `BasicDataImport/index.jsx` |
| **Settings Page**(Configuration Page) | 左侧 Tab + 右侧表单,无 Table | `Security/SysParams` |

**设计标杆**:`AI.REACT.SYS.3/src/views/HREmp/index.jsx`(员工档案页 — List Page 标准实现)

新建 / 重构 / 迁移**列表页**默认套用，不需要单独spec拍板；问题按实际业务影响定级，纯视觉约定偏差不自动判HIGH。

## 1. 技术栈基线

- **核心库**:`antd 5` + `@ant-design/pro-components`(ProTable / ProForm / ProDescriptions)
- **国际化**:`react-i18next` + `useTranslation()` + 业务 key 命名 `<page>.<field>`(如 `t("hrEmp.empTab")`);**范围边界**详见 [`frontend-i18n-standard.md`](frontend-i18n-standard.md)(2026-05-10 涛哥拍板:平台 UI 必双语 / 用户输入数据不翻译 / 客户自定义兜底中文)
- **路由**:`react-router-dom` + 路由配置中央化(MDM 现代化后参照 `routes.config.js` 模式)
- **❌ 不引入私有库**(`@org/private-antd-components` 仅 SYS.3 历史依赖,新前端 / 重构前端**禁引**;SYS.3 后续按独立 spec 迁出)

## 2. 页面外壳 / Page Shell

**`ListPage` 四段式平铺容器**(参照 `AI.REACT.SYS.3/src/components/ListPage/`):

```jsx
<ListPage>
  <ListPage.Title title="..." subtitle="..." extra={<Space>...</Space>} />
  <ListPage.Filters>{/* 外置过滤组件,可选 */}</ListPage.Filters>
  <ListPage.Toolbar search={...} actions={...} />
  <ListPage.Table>
    <AutoHeightProTable ... />
  </ListPage.Table>
</ListPage>
```

- `Title.title` = 主标题(i18n key);`Title.subtitle` = 业务定位副标题
- `Title.extra` = 页头操作按钮槽(`<Space>` + `<Button icon={...}>`,新增 / 导入 / 等)
- 不嵌套 `Card` / `Spin` / `Collapse` 等多层壳,薄封装消除嵌套深度

## 3. 过滤组件 / Filter Components

- **优先策略**:ProTable 内置 search 表单(列定义 `renderFormItem`),不自建外置 Form
- **下拉**:`<Select allowClear placeholder showSearch optionFilterProp="label" loading options={[{value, label}]} />`
- **级联**:多级联动通过 `useState` + `useMemo` + `setSearchXxx(v); tableRef.current?.reloadAndRest?.()`(典例:集团 → 公司 → 工厂)
- **search 容器**:`search={{ labelWidth: "auto" }}` 标签宽度自适应
- **列定义控制**:`order` 控筛选项显示顺序;非筛选列 `search: false`;`fieldProps` 传 `placeholder` 等 antd props

## 4. 列表样式 / Table Style

- **组件**:`<AutoHeightProTable customOffsetHeight={baseOffsetHeight + N} actionRef={tableRef} />`(自动高度,见第 12 段实现)
- **分页**:`pagination={defaultPaginationProps}` — 全局 `showSizeChanger: true` / `defaultPageSize: 20` / `pageSizeOptions: ['10','20','50','100']`(`@/config/commonSettings`)
- **rowKey**:函数式 + 大小写兼容 `rowKey={(r) => r.empId ?? r.EmpId}`
- **params**:全局上下文参数 `params={{ activeOrgCode }}`(从 `useOrgContext()` 拿)
- **request 函数**:try-catch + 错误 toast + 兜底返回 `{ data: [], success: true, total: 0 }`(避免空数据 UI 崩)
- **列定义结构**:`{ title, dataIndex, width, order, search, fieldProps, render }`

## 5. 工具栏 / Toolbar(强制三图标)

```jsx
toolBarRender={() => []}  // 空数组,不是 false(false 会禁掉整个 toolbar 含 options 三图标)
options={{
  reload: true,
  density: true,
  setting: { draggable: true, checkable: true },
  fullScreen: false,
}}
```

- **必加中文注释**说明"为什么是 `() => []` 不是 `false`"(防 AI 误改回);详见 `docs/superpowers/specs/2026-05-04-protable-options-toolbar-icons/spec.md`
- 顶部页头操作按钮(新增 / 导入 / 批量删除等)放 `<ListPage.Title extra>` 而非 `toolBarRender`

## 6. 字段大小写 + 空值

- **字段以实际契约为准**：先核对DTO、响应投影/映射和实际JSON。只有已证实存在两种历史响应时，才在明确适配边界兼容PascalCase/camelCase；不对所有字段盲目追加`??`掩盖契约错误。
- **空值显示**：已确认允许为空的业务值统一显示`—`；字段不存在、映射失败或实体关键字段全空是验收失败，不能用占位符包装成正常空态。
- **字段/按钮变更**：执行[ADR-008字段级影响闭环](../decisions/ADR-008-end-to-end-8-checks.md)，包含兄弟页面、DTO/映射、编辑保留及按钮路由；布局精简不能默认为数据契约精简。

## 7. 状态徽章 / Status Badge

- 用 `<Tag color="processing|success|warning|error|default">` 语义颜色
- 颜色语义对照:`processing`=进行中(蓝)/ `success`=成功(绿)/ `warning`=警告(橙)/ `error`=错误(红)/ `default`=中性(灰)

## 8. 主题 / CSS 变量

- 颜色用 `var(--sys-text-primary)` / `var(--sys-text-secondary)` / `var(--sys-text-tertiary)` 等 token,**不 hardcode 颜色值**
- 自动支持 dark/light 主题切换

## 9. 新增 / 编辑 / 详情路由页

- 原Drawer或宽Modal承载的新增、编辑、详情和流程页，统一改为当前Main/门户框架内的子应用路由独立页；不打开新浏览器窗口或新页签，不使用遮罩、侧滑Drawer或覆盖式全屏Modal伪装独立页。
- 页面样式以V2询价单为基准：浅色canvas、占满Main可用内容区且左右仅保留5–15px安全边距（宽表单建议8–12px）、顶部面包屑+业务标题+右上角操作区、需要时使用StepAnchorNav，主体按SectionCard编号分区；表单/明细页不设固定最大宽度，内容跟随页面滚动，不再维护弹窗内层滚动。
- 新增页右上角固定`[返回][保存]`；从列表进入的编辑页固定`[返回][删除][保存]`，删除必须有二次确认；只读详情页为`[返回]+该单据已授权业务动作`。不在“返回”旁重复提供同义“关闭”。
- 保存/删除成功后返回来源列表并刷新；直接刷新或深链访问必须可以按route id重新取数，不得只依赖`location.state`的临时行对象。未保存内容的返回拦截与浏览器历史语义保持一致。
- 确认、提示、导入及无明细的短事务仍可使用普通`<Modal destroyOnClose width={640}>`，不得把普通确认弹窗误扩成业务页。
- `<Spin spinning={loading}>` 包内容载入态
- `<Alert type="info" showIcon style={{marginBottom: 12}}>` 顶部提示
- 字段联动 `Form.useWatch("fieldName", form)` + `useMemo` 派生选项
- `onCancel` + `onOk` 而非 `footer` 自定义(除非有特殊业务)

## 10. 反馈 / Feedback

- **message 取法**:`const { message } = App.useApp();` + `messageRef = useRef(message)`(antd 5 推荐,响应 `ConfigProvider`)
- **toast**:操作成功 `messageRef.current.success("...")` / 失败 `.error("...")` / 警告 `.warning("...")`
- **删除二次确认**:`<Popconfirm title="..." onConfirm={...}>` 包 `<Button>` 操作列内
- **错误兜底**:request 函数 catch + 显示 `messageRef.current.error(typeof msg === "string" ? msg : "操作失败")` + 不抛上层

## 11. 操作列 / Action Column

- 列宽 `width: 360`(根据按钮数量调整,3-5 按钮约 300-400)
- 内含 `<Space>` 间距 + `<Button type="link" size="small">` 链接式按钮 + `<Popconfirm>` 包危险操作
- `search: false`(操作列不参与筛选)

## 12. AutoHeightProTable 自包含实现(替代私有库)

**背景**:SYS.3 历史使用 `@org/private-antd-components` 私有库的 `PrivateProTableAutoHeight` 自动高度组件。新前端 / 重构前端**不引私有库**,改用项目自包含实现。

**实现规范**:在每个前端项目 `src/components/AutoHeightProTable.jsx` 提供等价封装,核心逻辑(参照 `PrivateProTableAutoHeight` 源码 130 行):

```jsx
/**
 * AutoHeightProTable — 项目自包含的 ProTable 自动高度封装
 * 替代私有库 @org/private-antd-components 的 PrivateProTableAutoHeight
 *
 * 核心逻辑(对齐 SYS.3 设计标杆):
 * - 容器外层 div 高度 = calc(100vh - customOffsetHeight)
 * - ProTable scroll.y 动态计算 = 容器高 - searchHeight - toolbarHeight - headerHeight - paginationHeight(40) - 16
 * - 监听 window resize + search 表单 onCollapse,debounce 300ms 重算
 * - 最小高度 200px 兜底
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProTable } from '@ant-design/pro-components';
import { debounce } from 'lodash-es'; // 或自实现 debounce,避免 lodash 依赖

const AutoHeightProTable = ({ search, scroll, customOffsetHeight = 152, ...props }) => {
  const containerRef = useRef(null);
  const [scrollY, setScrollY] = useState(0);
  const lastCalculatedRef = useRef({});

  const getElementTotalHeight = useCallback((el) => {
    if (!el) return 0;
    const styles = window.getComputedStyle(el);
    return el.offsetHeight + (parseFloat(styles.marginTop) || 0) + (parseFloat(styles.marginBottom) || 0);
  }, []);

  const calculateHeight = useCallback(() => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const searchHeight = getElementTotalHeight(containerRef.current.querySelector('.ant-pro-table-search'));
    const toolbarHeight = getElementTotalHeight(containerRef.current.querySelector('.ant-pro-table-list-toolbar'));
    const headerHeight = getElementTotalHeight(containerRef.current.querySelector('.ant-table-thead'));
    const hasPagination = props.pagination !== false;
    const snapshot = { containerHeight, searchHeight, toolbarHeight, headerHeight, hasPagination };
    if (JSON.stringify(snapshot) === JSON.stringify(lastCalculatedRef.current)) return;
    lastCalculatedRef.current = snapshot;
    const paginationHeight = hasPagination ? 40 : 0;
    const available = containerHeight - searchHeight - headerHeight - toolbarHeight - paginationHeight - 16;
    setScrollY(Math.max(available, 200));
  }, [getElementTotalHeight, props.pagination]);

  const debouncedCalc = useCallback(debounce(calculateHeight, 300), [calculateHeight]);

  useEffect(() => {
    const timer = setTimeout(debouncedCalc, 100);
    window.addEventListener('resize', debouncedCalc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', debouncedCalc);
    };
  }, [debouncedCalc]);

  const mergedSearch = search === false ? false : { onCollapse: calculateHeight, ...search };
  const mergedScroll = { y: scrollY, ...scroll };

  return (
    <div ref={containerRef} style={{ height: `calc(100vh - ${customOffsetHeight}px)` }}>
      <ProTable scroll={mergedScroll} search={mergedSearch} {...props} />
    </div>
  );
};

export default AutoHeightProTable;
```

**全局偏移常量**(放 `src/config/commonSettings.js`):

```js
// 框架顶部固定高度(导航 + breadcrumb + 卡片边距等),根据各前端实际布局调整
export const baseOffsetHeight = 152;
export const drawerTitleHeight = 56;

export const defaultPaginationProps = {
  showSizeChanger: true,
  defaultPageSize: 20,
  pageSizeOptions: ['10', '20', '50', '100'],
};
```

**用法**(完全对齐 SYS.3 标杆):

```jsx
import AutoHeightProTable from '@/components/AutoHeightProTable';
import { baseOffsetHeight, defaultPaginationProps } from '@/config/commonSettings';

<AutoHeightProTable
  customOffsetHeight={baseOffsetHeight + 100}
  actionRef={tableRef}
  pagination={defaultPaginationProps}
  rowKey={(r) => r.empId ?? r.EmpId}
  search={{ labelWidth: "auto" }}
  toolBarRender={() => []}
  options={{ reload: true, density: true, setting: { draggable: true, checkable: true }, fullScreen: false }}
  request={async (params) => { /* ... */ }}
  columns={columns}
/>
```

**SYS.3 迁出路径**(独立 spec 候选,登记 backlog):

SYS.3 当前 60 处 `PrivateProTableAutoHeight` 用法可在后续独立 spec `2026-XX-XX-sys3-remove-private-lib` 批量替换为同一实现,届时 `@org/private-antd-components` 私有库可彻底从 SYSV2 体系移除。

## 不变量(违反即 review reject)

- ❌ 不用 `toolBarRender={false}`(禁三图标)
- ❌ 不 hardcode 颜色值(必须用 CSS 变量)
- ❌ 不嵌套 `Card`/`Collapse` 等多层壳(用 `ListPage` 平铺)
- ❌ 不直接用静态 `import { message } from "antd"`(用 `App.useApp()`)
- ❌ 不猜字段大小写或盲加`??`兜底；依据§6核对实际契约，历史兼容必须有证据
- ❌ 不用 `react-cookie` / `redux` 等老依赖维护新页面状态(用 `useState` / `useContext` / `useOrgContext`)
- ❌ **不引入 `@org/private-antd-components` 私有库**(新前端 / 重构前端;SYS.3 后续按独立 spec 迁出)
- ✅ 加中文注释说明非典型实现(如 `toolBarRender={() => []}` 的由来)
- ✅ 列表页设计标杆 = `AI.REACT.SYS.3/src/views/HREmp/index.jsx`,任何 PR 偏离标杆需在 review 中说明理由

## 适用扩展(后续按需扩 spec)

- 路由独立页的统一页头、返回层级和未保存确认组件
- Form 验证错误展示(目前 antd Form `rules` 默认,可扩自定义错误样式)
- 批量操作 Bar(选中后底部浮起操作栏)
- 空态 Empty 标准(目前 ProTable 默认,可扩自定义插画)

每条扩展由独立 UI spec 落地,本基线不强制。

## 历史溯源

- 2026-05-04 SYS.3 列表页 ProTable 工具栏三图标统一(`docs/superpowers/specs/2026-05-04-protable-options-toolbar-icons/`,A 档 20 标杆页落地)
- 2026-05-05 涛哥拍板升为跨前端通用规则,本文档诞生
- 2026-05-05 涛哥拍板**不用私有库** `@org/private-antd-components`,新增 §12 `AutoHeightProTable` 自包含实现规范
