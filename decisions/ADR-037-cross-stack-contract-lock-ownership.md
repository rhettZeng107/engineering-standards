# ADR-037: 跨前后端契约锁定责任归属 / Cross-Stack Contract Lock Ownership

- **状态 / Status**: Accepted
- **日期 / Date**: 2026-06-01
- **决策者 / Deciders**: 涛哥(拍板)+ Claude(提议)
- **修订/补充 / Amends**: ADR-003(编码工作流路由·跨契约行)、ADR-008(8 项核对 ④)、ADR-024(标准轨前置门)

## 背景 / Context

跨前后端 feature 反复出现契约失真(字段大小写、端点路由、HTTP 动词、DTO 字段不同步)。最典型是 camelCase 序列化坑——前端按 PascalCase 读后端 camelCase 响应,恒 `undefined`。

根因实证(2026-06-01 HC 项目会话):

- subagent(`dotnet-developer` / `frontend-developer`)拥有**独立 context window**,**看不到主会话历史,也看不到对方 subagent 的产出**(官方 `sub-agents.md:777` 确认)。
- 既有 ADR-003 路由规定"后端 subagent 先锁契约 → 前端 qwen",但后端 subagent 与前端 subagent context 隔离,锁定的契约只能靠 orchestrator 人肉转述,**漏一次即偏离**。
- 实证:HC 2026-05-31 单会话 camelCase 各栽 deliverynote/field 2 次 CRITICAL(HC memory `project_backend_camelcase_serialization`)。
- subagent 还**读不到 auto-memory**(只加载原生 memory hierarchy:CLAUDE.md / `.claude/rules/`;官方 `sub-agents.md:783`),故"契约约定写 memory"对 subagent 不可见。

## 决策 / Decision

**跨前后端契约强耦合的 task(同 task 改 DTO / 接口签名 / 端点路由 / 序列化),契约由 Claude 本体亲自锁定,不下放给 subagent。**

1. **本体锁契约**:Claude 本体(唯一同时持有前后端 + 完整决策 context 的角色)产出**契约锁文件**(`contract-lock-*.md`),内容规格:
   - 端点:HTTP 动词 + 路由 + Policy 名
   - 字段:DTO 字段名 + **JSON 序列化大小写(camelCase / PascalCase,以后端实证为准)** + 类型 + 必填
   - 列表结构:分页字段约定(`items` / `totalCount` / `current` / `pageSize` 等)
2. **派 subagent 按锁文件落盘**:后端/前端 subagent 各自实现时,契约锁文件作为唯一接口真理源——因 subagent context 隔离,锁文件须随派单 prompt 或仓内文件显式传递,不能假设 subagent 能看到主会话里的约定。
3. **两层咬合**:
   - **执行层(预防)**:本体锁契约 → 锁文件 → 派 subagent(本 ADR 主体,修订 ADR-003 路由)
   - **验收层(检测)**:CR 静态比对 + E2E 断言**均以契约锁文件为基准**(补充 ADR-008 ④ + ADR-024 标准轨前置门)

## 替代方案 / Alternatives

| 方案 | 否决理由 |
|---|---|
| A. 后端 subagent 锁契约(ADR-003 原方案) | subagent 间 context 隔离,锁定结果靠人肉转述,实证反复偏离 |
| B. 全部前后端都由本体写 | context 消耗大、无法并行;大体量单侧落盘浪费本体 context |
| C. 契约规则写 auto-memory / SessionStart hook 注入 | subagent 读不到 auto-memory(官方确认),不可达 |

**采纳:本体锁契约(预防)+ subagent 落盘(效率)+ 契约锁文件(跨隔离 context 的唯一接口)。**

## 影响范围 / Impact

- **ADR-003**:编码工作流路由"跨前后端契约"行 →「后端 subagent 先锁契约」升级为「本体锁契约 → 契约锁文件 → 派 subagent」(全局 CLAUDE.md 已同步)
- **ADR-008**:8 项核对 ④ DTO 字段同步 → CR/E2E 以契约锁文件为基准(全局 CLAUDE.md 已同步)
- **ADR-024**:标准轨"前置门"→ 以契约锁文件为基准(全局 CLAUDE.md 已同步)
- **全局 agent**:`~/.claude/agents/dotnet-developer.md` / `frontend-developer.md` 栈中立化改造后,其 When invoked step 4 已写明"序列化大小写以后端实证为准"

## 实证锚点 / Evidence

- 官方 `sub-agents.md:777`(subagent context 隔离,看不到会话历史与对方产出)
- 官方 `sub-agents.md:783`(subagent 只加载原生 memory hierarchy:`~/.claude/CLAUDE.md` / 项目 CLAUDE.md / `CLAUDE.local.md` / managed policy / `.claude/rules/`;**不含 auto-memory**)
- HC memory `project_backend_camelcase_serialization`(2026-05-31 单会话 2 次 CRITICAL)
- HC CLAUDE.md「后端默认 camelCase 序列化」段
