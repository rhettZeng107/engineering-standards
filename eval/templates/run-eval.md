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

### 2. 启隔离的被测 session(模拟冷启动)

**关键**:**不在当前主 session 跑** — 当前 session 已有上下文。使用独立 Codex thread、`codex exec -C <worktree> --json`、独立 runtime session 或等价隔离方式,并记录实际 model ID、reasoning effort 与配置。

启动后**直接粘贴题目 prompt**(见 `tasks/<task>.md` §1 题目段),**不给其他提示**。

### 3. 被测 session 跑题(全程 Tier 1 自主)

- 允许 plan 节点拍板(Tier 2 设计内)
- 被测 session 中途主动 ask 未在 plan 节点且并非授权/安全所必需 = "打断"(计入指标)
- 不限时 — 但默认 30 分钟内完成

### 4. 落盘 transcript

被测 session 完成后,导出 transcript 到:

```
engineering-standards/eval/reports/<YYYY-MM-DD>-<task>-transcript.md
```

优先保存 runtime 直接导出的 JSONL/trace;不能导出时保存评分所需的最小证据,不重新让模型总结 transcript。

### 5. 先确定性评分,再做必要的隔离语义评分

能由 exit code、JSON、Git、build、test、E2E 和固定断言评分的项目直接机器判定。只有业务语义、证据冲突或开放式质量项才使用与被测执行隔离的 Reviewer;Reviewer 类型按风险路由,不固定叠加通用 `code-reviewer`。

```
Review the <task> evidence against tasks/<task>.md rubric. Preserve deterministic grader results, judge only semantic items, cite evidence anchors, and output reports/<YYYY-MM-DD>-<task>-baseline.md using templates/report-schema.md.
```

### 6. 涛哥抽查(每月 1 题)

涛哥从当月实际运行的代表性题中抽 1 题:
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

1. **确定性 grader 优先 + 隔离 Reviewer** — 被测 session 不参与自评
2. **涛哥月度抽查** — 复核 reviewer
3. **反指标警示**:
   - 完成率突涨 + 全 PASS + 缺独立证据 → 深审
   - unknown/not-required/blocked 被计为 PASS/0 → 数据污染
   - HIGH 逃逸无观察边界 → 不接受该指标
   - Token 跌穿历史低值仅在自动采集且配置可比时才检查装载缺失
   - 跨期题目"答案"被记住 → 用 v2 题型替换(锁期满后)

---

## 跨题目并行

允许同时跑独立题,每题独立 worktree。优先跑与本次规则/模型变化相关的最小代表性集合,不要为“全集”名义固定消耗 Token。

---

## 题目集 v1

以 `../tasks/` 实际存在的文件为准。当前只有 E4 已落盘;README 中待办题不算可运行题。新增题应覆盖 provider-neutral standard 定义的 10 类 golden task,优先从真实 run record/逃逸案例脱敏提炼。

---

## 参见

- [report-schema.md](report-schema.md)(报告输出 schema)
- [../README.md](../README.md)(eval 框架总览)
- [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)
