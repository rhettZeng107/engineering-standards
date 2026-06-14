# ADR-003: 编码工作流前后端硬切分(qwen 纯前端默认 + Claude/dotnet/dba 后端 DB 路由)

- **Status**: Accepted
- **Date**: 2026-05-02 涛哥重新校准 → 2026-05-05 ADR 化回溯落地
- **Decider**: 涛哥
- **Scope**: 跨项目(全局规则)

---

## Context

### 触发场景

- 早期(2026-04 中前)落盘路由按"复杂度"或"文件数阈值"切分,导致 qwen / Claude本体 / teams / agent 多次摇摆
- qwen 订阅充足,但只跑后端 / E2E / 配置等不擅长的 task,订阅价值未用足
- Claude本体跑前端 .tsx / .less / 简单组件改造时占用主上下文,挤压后端 / 跨契约工作
- 实证:qwen 0.14.5 跑 E2E 实战 OOM 不胜任;但跑纯前端 .tsx 修改稳定可靠
- 实证:qwen 越界改 `.cs` / SQL / `.csproj` / `*.spec.ts` 断言风险确实存在,需硬约束

### 决策不做的代价

- 路由继续摇摆 → 每个 task 重新讨论一次"用谁落盘"
- qwen 订阅资源闲置 → 浪费成本
- Claude本体 context 压力大 → 长流程会话压缩 / 失忆
- 风险无隔离 → qwen 越界改安全字段会导致难定位 bug

---

## Decision

**一句话**:按**代码类型**硬切分,无文件数阈值;纯前端走 qwen 默认,后端 / DB / 跨契约 / 配置走 Claude本体或专项 agent。

### 详细路由表

| Task 特征 | 走哪条 | 落盘方 |
|---|---|---|
| 纯前端(`.tsx`/`.ts`/`.less`/`.css`/前端配置)任意文件数 | qwen 默认 | `qwen -y -p "..."` |
| 后端小改(单模块/不跨契约/单层/字段补漏/小重构) | Claude 本体 | Write / Edit |
| 后端中大型/跨模块(≥2 层/新建模块/状态机/鉴权/数据迁移) | teams 模式 → `dotnet-developer` | subagent |
| 跨前后端契约(同 task 改 DTO/接口签名) | **Claude 本体先锁契约 → 契约锁文件 → 派 subagent 落盘**(2026-06-01 升级,见下修订 + ADR-037) | 本体 + subagent |
| DB / SQL / Migration / Schema | `dba` subagent | dba |
| 配置/文档/plan/spec/memory/规则/微调 | Claude 本体 | Write / Edit |
| E2E | Claude 本体 / `frontend-developer` / 其他合适 agent(**禁 qwen**) | Bash `npx playwright test` |

### Qwen 硬约束(必带 prompt)

1. 文件路径全列出 + 改动范围 + 验收标准
2. 加中文注释(业务约束 / 跨子应用同步点 / schema 依赖)
3. 禁改 `*.spec.ts` 断言 / 禁 `test.skip`
4. 禁动 `.cs` / SQL / `.csproj`
5. 禁碰前端构建配置安全字段(CORS / proxy 鉴权)
6. 跨契约 task 必须读 team-lead 提供的契约锁文件作输入

### Qwen 兜底触发(任一即 Claude本体或 frontend-developer 接管)

- qwen 冒烟失败 / 落盘越界 / 自审 2 轮不收敛 / 验收 CR ≥ 3 或 1 CRITICAL / 跨契约不一致

**兜底优先级**:qwen 失败 → ① Claude 本体 Edit(小改) → ② `frontend-developer`(中大型 / 复杂 UI 重构)

---

## 修订(2026-06-01)— 跨契约锁定责任:后端 subagent 锁 → Claude 本体锁

**背景(实证)**:原路由表"跨前后端契约 → 后端 subagent 先锁契约 → 前端 qwen"实证失效——subagent 间 context 隔离(官方 `sub-agents.md:777`),后端 subagent 锁定的契约前端 subagent 看不到,靠 orchestrator 人肉转述漏一次即偏离(HC 2026-05-31 单会话 camelCase 栽 2 次 CRITICAL)。subagent 还读不到 auto-memory(`sub-agents.md:783`),契约约定写 memory 对 subagent 不可见。

**决策**:跨前后端契约 task,契约由 **Claude 本体亲自锁定**(本体是唯一同时持前后端 context 的角色),产出契约锁文件(动词/路由/字段名/**大小写**/必填)→ 派 subagent 按锁文件落盘。**禁下放 subagent 锁契约**。详 [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md)。

---

## 修订(2026-06-01b)— team-lead subagent 取消,orchestration 归主会话

**背景(官方实证)**:原 Decision 路由表"后端中大型 → teams 模式 → team-lead 派 dotnet-developer"实证不成立——官方明确 **subagent 不能 spawn 其他 subagent**(`sub-agents.md:770`,防无限嵌套)。被主会话 spawn 的 team-lead 无法再派 worker subagent(成"光杆司令");且 .planning 实证 team-lead 从未真被 spawn 派单(10 处全是计划书纸面描述),实际 orchestrator 一直是主会话本体。

