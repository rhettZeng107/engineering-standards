# SYSV2 Eval 框架

> 跨项目 agent 输出质量量化引擎。配套 [ADR-021](../decisions/ADR-021-harness-mechanization-lint-eval.md)。

## 目的

- 月度量化「涛哥 harness 改动是否真生效」(不是 SWE-bench 通用基准)
- 用数据替代凭感觉,让治理决策(新 ADR / 调 memory / 改 CLAUDE.md)有跨期对比依据
- 验证 Lint 规则装载有效性(同类坑复发率)

## 目录结构

```
eval/
├── README.md                    本文档
├── tasks/                       题目定义(v1 锁 3 个月)
│   ├── E1-list-add-column-i18n.md      (待 P4 落)
│   ├── E2-controller-policy-dto.md     (待 P4 落)
│   ├── E3-known-bug-fix.md             (待 P4 落)
│   ├── E4-spec-discuss-startup.md      ✅ P1 已落
│   └── E5-list-search-filter.md        (待 P4 落)
├── templates/                   跑题 prompt 模板 + 报告 schema
│   ├── run-eval.md              ✅ P1 已落
│   └── report-schema.md         ✅ P1 已落
└── reports/                     baseline + delta 报告(按日期命名)
    └── <YYYY-MM-DD>-<task-id>-baseline.md
```

## 跑题流程(摘要,详见 templates/run-eval.md)

1. **EnterWorktree** 独立 git worktree(模拟冷启动 / 防本仓污染)
2. **装载**:标准全局 CLAUDE.md + SYSV2 项目级 CLAUDE.md + ADR-001~021 + memory + 题目描述
3. **模型**:Claude 4.7(默认)
4. **跑题**:全程 Tier 1 自主;Claude 在 plan 节点之外主动 ask = "打断"(计入指标)
5. **自评 + 审**:落盘后 Claude 自评 + 独立 `code-reviewer` subagent 按 rubric 客观判定(防 self-gaming)
6. **报告**:写到 `reports/<date>-<task>-baseline.md`(按 report-schema.md)
7. **抽查**:涛哥每月抽查 1 题
8. **ExitWorktree**

## 题目集 v1(锁 3 个月,只调参数不改题型)

| # | 题目 | 副作用 | 优先级 |
|---|---|---|---|
| E1 | SYS_HREmp 列表加列 + i18n zh/en + 列设置三图标 | 测试库 DDL 回滚 + git reset | 待 P4 |
| E2 | SYS_AuthInfo GET 接口 + Policy + DTO + 前端调用 | git reset + DDL 回滚 | 待 P4 |
| E3 | 修一个已知 bug(BP 菜单 race 简化版) | git reset | 待 P4 |
| **E4** | Spec discuss 启动「虚拟主题:audit log → ELK」 | **0**(无副作用) | **P1 首跑** |
| E5 | SYS.3 列表页加搜索过滤(数据库已支持) | git reset | 待 P4 |

## 主指标(每月看趋势)

- **自主完成率** = 不打断涛哥跑完的题数 / 总题数 → 协议成熟度
- **同类坑复发率** = eval 中触发的 lint / 已知 memory 规则数 → 规则装载有效性

## 反指标(警示信号)

- 完成率突涨 + 自评全 PASS + Reviewer 轮次 0 → 可能 self-gaming,涛哥抽查
- Token 跌穿历史低值 → 装载缺失风险
- 跨期题目集"答案"被记住 → v1 锁期满后用 v2 题型替换

## 触发频次

| 触发条件 | 跑什么 | 输出 |
|---|---|---|
| 每月 1 次定期 baseline | 5 题全跑 | `reports/<YYYY-MM-DD>-baseline.md` |
| 新 ADR 落地后 | 跑相关题 | `reports/<YYYY-MM-DD>-<task>-delta.md` |
| 新 memory feedback ≥ 3 条 | 跑全集 | baseline + delta |

## 反馈回路

- Reviewer 出"改进建议"段触发动作:
  - 建议加 lint → Plan §P4 新增 sub-task
  - 建议升 ADR → 新建 ADR 链路
  - 建议改 CLAUDE.md → 直接 Edit cheatsheet

## 参见

- [ADR-021](../decisions/ADR-021-harness-mechanization-lint-eval.md)(主决策)
- `SYSV2/docs/superpowers/specs/2026-05-10-harness-mechanization-lint-eval/spec.md` §7(题目集详细规格)
- `SYSV2/docs/superpowers/plans/2026-05-10-harness-mechanization-lint-eval/plan.md`(执行计划)
