# 跨工作区 AI Coding Harness Eval

> 跨项目 agent 输出质量量化引擎。配套 [ADR-021](../decisions/ADR-021-harness-mechanization-lint-eval.md)。

## 目的

- 月度量化「AI coding workflow 改动是否真生效」(不是 SWE-bench 通用基准)
- 用数据替代凭感觉,让治理决策(AGENTS / ADR / skill / hook / automation / model route)有跨期对比依据
- 验证 Lint 规则装载有效性(同类坑复发率)
- 用正常门禁已经产生的首审、返工、E2E、重新锁定和 HIGH 逃逸事件建立低额外 Token 的运行基线

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
│   ├── report-schema.md         ✅ P1 已落
│   └── monthly-workflow-review.md 月度工作流复盘模板
└── reports/                     baseline + delta 报告(按日期命名)
    └── <YYYY-MM-DD>-<task-id>-baseline.md
```

## 跑题流程(摘要,详见 templates/run-eval.md)

1. **EnterWorktree** 独立 git worktree(模拟冷启动 / 防本仓污染)
2. **装载**:当前全局/项目 `AGENTS.md` + provider-neutral harness standard + 命中的 ADR/skill/memory + 题目描述
3. **模型**:记录实际 model ID、reasoning effort、runtime 与配置;不在框架里长期硬编码某个 provider/model
4. **跑题**:按题目授权层级执行;计划节点外的非必要 ask 计为打断
5. **评分**:确定性 grader 优先;需要语义判断时用与被测执行隔离的 Reviewer,并由涛哥抽样校准(防 self-gaming)
6. **报告**:写到 `reports/<date>-<task>-baseline.md`(按 report-schema.md)
7. **抽查**:涛哥每月抽查 1 题
8. **ExitWorktree**

## 当前题目集实况

| # | 题目 | 副作用 | 优先级 |
|---|---|---|---|
| E1 | SYS_HREmp 列表加列 + i18n zh/en + 列设置三图标 | 测试库 DDL 回滚 + git reset | 待 P4 |
| E2 | SYS_AuthInfo GET 接口 + Policy + DTO + 前端调用 | git reset + DDL 回滚 | 待 P4 |
| E3 | 修一个已知 bug(BP 菜单 race 简化版) | git reset | 待 P4 |
| **E4** | Spec discuss 启动「虚拟主题:audit log → ELK」 | **0**(无副作用) | **P1 首跑** |
| E5 | SYS.3 列表页加搜索过滤(数据库已支持) | git reset | 待 P4 |

当前仓内只有 E4 题目与 2026-05-11 Claude Sonnet 4.6 历史 baseline;它用于历史参考,不代表当前 Codex/GPT-5.6 工作流质量。E1/E2/E3/E5 与跨项目新增题未真实落盘前,不得汇报为“5 题月度全集已运行”。目标覆盖仍按 provider-neutral standard 的 10 类 golden task 扩展。

## 主指标(按任务类别分层看趋势)

- 完成率、证据完整度。
- 主 CR 首审通过率。
- CR 阻断回修、验证回修、E2E 产品回修和重新锁定次数。
- E2E 结果,并把产品失败与环境/传输失败分开。
- HIGH/CRITICAL 逃逸,按 `observedThrough` 观察边界解释。
- Token、成本、耗时仅在 runtime 自动取得时记录;不要求模型估算。

## 反指标(警示信号)

- 完成率突涨 + 首审全 PASS + 无确定性证据 → 可能 self-gaming,涛哥抽查
- `unknown/not_required/blocked/not_evaluable` 被当作 PASS/0 → 数据污染
- HIGH 逃逸没有观察边界却报 0 → 右删失数据被误判
- Token 跌穿历史低值只在自动采集可比时才作装载缺失信号
- 跨期题目集"答案"被记住 → v1 锁期满后用 v2 题型替换

## 触发频次

| 触发条件 | 跑什么 | 输出 |
|---|---|---|
| 每月 1 次工作流复盘 | 聚合当月 run record + 可用代表性 eval + 后续 HIGH/事故 | `reports/<YYYY-MM>-workflow-review.md`或 Scheduled 只读报告 |
| 每月/重大模型变更 baseline | 运行当前已落盘、与变更相关的代表性题;不得假称未落盘题已运行 | `reports/<YYYY-MM-DD>-<task>-baseline.md` |
| 新 ADR 落地后 | 跑相关题 | `reports/<YYYY-MM-DD>-<task>-delta.md` |
| 同类反馈/逃逸重复或单次 CRITICAL/HIGH | 扩充真实案例并跑定向 delta | baseline + delta |

月度复盘先运行确定性聚合器,并显式传入业务时区(马来西亚/中国工作区通常为 `+08:00`):

```bash
node tools/ai-harness/aggregate-run-records.mjs \
  --month <YYYY-MM> \
  --timezone +08:00 \
  <workspace-root> [<workspace-root> ...]
```

先处理输出中的数据质量缺口,再把结构化汇总交给模型做原因归类与规则建议。聚合器不调用模型,因此不会为统计本身增加 Token 成本。

## 反馈回路

- 月度报告对规则只给 `retain/optimize/move_to_mechanism/demote/remove` 建议,不得无人值守改规则。
- 一次只改一组可归因规则,改前保留 baseline,改后运行对应 delta。
- 零事故不能单独证明规则无用;安全、生产破坏、鉴权、不可逆 DB、审计边界需要等强或更强替代机制才允许下沉/删除。
- Reviewer/评测建议按落点处理:
  - 可确定性验证 → hook/lint/CI/script
  - 重复多步流程 → skill/automation
  - 长期跨项目决策 → ADR/standard
  - 项目特化 → 项目 AGENTS/spec

## 参见

- [ADR-021](../decisions/ADR-021-harness-mechanization-lint-eval.md)(主决策)
- `SYSV2/docs/superpowers/specs/2026-05-10-harness-mechanization-lint-eval/spec.md` §7(题目集详细规格)
- `SYSV2/docs/superpowers/plans/2026-05-10-harness-mechanization-lint-eval/plan.md`(执行计划)
