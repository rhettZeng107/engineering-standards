# ADR-050：Gitea Actions 作为内网主交付链

- **Status**：Accepted
- **Date**：2026-09-15
- **Decider**：平台架构负责人
- **Scope**：跨项目 / 已容器化 MOM 应用及后续迁入内网 Gitea 的产品仓
- **配套标准**：[Gitea Actions 内网容器 CI/CD 标准](../standards/gitea-actions-onprem-container-cicd-standard.md)

## Context（背景）

内网原有 Azure DevOps Server 只有一个免费 Windows Agent。多仓库同时提交时构建串行，阶段切换还出现过 Job 已分配但长期未领取的异常。与此同时，已容器化应用已经统一运行于容器主机并由网关发布，继续把 Windows Agent 和旧 IIS 发布方式作为默认链路，会形成不必要的排队与两套运行真相。

Gitea 升级后已具备 Actions；独立 Linux Runner 已验证五槽并发、容器隔离、固定工具链镜像、仓库 Secret、制品下载和精确 SHA 部署。SYSV2 六个活动业务仓已完成从源码推送到容器部署及网关验证的闭环。BP 同覆盖定向 E2E 样本比旧 ADO 快约 19%，同 smoke 样本快约 58%；该数据只用于证明当前环境迁移有收益，不作为其它工作区的固定性能承诺。

## Decision（决策）

已完成迁移验收的业务仓采用以下默认交付模型：

1. Gitea 是内网协作主仓与 CI 触发源；GitHub 是成功交付后的镜像。旧 ADO 仓库与流水线保留历史只读，不再接收新提交或触发发布。
2. Gitea 与 Runner 分机部署。Runner 按显式标签选择临时 Job 容器，不在 Gitea 主机执行构建；不允许用含糊的 `ubuntu-latest` 或 host 标签承载企业应用构建。
3. 工具链按仓固定。`.NET 8`、`.NET 10`、前端 Playwright 等使用不同标签与镜像；流水线启动时必须校验实际 SDK/Node/pnpm 版本。迁移 CI 不等于升级业务目标框架。
4. Build 可按 Runner capacity 并行；同一目标环境的 Deploy 必须由部署端锁或独立单槽 Runner 串行。增加 Runner 只扩大构建能力，不取消目标环境互斥。
5. 每仓使用独立的受限部署身份。SSH 公钥在目标机绑定强制命令与单一应用，私钥放仓库 Secret；数据库连接、跨仓调度令牌等同样只以 Secret 注入，不进入仓库、镜像、日志或制品。
6. 流水线校验 checkout SHA，构建不可变容器上下文，使用 `run_id + 40位 commit SHA` 上传；目标机只允许白名单应用并在部署后把容器 revision 与该 SHA 对齐。
7. 交付顺序固定为：本地受影响验证 → commit/rebase → 推 Gitea → Gitea Actions 构建/测试/部署 → 网关 smoke 与部署态定向 E2E → 制品回读 → 推 GitHub 镜像。Gitea 红时不得把该提交作为已交付版本镜像到 GitHub。
8. 后端契约变化通过 Gitea `workflow_dispatch` 触发消费前端的 floor 与定向 E2E。跨仓令牌使用专用服务账号，只授予声明的消费仓权限；不得使用个人管理员令牌。
9. 每次 Run 至少保留版本、测试结果和容器上下文哈希；前端同时保留 JUnit 与失败截图。只有 Run 终态、容器健康、revision、网关探针和适用业务 E2E 均可对账时才算完成。
10. 工作区迁移采用逐仓切换：先完成现状等价矩阵和 Gitea 真实试跑，再停止 ADO 写入。尚未完成容器化或 Gitea 验收的存量仓继续走原链，不得因全局目标被提前切断。

ADR-042 的 `pull --rebase`、禁裸 force 和推后验真纪律继续有效；其中“ADO origin 固定为协作真源”仅保留给尚未迁移的工作区。ADR-046 的契约感知原则继续有效，ADO REST queue 实现由 Gitea workflow dispatch 替代。

## Consequences（影响）

### 正向

- 多仓构建可在独立 Linux Runner 上并发，减少唯一 Windows Agent 的排队与阶段租约风险。
- 每个 Job 在与标签绑定的临时容器运行，工具链版本可复现，Gitea 主机不承受构建负载。
- 代码、CI、部署 SHA、运行容器和证据制品形成同一条可审计链。
- 已容器化应用不再进入旧 IIS 发布链，回滚来源唯一。

### 代价与风险

- Runner 镜像、缓存、磁盘、队列、证书、备份和失联告警需要持续运维。
- Docker socket、仓库 Secret 和跨仓服务账号都是高价值边界，必须限制可信仓库、标签、权限和目标命令。
- 目标环境部署锁会让 CD 串行；这是避免并发替换同一环境的正确约束，不应通过增加 Build 槽绕过。
- Gitea Actions 与 GitHub Actions 高度兼容但并非完全相同；内网 Action、artifact 协议和 API 必须在升级前做回归。

## Alternatives Considered（替代方案）

### A. 继续以单 Windows ADO Agent 为唯一交付链

无需迁移，但并发受授权限制且已有阶段卡住实证；不选作已容器化应用的长期默认。

### B. 在 Gitea 主机直接运行 Runner

机器更少，但构建会争用代码托管与数据库资源，扩大故障域；不选。

### C. 所有技术栈共用一个通用镜像

初始维护简单，但 SDK 漂移、重复安装和跨项目污染难以控制；不选。

### D. 独立 Runner + 版本化容器标签 + 目标端部署锁

兼顾并发、复现、隔离和部署安全，并已在六仓完成真实闭环；采用。

## Related（相关引用）

- [ADR-042：Git 推送前同步](ADR-042-git-pull-before-push-team-collab.md)
- [ADR-045：部署后 E2E 分层](ADR-045-post-deploy-e2e-tiered-scoping-governance.md)
- [ADR-046：跨仓契约驱动 E2E](ADR-046-cross-repo-contract-driven-e2e-trigger.md)
- [ADR-049：MOM OIDC 与容器化交付](ADR-049-mom-oidc-containerized-delivery.md)
