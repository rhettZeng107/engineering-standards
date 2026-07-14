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
- **Claude 无法自主等 build 结果**:Claude 派 helper 改完代码 push 后,无法等 build 结果决策下一步(只能 AskUserQuestion 让涛哥手回报)— 阻塞批次任务
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

凭据:`$HOME\.claude\ado-pat`(Build Read & Execute 权限,90 天轮换;历史 `$HOME\.claude\sysv2-ado-pat` 只作旧别名)。
访问 Endpoint:`http://172.21.10.30:8090/JYDevOps/JYPrdCollection/<repo>/_apis/build/builds/...`

### 被动接收侧 — ADO 邮件订阅

落地:`docs/ops/cicd-ado-failure-notification.md`(涛哥手动配一次)

- ADO Server 全局 SMTP 配好(发件 + 测试)
- 涛哥个人 Subscription:"A build fails" — Filter = All pipelines in JYPrdCollection
- 邮件含 Pipeline + Build 编号 + 失败 stage + log URL,点开直达
- 新增 Pipeline 自动覆盖(Project 级 Filter)

### Claude 自主行为约定

Claude 在批次任务(ADR-017)内,push 后默认走 `Wait-AdoBuildComplete` 等结果;如失败拉 `Get-AdoBuildLogs -OnlyFailed`,在 Claude 本体可修范围内自主修复 + 重 push;只有以下情况打断涛哥:

- 修复 2 轮不收敛(超 ADR-017 CR/HIGH 2 轮上限)
- 实证反转(本来应过的 spec 失败,根因不在最近 commit)
- 跨边界(需改 ADO YAML / IIS 配置 / pipeline-e2e 之外的代码)

push 后 trigger 多次时,Claude 自动 `Cancel-AdoOldBuilds` 留最新一个,不问涛哥(Tier 1 自主)。

## Consequences

### 正向

- **批次任务执行不打断**:Claude 等 build 结果决策下一步,无需 AskUserQuestion 让涛哥手回报
- **涛哥被动通知**:邮件第一时间到,不必盯 ADO UI
- **Agent 时间节省**:Cancel 冗余 build 平均节省 30%+ Agent 时间(实证 2026-05-14 单日 11 build 中 5 次冗余)
- **诊断链路缩短**:4 步 → 1 命令(`Get-AdoBuildLogs -OnlyFailed`)

### 负向 / 代价

- PAT 凭据管理:`$HOME\.claude\ado-pat` 文件需保护(权限读限制,90 天轮换)
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
- 缺点:Claude 无法主动查 build 状态 → 批次任务被打断,涛哥手回报继续 in_progress
- 不选原因:Claude 批次任务(ADR-017)依赖主动查询,邮件是单向通知不可编程

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

- ADR-017:批次任务扩大版 — Claude 自主 wait/cancel 是本 ADR 的批次任务执行依赖
- ADR-018:决策授权三档 — `Cancel-AdoOldBuilds` 是 Tier 1 自主(可逆 + 队列管理)
- spec:`docs/superpowers/specs/2026-05-13-offline-deployment-strategy/spec.md`(关联 — 离线包 Pipeline 也走本策略)
- doc:`docs/ops/cicd-ado-monitor.md`(用法手册)
- doc:`docs/ops/cicd-ado-failure-notification.md`(邮件配置手册)
- doc:`docs/ops/dev-pre-merge-validation.md` § 高频 push(队列管理 inline 片段,后续可改引用本 helper)

## 修订(2026-05-28)

**背景**:monitor 从 PowerShell `.ps1` 迁移为跨平台 Node.js `.js`(`templates/cicd-ado-monitor.js`,各工作区 `docs/ops/cicd-ado-monitor.js`)后,PAT 路径出现文档漂移 —— ADR 正文与 `.ps1` 写 `~/.claude/sysv2-ado-pat`,而 `.js` 默认读 `~/.claude/ado-pat`,两者对不上,导致新工作区(SRMV2 等)的 JS monitor 找不到 PAT、无法开箱自查 CI(实证 2026-05-28:SRMV2 推送后未自查反向涛哥要状态/PAT)。

