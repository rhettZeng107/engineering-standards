# ADR-020: 前端中英 i18n 范围边界 — 用户输入不双语,平台固定 UI 必双语

- **Status**: Accepted
- **Date**: 2026-05-10
- **Decider**: 涛哥
- **Scope**: 跨项目(SYSV2 + 后续所有 Claude Code 协作前端项目)

---

## Context(背景)

- **触发场景**:SYSV2 i18n 落地实战(2026-05-10 P-A.2 + P-G.3 + P-B + P-C 完结一次性汇报后)涛哥追问"中英翻译范围理解是否一致"。
- **历史踩坑**(同 spec 内 2 次):
  1. v1 P1 范围偏离 — Claude 把"先整体跑通"误读为"链路通即可,内层中文保留";涛哥实际期望切英文 UI 全英文 → 涛哥回"那这个偏离太多了,一次性通过率也太差了"。
  2. v2 L4-B 单表过度设计 — Claude 给客户自定义岗位扩 EN 列;涛哥反问"业务字典数据一定要建表吗?有没有另外方案,比如放到配置文件 json?我字典库不是强制必须要所有字段。"
- **决策不做的代价**:
  - 后续 P-A.3 / P-D / P-E / P-H 4 phase 跨 30+ 模块 / 4 前端 + 后端,任何一处范围理解偏差都会触发返工。
  - MDM 27 模块从零 i18n(P-D)涉及 ~2605 处中文,边界不清会造成"用户输入数据被错误翻译"或"平台 UI 漏翻"两类回归。
  - 跨项目复用时(后续 SRM / MES / WMS / EAM 等)无统一范围标准,每次 spec discuss 都要重新拍板,效率低。

## Decision(决策)

**一句话**:前端中英 i18n 范围分两类硬切分 — **平台代码硬编码的所有用户可见 UI 文案必双语**;**用户输入数据 + 客户自定义字典 + 历史业务数据 + 系统级原始消息绝对不翻译**。

**详细**:见 [`engineering-standards/standards/frontend-i18n-standard.md`](../standards/frontend-i18n-standard.md)。

**核心边界判定矩阵**:

| 场景类型 | 必 i18n | 不 i18n |
|---|---|---|
| 列表 / Form / 弹窗 UI 元素 | 标题/列头/按钮/Tab/placeholder/message/Modal/Tag/Switch/rules | record.xxx 渲染用户字段值 / map(item=>item.name) |
| 字典 / 枚举 | 平台预设(菜单/系统角色/组织类型/状态码) | 客户自定义(SYS_AuthPosition / PUB_DictionaryItem 客户字典) |
| 后端业务消息 | 平台代码 throw 的硬编码消息(IStringLocalizer + resx) | DB 唯一约束/系统级原始/第三方 SDK 异常 |
| 业务数据 | — | 用户填写的实体名/姓名/物料/订单号 / DB 已存中文历史数据 / 第三方系统返回字段 |

## Consequences(影响)

### 正向

- **Spec discuss 加速**:i18n 涉及的 spec 启动时直接对照标准清单,不需要重新拍板范围。
- **qwen / dotnet-developer 派单 prompt 标准化**:范围硬约束作为公共片段插入,不靠 Claude 本体每次重写。
- **code-reviewer 标准化**:i18n 审查按 §5 检查清单出具 HIGH/MED/LOW,不靠主观判断。
- **跨项目复用**:SRM / MES / WMS / EAM / TPM 等后续项目 i18n 落地时直接套用,不需要每个项目重新讨论。

### 负向 / 代价

- **客户自定义部分用户体验割裂**:客户自定义岗位名(中文)在英文 UI 中混出 — 接受作 trade-off(强制翻译会让客户感觉"系统替我做决定")。
- **后端 resx 化迁移成本**:存量 `throw new Exception("中文")` 一次性改造工作量(SYS 后端约 85 处)。
- **维护点新增**:每次新加平台预设枚举/菜单/角色都要同步更新双语字典。

### 影响范围

- **影响 spec**:`docs/superpowers/specs/2026-05-10-frontend-i18n-zh-en-default/spec.md`(顶部回链本 ADR)
- **影响 plan**:同主题 `plan.md` 6 个 phase(P-A / P-B / P-C / P-D / P-E / P-H)
- **影响标准**:[`frontend-i18n-standard.md`](../standards/frontend-i18n-standard.md)(主标准)/ [`frontend-ui-standard.md`](../standards/frontend-ui-standard.md)(配套段)
- **影响代码**:SYSV2 4 前端 + SYS 后端;后续 SRM / MES / WMS / EAM 全套
- **影响 memory**:候选新 memory `feedback_i18n_scope_user_input_no_translate.md`(可选)

## Alternatives Considered(其他选项)

### A. 全 i18n(用户输入也翻译)

- 优点:UI 完全英文,无割裂感
- 缺点:技术上不可能 — 用户输入是任意中文,无法预先翻译;若用 LLM 实时翻译,成本高 / 延迟高 / 不准确
- 不选原因:违反"用户写啥就显示啥"基本原则;客户自定义岗位是客户业务表达,平台不应代为翻译

### B. 不区分平台 / 客户字典,全部 i18n 化

- 优点:DB 字段统一加 EN 列,代码一致性高
- 缺点:客户自定义岗位/字典/菜单需要客户填双语(增加客户填表负担)或 LLM 自动翻译(成本/质量风险);v2 L4-B 涛哥已批"过度设计"
- 不选原因:涛哥 2026-05-10 明确"客户自定义部分兜底中文"

### C. 完全不做 i18n,中文为唯一语言

- 优点:0 工作量
- 缺点:全球化客户(德国/法国/英语客户)无法接受
- 不选原因:涛哥 2026-05-10 启动 i18n 项目的初衷就是支持中英双语 + 后续按客户需求加德语/法语包

## Related(相关引用)

- spec:[`2026-05-10-frontend-i18n-zh-en-default`](../../SYSV2/docs/superpowers/specs/2026-05-10-frontend-i18n-zh-en-default/spec.md)
- 标准:[`frontend-i18n-standard.md`](../standards/frontend-i18n-standard.md)
- 上游 ADR:ADR-005(客户全新部署语义,讨论阶段剔除运维)/ ADR-018(决策授权三档)
- 下游 ADR:无(候选 ADR-021+ 视后续踩坑沉淀)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-10 | Proposed → Accepted | 涛哥 2026-05-10 拍板,SYSV2 i18n 实战拨乱后落地;`engineering-standards/standards/frontend-i18n-standard.md` v1.0 同步 |
