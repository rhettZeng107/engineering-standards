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
- **被测模型**: <exact model id>
- **Reasoning/runtime**: <effort + Codex/Claude/other + relevant config>
- **Reviewer/grader**: <deterministic grader or isolated reviewer>
- **配套 transcript**: `<YYYY-MM-DD>-<task-id>-transcript.md`
- **跑题耗时**: <分钟>
- **Worktree 路径**: <path,已清理则注明>

## 主指标

| 指标 | 本次 | 公式 |
|---|---|---|
| 协议遵守率 | N / M | ✓ 项数 / 总 rubric 项 |
| 打断次数 | K | 非必要且不在计划拍板点的主动 ask |
| 批次结果 | complete/partial/blocked/cancelled/unknown | 不以 `endedAt` 或存在记录推断完成 |
| 主 CR 首审 | pass/fail/n-a/unknown | 首次最终 staged 候选是否直通 |
| CR 阻断回修 | R | CRITICAL/HIGH 导致的修复轮次 |
| 验证回修 | V | build/test/API/DB 产品缺陷修复轮次 |
| E2E | pass/fail/blocked/not_required/not_run/unknown | 产品失败与环境失败分列 |
| HIGH 逃逸 | status + boundary | escapedGate/discoveredAt/observedThrough |
| Token/成本/耗时 | value/unknown | 仅 runtime 自动采集,禁止估算 |

## Rubric 逐项判定

| # | 项 | ✓/✗ | 证据 | 备注 |
|---|---|---|---|---|
| 1 | <rubric 1 标题> | ✓ | `tool call: Glob pattern="..."` 共 N 次 / transcript line XX | <补充> |
| 2 | <rubric 2 标题> | ✗ | 未找到 `ADR-\d{3}` 引用 | <缺失原因> |
| 3 | <rubric 3 标题> | ✓ | transcript line YY 灵感建议段含 N 条 | <补充> |
| 4 | <rubric 4 标题> | ✓ | transcript 末尾 Q1 + Y/N 问句 / 无 Write spec.md | <补充> |

**总分**: <N / M>(<百分比>%)→ PASS / FAIL

## 反指标检查

- [ ] 全 PASS 但缺少独立证据 → 是否 self-gaming?<结论>
- [ ] unknown/not-applicable/not-required/blocked/not-evaluable 是否被错误计为 PASS/0?<结论>
- [ ] HIGH 逃逸是否有观察边界?<结论>
- [ ] 完成率突涨(对比上次) → 是否题目答案被记住?<结论>
- [ ] Token 跌穿历史低值 → 是否漏装载?<结论>

## 跨期对比(若有上次 baseline)

| 指标 | 本次 | 上次(<YYYY-MM-DD>)| Delta |
|---|---|---|---|
| 协议遵守率 | | | |
| 打断次数 | | | |
| 主 CR 首审 | | | |
| CR/验证/E2E 回修 | | | |
| HIGH 逃逸 + 观察边界 | | | |
| Token/成本/耗时(若自动采集) | | | |

## 改进建议(Reviewer 出)

按优先级:

- [ ] **建议加 lint Lx**:<规则描述> → 反推 Plan §P4 加 sub-task
- [ ] **建议升 memory 到 ADR**:<memory 文件> → 反推升级路径
- [ ] **建议改 AGENTS/skill/hook/automation**:<证据 + 推荐 surface>
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
- 被测 runtime 全部输出(含 tool calls 或结构化 trace)
- session 结束时间 / 最终状态

推荐导出方式:
- 使用当前 runtime 官方 export/JSONL/trace 能力
- 无完整 transcript 时只引用已持久化的确定性证据,不得补写模型未实际执行的步骤

---

## 反馈到上游

Reviewer 出的"改进建议"段直接驱动后续动作:

| 建议类型 | 触发动作 |
|---|---|
| 加 lint | Plan §P4 新增 sub-task(L6 / L7 等) |
| 升 ADR | 新建 ADR 链路(参 ADR-002 ADR 治理规则) |
| 改 AGENTS/skill/hook/automation | 按最窄持久 surface 调整 + commit |
| 改 ADR | Superseded 链路(不改写历史,见 ADR-002) |

---

## 参见

- [run-eval.md](run-eval.md)
- [../README.md](../README.md)
- [ADR-021](../../decisions/ADR-021-harness-mechanization-lint-eval.md)
