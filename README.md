# Engineering Standards

> **跨项目通用工程标准与决策记录**
> 适用范围:多个企业应用工作区复用基线(SYSV2 / 后续新项目)。
> 本仓不绑定任何具体业务 / 客户 / DB 数据,仅承载工程实践模式 + 决策框架。

---

## 仓库定位

| 维度 | 说明 |
|---|---|
| **物理位置** | `~/Projects/engineering-standards/`(与各项目 workspace 同级邻接) |
| **远程** | GitHub `rhettZeng107/engineering-standards`(公开仓 / 单远程,**不推内网 ADO**) |
| **使用方式** | 各项目仓内文档通过相对路径引用 `../engineering-standards/<path>` |
| **更新节奏** | 跨项目通用规则变更时即时更新;变更走"新 ADR + 旧 ADR 标 Superseded"链路,不改写历史 |
| **协作模式** | 产品负责人维护决策，Codex/工程团队按事实更新；GitHub 公开供工程师参考 |

---

## 目录结构

```
engineering-standards/
├── README.md            # 本文件(全仓总索引 / 知识地图)
├── analyzers/           # 可执行静态分析器与测试
├── decisions/           # ADR — 为什么这样定(48 篇跨项目/项目索引 ADR + README 导航)
├── eval/                # Harness 评估任务、报告与模板
├── learning/            # 工程方法学习材料
├── references/          # 可复用参考实现与组件
├── standards/           # 工程标准 — 怎么做(20 篇)
├── templates/           # 可复制模板(CLAUDE.md / CICD / web.config / controller…)
└── tools/               # 可执行工具(lsp-nav / migration-fanout / migration-audit)
```

**项目特化决策(ADR-001 / ADR-006 / ADR-010 等)留各项目仓内**(如 `SYSV2/docs/decisions/`),不进本仓。

---

## 知识地图 — 查什么去哪(单一检索入口)

