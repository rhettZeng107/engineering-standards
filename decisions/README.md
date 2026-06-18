# ADR — Architecture Decision Records(跨项目)

> **Architecture Decision Record(架构决策记录)**:为重要的、跨范围的、长期影响的决策提供**即时锚点**,避免决策散落 spec / plan / memory / commit message,后期回溯成本高。
>
> **本目录仅承载跨项目 ADR**(决策 essence 适用于 ≥ 2 个项目)。
> **项目特化 ADR 留各项目仓内**(如 `SYSV2/docs/decisions/ADR-001-sys-authinfo-source-of-truth.md`)。

---

## 触发条件(任一即落 ADR)

| 触发 | 说明 | 示例 |
|---|---|---|
| **横向影响 ≥ 2 个 spec** | 决策被多个 spec / plan 引用 | "客户全新部署 → DROP/CREATE 自由"影响所有迁移类 spec |
| **跨项目 / 跨子应用** | 影响 SYS / MDM / BP / AP 多端,或新项目复用 | "8 项核对清单"跨前后端通用 |
| **推翻先前规则** | 校准既有约定 | "用户视角 → PM 视角"术语校准 |
| **长期基线决策** | 技术选型 / 工作流变更 / 架构基线 | "MDM 单分支收敛"基线、"SYS_AuthInfo 真理源"确立 |

## 落点决策

| 决策性质 | 落点 |
|---|---|
| 100% 跨项目 essence(决策框架 / 抽象规则) | **本仓 `engineering-standards/decisions/`** |
| 跨项目 essence + 含项目案例锚点 | **本仓**(案例锚点保留作真实性) |
| 项目特化(如 SYS_AuthInfo 真理源 / IP allowlist 跨进程鉴权) | **各项目仓 `<project>/docs/decisions/`** |
| 单 spec 内部决策 | spec.md 顶部 `## 决策` 段 |
| 临时方案 / 当次迭代取舍 | plan.md 内 |
| 个人协作偏好 | memory feedback |
| 配置 / 文档微调 | commit message |

---

## 文件命名

```
engineering-standards/decisions/
├── README.md                                # 本文件(索引 + 用法)
├── _template-adr.md                         # 模板(下划线开头,不进编号序列)
├── ADR-002-four-layer-doc-structure.md
├── ADR-003-coding-workflow-frontend-backend-split.md
└── ...
```

- 编号:`ADR-NNN`(三位数,从 001 开始递增,**不重用 / 不复用**)
- **跨项目 ADR 编号 vs 项目特化 ADR 编号共用全局编号空间**(避免冲突)— ADR-001/006 是 SYSV2 项目特化,但占用全局编号 001 / 006
- 主题:kebab-case 短名(< 50 字符)
- **一个 ADR = 一个文件 = 一个决策**,不合并不拆分

---

## 状态(Status)

```
Proposed     → 起草中,未拍板
Accepted     → 已拍板生效(默认)
Superseded   → 被新 ADR 取代(标 by ADR-XXX)
Deprecated   → 废弃但未被取代
```

**ADR 不可改写历史** — 决策需要变更时,**新建 ADR + 旧 ADR 标 Superseded**,不直接改旧 ADR 内容(除非纠错别字 / 补链接)。

---

## ADR 索引(全局编号空间 — 跨项目 + 项目特化)

