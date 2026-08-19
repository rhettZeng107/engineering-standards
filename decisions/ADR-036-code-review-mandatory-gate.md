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

**一句话**:Code Review 是 **commit 门禁(hook 强制)**,但按风险控制频次 —— 普通文档 0 审、代码/执行配置对最终 staged diff 做 1 次主审；只有第二类独立高风险才加定向二审。

**详细**:

### 1. Hook 三阶段守护(`~/.codex/hooks/core-code-review-gate.js`)

| 阶段 | 触发 | 行为 |
|---|---|---|
| **记录** | PostToolUse `Edit\|Write\|MultiEdit\|apply_patch` | 代码/执行配置文件累加到 `~/.codex/state/uncr-edits.json`，只作批次提醒，不作为通过证据 |
| **签发** | `SubagentStop`(独立 reviewer) | Reviewer 最终消息必须以连续两行 `CR-GATE: PASS` + `CR-REPO: <absolute path>` 结尾；缺仓、非绝对路径、标记后仍有正文均不签发。Hook 以 Git NUL 路径协议和 `--no-renames` 同时覆盖中文/特殊字符路径及 code→doc rename，再对该仓当前 staged 代码/执行配置 diff 计算 SHA-256 并写 PASS 凭证 |
| **拦截** | PreToolUse `Bash`(`git commit`) | 当前 staged 代码/执行配置没有相同 diff hash 的 PASS 凭证 → BLOCK；commit 必须为隔离命令(允许单一前置 `cd`)；shell 链/管道、pathspec、`-a/--only/--include/--patch/--interactive` 等会在预检后改变候选的形式一律阻断；Git 状态/差异读取异常按 fail-closed 阻断，可用显式 `skip-cr` 审计绕过 |

### 2. 计入 CR 的文件范围

- **计入代码**:`.jsx/.tsx/.ts/.js/.cs/.css/.less/.scss/.sql/.cshtml/.vue/.py/.go/.rs/.java/.kt/.swift/.cpp/.c/.h/.sh/.ps1/.toml/.props/.targets`
- **计入执行配置**:`package*.json`、依赖锁、`hooks.json`、`appsettings*.json`、`launchSettings/global.json`、`Web/NuGet/*.config`、`.npmrc/.yarnrc`、`pnpm-workspace`、`tsconfig/jsconfig`、CI workflow YAML、Docker/Makefile、`harness-policy.yml` 等会改变构建、运行、门禁或依赖的配置。
- **不计入**:`node_modules/**` / `build|dist/**` / 纯 markdown / 普通数据 JSON/YAML；是否计入按执行语义和明确文件模式判断，不按“所有 JSON/YAML”扩大。`docs/**`、`.planning/**` 不是目录级豁免，其中的 ops/deploy JS、PS1、Python、SQL 等真实执行资产仍计入。

### 3. Reviewer 白名单与一主审路由

`code-reviewer`(无专业风险默认)/ `csharp-reviewer` / `typescript-reviewer` / `python-reviewer` / `go-reviewer` / `rust-reviewer` / `java-reviewer` / `cpp-reviewer` / `kotlin-reviewer` / `flutter-reviewer` / `dba` / `architect` / `security-reviewer` / `database-reviewer` 等(支持 plugin 命名空间 `xxx:code-reviewer`)。

实现角色(`frontend-developer`、`dotnet-developer`、普通 worker 等)不能签发凭证。专业 Reviewer 替代通用 `code-reviewer`，不默认叠加；文件数量本身不触发 architect。

### 4. 绕过开关(审计可见)

紧急场景只能在命令开头加独立注释行 `# skip-cr=<reason>`(e.g. `# skip-cr=hotfix-rollback` 后换行再执行 commit),Hook 放行并追加 `~/.codex/state/cr-gate-bypass.jsonl` 审计记录；commit message 或命令中部出现该文本不生效。普通 docs-only staged diff 本身不触发代码门禁，无需绕过。

### 5. 评审频次与二审触发

- 普通文档/文案/非执行配置:0 次 Reviewer；保留格式、解析、链接等确定性检查。
- 简单代码/执行配置:最小验证后 stage 最终候选，1 次主 CR。
- 标准/迁移:每个可独立交付 staged 批次 1 次主 CR，不按文件、Phase 或实现 Agent 重复审。
- 只有第二类独立高风险、CRITICAL/HIGH 回修、范围扩大或大幅返工才做定向二审；MED/LOW 小修且验证通过不重跑全量 CR。
- 静态契约检查与真实 UI E2E 检查对象不同，需要时都保留。

---

## Consequences(影响)

### 正面

- CR 从「自觉」变「门禁」,杜绝连续多 commit 漏审
- 状态文件按 repo 分桶,multi-repo workspace 各仓独立计数
- 凭证绑定 Reviewer 完成事件、PASS 结论、仓库和 staged diff hash；审后改动自然失效
- `# skip-cr=` 绕过保留灵活性(hotfix / docs-only)+ 审计可追

### 代价 / 风险

- 每个代码交付批次 commit 前仍增加一次独立 Reviewer 调用；通过一主审和风险触发二审控制成本。
- Reviewer 必须在 stage 后运行并输出固定 PASS 标记；旧的“先审工作区、后 stage”顺序不再签发凭证。
- Hook 仍是机械护栏，不能替代对 Reviewer 报告质量、测试结果和真实 E2E 的主会话验收。

### 配套固化

| 配套 | 位置 | 状态 |
|---|---|---|
| Hook 实现 | `~/.codex/hooks/core-code-review-gate.js` + `hooks.json` 注册(PreToolUse Bash + PostToolUse Edit/Write/apply_patch + SubagentStop) | ✅ |
| 全局 AGENTS.md 修订 | 「评审」段固化一主审、风险触发二审和 staged-diff 凭证 | ✅ |
| 工作区 memory | `feedback_cr_mandatory_gate.md`(踩坑 case + hook 行为) | ✅(SRMV2)|

---

## Alternatives Considered(备选方案)

| 方案 | 描述 | 否决原因 |
|---|---|---|
| A 纯 PreToolUse commit 拦 | 检 staged 代码文件 → 验 session 派过 CR | 只验证“派过”不能证明 Reviewer 完成、PASS 或当前 diff 未变化 |
| C 仅 commit body 强制 `Reviewed-by:` | commit msg 必含 reviewer agent id | 可写假 id 绕过,**审计弱** |
| **staged-diff receipt(采纳)** | `SubagentStop` PASS + staged diff hash + commit 前重算 | 审查对象与提交对象一致；实现 Agent、启动事件和审后改动不能误放行 |

---

## 修订历史

- 2026-05-28 创建(Accepted)。触发:SRMV2 polish 批次连续漏 CR 复盘。
- 2026-08-19 修订(Accepted)。涛哥批准从固定多审改为风险触发式评审：普通文档 0 审、代码每批 1 次主审、专业 Reviewer 替代通用 Reviewer、二审仅由独立高风险触发；Codex Hook 改用 `SubagentStop` + staged diff hash + PASS 凭证。
