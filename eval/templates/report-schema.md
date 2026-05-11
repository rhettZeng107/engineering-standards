# Report Schema

> Eval 跑题报告标准 schema。所有 `reports/*.md` 必填字段。

---

## 文件命名

| 类型 | 命名 | 说明 |
|---|---|---|
| Baseline | `<YYYY-MM-DD>-<task-id>-baseline.md` | 月度首次 |
| Delta | `<YYYY-MM-DD>-<task-id>-delta.md` | 新 ADR 后 |
| Transcript | `<YYYY-MM-DD>-<task-id>-transcript.md` | 完整 session 记录 |

---

## Baseline / Delta 报告 Schema

```markdown
# Eval Report: <task-id> @ <YYYY-MM-DD>

## 元数据

- **题目**: <task name>
- **类型**: baseline / delta
- **日期**: <YYYY-MM-DD>
- **被测模型**: Claude 4.7
- **Reviewer**: code-reviewer subagent
- **配套 transcript**: `<YYYY-MM-DD>-<task-id>-transcript.md`
- **跑题耗时**: <分钟>
- **Worktree 路径**: <path,已清理则注明>

## 主指标

| 指标 | 本次 | 公式 |
|---|---|---|
| 协议遵守率 | N / M | ✓ 项数 / 总 rubric 项 |
| 打断次数 | K | Claude 主动 ask 未在 plan 节点次数 |
| Token 用量 | X K | 被测 session 总消耗 |
| Reviewer 轮次 | R | 0 = 直通 |
| E2E pass 率 | n/a 或 X% | 仅 E1/E2/E3/E5 适用 |

## Rubric 逐项判定

| # | 项 | ✓/✗ | 证据 | 备注 |
|---|---|---|---|---|
| 1 | <rubric 1 标题> | ✓ | `tool call: Glob pattern="..."` 共 N 次 / transcript line XX | <补充> |
| 2 | <rubric 2 标题> | ✗ | 未找到 `ADR-\d{3}` 引用 | <缺失原因> |
| 3 | <rubric 3 标题> | ✓ | transcript line YY 灵感建议段含 N 条 | <补充> |
| 4 | <rubric 4 标题> | ✓ | transcript 末尾 Q1 + Y/N 问句 / 无 Write spec.md | <补充> |

**总分**: <N / M>(<百分比>%)→ PASS / FAIL

## 反指标检查

- [ ] 自评全 PASS 但 Reviewer 轮次 0 → 是否 self-gaming?<结论>
- [ ] 完成率突涨(对比上次) → 是否题目答案被记住?<结论>
- [ ] Token 跌穿历史低值 → 是否漏装载?<结论>

## 跨期对比(若有上次 baseline)

| 指标 | 本次 | 上次(<YYYY-MM-DD>)| Delta |
|---|---|---|---|
| 协议遵守率 | | | |
| 打断次数 | | | |
| Token | | | |
| Reviewer 轮次 | | | |

## 改进建议(Reviewer 出)

按优先级:

- [ ] **建议加 lint Lx**:<规则描述> → 反推 Plan §P4 加 sub-task
- [ ] **建议升 memory 到 ADR**:<memory 文件> → 反推升级路径
- [ ] **建议改 CLAUDE.md cheatsheet**:<段名> → 反推 Edit
- [ ] **建议改 ADR**:<ADR 编号> → 反推 Superseded 链路

## 涛哥抽查结果(若本月被抽到)

- [ ] Reviewer 判定客观性:PASS / 需调整
- [ ] 抽样查 transcript 关键点:<具体>
- [ ] 备注:<涛哥意见>

## 参见

- [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)
- `tasks/<task>.md`(题目定义 + rubric reference)
- `templates/run-eval.md`(跑题流程)
```

---

## Transcript Schema(完整 session 记录)

格式自由,但必含:

- session 启动时间 / 装载列表 / 模型版本
- 用户 prompt(题目)
- Claude 全部输出(含 tool calls)
- session 结束时间 / 最终状态

推荐导出方式:
- Claude Code `/export <path>`
- 或主 session 用 Bash 读取 `~/.claude/projects/<project-hash>/session-<id>.jsonl` 转 markdown

---

## 反馈到上游

Reviewer 出的"改进建议"段直接驱动后续动作:

| 建议类型 | 触发动作 |
|---|---|
| 加 lint | Plan §P4 新增 sub-task(L6 / L7 等) |
| 升 ADR | 新建 ADR 链路(参 ADR-002 ADR 治理规则) |
| 改 CLAUDE.md cheatsheet | 直接 Edit + commit |
| 改 ADR | Superseded 链路(不改写历史,见 ADR-002) |

---

## 参见

- [run-eval.md](run-eval.md)
- [../README.md](../README.md)
- [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)
