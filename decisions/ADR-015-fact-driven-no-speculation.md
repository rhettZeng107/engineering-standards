# ADR-015: 事实驱动禁臆测 4 步硬规则

- **Status**: Accepted
- **Date**: 2026-05-09(回溯,实际 2026-04-22 起效 + 2026-05-02 升级)
- **Decider**: 涛哥
- **Scope**: 跨项目

---

## Context

任何方案 / 数字 / 选项给涛哥前,LLM 容易出现"凭直觉 / 凭经验 / 大概 / 应该 / 可能 / 估算"这类语境黑名单的推测式输出。SYSV2 项目早期(2026-04 之前)多次踩坑:Claude 拿着臆测的字段名 / 路由 / 表名 / 行号给涛哥拍板,后期实证发现错位 → 全文回溯返工,工作量膨胀 2-3 倍。

实证案例:LOGO bug 三轮反复 / Category 边界臆测 / AuthInfo 取错表 / MDM 老 conn 10.9 → P-E 数据双轨。

## Decision

**一句话**:任何方案 / 数字 / 选项给涛哥前,严禁推测 / 假设 / 估算 / 大概 / 可能 / 应该 / 凭直觉 / 凭经验;引用具体事实(类名 / 字段 / 路由 / 表 / API / 行号 / 路径)必须 session 内 read / grep / dba 验证;上游 agent 报告 trust but verify。

**4 步硬规则**:
1. **实证现状** — grep + read + dba 拿到 file:line / 字段 / 表名锚点
2. **基于事实给方案** — 列实证依据 file:line,不允许"先给个大概"
3. **沟通涛哥拍板** — 简洁 + 推荐 + 不主动拍板
4. **严按方案执行** — 实证反转即停升档报涛哥
5. **改前实证目标对象现状**(2026-05-26 修订,SRMV2 R7+R8 反例驱动) — 任何 INSERT/UPDATE/Edit/改 controller 字段引用前,**前置必跑全字段/全子代/全列模板** SELECT/grep,**禁** 凭"自己已列的清单 = 已知的全部"假设

**例外**(允许凭经验):通用语法 / 标准库 API / CLAUDE.md 明文事实 / 涛哥对话直接告知。

## Consequences

### 正向
- 决策返工率显著下降(spec/plan 阶段错位发现率从 40% 降到 < 10%)
- 涛哥拍板成本降低(不需要事后纠偏)
- AI 幻觉踩坑可防控

### 负向 / 代价
- 实证耗时增加(单次 spec 启动多 5-15 分钟 grep/read)
- session token 消耗上升
- 简单 task 也走实证有过度风险(已由 ADR-018 边界判定矩阵兜底)

### 影响范围
- 全局 CLAUDE.md「事实驱动 / 禁臆测」段
- 所有 spec discuss 阶段
- 所有 task 落盘前实证步骤
- memory:`feedback_fact_driven_no_speculation.md`(详细黑名单 + 实证案例)
- memory:`feedback_evidence_consumer_vs_producer.md`(消费端 vs 被消费端实证规则)

## Alternatives Considered

### A. 完全自由发挥(LLM 默认行为)
- 优点:速度快 / token 消耗低
- 缺点:臆测踩坑率高 / 涛哥事后纠偏成本高
- 不选原因:涛哥多次反馈"AI 凭经验给方案",决策成本高于实证成本

### B. 仅在涛哥要求时实证
- 优点:平时省时
- 缺点:涛哥 PM 不懂代码,无法判断何时要实证;反而要等踩坑后才发现
- 不选原因:违反"涛哥不应承担实证判断职责"原则

## Related

- memory:`feedback_fact_driven_no_speculation.md`
- memory:`feedback_evidence_consumer_vs_producer.md`
- 下游 ADR:ADR-016(spec 启动先 grep 历史)/ ADR-018(边界判定矩阵)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-04-22 | Proposed → Accepted | 涛哥首次拍板,memory 落地 |
| 2026-05-02 | Updated | 4 步硬规则升级,语境黑名单完善 |
| 2026-05-09 | 回溯落 ADR | Tier 2 候选回溯 |
| 2026-05-26 | Updated | **追加第 5 步「改前实证目标对象现状」**(SRMV2 spec `2026-05-26-srm-buyer-srmbasic-backfill-and-legacy-cleanup` R7+R8 反例驱动:R7 改 controller 加 entity 字段前没 grep entity 真实字段 → CI build CS1061;R8 改 6 项 TagFather 前没 SELECT 目标父节点现有子代 → 同名 404 散落)。详 post-mortem `SRMV2/docs/postmortems/2026-05-26-srmbasic-cleanup-r1-to-r8.md` |
