# 新工作区 Bootstrap 指南(Workspace Bootstrap Guide)

> 决策依据:[ADR-029](../decisions/ADR-029-workspace-governance-bootstrap.md)(工作区治理三层模型)。
> 适用:新建任何工作区(SRMV2 及未来 MES / WMS / EAM / TPM 等)。
> 配套模板:[templates/workspace-CLAUDE.md.template](../templates/workspace-CLAUDE.md.template)。

---

## 1. 工作区治理三层模型

| 层 | 载体 | 谁负责 | 放什么 |
|---|---|---|---|
| 全局层 | `~/.claude/`(CLAUDE.md / rules / hooks / agents) | 本机自动 | 跨项目通用工作流、编码路由、批次合同、鉴权刚性 |
| 跨项目标准层 | `engineering-standards` 仓 | 引用 | ADR、工程标准、迁移手册、本模板 |
| 工作区层 | `<workspace>/` 内的 CLAUDE.md + docs + 地图 + memory | bootstrap | **仅项目特化 + 项目级覆盖** |

**铁律**:工作区层只放项目特化,不重复上两层;跨项目可复用的 essence 上提 `engineering-standards`。

> **ADR-030 GSD 融合能力自动继承**:A1 新会话地图注入 / A2 context 窗口监控 / A3 claim 来源标注 / B4 地图漂移检测 —— 这些 hook 与规则落在**全局层**(`~/.claude/`)与 `engineering-standards`,新工作区**自动继承,无需重装**;工作区层只需按 §3 建好项目地图作其数据源。

---

## 2. 一个标准工作区的构成

```text
<workspace>/                      ← workspace 容器仓(git init,追踪 docs/scripts/根 *.md)
├── CLAUDE.md                     ← 项目特化(由模板实例化)
├── .gitignore                    ← 排除 nested 项目仓 + .mcp.json
├── .mcp.json                     ← MCP 配置(含密码 → 永不入库)
├── docs/
│   ├── superpowers/
│   │   ├── specs/                ← <YYYY-MM-DD-topic>/spec.md
│   │   ├── plans/                ← <YYYY-MM-DD-topic>/plan.md
│   │   ├── backlog/              ← 欠债登记
│   │   └── _archive/             ← 完结归档
│   ├── decisions/                ← 项目特化 ADR(跨项目 ADR 在 engineering-standards)
│   └── ops/                      ← 运维脚本 / CI-CD 监控脚本 / 自治修复 SOP
├── .planning/codebase/           ← 项目地图(7 文件,/gsd-map-codebase 产出)
└── <nested 项目仓>/              ← 实际代码仓,各自独立 git,gitignore 排除
```

memory 不在工作区内,在 `~/.claude/projects/<工作区路径转义>/memory/`(首次会话自动建)。

---

## 3. Bootstrap 步骤

> **一键搭骨架**:`templates/bootstrap-workspace.sh <工作区绝对路径>` 自动完成机械部分 —— 建容器仓 + git init + 实例化 CLAUDE.md 模板 + 文档骨架 + `.gitignore` + 拷 CI/CD 监控脚本(下方步骤 1-3、5 的目录/文件部分)。之后人工:填 CLAUDE.md 占位、clone nested 仓、跑 `/gsd-map-codebase`。

1. **建容器仓**:`mkdir <workspace> && cd <workspace> && git init`;workspace 容器仓只追踪 `docs/` `scripts/` 根 `*.md`,nested 项目仓写进 `.gitignore`。
2. **实例化 CLAUDE.md**:复制 `templates/workspace-CLAUDE.md.template` → `<workspace>/CLAUDE.md`,逐个填 `<占位符>`(见 §4)。
3. **建文档骨架**:`docs/superpowers/{specs,plans,backlog}/` + `docs/decisions/` + `docs/ops/`。
4. **建项目地图**:`.planning/codebase/`,跑 `/gsd-map-codebase` 扫出 7 文件项目地图。**地图是 ADR-030 新会话自动导航的数据源** —— 建好后全局 hook `project-map-session-digest`(新会话注入地图摘要)+ `project-map-staleness-check`(漂移检测)即自动生效。
5. **CI/CD 配置 + 监控**(ADR-022 监控双轨):配置各 nested 项目仓的 CI/CD 流水线;接监控两路 —— **被动**:全局 post-push 监控提醒 hook 已自动生效(推送后提示起 build 监控);**主动**:把 build 监控脚本(如 `cicd-ado-monitor`)+ 自治修复 SOP `cicd-self-heal-sop.md` 放工作区 `docs/ops/`。监控脚本可从已有工作区(SYSV2 `docs/ops/`)复用。
6. **memory**:首次会话自动在 `~/.claude/projects/<路径>/memory/` 建;写一条工作区画像(交付线、技术栈、关键约束)。
7. **回链标准**:CLAUDE.md 顶部声明「通用工作流以 `~/.claude/CLAUDE.md` 为准,跨项目标准见 `engineering-standards`」。
8. **老项目迁移工作区额外**:按 [legacy-migration-playbook](legacy-migration-playbook.md) §2 在 spec 声明基线(后端运行时 / 前端工具链 / 前端工程标准)+ §3.1 产源工件清单 + §3.5 验收质量闸。

---

## 4. CLAUDE.md 模板填空项

模板 `<占位符>` 逐个填:

| 占位符 | 填什么 |
|---|---|
| `<工作区名>` / `<一句话定位>` | 工作区名与业务定位 |
| `<交付线表>` | 各交付线:目录 / 技术栈 / 端口 |
| `<git 双推表>` | 各 nested 仓:远程 / 默认分支 |
| `<构建命令>` | 前后端 build / dev 命令 |
| `<架构落点>` | Context / Controller / Policy 注册等关键路径 |
| `<CI/CD 与监控>` | 各仓 CI/CD 平台 + 流水线 / build 监控脚本 / 自治修复 SOP |
| `<项目级覆盖>` | 项目特化覆盖全局规则的条目(无则留空) |
| `<测试环境>` | 测试账号 / 测试库 |

不确定的项留 `TODO(<占位符>)`,首个 spec discuss 时补全。

---

## 5. 维护

- 治理改进(新踩坑沉淀、新标准)→ 同步更新本指南 + 模板,后续新工作区即继承。
- 跨项目标准变更走 `engineering-standards`;各工作区因顶部回链,自然指向最新真理源。
- 已存在的旧工作区(如 HC)若要并入本治理:对照 §2 §3 补齐缺的层,不必推倒重来。
