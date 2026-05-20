# Memory 维护标准(跨项目工程标准)

- **生效日期**:2026-05-20
- **范围**:所有 `~/.claude/projects/<workspace>/memory/` 治理(跨工作区通用,不绑定具体项目名)
- **关联 ADR**:ADR-009(CLAUDE.md cheatsheet 化哲学扩展)/ ADR-015(事实驱动)/ ADR-030 A3(Claim 来源)
- **关联 template**:`templates/MEMORY.md.template`

---

## 1. 原则

memory 是**工作区特化沉淀**,**不是**通用工作流规则的存放点。通用规则的真理源是 ADR / standards / CLAUDE.md。

### 1.1 真理源层级(高 → 低)

| 层级 | 位置 | 性质 |
|---|---|---|
| ADR(跨项目)| `engineering-standards/decisions/` | 不可改写,变更走 Superseded |
| ADR(项目级)| `<workspace>/docs/decisions/` | 同上 |
| standards | `engineering-standards/standards/` | 跨项目工程标准 |
| 全局 CLAUDE.md | `~/.claude/CLAUDE.md` | cheatsheet,详情下沉 ADR |
| 项目 CLAUDE.md | `<workspace>/CLAUDE.md` | 项目特化覆盖 |
| memory | `~/.claude/projects/<workspace>/memory/` | **本工作区**独有沉淀 |

**关键**:memory 不允许重复或抢占上层规则。已锚 ADR 的条目从 memory 删除,改为 ADR 引用。

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
❌ 用户画像类(全局 CLAUDE.md 已有「用户画像」段)
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
| memory 文件数 > **50** | 扫一遍,删除已锚 ADR 的条目;合并同语义 |
| MEMORY.md 索引 > **200 行** | 按分类整合,删冗余 |
| 同一 ADR 主题 ≥ 3 个 memory 文件 | 合并为集合 + 删原文件 |
| 涛哥纠正同一规则 ≥ 2 次 | 检查是否该提升 ADR(走跨项目 / 项目级) |
| 工作区 memory 重复语义命中其他工作区 3 次 | 提升 ADR(跨项目)|

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
| 编码路由 / Teams / Qwen | 落盘方偏好 |
| DB / SQL / 安全 | 数据库 / 测试库 / 安全规则 |
| CI/CD / 监控 / Dev Server | 部署 / 监控 / dev 环境 |

每条索引一行,**≤ 150 字符**,格式:`- [name](file.md) — 一句话钩子`。

---

## 7. 维护节奏

| 时机 | 动作 |
|---|---|
| 涛哥纠正后 | 立即写 memory(同 turn 落档,不积压)|
| 每会话结束 | 不主动精简(避免开销)|
| 每周 | 涛哥可主动 `/skim memory` 或 Claude 主动检查阈值(触发精简)|
| 工作区 bootstrap | 从 `MEMORY.md.template` 实例化 |
| ADR 新立 / 修订 | grep 工作区 memory,删除已被 ADR 覆盖的条目 |

---

## 8. 兼容性 / 历史欠债

本标准 **2026-05-20 生效**。已存在工作区(SRMV2/SYSV2/HC)的 memory 当前可能含违反本规范的条目,**不强制立即清理**,按以下节奏处理:

1. **新写 memory**:必须遵守本规范
2. **现有 memory**:涛哥主动触发清理 / 阈值触发精简时按规范整理
3. **明显违反**(已锚 ADR 的重复条目):发现即删,不等周期

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
