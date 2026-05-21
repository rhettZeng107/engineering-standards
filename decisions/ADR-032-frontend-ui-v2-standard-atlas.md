# ADR-032: 公司前端 UI V2 统一工程标准(Atlas)

- **Status**: Accepted
- **Date**: 2026-05-21
- **Decider**: 涛哥
- **Scope**: 跨项目(公司全线前端工程标准:SYSV2 = SYS.3 / BP / AuditPortal / MDM,以及 SRM / MES / WMS / EAM / TPM 计划)

---

## Context(背景 / 为什么需要决策)

### 触发场景

2026-05-21 BP 业务门户子应用 UI 重构讨论。涛哥定调:现行前端 UI 强制标准(`engineering-standards/standards/frontend-ui-standard.md` = antd 5 + pro-components + ListPage 四段式 + AutoHeightProTable + 工具栏三图标)**观感偏 antd 默认、模板感重**,要求重构一套**更现代、更高级、面向操作水平不一最终用户、导航清晰**的统一 UI 标准 V2,且**作为公司跨项目工程标准**。

### 当前状态实证

| # | 现状 | 实证锚点 |
|---|---|---|
| 1 | V1 UI 标准 = antd 默认观感,强约束四段式 / AutoHeightProTable / 三图标 | `engineering-standards/standards/frontend-ui-standard.md`(注:**非** ADR-023,ADR-023 是 i18n/Auth/hostMap/web.config 基建标准) |
| 2 | 多字段录入靠抽屉「一拉到底」,操作员体验差 | 涛哥反馈 + MDM `supplier/suppliersubmajor.jsx` 多 tab 长表单 |
| 3 | 各前端无统一「门户 shell + 业务页」设计语言,视觉碎片化 | BP `BpLayout.jsx`(深蓝 Sider)vs MDM 子应用各自样式 |

### 不做决策的代价

各应用 UI 各自演进,迁移改造(SRM/MES/WMS/EAM/TPM)各搬各的观感,无法形成公司统一产品形象;操作员跨应用学习成本高。

---

## Decision(决策本身)

**一句话**:确立 V2 设计语言 "Atlas" 为公司跨项目前端 UI 统一工程标准;V1(ADR-023)降级为**备用基线**(并存不废除);V2 不绑定 antd,落地技术选型在各 plan 决定。

### 1. 与 V1 UI 标准的关系 —— 并存,非废除

> V1 UI 设计标准真理源 = `engineering-standards/standards/frontend-ui-standard.md`。**非 ADR-023** —— ADR-023 是 i18n / Auth401 / hostMap / web.config 四基建标准,与 UI 设计正交,V2 仍须遵守。

- **V2(本 ADR)= 新默认 UI 标准**:新建 / 重构 / 迁移页面默认套 V2。
- **V1(frontend-ui-standard.md)= 备用基线**:存量未重构页面继续可用;特殊场景(快速交付、第三方嵌入)可降级用 V1。
- `frontend-ui-standard.md` 顶部回链「V2 见 ADR-032,V1 降级为备用基线」。

### 2. V2 "Atlas" 设计语言定义

| 维度 | 标准 |
|---|---|
| 字体 | 拉丁/标题 `Sora` + 中文 `Noto Sans SC` + 数字/编号 `JetBrains Mono`(等宽 tabular-nums);**禁** Inter / Roboto / 系统默认冒充设计 |
| 主色 | 靛墨蓝 `--brand:#1e4d8c` + 墨 `#14233b` + 暖中性灰画布 `#f5f6f8`;语义色 ok `#0f9d6e` / warn `#c2740c` / err `#d14343` |
| 令牌化 | 全量 CSS 变量(色/字/圆角/阴影/间距),改一处全局生效;**不暴露为多客户皮肤开关**(公司统一一套,见 §5) |
| 质感 | 卡片极轻阴影 + hover lift;tint 图标方块;状态 pill + 状态点;克制留白节奏;避开模板脸 |

### 3. 页面范式标准(五类)

- **门户 Shell · 工作台**:登录首屏 = 个人工作台(问候 + 待办聚合 + 继续工作页签 + 我的收藏 + 最近访问 + 按应用分组菜单卡 + ⌘K 命令面板)。BP 落地见 ADR-033。
- **表单(多字段)**:**反抽屉**——多字段强制「步骤条引导」(新手分步)或「模块锚点 / tab 分区」(老手跳改);必填红点 + 实时校验 + 完成度。
- **列表**:搜索 + chip 快筛 + 高级筛选 + 行内操作 + 批量工具栏 + 分页;可选左分类树导航。
- **详情**:业务 tab(带数字徽标)+ 卡片网格 + 明细表 + 操作时间线;或左锚点长详情。
- **三态**:空 / 加载骨架 / 错误,**均须设计**(插画 + 文案 + 主操作),禁白屏。

### 4. 落地硬约束(plan 编码阶段强制验收,2026-05-21 涛哥两点)

> 效果图(mockup)阶段静态示意即可;**spec 确认 + plan 落盘编码时**必须满足:

- **① 字段要"活"**:按真实业务字段实装、填真实数据、**禁占位符空字段**冒充;字段集以源系统实证为准(如 MDM 供应商 / 物料 / 客户字段,见对应 spec 字段依据),不臆造、不简配。
- **② 自适应**:响应式适配多分辨率 + 浏览器缩放(125%/150%),**无重影、无错位叠加**;`fixed`/`absolute`/`sticky` 布局须在窄屏与缩放下健壮。

### 5. 单一标准,无多客户皮肤

V2 是公司统一标准。CSS 变量仅作工程化维护用途,**不开放为客户品牌定制 / 主题切换**。统一的是「皮肤」,各人可见菜单仍按授权(数据层)区分,二者不混。

### 6. 技术选型边界

V2 **不绑定 antd**;是否自研组件库 / 封装现有库 / 渐进替换,属重大成本决策,在各项目 plan 中评估拍板,本 ADR 不预设。

---

## Alternatives(替代方案)

| 方案 | 否决理由 |
|---|---|
| 维持 V1(ADR-023)仅微调 | 解决不了「模板感 + 抽屉一拉到底」核心诉求 |
| 各应用各自设计 | 视觉碎片化,违背公司统一产品形象目标 |
| 直接采购成熟组件库套皮 | 仍是「别人的脸」,且企业字段密度 / 中文场景适配差 |

---

## Consequences(影响)

- **正面**:公司前端统一现代观感;操作员跨应用一致体验;迁移改造(SRM/MES…)有统一目标基线。
- **代价**:需沉淀 V2 组件库 + 标准文档(`engineering-standards/standards/frontend-ui-v2-standard.md` 待建);存量页面渐进迁移,V1/V2 并存期。
- **影响范围 / 回链**:`frontend-ui-standard.md`(V1 降级备用,需回链)、ADR-033(BP Shell 落地 V2)。
- **效果图锚点**:`SYSV2/docs/mockups/v2/`(index + workbench + form + list + detail + states + v2-ui.css)。

---

## 后续(待办)

- [ ] `frontend-ui-standard.md` 顶部回链本 ADR(V1 降级备用基线)
- [ ] 沉淀 `engineering-standards/standards/frontend-ui-v2-standard.md`(token + 组件 + 五类范式 + 两点验收)
- [ ] BP 试点落地(ADR-033 + spec `2026-05-21-bp-ui-v2`)→ 验证后推广 SRM/MES
