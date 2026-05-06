# ADR-005: 客户全新部署语义,讨论阶段剔除运维维度

- **Status**: Accepted
- **Date**: 2026-05-05
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- SYSV2 / HC 等企业管理软件项目,客户都是**全新部署**,不存在"老系统割接"语境
- 早期 spec / plan discuss 仍按互联网产品惯例讨论"回滚 / 灰度 / canary / 数据迁移兼容 / SLA",占用大量 token + 涛哥精力
- 实证:MDM 现代化 spec discuss 早期纠结"P5 manifest 接入要不要灰度发布",涛哥拍板"客户全新部署没必要"
- 实证:`AuthInfo` 老 29 列遗留表 DROP — 测试库直接 DROP,客户全新部署不会带历史数据

### 决策不做的代价

- spec / plan discuss 持续耗时讨论运维维度无业务价值
- "兼容老数据"约束限制设计自由度 — 实际客户从不带老数据
- 双轨 discuss(全新部署 + 割接)增加文档 / 测试负担
- 涛哥精力被运维维度消耗,业务决策被挤压

---

## Decision

**一句话**:讨论阶段(spec / plan)**剔除运维维度**(回滚 / 灰度 / canary / 数据迁移兼容 / SLA);客户部署一律**全新部署**(DROP / CREATE 自由,无老数据兼容负担);discuss 题目只留**业务边界 + 技术清理 + 演进** 3 段。

### 详细落点

#### 剔除维度

- ❌ 回滚预案 / 灰度发布 / canary 滚动
- ❌ 数据迁移兼容(老数据格式 / 老字段保留 / 双写期)
- ❌ SLA / 可用性指标 / 性能 SLO
- ❌ 部署节奏 / 维护窗口

#### 保留维度

- ✅ 业务边界(做什么 / 不做什么)
- ✅ 技术清理(死代码 / 过期表 / 历史包袱)
- ✅ 演进(下一步 / 后续 spec 钩子)

#### DB / Schema 自由度

- 测试库 / 开发库:DROP / DELETE / UPDATE / TRUNCATE 全免确认(dba 自主)
- 生产库:SELECT 免 / INSERT/UPDATE 幂等告知 / DELETE/DROP/REVOKE/TRUNCATE 必 Y
- 客户全新部署无"老数据保留"需求 → schema 设计完全按当下最优,无历史包袱

#### 例外:已上线生产改造

- 涛哥 Job 中确实有"已上线某客户改造"场景(如景颜 customer 分支)→ **独立 spec 处理**,不影响默认全新部署语义
- 等保 / 合规改造 → 独立 spec(`feedback_mvp_phase_workflow_downgrade.md` 已界定)

---

## Consequences

### 正向

- spec / plan discuss 提速 50%+,涛哥精力聚焦业务
- 设计自由度高,不被"兼容老数据"约束
- DROP / CREATE 自由 → 死代码 / 过期表清理无心理负担
- 客户全新部署语义清晰,跨项目可复用

### 负向 / 代价

- 已上线客户改造仍需独立 spec(不能套用全新部署默认)
- 等保 / 合规 / 审计独立 spec 时仍需重新引入运维讨论

### 影响范围

- 全部 SYSV2 / HC / 后续项目 spec / 方案 discuss
- DB schema 设计 / 死代码清理 / 表结构演进
- memory `feedback_no_ops_no_prod_cutover.md` 同向

---

## Alternatives Considered

### A. 双轨 discuss(全新 + 割接)(已否)

- 优点:覆盖所有部署形态
- 缺点:80% 客户用全新部署,双轨增加 80% spec 文档负担
- 不选原因:实际场景不需要

### B. 强制兼容老数据(默认)(已否)

- 优点:防止误清数据
- 缺点:客户都是全新部署没有老数据 → 兼容约束变成纯负担
- 不选原因:实证不存在该需求

### C. 全靠割接 spec(默认)(已否)

- 优点:严谨
- 缺点:违反实际 — 客户都是全新部署,割接 spec 是少数场景
- 不选原因:实证违反实际

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`「SQL 操作」段(测试库免 Y)
- memory:`feedback_no_ops_no_prod_cutover.md`(本 ADR 主源)
- memory:`feedback_sql_dba_default.md`(测试库 DDL 免确认)
- memory:`feedback_refactor_over_new.md`(测试库脏数据可清)
- memory:`feedback_mvp_phase_workflow_downgrade.md`(合规独立 spec 例外)
- 实证案例:[ADR-001](ADR-001-sys-authinfo-source-of-truth.md)(老 AuthInfo 测试库 DROP 自由)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-05-05 | Proposed → Accepted + ADR-005 回溯落地 | MDM 现代化 spec discuss 拍板 |
