# migration-audit — 迁移完整性审计 workflow

> 决策依据:[ADR-014 修订 2026-06-15](../../decisions/ADR-014-migration-refactor-workflow.md)(完整性审计 workflow 化)。
> 配套手册:[legacy-migration-playbook.md](../../standards/legacy-migration-playbook.md) §3.1 / §3.6 / §5。
> 姊妹工具:[migration-fanout](../migration-fanout/)(执行=批量落盘);[baseline-adversarial](./baseline-adversarial.workflow.js)(建基准查「误判」);本工具查「漏」。wrapper 只读业务代码,但会写批次目录内的合同、锁与审计产物。

## 解决什么

MDM→SRM→TPM 三次迁移的高代价坑同属一类 —— **完整性盲区**:整模块后端漏迁 / 壳层功能随 layout 整删 / 菜单种子整组漏种。检查项 playbook 都有,但「人工/单 agent 一遍过」线性、易漏一整维。本工具用 Workflow 三模式主动穷扫:

| 模式 | 作用 |
|---|---|
| **multi-modal sweep** | N 个 agent 各扫一维、互相盲(初始 4 维:前后端归属 / 壳层功能 / 三方交叉 / 源工件退化) |
| **completeness critic** | 每轮收口问「还漏哪个维度 / 哪个模块停中间态 / 哪个声称迁完无证据」,遗漏维度并入下一轮 |
| **loop-until-dry** | 连续 2 轮无新发现才停 |

## 触发时机(ADR-014 强制)

1. 迁移启动前置(扫存量盲区,尤其前端 api 寻址层多后端的工作区)
2. 每模块 STEP1 验收前(扫该模块四维完整性)
3. 迁移完结 DoD(后端归属清零未达不得宣告迁完)

## 用法

```
Workflow({ scriptPath: '<repo>/tools/migration-audit/migration-audit.workflow.js', args: { ... } })
```

args 见 workflow 文件头注释。关键:`apiAddrFiles` / `oldBackendMarkers` / `newBackendMarkers`(归属维度)、`layoutPaths`(壳层)、`menuDbQuery`(三方交叉)、`legacyRepo`(退化核对)、`modules`、`maxRounds`。

## 姊妹门:baseline-adversarial(adversarial verification,查「误判」)

[ADR-014 修订 2026-06-18 / ADR-044 G5](../../decisions/ADR-014-migration-refactor-workflow.md)。同目录 `baseline-adversarial.workflow.js`,与本工具**正交**:

| | migration-audit | baseline-adversarial |
|---|---|---|
| 查什么 | **漏**(completeness):哪些维度/模块没枚举 | **误判**(correctness):枚举了但判错 |
| 模式 | multi-modal sweep + critic + loop-until-dry | fan-out-and-vote(每判定 3 视角独立 skeptic refute + 多数票) |
| 防的坑 | 整模块漏迁 / 壳层整删 / 菜单漏种 | 坑 2 半成品当完好、坑 10 退化产物当设计意图 |
| 触发 | 启动前置 / 每模块验收 / 完结 DoD | 建基准时(源工件清单/退化判定/UI 清单锁定前) |

建基准时**两者都跑**:audit 查漏 + adversarial 查误判。adversarial 的 `disputed`(多数 refute)= 基准不得锁定,交主会话复核。args:`artifacts`(待裁决判定清单)+ `frontendDir/backendDir/legacyRepo`。

## Codex wrapper:标准批次 + 硬交付链

Codex 不直接运行 Claude `Workflow({ parallel, agent, schema })`;迁移轨在 Codex 中用标准批次模板 + 确定性机器门 + 投票合并 wrapper 承接。

### 初始化批次

```bash
tools/migration-audit/codex-migration-audit.js init \
  --target docs/superpowers/specs/2026-07-xx-xxx-migration \
  --batch-id 2026-07-xx-xxx-migration \
  --title "XXX Migration"
```

生成文件:

| 文件 | 作用 |
|---|---|
| `migration.yaml` | 批次配置,声明源仓/目标仓/gate 输入/报告输出 |
| `source-inventory.json` | 老系统源工件清单 |
| `migration-matrix.json` | old-to-new 决策与合同归属,不混入实现进度 |
| `contract-index.json` + 8 个合同集合 | 页面/UI 操作/API/字段/Service/菜单/壳层/集成的规范化 1:1 合同 |
| `completeness-sweep.json` | 六维扫描、已解决 gap 与连续两轮 dry critic 的硬门产物 |
| `baseline-lock.json` | Phase 0 通过后生成的输入摘要锁;禁止手改 |
| `migration-progress.json` | STEP1 后每个矩阵行的实现与验证证据 |
| `field-diffs.json` | 字段 diff 任务列表 |
| `.migration-coverage` | Gate0 无同名页的消解登记 |
| `.field-coverage` | 字段差异消解登记 |
| `votes.json` | subagent/codex-exec 反证投票输入 |
| `audit-report.*` | 机器审计结果 |

### 本机硬验证

```bash
tools/migration-audit/codex-migration-audit.js contract --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js completeness --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js lock   --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js check-lock --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js gate   --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js fields --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js vote   --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js progress --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js local  --config <batch>/migration.yaml
tools/migration-audit/codex-migration-audit.js report --config <batch>/migration.yaml
```

