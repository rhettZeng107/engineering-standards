# Memory 维护标准(跨项目工程标准)

- **生效日期**:2026-05-20
- **范围**:经批准的 memory 扩展入口与工作区 curated memory 治理(跨工作区通用,不绑定具体项目名)；不直接整理 Codex 管理的注册表、rollout summaries、skills 或仓库元数据
- **关联 ADR**:ADR-009(短准指令层哲学扩展)/ ADR-015(事实驱动)/ ADR-030 A3(Claim 来源)
- **关联 template**:`templates/MEMORY.md.template`

---

## 1. 原则

memory 是**工作区特化沉淀**,**不是**通用工作流规则的存放点。通用规则的真理源是 ADR / standards / `AGENTS.md`。

### 1.1 真理源层级(高 → 低)

| 层级 | 位置 | 性质 |
|---|---|---|
| 项目 AGENTS.md | `<workspace>/AGENTS.md` 或最近 nested `AGENTS.md` | 项目特化覆盖 |
| 全局 AGENTS.md | `~/.codex/AGENTS.md` | 跨项目常驻规则,详情下沉 ADR/standards |
| ADR(项目级)| `<workspace>/docs/decisions/` | 项目长期决策；与上级指令冲突时按指令链处理 |
| ADR(跨项目)| `engineering-standards/decisions/` | 跨项目长期决策；变更走 Superseded |
| standards | `engineering-standards/standards/` | 跨项目工程标准 |
| memory | `~/.codex/memories/` 的 INDEX/curated memory | 工作区背景、偏好与实证索引 |
| 历史 provider memory | `~/.codex/legacy-claude-assets/` 等归档 | 仅作追溯或迁移输入,不参与活动规则优先级 |

**关键**:memory 不允许重复或抢占上层规则。已锚 ADR 的条目从 memory 删除,改为 ADR 引用。

**写入边界**:只通过当前 Codex 明确批准的扩展入口写入，或维护工作区明确标识的 curated memory。`MEMORY.md`、`memory_summary.md`、`rollout_summaries/`、`skills/`、`.git/` 等 Codex 管理或追加式资产不得由本维护流程直接合并、改写或删除。

---

## 2. 保留原则(允许进 memory)

✅ 工作区独有的反模式(其他工作区不必然遇到)
✅ 实证案例锚点(具体 file:line / commit / 现象,作 ADR 案例补充)
✅ 工作区特化的外部资源 / 测试环境 / 老仓引用
✅ 工作区内涛哥纠正过的偏好细节
✅ 跨工作区共性沉淀的**临时驻留**(满 3 工作区命中后应提升 ADR)

---

## 3. 删除原则(必须从 memory 移除)

❌ 已锚 ADR-NNN 的条目(decisions 仓即真理源,memory 重复 = 漂移风险)
❌ 用户画像类(全局 `AGENTS.md` 已有「用户画像」段)
❌ 通用工作流规则(ADR/standards 真理源)
❌ 已过时的临时偏好(涛哥再次推翻 / 自然过期)
❌ 同一规则多个 memory 文件(应合并为集合文件)

---

## 4. 命名规范

| 类型 | 文件名格式 | 例 |
|---|---|---|
| 工作区特化反模式 | `feedback_<topic>.md` | `feedback_git_log_full_history.md` |
| 实证案例锚点 | `case_<topic>.md` 或 `project-<topic>.md` | `project-migration-pitfall-anchors.md` |
| 外部资源引用 | `reference_<topic>.md` 或 `reference-<topic>.md` | `reference-test-environment.md` |
| 集合文件(合并多条同语义) | `feedback_<group>_collection.md` | `feedback_e2e_execution_stack.md` |

---

## 5. 触发精简的硬阈值

| 触发条件 | 动作 |
|---|---|
| memory 文件数 > **50** | 只报告阈值；仅经涛哥明确授权或已授权 automation，才整理获批的 curated memory |
| MEMORY.md 索引 > **200 行** | 只报告阈值；仅经授权后按分类整合获批的 curated memory |
| 同一 ADR 主题 ≥ 3 个 memory 文件 | 建议合并；取得授权后仅处理获批的 curated memory |
| 涛哥纠正同一规则 ≥ 2 次 | 建议评估是否提升 ADR(走跨项目 / 项目级)，不自动写入 |
| 工作区 memory 重复语义命中其他工作区 3 次 | 建议提升 ADR(跨项目)，不自动写入 |

---

## 6. MEMORY.md 索引格式(强约束)

| 段 | 内容 |
|---|---|
| 🔝 置顶 | **强约束**:ADR-015 / ADR-030 A3 / ADR-018 等高频规则置顶提醒(SessionStart hook 同等内容注入)|
| 工作区特化沉淀 | 本工作区独有 |
| 工作流 / 协作偏好 | Tier 边界微调 / 沟通节奏 |
| Spec / Plan / 评审 | 启动 / 拆分 / 评审偏好 |
| 事实驱动 / 实证 / Debug | 技术域实证规则 |
| E2E / 集成验证 | 工作区 E2E 规则 |
| 编码路由 / Agents / Models | 落盘方偏好 |
| DB / SQL / 安全 | 数据库 / 测试库 / 安全规则 |
| CI/CD / 监控 / Dev Server | 部署 / 监控 / dev 环境 |

每条索引一行,**≤ 150 字符**,格式:`- [name](file.md) — 一句话钩子`。

---

## 7. 维护节奏

| 时机 | 动作 |
|---|---|
| 涛哥明确要求记入 memory 后 | 同 turn 通过当前 Codex memory 扩展入口落档；普通纠正只更新本轮 Plan、适用规则或项目文档，不擅自写 memory |
| 每会话结束 | 不主动精简(避免开销)|
| 每周 | 涛哥可主动要求 memory 巡检，或 Codex 按已授权 automation 检查阈值 |
| 工作区 bootstrap | 从 `MEMORY.md.template` 实例化 |
| ADR 新立 / 修订 | 检索并报告被ADR覆盖的条目；仅在明确授权后整理获批的 curated memory |

---

## 8. 兼容性 / 历史欠债

本标准 **2026-05-20 生效**。已存在工作区(SRMV2/SYSV2/HC)的 memory 当前可能含违反本规范的条目,**不强制立即清理**,按以下节奏处理:

1. **新写 memory**:必须遵守本规范
2. **现有 memory**:阈值只触发报告；涛哥明确授权或已授权 automation 后，才按规范整理获批的 curated memory
3. **明显违反**(已锚 ADR 的重复条目):仅在批准的扩展入口或 curated memory 中移除；Codex 管理资产只记录问题，不直接改写

---

## 9. 反模式

❌ 把全局工作流规则写进 memory(违反真理源层级)
❌ 把临时 task 状态 / 进度写进 memory(应进 `progress.md`)
❌ 把会话总结 / 活动日志写进 memory(memory 不是日志)
❌ memory 索引 MEMORY.md 写满规则正文(只能写一行索引)
❌ 同语义多文件不合并 → memory 膨胀
❌ 已锚 ADR 不删 memory → 双源漂移

---

## 10. 例外 / Defer

- 工作区**正在踩坑实证**的临时规则:可先写 memory,3 次跨工作区命中后再提 ADR
- 工作区 bootstrap 时**模板继承**的「置顶段」不算违反真理源层级(它是引用 ADR,不是重新写)
- 复盘类(`postmortem-*.md`)沉淀在工作区 docs 而非 memory
