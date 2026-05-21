# APM-lite 应用层可观测体系接入标准

> 参见 ADR-034。适用:所有 SYSV2 子系统(SYS / MDM = 参考实现;SRMV2 / MES / WMS / EAM / TPM 按本手册接入,不单独写 spec)。
> 设计标杆:`AI.Extend.SYS` 后端 + `errorReporter.js` 前端。

## 1. 定位:可观测三支柱

| 支柱 | 状态 |
|---|---|
| **Logs(错误追踪)** | ✅ 本标准范围 |
| Metrics(指标) | 演进 backlog |
| Traces(链路追踪) | 演进 backlog(已有 scid 会话贯穿雏形) |

## 2. 前端接入(errorReporter)

- 复制 `errorReporter.js`,`initErrorReporter()` 在 main 入口调用一次;`reportAxiosError` 接入 axios 响应拦截器。
- 捕获:`window.error` + `unhandledrejection` + axios 5xx。
- **上报契约(硬约束,字段名不可改)**:

| 字段 | 必填 | 说明 |
|---|---|---|
| `message` | ✅ | 错误消息。**字段名必须是 `message`**;后端 DTO 须 `[JsonPropertyName("message")]` 对齐(踩坑见下) |
| `errorType` / `stackTrace` / `severity` / `appCode` / `userAgent` | | appCode 走白名单 |
| `requestPath` / `httpMethod` / `statusCode` | | axios 错误携带 |

- 节流去重:同 message+stackTop 10 秒内合并;上报失败静默,不影响业务。

## 3. 后端接入

- 接口 `POST /api/app-error-log`:匿名 + RateLimit 20/min/IP + Payload 校验(Message 2KB / Stack 8KB / UA 512B / 整体 16KB)。
- DTO 字段名与前端**逐一对齐**(必检契约项)。
- 写入 `SystemLogWriter.WriteAppErrorAsync` → `SYS_SystemLog`(LogType='AppError'),走独立 `AuditWriter` 连接,MERGE + HOLDLOCK 服务端指纹去重(MD5(appCode+errorType+normMsg+stackTop3))。
- 查询:`GET /api/app-error-log`(分页 List)+ `GET .../by-fingerprint`(OccurCount 聚合)。鉴权 `ConsoleOrAuditLogView`。

## 4. 拉日志分析闭环(AI)

- 工具:`scripts/pull-runtime-errors.sh`(本月 + 排除 dev localhost 噪声 + 按 OccurCount 排序);Claude 会话用 `mssql-test` MCP 跑同款 SQL。
- 排序:`OccurCount × Severity × 是否阻断主路径`。
- 闭环:拉日志 → 根因 → 改码走 CI(**禁直接动 production**)→ **补 E2E 用例(L2→L1 左移)** → post-mortem 沉淀。

## 5. 返工度量接入(ADR-033)

| 层 | 含义 | 纪律 |
|---|---|---|
| L1 内循环 | CI 红 / CR 回修 | 健康,控 ≤2 轮,不清零 |
| L2 运行时 | 本体系日志暴露 + 修复 | **北极星,每次修复必补 CI 用例** |

## 6. 不变量 / 反模式

- ❌ 前后端上报字段名不一致(本次 `message` ≠ `errorMessage` 致消息永久丢失 → DB LogContent 全空)。
- ❌ 在 production 开 SSH 拉日志(走查询接口 / DB,符合等保最小暴露面)。
- ❌ 会话直接改 production;❌ 审计写入耦合业务事务。
- ✅ 上报字段名 `message`;✅ 数据留内网;✅ 审计写失败静默、不影响业务、不可篡改。

## 7. 演进 backlog

source map 还原(优先)/ 按影响用户数排序 / release 版本关联 / 主动告警 / Metrics + Traces 支柱。