> 四类知识载体分工:**decisions/ = 为什么这样定(ADR)** · **standards/ = 怎么做(标准/手册)** · **templates/ = 可复制模板** · **tools/ = 可执行工具**。
> ADR 详细按主题分组见 [decisions/README 九簇导航](decisions/README.md#按主题簇导航9-簇)。

### 主题检索表(我要做 X → 看这些)

| 我要… | ADR(为什么) | standards(怎么做) | templates / tools |
|---|---|---|---|
| **老项目迁移** | ADR-014(执行)+ ADR-028(完成判定) | **legacy-migration-playbook §0 总入口** | tools/migration-fanout(执行) + migration-audit(查漏) + templates/subapp-migration-checklist |
| **子应用发布 BP + CICD** | ADR-011 / 012 / 038 / 049 / 050 / 051 | **subapp-bp-release-pipeline-standard(总纲入口)** · subapp-onboarding-guide · mom-oidc-containerized-delivery-guide · gitea-actions-onprem-container-cicd-standard | templates/subapp-migration-checklist · pipeline-e2e |
| **前端页面 / UI** | ADR-008 / 020 / 023 / 032 / 045 | **frontend-ui-v2-standard（页面入口）** · frontend-ui-standard（基础细则） · react-ui-guidelines（列表交互） · page-change-acceptance-standard · frontend-i18n-standard | references/ui-v2-theme-examples · templates/frontend-i18n-init · frontend-env-production |
| **鉴权** | ADR-007 / 049 / 051 | mom-oidc-containerized-delivery-guide · subapp-onboarding-guide(接入侧) | — |
| **CICD / E2E / 监控** | ADR-008 / 024 / 022 / 034 / 045 / 050 | gitea-actions-onprem-container-cicd-standard · cicd-e2e-in-pipeline-standard · page-change-acceptance-standard · observability-apm-lite-standard | pipeline-e2e · hooks/page-change-e2e-guard · templates/azure-pipelines-e2e(旧ADO参考) |
| **主数据消费** | ADR-038 | sys-master-data-api-standard | templates/csharp-list-controller |
| **项目地图 / codebase** | ADR-025 / 026 | provider-neutral scoped mapping | Codex 本体 / codebase mapper / `codex exec` |
| **新建工作区** | ADR-029 | workspace-bootstrap-guide | templates/bootstrap-workspace.sh · workspace-AGENTS.md.template |
| **LSP 符号导航** | ADR-035 | tools/lsp-nav/SKILL.md | tools/lsp-nav |
| **AI coding harness** | ADR-015 / 018 / 031 / 035 | provider-neutral-ai-coding-harness-standard | templates/ai-harness |
| **治理 / 精简规则** | ADR-009 / 033 / 021 | memory-maintenance-standard · governance-reduction-audit(一次性审计记录) | — |
| **文档目录规范** | ADR-002 | doc-conventions | — |
| **工作纪律 / 决策授权** | ADR-005 / 015 / 016 / 017 / 018 / 019 / 027 / 031 | — | — |

### standards/ 常用标准索引（非全量）

| 文档 | 是什么 |
|---|---|
| legacy-migration-playbook | 老项目迁移改造手册(§0 = 迁移轨标准工作流总入口) |
| subapp-bp-release-pipeline-standard | 子应用发布 BP + CICD 流水线编排总纲(7 环节,串各 detail doc)|
| subapp-onboarding-guide | 子应用接入业务门户(BP)手册 |
| subapp-menu-manifest-publish | 子应用菜单发布(manifest + ScanMenus) |
| sys-master-data-api-standard | SYS 主数据接口调用规约 |
| frontend-ui-v2-standard | 前端 UI V2 现行页面工程标准：明暗主题、紧凑列表与筛选、语义色、独立业务页和参数页；MDM 视觉试点已评审 |
| frontend-ui-standard | antd 5 + ProTable 基础技术细则，页面适用与验收以 UI V2 为准 |
| page-change-acceptance-standard | 页面变更轻量方案 C：本机 staged-diff 主门 + exact SHA CI 二次门 |
| frontend-i18n-standard | 前端中英 i18n 标准 |
| react-ui-guidelines | React 列表页/编辑页交互规约 |
| cicd-e2e-in-pipeline-standard | CI/CD E2E-in-pipeline(部署后自动验证) |
| gitea-actions-onprem-container-cicd-standard | Gitea 主仓、独立 Linux Runner、容器精确 SHA 交付与命令行验真 |
| mom-oidc-containerized-delivery-guide | SYS OIDC、三门户会话槽、Bridge V1、容器与统一网关迁移合同 |
| cicd-onprem-iis-deploy-standard | 未容器化存量应用的 IIS 部署通道；不得用于已容器化应用 |
| observability-apm-lite-standard | APM-lite 应用层可观测体系接入 |
| workspace-bootstrap-guide | 新工作区 Bootstrap 指南 |
| doc-conventions | 文档目录规范(spec/plan/ADR 命名) |
| memory-maintenance-standard | Memory 维护标准 |
| provider-neutral-ai-coding-harness-standard | Provider-neutral AI coding harness 标准(Policy / Evidence / Gates / Recovery / Eval) |
| governance-reduction-audit-2026-05-21 | 治理减法审计记录(一次性快照,非长期标准) |

---

## 引用方式

### 在项目仓 markdown 内引用本仓内容

```markdown
参见跨项目页面标准 [`frontend-ui-v2-standard.md`](../engineering-standards/standards/frontend-ui-v2-standard.md)
参见跨项目决策 [ADR-005](../engineering-standards/decisions/ADR-005-customer-fresh-deploy-no-ops.md)
```

**前提**:项目 workspace 与 `engineering-standards/` 在同级目录(均位于 `~/Projects/` 下)。

### GitHub 网页跨仓跳转(可选)

当文档需要在 GitHub 网页上跨仓跳转时,使用绝对 URL:

```markdown
参见 [frontend-ui-v2-standard.md](https://github.com/rhettZeng107/engineering-standards/blob/master/standards/frontend-ui-v2-standard.md)
```

推荐核心锚点（如项目 `AGENTS.md` / README）同时提供本地相对链接与对应 GitHub 页面链接；以上 UI V2 示例可直接复用。

---

## 归集判定原则(2026-05-06 决策)

**唯一标准:评估后可 100% 跨项目的才归集到本仓**。

| 判定 | 落点 |
|---|---|
| ✅ 100% 跨项目 essence(决策框架 / 抽象规则 / 标准模板) | 归集本仓 |
| ⚠ 跨项目决策 essence + 含项目案例锚点(如 ADR-002 提到 `SYSV2/MDM/BP` 作语境) | 归集本仓,案例锚点保留作真实性 |
| ❌ 项目特化决策 / 业务场景 / 测试库连接 / 客户绑定 | 留各项目仓内 |
| ❌ 跨项目 < 100%(部分通用部分特化) | 留各项目仓内,直到完全抽离才归集 |

**反模式**:不要为追求"统一"把项目特化内容硬抽到本仓再加 if-else,等真的 100% 通用再升级。

---

## 修改流程

| 类型 | 流程 |
|---|---|
| 增加新标准 / 新 ADR | 直接 commit + 推 GitHub;影响范围广时同时更新各项目仓引用 |
| 修订现有标准 | 直接修订(标准类文档允许历史改写);相关项目仓引用同步检查 |
| 推翻 ADR 决策 | **新建 ADR + 旧 ADR 标 `Superseded by ADR-XXX`**,不改写历史 |
| 项目特化 → 跨项目 | 从项目仓 `git mv` 到本仓 + 更新引用路径 |
| 跨项目 → 项目特化 | 从本仓 `git mv` 回项目仓 + 更新引用路径 |

---

## 安全 / 脱敏约定

本仓 GitHub 公开,**禁含**以下任一类型数据:

- ❌ 客户名 / 工厂 PlantCode / 业务字段
- ❌ DB、SSH、Token、私钥等凭据，或未经批准的客户/生产网络标识
- ❌ 等保 / 合规 / 安全配置细节
- ❌ 个人 / 员工身份信息

允许包含:

- ✅ 通用工程模式(antd ProTable / wujie / SubApp 注册流程等)
- ✅ 项目代号(SYSV2 / MDM / BP / SYS.3 等已在 GitHub 公开仓存在的)
- ✅ 决策语境抽象描述("客户全新部署"语义,不绑定具体客户)
- ✅ 已批准且必要的集成环境拓扑锚点；可复用正文仍优先使用`<gateway>`、`<runner>`等占位符，真实IP只放运维/实证章节且不携带凭据

变更前 grep 检出待人工复核项（命中不等于违规）:

```bash
grep -rE '璟岩|JingYan|淮海|HuaiHai|S100[0-9]|172\.21\.|172\.\d+\.\d+\.\d+|\.intranet\.|\.local|JYDevOps|JYPrdCollection' .
```

---

## 历史溯源

| 时间 | 事件 |
|---|---|
| 2026-05-06 | 采用方案 E，从 SYSV2 抽离跨项目通用文档独立成仓；首版 7 ADR + 3 standards |
| ~~2026-05-05~~ | 跨项目 ADR 机制 + 文档目录规范 + 前端 UI 标准在 SYSV2 内沉淀(本仓内容来源) |

---

## 关联仓

- [SYSV2 项目 workspace](https://github.com/rhettZeng107/SYSV2-workspace)(主要使用方)
- 后续新项目接入时本 README 末尾登记
