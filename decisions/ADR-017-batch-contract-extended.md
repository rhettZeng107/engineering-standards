# ADR-017: 批次任务扩大版 — Y 一次跑完整批次中间不打断

- **Status**: Accepted
- **Date**: 2026-05-09(回溯,实际 2026-05-06 起效)
- **Decider**: 涛哥
- **Scope**: 跨项目

---

## Context

涛哥是 PM,精力主要放在产品策略 + 业务边界拍板,不应被 phase 间 / phase 内 / plan 全程的进度报告打断。早期版本"批次执行不打断"仅覆盖 phase 间,phase 内每个 task 完成 / 每次 commit / 每次 MED/LOW 评审报告仍打断涛哥,频次高。

实证案例(2026-05-06):BP 门户 plan 执行期间 phase 内频繁报告进度,涛哥反馈"Y 一次后应该跑完不要再问"。

## Decision

**一句话**:涛哥 Y 一次 = 跑完批次内全部 phase + phase 内 + plan 全程,中间不打断;中断白名单仅 4 类。

**白名单**(任一触发即可停下来报告):
1. **CR / HIGH 2 轮回修不收敛** — 评审阻塞,需涛哥拍板"修 vs defer"
2. **实证反转** — 执行中实证发现既定方案前提错(如表名错 / 字段不存在 / 鉴权链断)
3. **跨边界** — 改动溢出 spec 范围 / 跨项目影响 / 推翻 ADR
4. **超 spec CRITICAL** — 安全 / 数据丢失 / 生产破坏风险

**留批次完结一次性给**:
- MED / LOW 评审报告
- commit / push 进度
- phase 内进度报告
- 子任务完成确认

## Consequences

### 正向
- 涛哥精力释放到产品决策
- 批次执行连贯性提升(不被打断 → 减少 context 切换损耗)
- 实际交付时间下降

### 负向 / 代价
- Claude 自判错误时影响范围扩大(从 1 个 phase 扩到全 plan)
- 涛哥批次完结一次性看大量报告,首次消化成本高
- 白名单边界判定本身需要 Claude 准确(不准就失效)

### 影响范围
- 全局 CLAUDE.md「批次 + 提交节奏」段
- 所有 plan 执行阶段
- memory:`feedback_batch_contract_extended.md`
- memory:`feedback_batch_autonomous_execution.md`(被本 ADR 上位覆盖,但保留作历史)
- 配套 ADR-018(边界判定矩阵 — 决定何时升档报涛哥)

## Alternatives Considered

### A. 每 phase 完结报告一次
- 优点:涛哥实时掌控
- 缺点:phase 数多时打断频次高;涛哥不需要实时掌控
- 不选原因:违反 PM 精力释放原则

### B. 完全自治到批次完结
- 优点:打断 0
- 缺点:CR / 实证反转 / 跨边界场景 Claude 应该停下来
- 不选原因:边界场景需要涛哥兜底,完全自治风险过高

## Related

- ADR-018:边界判定显式矩阵(决定何时触发白名单)
- memory:`feedback_batch_contract_extended.md`
- memory:`feedback_batch_autonomous_execution.md`

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-04 初版 | phase 间不打断 | memory:`feedback_batch_autonomous_execution.md` |
| 2026-05-06 | 扩大版,phase 内 + plan 全程不打断 | 涛哥拍板,memory:`feedback_batch_contract_extended.md` |
| 2026-05-09 | 回溯落 ADR | Tier 2 候选回溯 |
