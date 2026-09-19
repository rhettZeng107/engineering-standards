# V2(Atlas)业务范式组件参考实现

> 真理源。来源:HC 项目首建(spec `HC/docs/superpowers/specs/2026-06-11-hcv2-ui-v2-upgrade`,B5 涛哥拍板定稿 2026-06-12),依据 ADR-032 V2 Atlas 设计语言 + `SYSV2/docs/mockups/v2/v2-form.html`、`v2-states.html` 设计基准。
> 消费方(copy 落地,CR 用 `diff -r` 比对一致性,禁私有 npm 源):HC srmctest / HC srmcolud `src/components/v2/`。改组件必须同 commit 双仓 + 回填本目录。

## 组件清单

| 组件 | 职责 | 关键 props |
|---|---|---|
| `SectionCard` | 编号圆徽章段头 + 白卡片分段容器 | `no` / `title` / `desc` / `extra` / `id`(锚点) |
| `StepAnchorNav` | sticky 编号步骤锚点条(平滑滚动 + scroll-spy 高亮,可跳读非强制向导) | `items[{key,title,targetId}]`(**须 useMemo 稳定引用**)/ `offsetTop` |
| `InlineDetailTable` | 天然 `1:N` 业务单据的物料明细表；EditableProTable 薄封装，支持行内编辑 + 整宽虚线「+ 添加行」 | 透传 EditableProTable；`rowKey` / `value` / `onChange` / `editable` / `addText` / `recordCreatorProps` |
| `V2States` | 三态(空/错误/加载骨架),禁白屏 | `type="empty\|error\|loading"` / `title` / `description` / `action` / `rows` |

## InlineDetailTable 适用契约

- 询价单、采购申请、采购订单、发货计划、发货单等主单天然允许多条同构物料明细时默认使用；判断依据是领域模型 `1:N`，不是列表批量选择行为或当前明细数量。
- 新增、编辑页一行对应一条物料业务记录；即使当前只有一条也保持明细表和添加能力。详情页复用相同列语义、列顺序和行粒度，只切换为只读状态。
- 禁止为每条物料复制一整块卡片或表单并纵向堆叠，也禁止逐条重复标题、删除区、说明/提示框和公共字段。公共字段放表格列；少量条件字段使用动态列、单行展开或当前选中行的单一辅助编辑区。
- 调用方必须提供稳定 `rowKey`：既有行使用业务明细 ID，新增行使用稳定临时 key。受控 `value/onChange` 不得因校验、分页或重渲染丢行。
- 默认提供添加和删除；复制、模板下载、批量导入和行附件按业务启用。导入、附件分别复用 `ImportModal`、`FileUploader`，不在表格内另造上传实现。
- 行校验必须显示到具体行/单元格并保留失败前输入；整单保存后重新读取并核对明细数量、标识和关键字段。重复物料、默认值、既有行删除及部分成功均服从业务契约，不由组件自行推断。
- 列宽、固定列和横向滚动由调用方按字段集声明；不得为了消除横向滚动而隐藏业务字段，或在桌面、缩放和窄屏适配中改回多卡片堆叠。

## 依赖

- antd 5 + @ant-design/pro-components 2.8.x + @ant-design/icons;React 18;.jsx(无 TS)。
- **token 前置**:消费仓须先落 `v2-tokens.css`(本目录附 HC 版副本;组件样式全引 `--v2-*` 变量,0 hardcode 色值)。
- 字体:标题 Sora / 等宽 JetBrains Mono(latin woff2 本地打包);中文字体按 ADR-032 §2 默认 Noto Sans SC,**HC 内网部署用系统字体栈降级备选**(详 ADR-032 修订)。

## 已知契约约束

- InlineDetailTable 只固化视觉和 `editable.type="multiple"` 默认值，不替调用方生成业务 ID、校验规则、保存事务或导入合并策略。
- StepAnchorNav `items` 每 render 新数组会重绑滚动监听(非泄漏但抖动)— 调用方 useMemo。
- 整页表单接入回填时序:loading 期若用 V2States 替换表单(early return),`setFieldsValue` 必须放表单挂载后的 effect(`[loading, data]` 依赖),否则被静默吞(HC B2/B3 试点 CR 实证)。
- sticky 锚点条:祖先链禁 `transform`/`overflow:hidden`;z-index 30(低于 antd 浮层 1000)。
