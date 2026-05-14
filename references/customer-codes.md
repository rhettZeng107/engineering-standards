# 客户简称体系(跨项目共享真理源)

> **Status**: Active
> **Date**: 2026-05-13 首版
> **Owner**: 涛哥
> **Scope**: 跨项目(HC / SYSV2 / 后续 SRM / MES / EAM / WMS 等)
> **用途**: 同一客户被多个项目服务时简称一致,避免沟通/分支/Variable Group 命名冲突
> **真理源**: 本文件唯一权威,各项目 spec / ADO Variable Group / artifact 命名引用

---

## 1. 命名规则

- 简称 **2-4 字符**,大写字母为主,可加数字
- 优先取客户全称首字母缩写(华灿 → HC,龙城 → LC)
- 全称含多字时取主要部分(山西淮海 → SHHH)
- **唯一性**:整张表内简称不冲突;后续新增需 grep 本表确认
- 一旦发布 **不可改写**(避免引用断裂)— 客户合并 / 重组通过新增简称 + 标"已合并"维护

---

## 2. 公司 vs 客户

| 实体类型 | 含义 |
|---|---|
| **本公司** | 经营 SYSV2 / HC 等项目的运营公司,**景颜(JinYan)** — 内部环境配置 `appsettings.JingYan.*` 是公司内部开发 / 演示用,**不是客户** |
| **客户** | 购买并部署本公司产品的外部企业(下表) |

---

## 3. 客户清单

| 简称 | 全称 | 行业 | HC 项目 | SYSV2 | 状态 | 备注 |
|---|---|---|---|---|---|---|
| **HC** | 华灿 | (待补) | ✅ 上线 | ⏸️ 试点候选 | 上线(HC 项目) | SYSV2 试点优先选 HC |
| **LC** | 龙城 | (待补) | ✅ 上线 | — | 上线(HC 项目) | 暂未安排 SYSV2 |
| **KH** | 科华 | (待补) | ✅ 上线 | — | 上线(HC 项目) | 暂未安排 SYSV2 |
| **DS** | 鼎盛 | (待补) | ✅ 上线 | — | 上线(HC 项目) | 暂未安排 SYSV2 |
| **SHHH** | 山西淮海 | (待补) | ✅ 上线 | ❌ 不试点 | 上线(HC 项目) | MDM `appsettings.ShanxiHuaiHai.*` 是 HC 项目历史遗留配置 |

> **新增客户流程**:
> 1. 涛哥拍板简称(2-4 字符,grep 本表确认无冲突)
> 2. 行/全称/项目覆盖填齐
> 3. commit + 双推 engineering-standards
> 4. 各项目 ADO Variable Group / spec / artifact 命名引用新简称

---

## 4. 引用规范

各项目按此格式命名:

### ADO Variable Group
- `<Project>-Customer-<Code>-Secrets`
- 例:`SYSV2-Customer-HC-Secrets` / `HC-Customer-LC-Secrets`

### 离线包 artifact
- `<project>-<app>-<Code>-<sha>-<timestamp>.zip`
- 例:`sysv2-sys-api-HC-c0257ba-20260513-2030.zip`

### 客户专属分支(应少用,优先 Variable Group + 配置驱动)
- `customer/<code>/<purpose>`
- 例:`customer/HC/test-env` / `customer/SHHH/prod-deploy`
- 历史例外:SYSV2 `AI.REACT.MDM.1` 的 `customer/jy/47云服务器` 是**景颜本公司**生产分支(非客户),命名带 `customer/` 前缀是历史习惯,**新分支按本表规则**

---

## 5. History

| 日期 | 变更 | 备注 |
|---|---|---|
| 2026-05-13 | 首版 | 从 HC 项目客户简称体系沉淀;SHHH 简称由涛哥拍板;Q3 跨项目复用决议 |
