# ADR-046:跨仓契约驱动的部署后 E2E 触发(后端改 → 触发消费前端 L1 定向)

- **Status**: Accepted
- **Date**: 2026-06-18
- **Deciders**: 涛哥(拍板 B 机制)
- **关联**: [ADR-045](ADR-045-post-deploy-e2e-tiered-scoping-governance.md)(分层定级,本 ADR 落地其 Decision §3)/ [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md)(契约锁)/ [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md)

---

## Context(背景)

ADR-045 Decision §3 定了「后端契约改 → 触发消费前端 pipeline 跑 L1 定向」(涛哥 2026-06-18「本期做,不留二期」),但未定**触发机制**。P4 实证(SYSV2,2026-06-18):

- 内网 ADO = **Azure DevOps Server 2020+**(api-version 7.0 通 + Pipelines API project 级 200)→ 三种触发机制技术上都可行。
- 各仓 pipeline definitionId:后端 SYS=2 / MDM=7;前端 SYS.3=8 / BP=13 / AuditPortal=14 / MDM=15。
- **无任何跨仓触发先例**(全是 branch trigger);**contract-lock 0 个文件有 consumers 字段**(约定待建)。
- 后端 pipeline = Build→Test→Deploy(无 post-deploy Verify);green = Deploy 成功。
- 凭据:现成 PAT(Build R&Execute,可 queue);或 `System.AccessToken`(需跨 project Queue 权限 + 关闭"限制作业授权范围到当前 project")。
- **约束**:contract-lock.md 在 workspace 容器仓(`docs/superpowers/plans/`),**后端代码仓 checkout 不含它** → consumers 机器可读源必须落在**后端代码仓内**。

原始要求是**契约感知**(仅契约改 + 仅受影响消费前端)+ **L1 模块定向**(传受影响模块)。

## Decision(决策)

采用 **机制 B:后端 pipeline 绿后经 ADO REST 主动 queue 受影响的消费前端 pipeline,传 affectedModules**。

### 触发链路

```
后端 push → Build → Test → DeployTest(绿)
  → [新增] Stage: TriggerConsumers(condition: 本次 diff 命中契约面)
      ① 读后端仓内 consumers manifest(pipeline-e2e/contract-consumers.json)
      ② git diff 命中契约面(Controllers/ DTO/ 路由)→ 收集受影响 consumers
      ③ 对每个 consumer:ADO REST POST .../_apis/build/builds(definitionId + 参数)
         参数:reason=consumer-trigger / affectedModules=<csv> / sourceBackend=<repo>
  → 消费前端 pipeline 被 queue:
      Build/DeployTest stage condition 跳过(Build.Reason/参数判定,前端未变不重新部署)
      E2E stage 跑 tier=L1 --grep "@module:<affectedModules>"(对已部署前端 + 新后端)
```

### consumers manifest(机器可读,落后端代码仓)

`<后端仓>/pipeline-e2e/contract-consumers.json`:
```json
{
  "backend": "AI.Extend.SYS",
  "contractGlobs": ["**/Controllers/**", "**/Dtos/**", "**/*Dto.cs"],
  "consumers": [
    { "repo": "AI.REACT.SYS.3", "definitionId": 8, "modules": ["org", "auth"] },
    { "repo": "AI.REACT.SYS.BusinessPortal", "definitionId": 13, "modules": ["workbench"] }
  ]
}
```
- MVP 粒度 = **后端仓级**:本次 deploy 的 git-diff 命中 `contractGlobs` → 触发**全部** declared consumers(传各自 `modules`)。
- 精化(后续可选,非本期阻塞):per-契约 → per-module 精确映射(diff 哪个 Controller → 哪个 module),减少过度触发。
- 人读镜像:workspace contract-lock.md 加 `## Consumers` 段引用本 manifest(ADR-037 契约锁补充),机器源以后端仓 json 为准。

### 凭据 + 权限

- 复用现成 PAT 存 Variable Group `SYSV2-Deploy-Secrets`(`ADO_QUEUE_PAT`,Build R&Execute);或 `System.AccessToken` + 给 build 服务账号目标前端 pipeline 的 Queue 权限。**优先 PAT**(避免跨 project token-scope org 设置)。

### 前端 pipeline 配合

- Build / DeployTest stage 加 `condition`:`and(succeeded(), ne(variables['Build.Reason'],'ResourceTrigger'), eq(variables['e2eOnly'],''))`——consumer-trigger 来的 run 跳过重新构建/部署。
- E2E stage:收到 `affectedModules` → tier=L1 `--grep "@floor|@module:m1|@module:m2"`;**L1 实效依赖 @module 标签**(本批次同做);@module 未到位的 consumer 暂退 L2(保守)。

## Consequences(影响)

- ✅ 唯一满足「契约感知 + L1 定向」:仅契约改触发、仅受影响消费前端、传模块。
- ✅ 版本控制 + 可审计(consumers manifest + queue 逻辑在仓内,非 UI)。
- ✅ 复用现成 PAT,无需 org 级 token-scope 改动。
- ⚠️ 需新建 consumers manifest 约定 + 后端 TriggerConsumers stage 脚本 + 前端 e2eOnly condition;**强依赖 @module 标签**(L1 定向),@module 未到位前 consumer 退 L2。
- ⚠️ MVP 后端仓级粒度会轻微过度触发(契约面任意改→全 consumers);精化粒度留后续,不阻塞。
- ⚠️ PAT 轮换(90 天)需同步 `ADO_QUEUE_PAT`。

## Alternatives Considered(实证否决)

| 方案 | 否决原因(实证) |
|---|---|
| **A 声明式 pipeline-completion**(前端 YAML `resources.pipelines`) | ADO 2020+ 支持,但**任何后端改都过度触发所有消费前端**、**传不了 affectedModules → 做不到 L1 定向**(只能 L0/L2)、前端 YAML 耦合后端 pipeline 名。不满足契约感知 + L1 定向。 |
| **C 经典 build-completion 触发**(ADO UI 配) | 最简,但**非版本控制(UI 漂移、不可审计)**、无契约感知、无模块定向。与全工作区 YAML-as-code 治理背道。 |

## References
- [ADR-045](ADR-045-post-deploy-e2e-tiered-scoping-governance.md) / [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md) / [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md) / [ADR-022](ADR-022-cicd-monitoring.md)
- 标准:`standards/cicd-e2e-in-pipeline-standard.md` §7
- Spec:`SYSV2/docs/superpowers/specs/2026-06-18-post-deploy-e2e-tiered-scoping/spec.md` §5
