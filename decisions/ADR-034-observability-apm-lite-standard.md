# ADR-034: APM-lite 应用层可观测体系作为跨项目工程标准

- **Status**: Accepted
- **Date**: 2026-05-21
- **Decider**: 涛哥
- **Scope**: 跨项目(SYS / MDM 已具备参考实现;SRMV2 / MES / WMS / EAM / TPM 后续子系统接入)

---

## Context(背景)

涛哥提出"操作/测试时异常自动留痕 → 会话拉日志 → 按优先级分析 → 修复 → 沉淀"的监控-反馈闭环,目标是建立可观测体系并固化为工程标准。

实证现状(2026-05-21):
- 前端 `errorReporter.js`(BP / SYS.3)已捕获 window.error + unhandledrejection + axios 5xx,POST `/api/app-error-log`。
- 后端 `GlobalExceptionMiddleware` + `OperationLogActionFilter` + `SystemLogWriter` 写入 `SYS_SystemLog`,走独立 `AuditWriterDbContext`(审计与业务事务解耦,"日志不可篡改"语义)。
- `AppErrorLogController` 提供分页 List + by-fingerprint 聚合查询(OccurCount),已有指纹去重。
- 即"应用埋点 → 上报 → 集中存储 → 指纹聚合 → 查询"模式已成型,等同业界 Error Tracking(Sentry 模式)的极简自实现。

**触发本 ADR 的契约 bug**:前端上报字段名 `message` 与后端 DTO `ErrorMessage` 不一致,JSON 绑定接不上 → 错误消息永久丢失(`LogContent` 落库空串,DB 实测 112 条 HasMessage=0)。证明该体系缺统一契约约束,须固化为标准防复发。

## Decision(决策)

将 **APM-lite 应用层可观测(错误追踪)体系**确立为跨项目工程标准:

1. **三支柱范围**:可观测三支柱(Logs / Metrics / Traces),当前标准化 **Logs 中的应用错误追踪**;Metrics / Traces 列演进 backlog,不强制。
2. **自建而非引入第三方(Sentry / Datadog)**:理由 = 内网/离线部署、数据不出网(合规)、与既有审计 / 三员 / 会话贯穿(scid)体系融合。商业 APM 的高级能力列演进项补齐。
3. **统一上报契约(防本次 bug 复发)**:上报字段名以 `message` 为准(对齐前端既有);后端 DTO 必须 `[JsonPropertyName]` 对齐;appCode 走白名单;落 `SYS_SystemLog`(LogType='AppError')+ 服务端指纹去重。
4. **AI 闭环**:错误日志可被 Claude 会话拉取(MCP / 脚本)→ 按 `OccurCount × Severity × 是否阻断主路径` 排序 → 根因分析 → 改码走 CI(禁直接动 production)→ 补 E2E 用例(L2→L1 左移)→ 沉淀 post-mortem。返工统计接 ADR-033 度量纪律。
5. **接入手册**:`standards/observability-apm-lite-standard.md`;后续子系统按手册 1:1 接入,不单独写 spec。

## Consequences(影响)

- 正:统一契约杜绝字段不一致;新子系统接入有手册;AI 可观测闭环标准化;数据合规留内网。
- 代价:自建缺商业 APM 高级能力(演进项补);需持续维护前后端上报契约一致性。
- 演进 backlog:① 前端 source map 还原(压缩堆栈可读,**优先级最高**)② 按影响用户数排序 ③ release 版本关联 ④ 主动告警 ⑤ Metrics / Traces 支柱。

## Alternatives Considered(替代方案)

- **引入 Sentry 自托管**:功能强,但需独立 docker 栈、与审计体系割裂、运维重;内网场景性价比低。否决。
- **仅靠服务器日志文件 + SSH 拉取**:扩大 production 暴露面,与等保最小化暴露面冲突;无聚合无指纹。否决。

## 关联

- ADR-008(端到端 8 项核对 ① 契约双向)/ ADR-024(E2E 左移)/ ADR-033(返工度量纪律 L1/L2)
- 实现锚点:`AI.Extend.SYS` AppErrorLogController.cs / SystemLogWriter.cs / errorReporter.js
