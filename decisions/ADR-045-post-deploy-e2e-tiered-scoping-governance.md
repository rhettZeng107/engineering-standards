# ADR-045: 部署后 E2E 分层定级治理 — 跨工作区 CI 发布 E2E 标准

- **Status**: Accepted
- **Date**: 2026-06-18
- **Decider**: 涛哥
- **Scope**: 跨工作区(SYSV2 / SRMV2 / TPMV2 / MESV* / WMS / EAM 等所有 brownfield 工作区的前后端 CI 发布)
- **扩展**: [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md)(E2E 分级 + CI 接管)+ [ADR-022](ADR-022-cicd-monitoring.md)(CICD 监控)

---

## Context(背景)

- **诉求**(涛哥 2026-06-18):CI 部署后 E2E 要**替代人工测试**;首发模块全量逐页体检、日常增量只测受影响面(省时间)、异常走 CI 自愈自治修。
- **张力**:纯选择性测试(只测受影响点)省时间,但**容易 under-scope 漏跨切面回归** —— 共享组件/i18n/路由「小改」blast radius 是整站(正是 ADR-024 要堵的那批坑)。
- **现状盘点**(跨工作区普查):三层所需方法**基本已有**,缺「定级编排」把它们组织起来 —— 前端 boot/quality/i18n-mix(L0 料)、SRM Buyer `m03-batch*` 模块级 spec(L1 先例)、SRM/TPM menu-walk(L2 骨架);后端仅 SYS 有单测、TPM 有 API-Health Verify,**多数后端无 post-deploy 验证**。

## Decision(决策)

**一句话**:部署后 E2E 走**三层 + 改动路径自动定级**,用「永远跑的廉价 floor + 判不准默认全量」让选择性变安全,既省日常又不漏跨切面回归;前后端全覆盖,异常接 CI 自愈。

### 一、三层模型

| 层 | 触发 | 跑什么 |
|---|---|---|
| **L0 核心 floor** | **每次部署无条件** | 前端 boot+i18n-mix+quality+核心导航 smoke(登录+进 3-5 主菜单页);后端 API-Health(swagger 200+menu/manifest 非空) |
| **L1 定向** | diff 只碰单模块 | L0 + 该 `@module` 逐页 render+视觉 + 前后端契约关联页 |
| **L2 全量逐页** | 首发 / 碰共享层 / 判不准 / 夜间 | L0 + 全菜单逐页 render+视觉+截图(替代人工) |
| **L3 自愈** | 任一层红 | `cicd-self-heal-sop` 三层分流 |

### 二、两个保险(强制,不可裁掉)

1. **L0 永远跑** —— 不管改什么每次部署都跑廉价 floor,兜高频失败模式(白屏/崩溃/5xx/MIME/中英混杂/后端没起来)。
2. **改动路径自动定级 + 判不准默认 L2** —— git diff 命中共享层(`components/v2/layouts/router/locales/request 封装/构建配置`)→ 升 L2;无法映射模块 → L2;首发 → L2。**赌不起就全量**。

### 三、关键机制

- **模块标签**:页级 spec 打 `@module:<name>`;`src/views/<module>/` 目录名=模块;diff→受影响模块→`--grep` 选跑。
- **首发检测**:`menu-manifest.json` diff 出现新菜单页 = 首发 → L2;无 manifest 仓以「无绿基线」判。
- **前后端关联(本期做,不留二期)**:后端契约改 → 契约锁(ADR-037)标 `consumers` → **触发消费前端仓 pipeline** 跑 L1;映射不全 → L2。
- **后端 floor 标准化**:TPM API-Health 范式(swagger+manifest)提为**所有后端 post-deploy 必跑**。
- **E2E job timeout ≥ 60min**(涛哥拍板;全量套件留余量,分层后 L0/L1 远低于此)。

### 四、L2「真替代人工」覆盖

每菜单页:点进 → #root 有子节点 + 非白屏 + 无 pageerror + 无业务 5xx + 列表首屏渲染 + 整页截图留档。**不验**数据值对错/跨页业务流(UAT 残留)。

## Consequences(影响)

### 正向
- 日常增量部署只跑 L0+定向,省时间;首发/共享层改动全量,不漏回归。
- 后端补 floor,部署后「后端没起来」当场拦。
- 替代人工逐页 QA(视觉+打开健康+中英混杂),异常自治修。

### 负向 / 代价
- 定级引擎 + `@module` 标签 + 共享层路径表需建+维护(未打标自动 L2 兜底)。
- 跨仓后端→前端触发需 ADO pipeline resource 编排。
- L2 全量逐页慢(故 timeout 提 60min;只在首发/共享层/夜间)。

### 影响范围
- **标准**:`standards/cicd-e2e-in-pipeline-standard.md`(加 §7 分层定级)。
- **Skill**:`workspace-bootstrap`(新工作区继承分层模型)。
- **Spec**:`SYSV2/docs/superpowers/specs/2026-06-18-post-deploy-e2e-tiered-scoping/spec.md`(实现分期 P1-P5)。
- **模板**:`templates/pipeline-e2e/`(L0/L1/L2 spec 骨架 + 定级脚本)。

## Alternatives Considered

- **A. 每次全量**:零漏报但每次慢(涛哥明确否,日常太浪费)。
- **B. 纯选择性(只测受影响)**:最省时但漏跨切面回归,替代人工有缺口 —— 不选(故加两个保险)。
- **C. 留二期做跨仓联动**:本期只同仓 —— 涛哥拍板不留二期,跨仓本期做。

## References
- [ADR-024](ADR-024-plan-e2e-tiered-cicd-handover.md) / [ADR-022](ADR-022-cicd-monitoring.md) / [ADR-037](ADR-037-cross-stack-contract-lock-ownership.md)
- 标准:`standards/cicd-e2e-in-pipeline-standard.md`
- Spec:`SYSV2/docs/superpowers/specs/2026-06-18-post-deploy-e2e-tiered-scoping/spec.md`
- 自愈:`docs/ops/cicd-self-heal-sop.md`
