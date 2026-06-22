# Frontend UI V2(Atlas)标准 — 业务页三范式

> 状态:正式(2026-06-12)。来源:ADR-032(V2 Atlas 设计语言)+ HC 项目首建落地(spec `HC/docs/superpowers/specs/2026-06-11-hcv2-ui-v2-upgrade`,A/B/C 三 Phase 全量实施,~40 页改造实战沉淀)。
> 参考实现(真理源):`engineering-standards/references/v2-components/`(SectionCard / StepAnchorNav / InlineDetailTable / V2States / **FileUploader / ImportModal**(+ FileUploader.css)+ v2-components.css + v2-tokens.css)。消费仓 copy 落地,CR 用 `diff -r` 比对,禁私有 npm 源。
> 适用栈:React 18 + antd 5 + @ant-design/pro-components 2.8.x(craco/CRA 或同类)。

## 1. Token 层(L1,全量换肤)

- 基线 = `v2-tokens.css`(CSS 变量:品牌靛蓝 `--v2-brand #1e4d8c` / 画布 `--v2-canvas #f5f6f8` / 语义色 ok·warn·err·info / 圆角 r-s·m·l / 阴影 sh-1·2·pop / 字族)。入口 import,层叠到 `:root`。
- antd 5 `ConfigProvider` token 映射(两端字段级一致):`colorPrimary/colorLink #1e4d8c`、`colorSuccess #0f9d6e`、`colorWarning #c2740c`、`colorError #d14343`、`colorInfo #2563eb`、`borderRadius 7`、`colorBgLayout #f5f6f8`、`colorText #14233b`、`fontFamily`(见 §2)。
- **回滚开关**:theme 文件保留 LEGACY 常量 + 单变量(`V2_ENABLED`)切换;注意 less modifyVars 经构建期注入,**翻开关后需 rebuild**(token 层 runtime 即时)— 回滚 SOP 必须写明。
- 品牌色派生进 `rgba()` 用 `--v2-brand-rgb: 30, 77, 140`;hover 变体 `--v2-brand-soft-2`。禁页面级 hardcode 色值,既有 hardcode 在换肤批清剿(`grep` 旧主色 0 残留作机器门)。

## 2. 字体

- 标题 `--v2-font-heading`:**Sora**(600/700);单号/数字列 `--v2-font-mono`:**JetBrains Mono**(400/500)。latin subset woff2 本地打包(@fontsource 提取,合计 <80KB),`font-display: swap`,**禁外网 CDN**(`grep googleapis` 0 命中作门)。
- 中文正文按 ADR-032 §2 **默认 Noto Sans SC**;**内网/零体积部署降级备选**(HC 方案):不打包中文字体,系统栈 `"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif` — 降级备选不覆盖默认。
- 数字列等宽:`.v2-num { font-variant-numeric: tabular-nums }`。

## 3. 四组件 API(参考实现为准)

| 组件 | 职责 | 关键 props |
|---|---|---|
| `SectionCard` | 编号圆徽章段头 + 白卡片分段容器 | `no` / `title` / `desc` / `extra` / `id`(锚点) |
| `StepAnchorNav` | sticky 编号锚点条(scroll-spy + 平滑滚动,可跳读非强制向导) | `items[{key,title,targetId}]`(**须 useMemo/模块级常量**)/ `offsetTop` |
| `InlineDetailTable` | EditableProTable 薄封装(整宽虚线「+ 添加行」) | 透传 + `addText` / `recordCreatorProps` |
| `V2States` | 三态(空/错误/加载骨架),禁白屏 | `type` / `title` / `description` / `action` / `rows` |
| `FileUploader` | 统一附件上传(拖拽+点选,移植 SYSV2 MDM VUpload)— 见 §3.1 | `mode('compact'\|'dragger')` / `dataFlow('action'\|'defer'\|'base64')` / `accept` / `maxSize` / `maxCount` / `multiple` / `value` / `onChange` / `enableImagePreview` |
| `ImportModal` | 统一 Excel 导入(下载模板→拖拽/点选上传→后端解析或前端 XLSX)— 见 §3.1 | `open` / `templateUrl` / `parseMode('backend'\|'frontend')` / `onSuccess` / `onClose` |

## 3.1 附件上传 / 导入标准(强制 — 拖拽+点选,移植 SYSV2 MDM VUpload)

> 来源:涛哥 2026-06-22 拍板锁定(HC 项目实战:plain `<Upload>` 只点选退化被抓)。**所有附件上传 / 文件导入入口默认走统一组件,禁退化为 HC 老栈的「只点选 input/button」。**

- **铁律(拖拽+点选)**:任何附件上传 / 导入入口**必须同时支持拖拽(drag-drop)+ 点选(click)**,底座用 antd `Upload.Dragger`(原生双支持),**禁** plain `<Upload><Button>选择文件</Button></Upload>`(只点选)或裸 `<input type="file">`。视觉/交互移植参考 **SYSV2 MDM VUpload**。
- **统一组件,禁各页自造**:
  - 附件上传 → `FileUploader`(`components/upload/FileUploader.jsx`)。形态 `mode`:`compact`(行内,文案「点击或拖拽上传」)/ `dragger`(大拖拽区,文案「拖拽文件到此处,或 点击选择」)。
  - Excel 导入 → `ImportModal`(`components/upload/ImportModal.jsx`,内含 Dragger「点击或拖拽 Excel 文件到此区域」+ 模板下载 + 解析预览)。
  - 自造 plain Upload = 退化,CR 必拦(grep `<Upload\b`(非 `Upload.Dragger`)+ `type="file"` 作机器门)。
