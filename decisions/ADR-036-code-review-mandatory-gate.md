# ADR-036: Code Review 强制门禁 — CR 是 commit 门禁,非自觉建议

- **Status**: Accepted
- **Date**: 2026-05-28
- **Decider**: 涛哥
- **Scope**: 跨项目(SYSV2 / SRMV2 / HC / 未来 MES/WMS/EAM/TPM 等所有工作区)

---

## Context(背景 / 为什么需要决策)

### 触发场景

2026-05-28 SRMV2 供应商前端 polish 批次,Claude 连续落盘 **7 个代码 commit**(Phase 1-4 + 登录页 1:1 + topbar 重做),**全程 0 次主动派 code-reviewer**。涛哥 VPN 走查连续发现明显低级缺陷:

- 登录页账户字段双层嵌套盒子(antd affix-wrapper + 内 input 双 border)
- 顶部 `.header` 蓝色 64px 包白色 `.appbar` 60px → 蓝色露边 + 颜色冲突
- nav chip「公告」`Link to="/announcement"` 路由不存在(404)
- `PlantImageId({plantCode:"S1001"})` 硬编码(Phase 0 spike 已记录要改 `getDefaultPlantCode()`)
- E2E spec selector 与实装 placeholder 不匹配(本批 E2E 全 false-positive)
- Login 文件 3 处 `console.log(res)`(含 token,production 泄露)
- 140+ 行 CSS 死代码

事后补派 code-reviewer 一次性查出 5 HIGH + 7 MEDIUM + 6 LOW —— **本可在每个 commit 前拦下**。

### 根因(为什么会漏)

1. **设计层**:全局 CLAUDE.md「评审」段 + 「立即派 无需提示」**是自觉,无硬约束**
2. **批次流 drift**:涛哥「自治推进 最后汇报」被解读成「commit/push 之间不打断」→ 漏掉「commit 前必 CR」是同等级硬约束(中断白名单第 1 项就是 CR)
3. **派 qwen 模式偏差**:派 qwen 后默认 qwen 已自审 → **qwen ≠ reviewer agent**,但心智里等同了
4. **进度压力**:多 Phase 连推 + 网络抖断 → CR 被降级为「可选优化」而非「必经门」
5. **无复盘固化**:第一次被批评口头改,没 hook / 没 ADR → 第二次必再犯

### 现状实证

- 33 个已有 hook:**0 个 CR 触发/拦截 hook**(`ls ~/.claude/hooks | grep -iE review` 仅 secret-scan)
- 全局 CLAUDE.md:`60-65`「代码层默认 code-reviewer」+ `182`「代码刚写完 → code-reviewer(无需提示)」—— 规则在,执行靠自觉

---

## Decision(决策本身)

**一句话**:Code Review 是 **commit 门禁(hook 强制)**,不是自觉建议 —— 代码文件落盘后未过 reviewer agent,`git commit` 被 BLOCK。

**详细**:

### 1. Hook 三阶段守护(`~/.claude/hooks/core-code-review-gate.js`)

| 阶段 | 触发 | 行为 |
|---|---|---|
| **记录** | PostToolUse `Edit\|Write\|MultiEdit` | 代码扩展名文件累加到 `~/.claude/state/uncr-edits.json`(按 git repo root 分桶);累计 3/6/10 个时 stderr 软提醒 |
| **清空** | PostToolUse `Task\|Agent`(reviewer 类 agent) | reviewer agent 完成 → 清空当前 repo 未审清单 |
| **拦截** | PreToolUse `Bash`(`git commit`) | 当前 repo 未审清单非空 → BLOCK(exit 2)+ 列文件 + 提示派 reviewer |

### 2. 计入 CR 的文件范围

- **计入**:代码扩展名 `.jsx/.tsx/.ts/.js/.cs/.css/.less/.scss/.sql/.cshtml/.vue/.py/.go/.rs/.java/.kt/.swift/.cpp/.c/.h`
- **不计入**:`docs/**` / `.planning/**` / `node_modules/**` / `build|dist/**` / 纯 markdown / json / yml 配置

### 3. reviewer agent 白名单(清空触发)

`code-reviewer`(默认)/ `csharp-reviewer` / `typescript-reviewer` / `python-reviewer` / `go-reviewer` / `rust-reviewer` / `java-reviewer` / `cpp-reviewer` / `kotlin-reviewer` / `flutter-reviewer` / `dba` / `architect` / `frontend-developer` / `security-reviewer` / `database-reviewer` 等(支持 plugin 命名空间 `xxx:code-reviewer`)

### 4. 绕过开关(审计可见)

紧急场景命令前加注释 `# skip-cr=<reason>`(e.g. `# skip-cr=hotfix-rollback` / `# skip-cr=docs-only`),hook 放行 + stderr 记录 reason。

### 5. reviewer agent 路由(沿用 ADR-003 + 全局「评审」段)

- 默认 `code-reviewer`;C# / .NET → `csharp-reviewer` 或 `dba`(迁移/DDL);DB → `dba`;跨仓 ≥ 10 文件 → `architect`
- 轮数:0 CR + 0 HIGH 通过 / 0 CR + HIGH Claude 本体回修自审 / 有 CR 列涛哥拍板

---

## Consequences(影响)

### 正面

- CR 从「自觉」变「门禁」,杜绝连续多 commit 漏审
- 状态文件按 repo 分桶,multi-repo workspace 各仓独立计数
- reviewer agent 完成自动清空,无需手动管理
- `# skip-cr=` 绕过保留灵活性(hotfix / docs-only)+ 审计可追

### 代价 / 风险

- 每批代码改动 commit 前**必须**派 reviewer agent(增加一次 agent 调用成本)—— 但这正是目的
- 状态文件 `uncr-edits.json` 跨 session 持久 → 若上次 session 未 commit 残留,新 session commit 会被拦(可 `# skip-cr=stale-state` 或派 CR)
- hook 不能 introspect agent 真实审了哪些文件 → reviewer agent「跑了就清空」,信任 agent 真审(trust but verify 仍靠 Claude 本体把关 reviewer 报告质量)

### 配套固化

| 配套 | 位置 | 状态 |
|---|---|---|
| Hook 实现 | `~/.claude/hooks/core-code-review-gate.js` + `hooks.json` 注册(PreToolUse Bash + PostToolUse Edit\|Write\|MultiEdit + Task\|Agent) | ✅ |
| 全局 CLAUDE.md 修订 | 「评审」段 + 「中断白名单第 1 项 CR」加「**hook 强制 `core-code-review-gate`**」标注 | ✅ |
| 工作区 memory | `feedback_cr_mandatory_gate.md`(踩坑 case + hook 行为) | ✅(SRMV2)|

---

## Alternatives Considered(备选方案)

| 方案 | 描述 | 否决原因 |
|---|---|---|
| A 纯 PreToolUse commit 拦 | 检 staged 代码文件 → 验 session 派过 CR | hook 独立进程,**无法 introspect** session agent 调用历史 |
| C 仅 commit body 强制 `Reviewed-by:` | commit msg 必含 reviewer agent id | 可写假 id 绕过,**审计弱** |
| **B+C 组合(采纳)** | 状态文件累积未审清单 + agent 完成清空 + commit 拦 | 精确知道哪些文件未审,审计完整,绕过可控 |

---

## 修订历史

- 2026-05-28 创建(Accepted)。触发:SRMV2 polish 批次连续漏 CR 复盘。
