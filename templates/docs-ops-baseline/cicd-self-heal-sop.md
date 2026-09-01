# CI/CD 失败自治闭环 SOP

> 适用:SYSV2 所有项目(SYS / MDM / SYS.3 / BP / AP)CI/CD pipeline 失败的统一处置流程
> 拍板日期:2026-05-14(涛哥)
> 关联:ADR-017 批次任务扩大版 / ADR-018 决策授权三档

## 目标

ADO build 红 → Claude 自治 → 绿,涛哥少看红邮件,少打断 PM 工作。

## 三层分流(2026-05-14 涛哥放宽 L3 — 迁移改造场景大胆重构)

| Layer | 失败类型 | 处置方 | 理由 |
|---|---|---|---|
| **L1 确定性错** | build / type / lint / yaml / regex / NuGet 路径 / 包依赖 | **subagent**(`build-error-resolver` / `typescript-reviewer` / `csharp-reviewer`) | 报错明确,无业务上下文需求 |
| **L2 业务 + 架构相关** | E2E spec fail / API 返空 / 鉴权时序 / 字段错位 / 业务逻辑回归 / **跨契约 / DB schema / 安全 / 鉴权架构(只要参照已有 ADR/standard 合理重构即可)** | **Claude 本体** | 迁移改造已稳定,合理重构不需要拍板。约束:查标准 + 合理性自检 + 完结时汇报存档 |
| **L3 真不可回头** | 推翻 ADR / 客户分支 / 生产库破坏 / 3 轮不收敛 / 实证反转(根因与 spec 假设矛盾) | **涛哥拍板** | 不自治 |

## 关键约束

**agent 只改代码 / Claude 主体走 git**:
- subagent 不熟 SYSV2 双推 / commit message 简洁 / 不加 Co-Authored-By 等 SOP — 容易跑偏
- Claude 主体单独管 commit + 双推 + 等 ADO 绿 = 单一职责
- agent 完成后回复修改清单,Claude 复审 + 提交

## 闭环流程

```
CI 红
 ↓
Claude/Codex 拉 fail log(ADO API / artifact)
 ↓
分类(L1 / L2 / L3)
 ↓ L1                ↓ L2                ↓ L3
派 subagent 修代码    Claude 本体定位+修    立刻报涛哥
 ↓                    ↓
Claude 复审 diff      Claude commit
 ↓
Claude commit + 双推
 ↓
后台 detached/background watcher
 ↓
绿了 → 报告;红了 → 重复(轮次+1)
 ↓
3 轮不收敛 → 升 L3 报涛哥
```

## 上限 + 中断

- **每个 fail 最多 3 轮自治**(防死循环 / 屎山扩散)
- **中断白名单(L3 真不可回头,任一即停)**:
  1. 推翻先前 ADR / 跨项目影响 / 客户分支(jy customer 等)
  2. 生产库 DELETE / DROP / 破坏性变更
  3. 3 轮后仍红(自治失败)
  4. 实证反转(根因与 spec 假设矛盾,需重新对齐)

## L2 自治约束(跨契约 / DB / 安全 / 鉴权 也能自治,但要稳)

1. **查标准优先**:有 ADR / engineering-standards / memory 的按标准执行
2. **合理性自检**:KISS + 最小改动 + 不破坏现有数据 + 不引入新依赖
3. **测试库 DDL 免确认**(dba 自主);**生产库 DELETE/DROP/REVOKE/TRUNCATE 必拍板**(走 L3)
4. **完结汇报必含**:做了什么(代码/schema/契约改动清单)+ 为什么(根因)+ 影响范围(波及哪些项目/接口)+ 存档位置(commit / ADR / memory / spec)

## subagent 派工模板

