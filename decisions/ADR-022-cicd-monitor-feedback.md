# ADR-022: CI/CD Monitor & Feedback 策略

- **Status**: Accepted
- **Date**: 2026-05-14
- **Decider**: 涛哥
- **Scope**: 跨项目(SYSV2 6 个 Pipeline 全适用,后续新增项目沿用)

---

## Context

SYSV2 CI/CD Phase 1 闭环过程中(SYS / SYS.3 / BP / AuditPortal / MDM 前后端共 6 个 Pipeline),涛哥踩到的反复痛点:

- **被动盯 ADO UI**:Pipeline 跑挂没人知道,涛哥要主动开 ADO 网页才能看 — 失败修复延迟数小时
- **高频 push 队列堆积**:连续 push 3-5 个 commit,Self-hosted Agent 单 worker 排队,旧 build 跑出来已被新 commit 覆盖,浪费 5-15 分钟 Agent 时间
- **Claude 无法自主等 build 结果**:Claude 派 helper 改完代码 push 后,无法等 build 结果决策下一步(只能 AskUserQuestion 让涛哥手回报)— 阻塞批次合同
- **失败原因诊断成本高**:涛哥需登 ADO → 找到 build → 找到 failed task → 看 log,链路 4 步;Claude 无 PowerShell helper 同样链路要走

实证锚点:
- 2026-05-14 单日 MDM Pipeline 跑 11 次(build 121-131),其中 5 次因前序 build 已被覆盖白跑(`AI.REACT.MDM.1/azure-pipelines.yml` history)
- `docs/ops/dev-pre-merge-validation.md` § 高频 push 队列管理 已加 inline PowerShell 但无 reusable helper
- 涛哥反馈:"pipelines运行列表中,结果失败的是否可以自动删除?"(2026-05-14)

**不做这条决策的代价**:Phase 2 / Phase 3 引入 Docker / k3s 后 Pipeline 数 ≥ 10,人工盯监控 + 队列管理成本指数级上升。

## Decision

**一句话**:CI/CD Monitor & Feedback 双轨 — 主动查询侧(PowerShell helper)+ 被动接收侧(ADO 邮件订阅),Claude/涛哥两侧都覆盖。

**详细**:

### 主动查询侧 — PowerShell helper

落地:`docs/ops/cicd-ado-monitor.ps1` + 用法 `docs/ops/cicd-ado-monitor.md`

4 个核心函数:

| 函数 | 用途 |
|---|---|
| `Get-AdoBuildStatus -Repo <name>` | 看 repo 最近 N 个 build 状态(快速诊断) |
| `Get-AdoBuildLogs -Repo <name> -BuildId <id> -OnlyFailed` | 看某 build 失败 task 列表 + 直达 log URL |
| `Cancel-AdoOldBuilds -Repo <name>` | 留最新 inProgress/notStarted,cancel 其余冗余 |
| `Wait-AdoBuildComplete -Repo <name> -BuildId <id>` | 脚本化等待 build 完成,作 Claude 批次决策依赖 |

凭据:`$HOME\.claude\sysv2-ado-pat`(Build Read & Execute 权限,90 天轮换)。
访问 Endpoint:`http://172.21.10.30:8090/JYDevOps/JYPrdCollection/<repo>/_apis/build/builds/...`

### 被动接收侧 — ADO 邮件订阅

落地:`docs/ops/cicd-ado-failure-notification.md`(涛哥手动配一次)

- ADO Server 全局 SMTP 配好(发件 + 测试)
- 涛哥个人 Subscription:"A build fails" — Filter = All pipelines in JYPrdCollection
- 邮件含 Pipeline + Build 编号 + 失败 stage + log URL,点开直达
- 新增 Pipeline 自动覆盖(Project 级 Filter)

### Claude 自主行为约定

Claude 在批次合同(ADR-017)内,push 后默认走 `Wait-AdoBuildComplete` 等结果;如失败拉 `Get-AdoBuildLogs -OnlyFailed`,在 Claude 本体可修范围内自主修复 + 重 push;只有以下情况打断涛哥:

- 修复 2 轮不收敛(超 ADR-017 CR/HIGH 2 轮上限)
- 实证反转(本来应过的 spec 失败,根因不在最近 commit)
- 跨边界(需改 ADO YAML / IIS 配置 / pipeline-e2e 之外的代码)

push 后 trigger 多次时,Claude 自动 `Cancel-AdoOldBuilds` 留最新一个,不问涛哥(Tier 1 自主)。

## Consequences

### 正向

- **批次合同执行不打断**:Claude 等 build 结果决策下一步,无需 AskUserQuestion 让涛哥手回报
- **涛哥被动通知**:邮件第一时间到,不必盯 ADO UI
- **Agent 时间节省**:Cancel 冗余 build 平均节省 30%+ Agent 时间(实证 2026-05-14 单日 11 build 中 5 次冗余)
- **诊断链路缩短**:4 步 → 1 命令(`Get-AdoBuildLogs -OnlyFailed`)

### 负向 / 代价

- PAT 凭据管理:`$HOME\.claude\sysv2-ado-pat` 文件需保护(权限读限制,90 天轮换)
- PowerShell helper 维护:ADO Server 升级时 REST API 版本可能变(当前 api-version=7.0)
- 邮件订阅依赖 ADO Server SMTP 可用性(SMTP 挂 → 邮件断,但 PowerShell 主动查询仍可用,双轨互补)

### 影响范围

- **影响 spec**:Phase 1 闭环 spec(2026-05-13 之前的 CI/CD spec)— 增量 patch 引用本 ADR
- **影响 plan**:后续 Phase 2 Docker 扩展 plan(`engineering-standards/decisions/` 内 ADR + plan 暂未写)沿用本策略
- **影响 memory**:无新增 — 走 ADR(跨项目长期基线)而非项目级 memory
- **影响代码**:
  - `docs/ops/cicd-ado-monitor.ps1`(新增)
  - `docs/ops/cicd-ado-monitor.md`(新增)
  - `docs/ops/cicd-ado-failure-notification.md`(新增)
  - `docs/ops/dev-pre-merge-validation.md` § 高频 push(引用本 ADR)

## Alternatives Considered

### A. 只配邮件订阅,不写 PowerShell helper

- 优点:零代码维护,纯 ADO Server 内置
- 缺点:Claude 无法主动查 build 状态 → 批次合同被打断,涛哥手回报继续 in_progress
- 不选原因:Claude 批次合同(ADR-017)依赖主动查询,邮件是单向通知不可编程

### B. 只写 PowerShell helper,不配邮件

- 优点:Claude 闭环 OK
- 缺点:涛哥不在工位时 build 跑挂无感知 → 通宵 build 失败次日才知道
- 不选原因:涛哥 PM 角色,被动通知是必要兜底

### C. 写一个独立 watcher 服务(Node.js / Python)轮询 ADO + 推送钉钉/微信

- 优点:实时性最高,可定制 routing
- 缺点:多一个服务要维护,部署 + 监控成本;企业内网钉钉/微信集成成本
- 不选原因:过度设计 — 双轨已覆盖 95% 场景,剩余 5% 通宵失败延迟可接受

### D. 把 PowerShell 函数封装为 ADO Pipeline Task / Extension

- 优点:在 ADO UI 内可见
- 缺点:Extension 开发 + 签名 + 部署成本 ≥ 几周
- 不选原因:工具属性,不值得 ADO Extension 包装

## Related

- ADR-017:批次合同扩大版 — Claude 自主 wait/cancel 是本 ADR 的批次合同执行依赖
- ADR-018:决策授权三档 — `Cancel-AdoOldBuilds` 是 Tier 1 自主(可逆 + 队列管理)
- spec:`docs/superpowers/specs/2026-05-13-offline-deployment-strategy/spec.md`(关联 — 离线包 Pipeline 也走本策略)
- doc:`docs/ops/cicd-ado-monitor.md`(用法手册)
- doc:`docs/ops/cicd-ado-failure-notification.md`(邮件配置手册)
- doc:`docs/ops/dev-pre-merge-validation.md` § 高频 push(队列管理 inline 片段,后续可改引用本 helper)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-14 | Proposed → Accepted | 涛哥拍板,Phase 1 闭环 task #7/#8/#10 一并落地 |