- **三数据流(FileUploader.dataFlow)**:`action`(antd 直传 ExtendDoc)/ `defer`(暂存原始 File 交父组件提交)/ `base64`(转码交父提交)。按场景选,默认 `action`。
- **能力基线(移植 VUpload)**:文件卡片(类型彩标 / 图片缩略图)+ 删除 + 下载预览 + 体积校验(`maxSize` MB)+ `maxCount`/`multiple` 约束 + 卸载释放本地 blob URL 防泄漏。
- **value 形状(承 §7 坑)**:受控 `value` 项须含**顶层** `fileId`(`{uid,name,fileId,url?,status,...}`),不止 `.response.fileId`,否则已传文件下载链接失效。
- **parity / 迁移红线**:迁移 HC 页面时,若 hcv2 已有上传增强(拖拽+点选),**保留增强不照搬 HC 退化**(详 legacy-migration-playbook「增强保留」原则)。

## 4. 表单范式(L2)— 形态判定决策树(实战沉淀,按序判定)

1. **List 页** → 保 List 标准骨架,**禁重排**(仅吃 token)。
2. **简单 Form(≤10 字段且无明细表)** → 保原 Modal/Drawer 骨架,仅吃 token,禁加装饰段。
3. **单调用方表单**(列表行点开,数据自给:有 get-by-id 或可 state 传递)→ **整页路由化**:删 Drawer 壳 → 页面容器(canvas 背景 + max-width ~1200 居中 + 面包屑/标题/返回/保存)+ SectionCard 编号分段 + 顶部 StepAnchorNav + V2States 三态;入口改 navigate,返回 `navigate(-1)`(列表重挂载自动刷新 — **提交后列表回刷依赖重挂载,行为差异需 UAT 确认**)。
4. **多调用方共享 Drawer / 嵌套 Drawer 链 / 新建流传整对象无 id** → **禁路由化**(会断回调链/快照驱动/嵌套闭环),改 **Drawer 内分段**:Drawer 体内套 SectionCard 编号段;**不加 StepAnchorNav**(Drawer 内 window scroll-spy 失效 = 死控件);调用方契约(`item/open/onCancel/onReload`)零改动。
5. **多 Tab 大页(每 Tab 独立 save)** → 原地分段:保留 Tabs 与各 save 模型,Tab 内容拆 SectionCard;最长 Tab 可加 StepAnchorNav(锚点只在该 Tab 内渲染,防点锚点滚到不存在的 id)。

**铁律**:0 字段口径变更(payload 组装/字段 name/columns dataIndex/endpoint+HTTP 动词与改造前逐项一致,作 CR 机器门);只动布局容器层。

## 5. 详情范式(L3a)

- 只读页内容块按既有分组套 `SectionCard`(编号 1..N);保持现有形态(Drawer 子组件留壳)。
- **嵌套卫生**:被父级 import 的 detail 组件**不自包 SectionCard**(由调用方分段),先 grep 消费方再决定 — 防双重/三重嵌套段头。
- 禁自创段/占位段(ADR-032 字段要"活",禁占位符)。

## 6. 硬验收(ADR-032 两条 + 实战补充)

1. 字段要"活":真实业务字段,禁占位符冒充(CR 必查)。
2. 响应式 + 浏览器缩放 **125%/150%** 无重影错位(sticky 锚点条重点风险面,E2E 加 `document.body.style.zoom` 断言)。
3. 两仓/多端同构:组件目录 `diff -r` 退出码 0;ConfigProvider token 集字段级一致。
4. build 0 error + 字体体积门 + 外网请求 0。

## 7. 高频坑清单(HC 实战 CR 抓出,新项目必读)

| 坑 | 症状 | 规避 |
|---|---|---|
| **回填时序**(2×CRITICAL+1×HIGH) | loading 期 early-return(V2States 替换表单)时 `formref.current` 为 null,`?.setFieldsValue` 被静默吞 → 编辑态字段全空 | 回填放表单挂载后 effect:`useEffect(() => { if (!loading && data) formref.current?.setFieldsValue(data) }, [loading, data])` |
| **明细数据源误读**(CRITICAL) | 接口返回扁平行数组被误当 `json[0].entries` → 明细永空 | 改造前先实证响应形状(读后端投影/同源消费方),全量数组单独 state |
| FileUploader value 形状(HIGH) | 简化传裸 state 丢顶层 `fileId` → 已传文件下载链接失效 | value 项须含顶层 `fileId`(不止 `.response.fileId`) |
| 锚点数组引用不稳(MED) | items 每 render 新数组 → 滚动监听反复重绑 | useMemo 或模块级常量 |
| 占位死段(ADR-032 违规) | agent 凭空加「预留扩展」空段 | 派单 prompt 明令禁止 + CR 必查 |
| 旧色 hardcode 残留 | 页面 inline style 写死旧主色 | 换肤批全仓 grep 清剿 → `var(--v2-brand)` 等 |
| 共享页样式隐式耦合(LOW) | 整页容器类(如 `quote-edit-page`)跨模块复用但不 import 其 css | 提取共享 `v2-edit-page.css` 显式 import(或接受先例并登记) |

## 8. 实施编排建议(多 agent 并行)

- 表单重排派 frontend-developer(HC 实战:qwen 表单重排 2 HIGH 前科);只读卡片化可派 qwen(prompt 带「禁自创段/禁自包壳」判例)。
- 路由文件(App.js / react-router.js)由编排方统一落,agent 只报需求 — 防多 agent 写冲突与撞名(先 grep 既有路由)。
- 每波:前置实证(单/多调用方+SKIP 判定)→ 落盘 → 统一 build → CR(0 字段口径作 CRITICAL 线)→ commit → 冒烟(渲染+分段+缩放断言)。
