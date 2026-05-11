# Run Eval — 跑题模板

> 启动 1 次 eval 题跑批的标准操作流程。

---

## 操作流程

### 1. 建独立 worktree(模拟冷启动 / 隔离副作用)

```powershell
$task = "E4-spec-discuss-startup"
$date = Get-Date -Format "yyyy-MM-dd"
$worktreeRoot = "C:\Users\Rhett\Projects\.eval-worktrees"
$worktreePath = "$worktreeRoot\$task-$date"

New-Item -ItemType Directory -Force -Path $worktreeRoot | Out-Null

# 在 SYSV2 仓建 worktree(若 task 涉及代码改动)
cd C:\Users\Rhett\Projects\SYSV2
git worktree add $worktreePath master
cd $worktreePath
```

对 E4(纯 spec discuss,无代码改动)— 可在原 SYSV2 仓的 master 主干上直接跑,但**仍建议建临时 branch**避免污染:

```powershell
git checkout -b eval/$task-$date
```

### 2. 启 Claude session(新进程,模拟新 PM 视角)

**关键**:**不在当前主 session 跑** — 当前 session 已有上下文。必须:
- 新开 Claude Code 实例,或
- 关闭当前 session 重启,或
- 用 `claude --continue=false` 强制冷启动

启动后**直接粘贴题目 prompt**(见 `tasks/<task>.md` §1 题目段),**不给其他提示**。

### 3. 被测 session 跑题(全程 Tier 1 自主)

- 允许 plan 节点拍板(Tier 2 设计内)
- Claude 中途主动 ask 未在 plan 节点的 = "打断"(计入指标)
- 不限时 — 但默认 30 分钟内完成

### 4. 落盘 transcript

被测 session 完成后,导出 transcript 到:

```
engineering-standards/eval/reports/<YYYY-MM-DD>-<task>-transcript.md
```

可选:用 Claude Code `/export` 或截图 + 复制粘贴。

### 5. 派 `code-reviewer` subagent 客观打分

主 session(评分 session,与被测 session 独立)用 Agent 工具:

```
Agent({
  description: "Eval <task> reviewer",
  subagent_type: "code-reviewer",
  prompt: "审核 <task> eval transcript,按 tasks/<task>.md §4 rubric 4 项逐条 yes/no 客观判定,每项给证据(tool call 引用或 grep 命中位置)。输出 reports/<YYYY-MM-DD>-<task>-baseline.md(按 templates/report-schema.md 格式)。"
})
```

### 6. 涛哥抽查(每月 1 题)

涛哥从月度 5 题中抽 1 题:
- 复核 reviewer rubric 判定
- 抽样查 transcript 关键点
- 出"reviewer 客观性"评价(PASS / 需调整)

### 7. ExitWorktree

```powershell
# 删除 worktree
git worktree remove $worktreePath

# 或删除临时 branch(若用 branch 路径)
git branch -D eval/$task-$date
```

---

## 给被测 session 的提示语规则

| ❌ 禁止 | ✅ 允许 |
|---|---|
| 告知"这是 eval 题" | 用涛哥真实口吻 |
| 提示"按 ADR-016 grep 历史" | 自然语境("帮我起 spec" / "看看怎么做") |
| 提示具体动作 | 允许被测主动 ask(计入打断) |
| 暗示评分维度 | 装载完整 CLAUDE.md + ADR + memory |

---

## 反 Self-Gaming 防御层

1. **独立 subagent 审** — 被测 session 不参与自评
2. **涛哥月度抽查** — 复核 reviewer
3. **反指标警示**:
   - 完成率突涨 + 自评全 PASS + Reviewer 轮次 0 → 深审
   - Token 跌穿历史低值 → 装载缺失风险
   - 跨期题目"答案"被记住 → 用 v2 题型替换(锁期满后)

---

## 跨题目并行

允许同时跑多题,每题独立 worktree。Token 总消耗需控制(参见 spec §7.5 频次)。

---

## 题目集 v1

见 `../tasks/` 目录:E1 / E2 / E3 / E4 / E5。

E4 = P1 spike 首跑题目,**0 副作用 + 无 DDL 回滚需要**,推荐第一次跑。

---

## 参见

- [report-schema.md](report-schema.md)(报告输出 schema)
- [../README.md](../README.md)(eval 框架总览)
- [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)