| 编号 | 标题 | 状态 | 日期 | Scope | 位置 |
|---|---|---|---|---|---|
| [ADR-001](../../SYSV2/docs/decisions/ADR-001-sys-authinfo-source-of-truth.md) | SYS_AuthInfo 为菜单/权限真理源,老 AuthInfo 表 DROP | Accepted | 2026-05-05 | 项目级(SYSV2) | SYSV2 |
| [ADR-002](ADR-002-four-layer-doc-structure.md) | 四层文档结构(ADR / Spec / Plan / Tasks) | Accepted | 2026-05-05 回溯 | 跨项目 | 本仓 |
| [ADR-003](ADR-003-coding-workflow-frontend-backend-split.md) | 编码工作流前后端硬切分 | Accepted | 2026-05-05 回溯 | 跨项目 | 本仓 |
| [ADR-004](ADR-004-pm-view-business-scenario.md) | PM 视角 + 业务场景化作 spec/方案/E2E 兜底 | Accepted | 2026-05-05 回溯 | 跨项目 | 本仓 |
| [ADR-005](ADR-005-customer-fresh-deploy-no-ops.md) | 客户全新部署语义,讨论阶段剔除运维维度 | Accepted | 2026-05-05 | 跨项目 | 本仓 |
| [ADR-006](../../SYSV2/docs/decisions/ADR-006-subapp-cross-process-auth-ip-allowlist.md) | SubApp 跨进程鉴权采用 IP allowlist | Accepted | 2026-05-05 | 项目级(SYSV2) | SYSV2 |
| [ADR-007](ADR-007-auth-4-rigidity.md) | 鉴权 4 条刚性 | Accepted | 2026-05-05 回溯 | 跨项目 | 本仓 |
| [ADR-008](ADR-008-end-to-end-8-checks.md) | 端到端交付 8 项核对清单 | Accepted | 2026-05-05 回溯 | 跨项目 | 本仓 |
| [ADR-009](ADR-009-claude-md-cheatsheet-distillation.md) | 全局 CLAUDE.md 精简到 cheatsheet 本质 | Accepted | 2026-05-05 | 跨项目 | 本仓 |
| [ADR-010](../../SYSV2/docs/decisions/ADR-010-platform-spec-overrides-mdm-no-touch-app-center.md) | Platform spec 不动应用中心(MDM 路径切换 /srm/ → /MDM/) | Accepted | 2026-05-06 | 项目级(SYSV2) | SYSV2 |
| [ADR-011](ADR-011-bp-business-portal-boundary.md) | BP 业务门户边界 | Accepted | 2026-05-07 | 跨项目 | 本仓 |
| [ADR-012](ADR-012-subapp-onboarding-sop-enforcement.md) | SubApp Onboarding SOP 强制执行 | Accepted | 2026-05-07 | 跨项目 | 本仓 |
| [ADR-013](ADR-013-codebase-profile-maintenance.md) | Codebase 画像维护(自动化历史扫描) | Superseded by ADR-025 | 2026-05-09 | 跨项目 | 本仓 |
| [ADR-014](ADR-014-migration-refactor-workflow.md) | 迁移改造工作流(Front-load + Back-automate) | Accepted | 2026-05-09 | 跨项目 | 本仓 |
| [ADR-015](ADR-015-fact-driven-no-speculation.md) | 事实驱动禁臆测 4 步硬规则 | Accepted | 2026-05-09 回溯 | 跨项目 | 本仓 |
| [ADR-016](ADR-016-spec-start-grep-history-first.md) | Spec/Plan 启动前必扫历史目录 | Accepted | 2026-05-09 回溯 | 跨项目 | 本仓 |
| [ADR-017](ADR-017-batch-contract-extended.md) | 批次任务扩大版 — Y 一次跑完不打断 | Accepted | 2026-05-09 回溯 | 跨项目 | 本仓 |
| [ADR-018](ADR-018-decision-authorization-tiers-and-boundary-matrix.md) | 决策授权三档 + 边界判定显式矩阵 | Accepted | 2026-05-09 回溯 | 跨项目 | 本仓 |
| [ADR-019](ADR-019-solve-problem-first-rules-negotiable.md) | 解决问题第一 + 规则可推翻 + 敢于说不 | Accepted | 2026-05-09 回溯 | 跨项目 | 本仓 |
| [ADR-020](ADR-020-frontend-i18n-scope-boundary.md) | 前端中英 i18n 范围边界(用户输入不双语,平台 UI 必双语) | Accepted | 2026-05-10 | 跨项目 | 本仓 |
| [ADR-021](ADR-021-harness-mechanization-lint-eval.md) | Harness 机制化 — Lint + Eval 双引擎 | Accepted | 2026-05-11 | 跨项目 | 本仓 |
| [ADR-022](ADR-022-cicd-monitor-feedback.md) | CI/CD Monitor & Feedback 策略(主动 + 被动双轨) | Accepted | 2026-05-14 | 跨项目 | 本仓 |
| [ADR-023](ADR-023-frontend-unified-4-standards.md) | 前端统一 4 标准 | Accepted | 2026-05-14 | 跨项目 | 本仓 |
| [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md) | Plan 落盘 E2E 分级 + CI/CD 接管全量回归 | Accepted | 2026-05-14 | 跨项目 | 本仓 |
| [ADR-025](ADR-025-project-map-adaptive-maintenance.md) | 项目地图自适应维护(Supersedes ADR-013) | Accepted | 2026-05-16 | 跨项目 | 本仓 |
| [ADR-026](ADR-026-project-map-mechanisms-and-visible-prelude.md) | 项目地图新增 MECHANISMS 维度 + discuss 读图可见化 | Accepted | 2026-05-17 | 跨项目 | 本仓 |
| [ADR-027](ADR-027-postmortem-layered-distillation.md) | 踩坑复盘 → 分层沉淀闭环机制 | Accepted | 2026-05-17 | 跨项目 | 本仓 |
| [ADR-028](ADR-028-legacy-migration-baseline-two-step.md) | 老项目迁移基线与两步走(三层等价 DoD + STEP1/STEP2 解耦) | Accepted | 2026-05-18 | 跨项目 | 本仓 |
| [ADR-029](ADR-029-workspace-governance-bootstrap.md) | 工作区治理三层模型与新工作区 bootstrap 模板 | Accepted | 2026-05-18 | 跨项目 | 本仓 |
| [ADR-030](ADR-030-gsd-capability-fusion.md) | 选择性融合 GSD 能力到工作流(A 档 4 + B 档 4) | Accepted | 2026-05-18 | 跨项目 | 本仓 |
| [ADR-031](ADR-031-workflow-auto-resume.md) | 工作流断点续作(进度文件 + socket 异常自动接续) | Accepted | 2026-05-20 | 跨项目 | 本仓 |
| [ADR-032](ADR-032-frontend-ui-v2-standard-atlas.md) | 前端 UI V2 标准图集 | Accepted | 2026-05-21 | 跨项目 | 本仓 |
| [ADR-033](ADR-033-governance-layering-and-reduction.md) | 治理分层金字塔 + 减法纪律 | Accepted | 2026-05-21 | 跨项目 | 本仓 |
| [ADR-034](ADR-034-observability-apm-lite-standard.md) | APM-lite 应用层可观测体系工程标准 | Accepted | 2026-05-21 | 跨项目 | 本仓 |
| [ADR-035](ADR-035-lsp-subclaude-gateway.md) | LSP Sub-Claude Gateway — Multi-repo workspace 的 LSP 使用模式 | Accepted | 2026-05-27 | 跨项目 | 本仓 |
| [ADR-036](ADR-036-code-review-mandatory-gate.md) | 代码评审强制 commit 门禁(hook BLOCK) | Accepted | 2026-05-28 | 跨项目 | 本仓 |
| [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md) | 跨前后端契约锁定责任归属(本体锁,非 subagent) | Accepted | 2026-06-01 | 跨项目 | 本仓 |
| [ADR-038](ADR-038-subapp-master-data-via-api-not-direct-table.md) | 子应用主数据消费 API 不直查共享表 + 业务重建 | Accepted | 2026-06-15 | 跨项目 | 本仓 |
| [ADR-039](ADR-039-standard-task-workflow.md) | 标准任务工作流 — 6 阶段主线(调研→实证→判断→处理→检查→汇报) | Accepted | 2026-06-15 | 跨项目 | 本仓 |
| [ADR-040](ADR-040-cicd-onprem-iis-deploy-channel.md) | 自托管 Agent→内网 IIS 部署通道改用 MsDepSvc(弃 WMSvc 8172);配套 standards/cicd-onprem-iis-deploy-standard.md | Accepted | 2026-06-17 | 跨项目 | 本仓 |
| [ADR-041](ADR-041-cross-workspace-autonomous-collab.md) | 跨工作区自治协作(文件载任务 + tmux 短触发注入 + 注入前判态);配套 `~/.claude/bin/cross-ws-send.sh` + workspace-bootstrap skill §6.3 | Accepted | 2026-06-18 | 跨项目 | 本仓 |
| [ADR-042](ADR-042-git-pull-before-push-team-collab.md) | Git 推送前必同步(pull --rebase before push)+ 禁裸 force(团队多人协作);配套 hook `core-git-pull-before-push-guard.js` | Accepted | 2026-06-18 | 跨项目 | 本仓 |

