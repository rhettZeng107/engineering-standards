# SYSV2 ADO Pipeline Failure 邮件通知配置

> 创建:2026-05-14(Phase 1.1)
> 目的:Pipeline 失败时涛哥/Claude 第一时间收到邮件,不必盯 ADO UI
> 关联 ADR:ADR-022(CI/CD Monitor & Feedback 策略)— 被动接收侧
> 配套:`cicd-ado-monitor.md` — 主动查询侧

## ADO Server 内置邮件通知机制

ADO Server(2020+)自带 Subscription 通知系统,无需写代码,**Project Settings → Notifications** 配置。

## 配置步骤(涛哥手动一次配完)

### 1. 配 SMTP(ADO Server 全局,只配一次)

如果 ADO Server 还没配 SMTP,先去:

- ADO Server Web UI → 右上齿轮 → **Server settings** → **Email** / **SMTP**
- 填公司 SMTP server / 端口 / 发件人地址 / 凭据
- 测试发送一封到涛哥邮箱确认通

### 2. 启用涛哥个人订阅(每个 Project 一次)

对 `JYDevOps/JYPrdCollection` Project:

1. 涛哥登录 ADO Server,右上头像 → **User settings** → **Notifications**
2. 点 **New subscription**
3. 选模板:**A build fails**(或 **A run fails in this project** 7.0+ 版本)
4. Filter 留 default(All pipelines in JYPrdCollection)
5. Delivery 选 **Email** → 填涛哥邮箱
6. Save

### 3. (可选)团队邮件组订阅

如果将来多人协作:

- ADO Server → **Project settings → Notifications → Team or group**
- New subscription:**A build fails** → 邮件组(如 `sysv2-dev@xxx`)

## 6 个 SYSV2 Pipeline 都自动覆盖

订阅 Filter = "All pipelines in JYPrdCollection",自动覆盖:

| Pipeline | 失败邮件触发 |
|---|---|
| AI.Extend.SYS | ✅ |
| AI.REACT.SYS.3 | ✅ |
| AI.REACT.SYS.BusinessPortal | ✅ |
| AI.REACT.SYS.AuditPortal | ✅ |
| AI.Extend.MDM.1 | ✅ |
| AI.REACT.MDM.1 | ✅ |

新增 Pipeline 不需要单独订阅(Filter 是 project 级)。

## 邮件内容应该有

ADO 默认邮件模板含:

- Pipeline 名 + Build 编号 + 触发的 commit
- 失败 stage / task 名 + 失败时间
- 直达 build log URL(点开看红色 task)
- 触发人 + 分支

## 配完验证

涛哥手动 trigger 一次某 Pipeline 让它失败(改 spec 故意写错),收到邮件 = OK。

或者直接复用近期已失败的 build:ADO → Pipelines → 失败的 build → **Run new** 重跑,如果配好邮件应该几分钟内到。

## 关联

- 主动查询侧:`cicd-ado-monitor.md` — Claude/涛哥 PowerShell 命令查 build 状态
- 配 SMTP 详细参数:`cicd-iis-server-setup.md` § 邮件服务(待补)
- ADR-022:CI/CD Monitor & Feedback 完整策略