Phase 0 必须先跑 `contract`、`completeness` 和 `lock`。`contract` 强制批次 ID 一致、ID 唯一、源工件恰好归属一个矩阵行且被同行主维度合同引用、合同恰好归属一个矩阵行、专用引用与工件类型有效、每行 8 个合同维度均 `covered` 或登记 `not-applicable` 证据、无 draft/disputed/open gap。工具校验 N/A 证据存在性,其业务真实性仍由 CR/风险票审查。`completeness` 的 canonical 六维不可通过配置缩减（配置只能追加项目维度）；critic 的漏维/中间态/无证声称必须写成同轮 `newGapIds` 中的 gap ID,由 gap 绑定矩阵行、解决状态和证据,最后连续两轮全部为空。`lock` 还要求字段门和与具体风险行绑定的反证票通过;零风险批次允许空票,但判断性风险或 `CRITICAL/HIGH` 行无绑定票必阻断。锁输入包含 `spec.md`、完整性产物及每个字段 diff 自己的 coverage 文件,任一内容或输入集合漂移即失锁。没有当前有效锁不得进入 STEP1。

提交前必须一次跑硬门:

```bash
tools/migration-audit/codex-migration-audit.js verify --config <batch>/migration.yaml
```

- V0 = `contract + completeness + lock + gate + fields + progress`:不依赖 LLM,包装合同完整性、扫描收敛与既有 shell 门。
- V1 = `vote + report`:合并多 subagent/codex-exec 的反证票,少于 2 个有效票或半数以上反证则 `disputed`。
- 本机硬验证 = `verify`:依次跑 `contract + completeness + check-lock + gate + fields + vote + progress + local + report`;任一未跑/失败即非零退出。
- `local` 执行 `local-verify.commands` 中的项目命令(build/test/E2E 等),命令列表为空也阻断,防假绿灯。
- wrapper 只读业务代码,只写批次目录内的合同锁、审计状态和报告。

wrapper 回归测试:

```bash
node tools/migration-audit/codex-migration-audit.test.js
```

当前 `local` 使用 POSIX `/bin/sh`;本 wrapper 的本地命令执行面支持 macOS/Linux。Windows runner 需通过 WSL 或另配 PowerShell adapter。

### Hook / CI 硬门

迁移轨不采用 warning 软门禁。推荐顺序:

1. 本机:填好 `local-verify.commands`,执行 `codex-migration-audit.js verify --config <batch>/migration.yaml`。
2. commit:安装 `templates/hooks/migration-audit-precommit.sh`,或在既有 pre-commit 中调用;`verify` 不绿则 commit 失败。
3. CI:接 `templates/azure-pipelines-migration-audit-stage.snippet.yml`;push 后 CI 再跑同一批次 audit。
4. 部署后:前端继续接 `E2EVerify` stage;CI E2E 失败按 `docs/ops/cicd-self-heal-sop.md` 自愈。

提交/交付条件:本机 `verify` 绿 + CR 过 + commit 后 CI/E2E 绿;任一红灯不宣告迁移完成。

## 确定性机器门(与 workflow 互补,CI/收尾必跑)

workflow(agent 编排)解「查得全 / 查对方向」,但 agent 仍可能漏跑或失真;同目录两个**确定性 shell 门**作机器兜底(退出码非0即红,无 LLM):

| 门 | 抓什么 | 粒度 | 入参 |
|---|---|---|---|
| `migration-gate.sh` | Gate0 枚举完整性(老仓 Controllers∪Views∪Scripts 零黑名单)/ Gate1 前端桩 / Gate2 后端归属 / Gate3 路由孤儿 | 页/目录级 | 前端 src 目录 + 老仓 roots + `.migration-coverage` |
| `field-diff.sh` | **后端字段漏迁**:核心实体 老DTO/实体 × 新DTO 字段并集 diff,`老有−新无`=候选(抓 TPM 设备父子那类「老有·新前端/DTO全无·后端孤儿列」)| 字段级 | 老/新类型文件 CSV + `.field-coverage` 登记 |

- `field-diff.sh`(ADR-014 修订 2026-06-23,设备父子漏迁复盘):栈中立铁律 + 实现优选 LSP(grep 兜底,v1 C#);`老有−新无` 候选过 `.field-coverage`(`renamed→X/merged→Y/intentional/backlog#N`)消解,未登记=硬红。**核心实体清单机器锚** = 老仓 `*Dto.cs`/`*Entity.cs` 全集 − 显式排除登记(禁靠人正向挑)。**回归实证**:TPM Equipment 跑(老 DTO × 审计当时态新 DTO)精准抓出 `ParentEqptNo/ParentEqptName`,补迁后复跑确认消失。
- 两门均**只读**;候选/疑点喂回迁移矩阵对应行,过对抗投票才锁基准。

## 边界

只读审计,**不改码、不拍板**。契约锁定 / 风险拍板由主会话本体做(ADR-037)。gap 清单交主会话/涛哥决策;`CRITICAL`/`HIGH` 是迁移完结 DoD 阻塞项。

## 状态

全局迁移轨硬门基线(2026-07-15)。合同引用、完整性六维收敛、规格/字段覆盖哈希锁、风险分层投票和实现进度均已有确定性 wrapper 回归；具体项目仍须按自己的源仓、目标仓、DB/集成边界填写批次合同并跑真实 build/E2E。