**决策**:
- **取消 `team-lead` subagent**(删 `~/.claude/agents/team-lead.md`)。
- **orchestration / 派单 / 汇总归主会话本体**(官方"chain subagents from main conversation"):主会话接 task → 规模评估降级 → 直接派 worker(`dotnet-developer` / `qwen` / `frontend-developer` / `dba`)→ 双 reviewer 并行 → 汇总。
- team-lead 原有价值规则(规模评估自我降级 + 双 reviewer 并行配对)**上移全局 CLAUDE.md「编码工作流路由」段**。
- 需 worker 并行互相挑战 + 高预算 → 用已启用的原生 Agent Teams(`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`,主会话当 lead);路由表正文"teams 模式"措辞保留为历史,语义以本修订为准。

---

## 修订(2026-06-14)— qwen-default-frontend-guard 取消强制(block → warn)

**背景**:① 动态 workflow fan-out 试点(迁移轨批量页面迁移,ADR-014 增强)需 `frontend-developer` 并行落盘;② 实践中复杂业务页 qwen 不擅长(plan P1/P2 教训),`frontend-developer` 才是合适落盘方。原 hook 硬 block `frontend-developer`(要 `# qwen-exception:` 豁免)成为日常摩擦。

**决策**:`qwen-default-frontend-guard.js` 从 **block(exit 2)→ warn(exit 0 + stderr 软提醒)**(涛哥拍板)。
- 前端默认 qwen **仍是推荐**(成本优化,简单 CRUD qwen 胜任)——hook 仍软提醒。
- **不再硬拦 `frontend-developer`**:复杂业务页 / workflow fan-out / 跨组件重构用它,无需豁免注释。
- 落盘方判断回归语义:简单 CRUD → qwen;复杂 / fan-out → `frontend-developer`。

**影响**:路由表(line 37「qwen 默认」)+ 兜底优先级语义不变(qwen 仍默认),只是 `frontend-developer` 不再被 hook 硬拦;「Qwen 硬约束/兜底」中"强制"语义弱化为"默认推荐"。配套全局 CLAUDE.md「编码工作流路由」段同步(强制→软提醒)。**未变**:`qwen-yolo-flag-guard`(qwen 调用仍强制 -y)、E2E 禁 qwen、qwen 6 条硬约束(用 qwen 时仍适用)。

---

## Consequences

### 正向

- 路由清晰,每个 task 派单 0 摇摆
- qwen 订阅用足,Claude 本体 context 压力降低
- 风险隔离:qwen 不动后端 / DB / 安全字段 → 即使越界也限定爆炸半径
- 跨项目统一,HC / 后续项目可直接复用

### 负向 / 代价

- 6 条 qwen 硬约束 + 5 条兜底触发 → prompt 长
- frontend-developer 退化为兜底角色,日常不派
- E2E 显式禁 qwen → 部分边界 task 仍需 Claude本体跑

### 影响范围

- 全部 SYSV2 / HC / 后续项目落盘工作
- memory `feedback_qwen_default_coding.md` / `feedback_teams_qwen_frontend_delegation.md` / `feedback_teams_mode_agent_writes.md` / `feedback_workflow_only_teams_qwen.md` 等 4 条 memory 同向收敛

---

## Alternatives Considered

### A. 全 Claude 本体(qwen 不用)(已否)

- 优点:统一 / 无路由摇摆 / 无 qwen 越界风险
- 缺点:qwen 订阅完全闲置 / Claude 本体 context 压力大 / 长流程会话压缩 / 成本高
- 不选原因:订阅价值未用足

### B. 全 qwen(Claude 本体仅协调)(已否)

- 优点:qwen 用足
- 缺点:qwen 不胜任 E2E(实战 OOM)/ 跨契约协调 / 复杂规划;落 DB / 后端中大型风险高
- 不选原因:风险隔离失败

### C. 文件数阈值切分(< 5 文件 qwen / ≥ 5 Claude)(已否)

- 优点:看似客观可量化
- 缺点:文件数与复杂度不强相关 — 1 文件改 schema 比 10 文件改 .less 风险高 100 倍;阈值持续摇摆
- 不选原因:实证摇摆,2026-05-02 涛哥拍板放弃

---

## Related

- 全局规则:`~/.claude/CLAUDE.md`「编码工作流路由」段
- memory:`feedback_qwen_default_coding.md`
- memory:`feedback_teams_qwen_frontend_delegation.md`
- memory:`feedback_teams_mode_agent_writes.md`
- memory:`feedback_workflow_only_teams_qwen.md`
- memory:`feedback_qwen_cli_yolo_flag.md`(qwen CLI -y 必带)
- memory:`feedback_qwen_exception_abuse_warning.md`(qwen MUST 不得跳过)
- memory:`feedback_e2e_default_background.md`(E2E 禁派 qwen)

## History

| 日期 | 状态变更 | 备注 |
|---|---|---|
| 2026-04-21 | teams 模式雏形 | 三路之一 |
| 2026-05-02 | 重新校准为前后端硬切分 | 涛哥拍板 |
| 2026-05-05 | ADR-003 回溯落地 | 上提全局 |
| 2026-06-14 | 修订 | qwen-default-frontend-guard 取消强制(block→warn):前端默认 qwen 仍推荐,但复杂业务页/workflow fan-out 用 frontend-developer 不再硬拦。触发=workflow fan-out 试点 + 复杂页 qwen 不擅长(P1/P2 教训) |
