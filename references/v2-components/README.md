# V2(Atlas)业务范式组件参考实现

> 真理源。来源:HC 项目首建(spec `HC/docs/superpowers/specs/2026-06-11-hcv2-ui-v2-upgrade`,B5 涛哥拍板定稿 2026-06-12),依据 ADR-032 V2 Atlas 设计语言 + `SYSV2/docs/mockups/v2/v2-form.html`、`v2-states.html` 设计基准。
> 消费方(copy 落地,CR 用 `diff -r` 比对一致性,禁私有 npm 源):HC srmctest / HC srmcolud `src/components/v2/`。改组件必须同 commit 双仓 + 回填本目录。

## 组件清单

| 组件 | 职责 | 关键 props |
|---|---|---|
| `SectionCard` | 编号圆徽章段头 + 白卡片分段容器 | `no` / `title` / `desc` / `extra` / `id`(锚点) |
| `StepAnchorNav` | sticky 编号步骤锚点条(平滑滚动 + scroll-spy 高亮,可跳读非强制向导) | `items[{key,title,targetId}]`(**须 useMemo 稳定引用**)/ `offsetTop` |
| `InlineDetailTable` | EditableProTable 薄封装:行内编辑明细 + 整宽虚线「+ 添加行」 | 透传 EditableProTable;`addText` / `recordCreatorProps` |
| `V2States` | 三态(空/错误/加载骨架),禁白屏 | `type="empty\|error\|loading"` / `title` / `description` / `action` / `rows` |

## 依赖

- antd 5 + @ant-design/pro-components 2.8.x + @ant-design/icons;React 18;.jsx(无 TS)。
- **token 前置**:消费仓须先落 `v2-tokens.css`(本目录附 HC 版副本;组件样式全引 `--v2-*` 变量,0 hardcode 色值)。
- 字体:标题 Sora / 等宽 JetBrains Mono(latin woff2 本地打包);中文字体按 ADR-032 §2 默认 Noto Sans SC,**HC 内网部署用系统字体栈降级备选**(详 ADR-032 修订)。

## 已知契约约束

- StepAnchorNav `items` 每 render 新数组会重绑滚动监听(非泄漏但抖动)— 调用方 useMemo。
- 整页表单接入回填时序:loading 期若用 V2States 替换表单(early return),`setFieldsValue` 必须放表单挂载后的 effect(`[loading, data]` 依赖),否则被静默吞(HC B2/B3 试点 CR 实证)。
- sticky 锚点条:祖先链禁 `transform`/`overflow:hidden`;z-index 30(低于 antd 浮层 1000)。
