# 文档目录规范 / Doc Directory Convention

> **2026-05-03 涛哥拍板**:`docs/superpowers/plans/` 和 `docs/superpowers/specs/` 改"每个主题独立目录"结构,周边文件聚拢便于跟踪。
>
> 新建 plan/spec **必须直接走单目录**,不要再写扁平。

## 单目录结构

```
docs/superpowers/
├── specs/
│   ├── <YYYY-MM-DD-topic>/                  ← 一个主题一个目录
│   │   ├── spec.md                          ← 主 spec(原 <topic>-design.md)
│   │   ├── spec-<sub>.md                    ← 同主题子 spec(可选,如 spec-followup.md)
│   │   ├── review.md                        ← spec 阶段评审(可选)
│   │   ├── dba-precheck.md                  ← 事实查证 / DB schema 实证(可选)
│   │   ├── feature-inventory.md             ← 功能盘点矩阵(迁移/整改/整合 spec 必做,可选)
│   │   └── app-center-current-state.md      ← 应用中心现状深度分析(本主题特有,可选)
│   └── _<placeholder>.md                    ← 元文件保留扁平(_compliance-sprint-placeholder 等)
└── plans/
    ├── <YYYY-MM-DD-topic>/                  ← 一个主题一个目录
    │   ├── plan.md                          ← 主 plan
    │   ├── plan-<sub>.md                    ← 同主题子 plan(可选,如 plan-batch1.md / plan-p1-backend-slim.md)
    │   ├── review-architect.md              ← plan 阶段 architect 评审(可选)
    │   ├── review-dba.md                    ← plan 阶段 dba 评审(可选)
    │   ├── review-code-phase-N.md           ← 代码层评审(每 phase 触发时落,可选)
    │   ├── spike-<topic>.md                 ← 技术 spike(plan 阶段产物,归 plan 目录)
    │   └── contract-lock.md                 ← 跨前后端契约锁(Phase 2 后产物,可选)
    └── _<template>.md                       ← 元文件保留扁平(_template-app-onboarding 等)
```

## 命名约定

| 文件类型 | 命名 | 归属目录 |
|---|---|---|
| 主 spec / plan | `spec.md` / `plan.md` | 自身主题目录 |
| 同主题子 spec / plan | `spec-<sub>.md` / `plan-<sub>.md`(如 `plan-callsites.md` / `plan-p1-backend-slim.md`) | 自身主题目录 |
| spec 评审 | 简单单评审 `review.md` / 多并行 `review-{architect,dba,code-reviewer}.md` | spec 目录 |
| plan 评审 | 同上 | plan 目录 |
| 代码层评审(每 phase) | `review-code-phase-N.md` | plan 目录 |
| 事实查证 / DB precheck | `dba-precheck.md` | **spec 目录**(spec 阶段产物) |
| 功能盘点矩阵(PM 视角) | `feature-inventory.md` | spec 目录(迁移/整改/整合 spec 必做,见 `feedback_pm_view_feature_inventory.md`) |
| 主题特有现状分析 | `<topic>-current-state.md`(如 `app-center-current-state.md`) | spec 目录 |
| 技术 spike | `spike-<topic>.md`(如 `spike-libreoffice.md`) | **plan 目录**(plan 阶段验证) |
| 契约锁 | `contract-lock.md` | plan 目录 |

## 评审报告内联 vs 独立

- **简单评审**(0 CR + 0 HIGH 通过 / 仅自修 1 轮)可选内联到 plan 顶部 `## Reviews` 段,5-15 行结论,**不必独立文件**
- **复杂评审**(多轮 / 跨多 reviewer / 详细 CR-HIGH 清单)落独立 `review-*.md` 归主题目录

## 例外保留扁平(不单目录化)

- `_template-*.md` / `_<placeholder>.md` 等下划线开头的元文件 → `plans/` / `specs/` 根
- **L3 孤立 plan**(无 spec / 无 review / 无 spike 的纯单文件,约 30+ 个历史 plan)→ 保留扁平,新建 plan 时如有周边文件再回溯
- `backlog/` 目录扁平不动(`feature-extension-backlog.md` / `compliance-debt.md` / `test-coverage-debt.md` 等)

## 跳 spec/plan 的边界(简单任务路径)

详见 `feedback_skip_spec_plan_simple_tasks.md` — 资源已有 / 纯字段扩展 / 工作量 S / 风险低的 task **即使跨前后端也跳 spec/plan**,直接落代码 + 详尽 commit message。

走 spec/plan 的硬触发:
- 鉴权敏感 / DB schema 迁移 / ≥4 文件 / 多模块联动 / 涛哥显式要求
- 详见 `feedback_standard_workflow_reduces_rework.md`

## 历史回溯状态(2026-05-03)

L1 主题已回溯单目录结构:

- `2026-05-03-edoc-merge-into-sys`
- `2026-04-21-org-auth-unification`
- `2026-04-22-basic-data-import`
- `2026-04-22-orgauth-tab-fix-hr-emp-actions`
- `2026-04-06-mom-phased-roadmap`
- `2026-04-07-subapp`
- `2026-04-05-hr-person-employee`
- `2026-04-16-sys3-console-refactor-b`
- (共 8 个)

L2 配对主题部分回溯;L3 孤立 plan 暂保留扁平。

## 与三层文档规范的关系

文档目录规范 = "怎么放文件";三层文档规范 = "写什么内容"。两者协同:

- **Spec**(`spec.md`)— 做什么 + 为什么 + 边界 + 验收(不写 phase / task / 文件路径 / 代码片段)
- **Plan**(`plan.md`)— 怎么做 + 谁做 + 验证;顶部必填 `## Spec` 行引用对应 spec
- **Tasks**(内嵌 plan 底部 `## Tasks 拆解`)— 单单元目标 / 输入 / 输出 / 涉及文件 / 验收 / 依赖

详见全局 `~/.claude/CLAUDE.md` 「三层文档:Spec / Plan / Tasks」段。

## 历史溯源

- 2026-05-03 涛哥拍板单目录结构,replace 原扁平命名(`<topic>-design.md` / `<topic>-plan.md`)
- user scope superpowers 5.0.7 cache `SKILL.md` 已 patch 输出此结构(指纹见 `docs/ops/superpowers-patch-notes.md`)
- 2026-05-05 抽出独立标准文档(本文档),CLAUDE.md 仅保留摘要 + 引用