**修订决策**:

1. **PAT 规范路径统一为 `~/.claude/ado-pat`**(org 中性命名,匹配 `.js` monitor 默认)。同一 ADO org/collection 多工作区**共用一份**;历史 `~/.claude/sysv2-ado-pat` 视为别名,以 `cp`/`symlink` 对齐到 `~/.claude/ado-pat`(本会话已对齐)。90 天轮换时只维护这一份。

2. **monitor 真理源 = Node.js 版**(`cicd-ado-monitor.js`,跨平台,无需 PowerShell)。原 `.ps1` 函数 → `.js` 子命令对照:

   | `.ps1`(旧) | `.js`(现) |
   |---|---|
   | `Get-AdoBuildStatus -Repo` | `node cicd-ado-monitor.js status <repo> [--top N]` |
   | `Get-AdoBuildLogs -OnlyFailed` | `node cicd-ado-monitor.js logs <repo> <buildId> --failed` |
   | `Cancel-AdoOldBuilds` | `node cicd-ado-monitor.js cancel-old <repo>` |
   | `Wait-AdoBuildComplete` | `node cicd-ado-monitor.js wait <repo> <buildId> [--timeout N]` / `watch <repo>` |

3. **「build succeeded」≠ 已部署**:供应商等 pipeline = `Build & Package → Deploy to Test (10.8) → E2E`;判定上线必看 timeline 各 stage 都 succeeded(REST `/_apis/build/builds/<id>/timeline?api-version=7.0`),不能只看顶层 result。部署后按各项目 post-deploy 复验 SOP 打 prod 环境。

4. **「Claude 自主行为约定」适用条件补强**:推送后**必须**自主用 monitor 查 CI(凭据已就位,见第 1 条),**不得**向涛哥要 build 状态或 PAT;红了走 [[cicd-self-heal-sop]] 三层分流。该行为是跨项目基线(本 ADR),不下沉项目级 memory。

## 修订(2026-06-17)

**背景**:self-hosted Agent 单 worker(SYSV2-OnPrem)串行处理队列;被更新提交取代的在途 build(`notStarted`/`inProgress`)继续占 Agent = 纯浪费。2026-06-17 MsDepSvc 全工作区铺开时,同一 pipeline 出现"旧 build(只改通道)+ 新 build(再改一处)"并存,涛哥指出应取消被取代的旧 build。原「自主行为约定」line 65 已含此意但措辞偏窄("push 后 trigger 多次时"),本次升格为**显式铁律 + 扩至全工作区**。

**build 去重铁律**:

1. **每次 push 更新提交后**(代码或 pipeline 改动触发了构建),对该 pipeline 跑 `cancel-old <repo>` —— 按 `queueTimeDescending` **保留最新一个,取消其余全部在途**(无论旧 build 是 1 个还是多个、`notStarted` 还是 `inProgress`;`inProgress` 的旧 build 也取消,不为已跑一半的过时 build 等结果)。
2. **Claude 双推后自动执行**,Tier 1 自主不问涛哥(可逆 + 队列管理,对齐 line 65 / ADR-018);与 post-push monitor 配套:`push → cancel-old → watch 最新`。
3. **范围**:所有 ADO self-hosted 单/少 worker pipeline —— SYSV2 / SRMV2 / MES / TPM / 未来工作区一致。
4. **落地**:操作指引同步进 [`standards/cicd-onprem-iis-deploy-standard.md`](../standards/cicd-onprem-iis-deploy-standard.md) §队列卫生,各工作区 Claude 干部署时读。

## 修订(2026-07-09)

