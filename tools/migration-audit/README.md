# migration-audit — 迁移完整性审计 workflow

> 决策依据:[ADR-014 修订 2026-06-15](../../decisions/ADR-014-migration-refactor-workflow.md)(完整性审计 workflow 化)。
> 配套手册:[legacy-migration-playbook.md](../../standards/legacy-migration-playbook.md) §3.1 / §3.6 / §5。
> 姊妹工具:[migration-fanout](../migration-fanout/)(执行=批量落盘);本工具 = 审计(查漏,只读)。

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

## 边界

只读审计,**不改码、不拍板**。契约锁定 / 风险拍板由主会话本体做(ADR-037)。gap 清单交主会话/涛哥决策;`CRITICAL`/`HIGH` 是迁移完结 DoD 阻塞项。

## 状态

首版(2026-06-15)。下个迁移项目(SRM/MES/WMS/EAM 任一)启动时首用并复验三指标(主 context 省 / wall-clock / gap 检出率),达标后落 ADR-014 转稳定推广。
