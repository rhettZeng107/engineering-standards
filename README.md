# Engineering Standards

> **跨项目通用工程标准与决策记录**
> 适用范围:涛哥本人主导的多个项目复用基线(SYSV2 / 后续新项目)。
> 本仓不绑定任何具体业务 / 客户 / DB 数据,仅承载工程实践模式 + 决策框架。

---

## 仓库定位

| 维度 | 说明 |
|---|---|
| **物理位置** | `~/Projects/engineering-standards/`(与各项目 workspace 同级邻接) |
| **远程** | GitHub `rhettZeng107/engineering-standards`(公开仓 / 单远程,**不推内网 ADO**) |
| **使用方式** | 各项目仓内文档通过相对路径引用 `../engineering-standards/<path>` |
| **更新节奏** | 跨项目通用规则变更时即时更新;变更走"新 ADR + 旧 ADR 标 Superseded"链路,不改写历史 |
| **协作模式** | 单人维护(涛哥 + Claude)+ GitHub 公开供工程师参考 |

---

## 目录结构

```
engineering-standards/
├── README.md                      # 本文件(主索引)
├── standards/                     # 设计标准 / 编码规范 / 工作流标准
│   ├── frontend-ui-standard.md    # antd 5 + ProTable 列表页统一标准
│   ├── react-ui-guidelines.md     # React + antd 列表页/编辑页交互规约
│   ├── doc-conventions.md         # 文档目录约定(spec/plan/ADR 命名)
│   └── (后续) subapp-onboarding-guide.md  # 子应用接入 platform 标准手册
└── decisions/                     # ADR(架构决策记录)
    ├── README.md                  # ADR 索引 + 用法
    ├── _template-adr.md           # ADR 模板
    ├── ADR-002-four-layer-doc-structure.md
    ├── ADR-003-coding-workflow-frontend-backend-split.md
    ├── ADR-004-pm-view-business-scenario.md
    ├── ADR-005-customer-fresh-deploy-no-ops.md
    ├── ADR-007-auth-4-rigidity.md
    ├── ADR-008-end-to-end-8-checks.md
    └── ADR-009-claude-md-cheatsheet-distillation.md
```

**项目特化决策(ADR-001 / ADR-006 等)留在各项目仓内**(如 `SYSV2/docs/decisions/`),不进本仓。

---

## 引用方式

### 在项目仓 markdown 内引用本仓内容

```markdown
参见跨项目标准 [`frontend-ui-standard.md`](../engineering-standards/standards/frontend-ui-standard.md)
参见跨项目决策 [ADR-005](../engineering-standards/decisions/ADR-005-customer-fresh-deploy-no-ops.md)
```

**前提**:项目 workspace 与 `engineering-standards/` 在同级目录(均位于 `~/Projects/` 下)。

### GitHub 网页跨仓跳转(可选)

当文档需要在 GitHub 网页上跨仓跳转时,使用绝对 URL:

```markdown
参见 [frontend-ui-standard.md](https://github.com/rhettZeng107/engineering-standards/blob/master/standards/frontend-ui-standard.md)
```

推荐核心锚点(如 CLAUDE.md / 各仓 README)用双链:`[本地](../engineering-standards/...) ([GitHub](https://...))`。

---

## 归集判定原则(2026-05-06 涛哥拍板)

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
- ❌ DB 密码 / 内网 IP / 内网域名 / 端口硬编码
- ❌ 等保 / 合规 / 安全配置细节
- ❌ 个人 / 员工身份信息

允许包含:

- ✅ 通用工程模式(antd ProTable / wujie / SubApp 注册流程等)
- ✅ 项目代号(SYSV2 / MDM / BP / SYS.3 等已在 GitHub 公开仓存在的)
- ✅ 决策语境抽象描述("客户全新部署"语义,不绑定具体客户)

变更前 grep 自检敏感词:

```bash
grep -rE '璟岩|JingYan|淮海|HuaiHai|S100[0-9]|172\.21\.|172\.\d+\.\d+\.\d+|\.intranet\.|\.local|JYDevOps|JYPrdCollection' .
```

---

## 历史溯源

| 时间 | 事件 |
|---|---|
| 2026-05-06 | 涛哥拍板方案 E,从 SYSV2 抽离跨项目通用文档独立成仓;首版 7 ADR + 3 standards |
| ~~2026-05-05~~ | 跨项目 ADR 机制 + 文档目录规范 + 前端 UI 标准在 SYSV2 内沉淀(本仓内容来源) |

---

## 关联仓

- [SYSV2 项目 workspace](https://github.com/rhettZeng107/SYSV2-workspace)(主要使用方)
- 后续新项目接入时本 README 末尾登记
