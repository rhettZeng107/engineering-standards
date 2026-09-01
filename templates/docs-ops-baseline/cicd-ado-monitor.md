# SYSV2 ADO Build Monitor 用法

> 创建:2026-05-14(Phase 1.3 — ADO Pipeline 状态自动监听)
> 2026-05-16 改造:PowerShell → Node.js(Mac 零依赖,node 内置模块,跨平台)
> 配套脚本:`cicd-ado-monitor.js`
> 关联 ADR:ADR-022(CI/CD Monitor & Feedback 策略)

## 使用场景

所有命令在 SYSV2 根目录下跑:

| 场景 | 命令 |
|---|---|
| 看某 repo 最近 5 次 build 状态 | `node docs/ops/cicd-ado-monitor.js status AI.REACT.MDM.1` |
| 看当前在跑/排队的 build | `node docs/ops/cicd-ado-monitor.js status AI.REACT.MDM.1 --state inProgress` |
| 看某 build 失败的 task 和日志正文 | `node docs/ops/cicd-ado-monitor.js logs AI.REACT.MDM.1 130 --failed --content` |
| 连续 push 后留最新一个,cancel 前面冗余 | `node docs/ops/cicd-ado-monitor.js cancel-old AI.REACT.MDM.1` |
| 故障诊断时前台等待某 build(已知 buildId) | `node docs/ops/cicd-ado-monitor.js wait AI.REACT.MDM.1 130` |
| 故障诊断时前台等待最新 build(无需 buildId) | `node docs/ops/cicd-ado-monitor.js watch AI.REACT.MDM.1` |
| 双推后默认静默后台监控指定 build | `node docs/ops/cicd-ado-monitor.js background AI.REACT.MDM.1 --build-id 130 --branch main --quiet` |
| 查看所有后台任务摘要 | `node docs/ops/cicd-ado-monitor.js summary` |
| 一次性消费 CI 终态 | `node docs/ops/cicd-ado-monitor.js consume` |

## 运行环境

只需 `node`,无需安装任何 npm 包(纯内置模块 `http` / `fs` / `path` / `os`)。Mac / Windows / Linux 通用。

## 凭据

PAT 文件 `~/.claude/ado-pat`(脚本用 `os.homedir()` 自动定位,跨平台),内容为 ADO Personal Access Token(单行,无引号)。历史 `~/.claude/sysv2-ado-pat` 只作旧别名。
权限:Build (Read & Execute) — 用于查询 + cancel。
轮换:每 90 天涛哥更新一次(参见 `cicd-agent-vm-setup.md`)。

## Repo 名速查

| Repo 名(命令参数) | 实际项目 |
|---|---|
| `AI.Extend.SYS` | SYS 后端 |
| `AI.REACT.SYS.3` | SYS.3 控制台前端 |
| `AI.REACT.SYS.BusinessPortal` | BP 业务门户前端 |
| `AI.REACT.SYS.AuditPortal` | AuditPortal 审计门户前端 |
| `AI.Extend.MDM.1` | MDM 后端 |
| `AI.REACT.MDM.1` | MDM 前端 |

## 子命令速查

| 子命令 | 参数 | 说明 |
|---|---|---|
| `status` | `<repo> [--top N] [--state all\|inProgress\|completed\|notStarted]` | 列 build 状态,默认最近 5 个 |
| `logs` | `<repo> <buildId> [--failed] [--content]` | 列 task 日志；`--failed` 只看失败项，`--content` 下载并脱敏输出正文 |
| `cancel-old` | `<repo>` | 留最新一个排队 build,cancel 其余 |
| `wait` | `<repo> <buildId> [--timeout 1800]` | 轮询已知 build 到完成;succeeded → exit 0,否则 exit 1 |
| `watch` | `<repo> [--timeout 1800]` | 轮询最新 build 到完成;输出 `FINAL: succeeded/failed`,exit 0/1 |
| `background` | `<repo> --build-id <id> [--branch <branch>] [--timeout 1800] [--log-dir docs/ops/ci-watch]` | detached 监控指定 build；网络短暂中断会续监，失败后自动下载失败日志并生成逐 build 告警。必须传 buildId，避免误认历史构建 |

## 典型工作流

### 1. 高频 push 时清队列

涛哥连续 push 3 个 commit,ADO 触发 3 个 build 排队:

```bash
node docs/ops/cicd-ado-monitor.js cancel-old AI.REACT.MDM.1
# 输出:保留最新:#132 (...) / 已取消:#130 (...) #131 (...)
```

### 2. Claude/Codex 自主监听 build 结果

双推后默认后台监控,不要占住主会话。模板脚本已内置 `background`:

```bash
node docs/ops/cicd-ado-monitor.js background AI.REACT.MDM.1 --build-id <buildId> --branch <branch> --quiet
# 父命令立即返回;PID/log/meta/current state 写入 gitignored 的 docs/ops/ci-watch/
# child 自己维护 `.pid`/`.ready.json`，每次 attempt 以 `runId` 区分，避免快速终态留下陈旧 PID 或覆盖终态 meta
# 红灯额外写入 <repo>-<buildId>.failed.log 和 <repo>-<buildId>.alert.json
# 启动后 60 秒或两个 poll 周期内必须验收 PID 存活 + log/meta 推进或已落终态
```

后台默认每 10 分钟检查一次。排队和运行中状态只写 `.out`/`.state.json`，不进入主会话；成功、失败或 monitor error 写不可覆盖的 `<repo>-<buildId>-<runId>.terminal.json`。在合适的交互边界执行：

```bash
node docs/ops/cicd-ado-monitor.js consume
```

`consume` 通过进程锁串行领取尚未消费的终态，先成功写出结果再记录消费游标；异常退出遗留的锁会按 PID 与锁龄自动回收，再次执行返回空数组。`consume --peek` 只读预览。演示前或故障诊断可用 `--interval-min 1` 临时加速，不改变默认值；允许范围为 1～1440 分钟，非法值直接拒绝，避免高频轮询。

若该工作区尚未提供 `background` wrapper,可临时用前台命令确认状态,但不得把长时间 `watch` 当作默认主会话等待:

```bash
node docs/ops/cicd-ado-monitor.js watch AI.REACT.MDM.1
# 逐行输出 [Ns] #id status/result,直到 FINAL: succeeded/failed
# exit 0 = 绿,exit 1 = 红
```

`nohup ... &` 只能作为兜底,且必须先在当前 Codex/终端环境实测子进程能脱离父会话继续写到终态。

### 3. 涛哥手动查 build 失败原因

```bash
node docs/ops/cicd-ado-monitor.js status AI.REACT.MDM.1 --top 3
# 看到 #130 result=failed
node docs/ops/cicd-ado-monitor.js logs AI.REACT.MDM.1 130 --failed
node docs/ops/cicd-ado-monitor.js logs AI.REACT.MDM.1 130 --failed --content
# 第二条命令直接输出已脱敏的失败日志正文
```

## 关联文档

- `dev-pre-merge-validation.md` § 高频 push 时的 build 队列管理 — 引用本脚本
- `cicd-agent-vm-setup.md` — Agent VM + PAT 凭据存放位置
- `cicd-ado-failure-notification.md` — 邮件失败通知配置(被动接收侧,本脚本是主动查询侧)