```
派 build-error-resolver(或 typescript-reviewer / csharp-reviewer):
  task:修复 ADO build #<N> 报错
  context:粘贴 fail 段 log + 涉及文件路径
  约束:
    - 只改代码,不要 commit / push / git 操作
    - 不要扩范围(看到无关 lint warning 不要顺手清)
    - 不要重命名 / 抽公共方法 / 加注释
    - 修完回复:改了哪几个文件 + 每文件改了什么(1 句)
```

## Claude 主体执行清单

每轮:
- [ ] 拉 build log(`node docs/ops/cicd-ado-monitor.js logs <repo> <buildId> --failed`)
- [ ] 分类 L1 / L2 / L3
- [ ] L1 → 派 subagent;L2 → 本体修;L3 → 报涛哥
- [ ] L1 修完 → Claude 复审 diff(不能扩范围 / 不能跨契约 / 不能影响安全)
- [ ] commit(message 简洁 ≤ 40 字符 + body ≤ 3 行)+ 双推
- [ ] 后台监控 build(优先 `node docs/ops/cicd-ado-monitor.js background <repo> --build-id <id>` 或项目等价 detached wrapper;没有 wrapper 时先补 wrapper,`nohup` 只作实测可存活后的兜底)
- [ ] 绿了短报告;红了 ++ 轮次,回到第 1 步

## 批次任务遵守

CI 自治闭环属于"修复中"动作 — 按 ADR-017 批次任务,**不打断涛哥**,直到:
- 批次内所有 task 完结(包括 ADO 绿)→ 一次性汇报
- 触发 L3 中断白名单 → 立刻汇报(批次外)

## 与已有 SOP 关联

- `cicd-ado-monitor.js`:提供 `status` / `logs` / `cancel-old` / `background` / `summary` / `consume` 子命令；`wait/watch`仅用于短时诊断(Node.js,跨平台)
- `cicd-ado-monitor.js background` 或项目等价脚本:提供低噪声后台监控,记录 PID/log/meta/current state
- `cicd-ado-monitor.md`:用法手册
- `cicd-ado-failure-notification.md`:ADO 邮件订阅(L3 触发时涛哥收到通知)

## 自动化触发闭环(涛哥目标:监控 / 反馈 / 处理高度自动化)

| Phase | 触发机制 | 当前状态 | 备注 |
|---|---|---|---|
| **监控** | ADO Server 自身轮询 build 状态 | ✅ 内建 | pipeline 跑完自动落 status |
| **反馈** | ADO 邮件订阅 → 涛哥收件箱 | ✅ 已配(`cicd-ado-failure-notification.md`) | 失败时即时邮件 |
| **处理 — 半自动**(短期目标) | 涛哥收邮件 → 一键启 Claude session(含 build ID + 自治指令) | 🟡 待落地 | 落 `cicd-self-heal-launcher.js`(下次涛哥邮件按"修复"快捷链接即可启 Claude) |
| **处理 — 全自动**(长期目标) | ADO webhook → Claude Code CLI 远程 invoke → 闭环 → 完结邮件回涛哥 | ⏳ 受限 | Claude Code CLI 当前为交互式,需常驻 worker / 持久 process。优先级低于半自动 |

### 半自动 launcher 落地清单(P3 后续)

1. `cicd-self-heal-launcher.js`:接收 build ID 参数,自动拉 fail log,准备好 Claude session prompt
2. ADO 邮件模板加"修复"按钮(`cmd:`URL scheme 调起 launcher)
3. launcher 输出"已派 Claude 修第 N 轮"日志 + 闭环完成后再发邮件

### 全自动闭环未来形态(等 Claude Code CLI 出 server 模式)

- ADO webhook POST 到内网 Claude server 端点
- Claude server 拉 fail log → 跑闭环 → 完结调 ADO API trigger rebuild
- 完结结果回邮件涛哥(含修复链路 / commit hash / build 链接)
- 失败超 3 轮自动转人工(邮件标 [URGENT])

**不臆测进度**:Claude Code CLI server 模式上线时间未知;当前阶段先落 SOP + 半自动 launcher 即可。