**背景**:SRMV2 前端修复后启动 ADO build watcher 时,用普通 shell `nohup ... wait ... &` 的子进程在 Codex 工具会话下只完成首轮轮询即退出,没有持续监控到终态。后续实测 Node `spawn(..., { detached: true }) + unref()` 可以在父命令退出后继续写日志并记录 `FINAL`。同日官方 Codex manual 已刷新为 current:官方 surface 区分中,`AGENTS.md` 承载持久工作约定,Automations 承载后台/定时任务,Hooks 承载生命周期机械检查,Rules 承载命令权限约束;因此 CI watcher 标准应落在工程标准 + 项目脚本/automation,而不是仅靠聊天提醒或前台 wait。

**修订决策**:

1. **默认后台监控改为可验证的 detached/background 机制**:各工作区优先提供 `background` 子命令或等价 wrapper,内部启动 detached watcher,并记录 `repo/branch/buildId/PID/logPath/command/meta`。模板默认落在 `docs/ops/cicd-ado-monitor.js background <repo> --build-id <id>`;SRMV2 现有 `codex-ci-heartbeat.js background` 属等价实现。
2. **`nohup` 降级为兜底**:只有在当前 Codex/终端运行环境实测子进程能脱离父会话继续运行时才可用;不得把 `nohup` 模板当成跨工作区默认。
3. **前台 `wait/watch` 只用于短检查或涛哥明确要求前台等待**。默认交互会话保持可响应;queued/inProgress 静默,终态绿汇报一次,红拉失败日志并按 self-heal SOP 自愈。
4. **模板同步**:新工作区 bootstrap/CI SOP 文档引用本规则;老工作区遇到 watcher 不稳定时,先补 `background` wrapper,再继续 CI 自愈。

## 修订(2026-07-14)

**背景**:SYSV2 同批 10 个构建启动 detached watcher 后,内网一次 `ETIMEDOUT` 导致全部 watcher 永久退出;BP #1673 后续真实红灯,但旧实现只保留失败 task 的 URL,没有自动抓正文,也没有能唤醒消费方的逐 build 告警。进程“已启动”被误当作“后台监控已闭环”,违反本 ADR 的自主查 CI 与自愈目标。

**修订决策**:

1. **启动必须验收**:启动后 60 秒或两个 poll 周期内,独立验证 watcher 仍存活且 log/meta 有推进,或已落终态;启动命令输出和 PID 本身不算完成证据。
2. **断线续监**:瞬时网络/API 错误只记 `monitor warning`,在总 timeout 内重试;`monitor_error` 与真实 CI `failed` 分开记录,不得混报。
3. **红灯自动取证**:终态红时自动下载失败 job/task 日志正文、脱敏并保存非空的逐 build failure artifact;只存 URL 不合格。
4. **逐 build 状态**:并发 watcher 分别维护 meta/alert;全局 `current` 只能作便利视图,不得作为并发构建的终审证据。
5. **必须有消费方**:detached watcher 必须绑定 thread/project automation、事件桥或仍在执行的 agent follow-up,由消费方读取终态/告警并进入 self-heal。只写文件、无人读取不算闭环。
6. **回放门禁**:每类 watcher 初次落地或机制修改后,至少验证一次已完成绿构建、一次已完成红构建(失败日志非空),并模拟或实证一次瞬时网络失败不会退出。

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-14 | Proposed → Accepted | 涛哥拍板,Phase 1 闭环 task #7/#8/#10 一并落地 |
| 2026-05-28 | 修订(不改编号) | PAT 路径统一 `~/.claude/ado-pat` + monitor `.ps1→.js` 迁移对照 + build≠部署判定 + 自主查 CI 强制(涛哥拍板) |
| 2026-06-17 | 修订(不改编号) | build 去重铁律升格 — push 后必 `cancel-old` 留最新、取消其余在途(含 inProgress)+ 扩至全工作区(涛哥拍板) |
| 2026-07-09 | 修订(不改编号) | CI watcher 默认后台机制改为实测 detached/background 或 Codex automation;`nohup` 仅作验证后兜底 |
| 2026-07-14 | 修订(不改编号) | 增加启动验收、断线续监、红灯日志正文、逐 build 告警与消费方闭环硬门禁 |