---

## 按主题簇导航(9 簇)

> 35 个 ADR 是正交决策非冗余(2026-06-15 聚类审计:keep=34 / merge=0 / archive=1)。按主题快速定位:

| 簇 | ADR | 一句定位 |
|---|---|---|
| **治理元方法** | 002·004·009·015·016·019·021·027·029·030·031·033·039 | 文档分层/PM视角/cheatsheet/事实驱动/扫历史/规则可推翻/lint+eval/复盘沉淀/工作区bootstrap/GSD融合/自动接续/治理金字塔/标准任务工作流主线 |
| **项目地图** | 025·026(~~013 归档~~) | 自适应维护 + MECHANISMS 第8维(013 已 Superseded by 025) |
| **迁移轨** | 014·028 → [playbook §0](../standards/legacy-migration-playbook.md) | 014 怎么执行 / 028 做什么算完;总入口 playbook §0 |
| **交付验证** | 008·024·022·034 | E2E 8项 / 三轨分级 / CICD监控 / APM-lite |
| **安全鉴权** | 007 | 鉴权 4 条刚性 |
| **子应用集成** | 011·012·038 | BP门户边界 / 接入SOP / 主数据走API |
| **前端工程标准** | 020·023·032 | i18n范围 / 4基建标准 / UI V2 Atlas |
| **AI工程工作流** | 003·035·037 | 编码路由 / LSP网关 / 契约锁归属 |
| **工作纪律/决策授权** | 005·017·018·036·042 | 全新部署剔运维 / 批次节奏 / 授权三档 / CR门禁 / 推前必同步禁裸force |

---

## 用法流程

1. **触发判断**:决策刚拍板时,对照"触发条件"清单
2. **落点判断**:跨项目 / 项目特化二选一
3. **起 ADR**:`cp _template-adr.md ADR-NNN-<topic>.md`,填 Context / Decision / Consequences / Alternatives
4. **更新索引**:本 README + 项目仓 `<project>/docs/decisions/README.md` 表格末尾追加一行
5. **回链锚点**:在被影响的 spec / plan / memory 顶部引用 `参见 ADR-NNN`
6. **后续校准**:决策变更 → 新 ADR + 旧 ADR 标 Superseded,不改旧文件正文

## 反模式

- ❌ 把 ADR 当 spec 写(spec 是"做什么 + 验收",ADR 是"为什么这样定 + 替代方案为什么没选")
- ❌ 改写历史 ADR 正文(用 Superseded 链路)
- ❌ 1 个 ADR 装多个无关决策(拆开)
- ❌ 决策没拍板就落 ADR(走 spec discuss 拍板后才落)
- ❌ 把临时取舍当 ADR 留(临时方案留 plan 即可)
- ❌ 跨项目 essence 不足却归集本仓(应留项目仓,等真正跨项目复用时再迁)
