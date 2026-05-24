# ADR-031 — 工作流自动恢复机制(进度文件 + 新 turn 自动接续)

- **状态 / Status**:Accepted
- **日期 / Date**:2026-05-20
- **决策人**:涛哥(PM)
- **影响范围**:跨项目工程标准 — 全部工作区(SYSV2 / SRMV2 / MES / WMS / EAM / TPM 等)
- **参见**:ADR-017 批次任务扩大版 / ADR-022 CICD 监控反馈 / ADR-029 工作区治理

---

## 背景 / Context

实际使用中长任务执行触发 Anthropic API socket 断开异常的频次不低(典型错误:`API Error: The socket connection was closed unexpectedly`),Claude Code CLI 主 turn 直接退出,不内置 retry。涛哥反馈:**「希望自动唤醒继续执行,不需要每次重新发指令」**。

实证现状(2026-05-20):

- `~/.claude/settings.json` 已配 `SessionStart` + `PostToolUse` hooks,**无 `Stop` hook**
- 部分工作区根目录已有 `.continue-here.md`(HC 工作区 2026-04-09,YAML frontmatter + Critical Anti-Patterns + Required Reading 结构)— 涛哥已有此习惯但未系统化
- SRMV2 等新工作区未建立该机制

「让 Claude 在 socket 断后**完全无人干预**自动重启」属于 shell wrapper / process supervisor 层面,Claude Code 内部解决不了;但**「让 Claude 新 turn 启动后自动接续,不需要涛哥重述任务」**完全可行,且收益最大。

## 决策 / Decision

### D1. 进度文件惯例(必做)

Claude 执行**任何超过单 turn 的批次任务**(plan 多 phase / spec 多 task / 长时间 spike / 多文件落档)前,**必须在批次目录写 `progress.md`**:

| 场景 | progress.md 位置 |
|---|---|
| spec 多 phase 执行 | `<spec-dir>/progress.md` |
| plan 多 task 落盘 | `<plan-dir>/progress.md` |
| 工作区根级长任务(跨多 spec / 元任务) | `<workspace-root>/.continue-here.md` |
| 单次会话短任务 | **不写**(避免冗余文件) |

`progress.md` 内容结构(YAML frontmatter + Markdown):

```markdown
---
context: <spec-id / plan-id / task-name>
phase: <phase-name>
task: <current-task-index>
total_tasks: <N>
status: in_progress | done | blocked | paused
last_updated: <ISO 8601>
---

## 批次计划 / Batch Plan
1. ✅ <已完成 task>
2. 🔄 <当前 task> ← 在做
3. ⬜ <待办 task>
...

## 当前上下文 / Current Context
- <关键决策 / 拍板点 / 已实证事实摘要,3-5 条>

## 阻塞 / 待决 / Blockers
- <若 status=blocked / paused,写阻塞原因 + 涛哥需要拍板的问题>

## 下一步 / Next
- <下一个 task 的明确动作:文件路径 + 操作类型 + 验收点>
```

### D2. 新 turn 自动接续(必做)

Claude 在**新 turn 启动时**(SessionStart 后 / `claude --continue` 后 / 涛哥发"继续"/"c"/"resume"等接续意图字符后),**必须**:

1. 扫工作区根的 `.continue-here.md`(若有)
2. 扫所有近期 spec / plan 目录的 `progress.md`(近 7 天内修改的)
3. 如发现 `status: in_progress` 或 `paused` 的进度文件,**自动 Read 全文并接续工作**,不需要涛哥重述任务
4. 接续第一动作:报告「检测到进度文件 `<path>`,当前 phase=X / task=Y / status=Z,继续执行下一步」+ 简要恢复

**触发关键字识别**(涛哥短指令接续):`继续` / `c` / `resume` / `接着` / `下一步` / `go on` / `continue`(任一即触发)

### D3. 进度文件更新节奏(必做)

- **批次启动时**:写初版 progress.md(全部 task 列出,第一个标 🔄)
- **每个 task 完成时**:更新 progress.md(标 ✅ + 移 🔄 到下一个 + last_updated)
- **阻塞 / 拍板等待时**:status 切 `blocked` / `paused` + 写阻塞原因
- **批次全部完成时**:status 切 `done` + last_updated(**保留 progress.md 作历史归档**,不删)
- **写 progress.md 用 Write 工具**(不能用 Edit 逐行改,容易漂移;每次整文件覆盖)

### D4. 硬自动恢复(**强烈推荐启用,2026-05-20 涛哥强化**)

涛哥 2026-05-20 明确:**「Claude 出现 API error 不要等我『继续』指令,自动接续」**。已落 `~/.claude/bin/claude-watchdog.sh`(chmod +x),涛哥**用 `claude-watchdog.sh` 代替 `claude` 命令启动**即可。



如需「socket 断 → 自动重启 claude process」,加 shell wrapper:

```bash
# ~/.claude/bin/claude-watchdog.sh
#!/bin/bash
LAST_EXIT=0
while true; do
  claude "$@"
  LAST_EXIT=$?
  [ $LAST_EXIT -eq 0 ] && break
  # 检测异常退出 + auto-resume 触发条件
  if grep -q 'socket connection was closed' ~/.claude/logs/*.log 2>/dev/null \
     && find ~/Projects -maxdepth 4 -name 'progress.md' -mmin -30 -exec grep -l 'status: in_progress' {} \; 2>/dev/null | head -1 >/dev/null; then
    echo "[watchdog] socket error + active progress.md, restarting with --continue..."
    sleep 3
    set -- "--continue"
  else
    echo "[watchdog] Exited $LAST_EXIT, manual restart required."
    break
  fi
done
```

涛哥需要时执行 `chmod +x ~/.claude/bin/claude-watchdog.sh` 后用 `claude-watchdog.sh` 代替直接 `claude`。

### D5. 与现有机制兼容

- **不替换 `.continue-here.md`**(HC 工作区已有的格式继续支持,作工作区根级跨 spec 进度的特例)
- **不与 ADR-017 批次任务冲突**:批次任务保证「涛哥 Y 一次 = Claude 跑完批次」,本 ADR 保证「断了之后能从断点续上」,两者互补
- **不强制每 turn 都写 progress**:单 turn 完成的短任务不写(降低噪声)

## 影响 / Consequences

**正面**:

- 涛哥从「断了重新发完整指令」降级为「断了发『继续』即可」,沟通成本下降 ~80%
- 进度文件作为「批次执行的可见状态」,涛哥可随时查看进度不打断 Claude
- 跨 session / 跨日的长任务(spike / migration phase)可被多次 session 继续推进,不需要 Claude 重新理解上下文
- 硬自动恢复(D4)为完全无人干预场景留下选项

**代价 / 风险**:

1. **额外文件维护**:每个长批次多一个 progress.md(但批次完成后保留作归档,无清理负担)
2. **新 turn 接续的扫描成本**:Claude SessionStart 后扫近期 progress.md 增加 ~1-2 个 Read,可接受
3. **D4 shell wrapper 不能识别所有异常类型**:仅识别 socket 断;其他异常(rate limit / 服务降级)仍需人工
4. **「触发关键字」可能误识别**:涛哥说「继续讨论 X」时 Claude 可能误以为是「接续上次任务」;**缓解**:Claude 接续前先报告检测到的进度文件 + 显式确认「是否接续 Y?」(D2 第 4 条要求)
5. **进度文件可能跟实际工作脱节**:Claude 忘记更新 progress.md → 涛哥下次接续时基于过时状态;**缓解**:D3 强制 task 完成时同步更新,且 Write 整文件覆盖

## 关系 / Relationship

- **协同 ADR-017** 批次任务:批次任务保证执行节奏,本 ADR 保证可恢复性
- **协同 ADR-022** CICD 监控:CICD 监控保证 push 后状态可见,本 ADR 保证 Claude 工作状态可见
- **协同 ADR-029** 工作区治理:`.continue-here.md` 模板纳入工作区 bootstrap 标配

## 实施 / Implementation

1. **全局 ~/.claude/CLAUDE.md** 加「进度文件 + 自动接续」段(本 ADR 简化版规则)
2. **engineering-standards/templates/`.continue-here.md.template`** 落档(供 bootstrap 复用)
3. **(可选)`~/.claude/bin/claude-watchdog.sh`** 提供 shell wrapper
4. **(可选)`~/.claude/hooks/workflow-progress-staleness-check.js`** 检测工作区有 `status: in_progress` 但 last_updated > 24h 的孤立 progress 文件,SessionStart 时提醒涛哥

## 参考 / References

- `~/Projects/HC/.continue-here.md`(涛哥已有的进度文件实例,2026-04-09)
- `~/Projects/SRMV2/docs/superpowers/specs/2026-05-20-srm-contract-migration/spec.md`(本会话触发本 ADR 的合同 spec)
- ADR-017 / ADR-022 / ADR-029
- Anthropic Claude Code docs: hooks / SessionStart / Stop hook

---

## 修订(2026-05-24)— 区分两类失败模式 + 卡死喂键(D6,涛哥拍板)

### 触发 / Context

涛哥反馈实际最常遇到的**不是**「进程崩溃退出」,而是:**API ERROR / socket 异常后 claude 进程没死、卡在 idle 等输入,要手动敲「继续 / go」才推进**(典型:夜间无人值守,早上才发现卡了一夜)。

实证(2026-05-24):

- 当时裸跑 `claude --dangerously-skip-permissions`(PID 12705 实测存活),未套 watchdog。
- **关键发现:D4 的 `claude-watchdog.sh` 结构性救不了这个场景** —— 它 `while` 循环阻塞在 `claude "$@"` 等进程退出;进程不退出则循环永不进下一圈。**D4 只覆盖「进程退出」**。

### 两类失败模式(本 ADR 须显式区分)

| 模式 | 进程状态 | 归谁 |
|---|---|---|
| **A 进程崩溃退出**(返回 exit code) | 死 | D4 `claude-watchdog.sh`(等退出 → 重启 `--continue`) |
| **B 进程活着卡 idle**(报错后停在输入提示) | 活 | **D6(新增)tmux + feeder 喂键** |

### D6. 卡死喂键(模式 B,保守档)

在 **tmux 会话内**跑 claude,后台看门人 `claude-feeder.sh` 每 ~90s `capture-pane` 读屏,三态判定:

- 底部有 `esc to interrupt`(在跑)→ 不动
- 尾部出现报错文案 + 连续 2 次同态(去抖)→ `send-keys go`(ASCII,非中文,防 `stuff` 多字节乱码)
- 其它 idle(正常完结 / 等指令 / **等拍板**)→ 不喂,留人工

**保守核心 = 白名单式喂键**:只有明确匹配报错文案才喂;拍板点屏幕无报错文案 → 天然不会被误喂(**不替人做决定**)。

A+B 互补,均跑在 tmux 内:
`Ghostty → claude-tmux.sh →(tmux pane:claude-watchdog.sh = 模式 A)+(后台:claude-feeder.sh = 模式 B)`

### Ghostty 自动装载

`~/.config/ghostty/config` 加 `command = ~/.claude/bin/claude-tmux.sh` → 开 Ghostty 自动进 claude,无需手敲;`claude-tmux.sh` 老会话 attach / 无则新建 + 自愈 feeder。

### D4 顺修

`claude-watchdog.sh` 重启时原 `set -- "--continue" "继续"` 会**丢原始参数**(如 `--dangerously-skip-permissions`)→ 改 `set -- "${ORIG[@]}" "--continue" "继续"` 保留。

### 实证 vs 假设(诚实标注,ADR-015)

- **[实证]** `capture-pane` 读屏 / `send-keys` 注入(cat 回显 `go` 验证)/ 三态判定 / 脚本 `bash -n` / tmux brew 安装 —— 全过。
- **[假设]** feeder 报错正则 `ERR_RE` 匹配真实 Claude Code 卡死屏 —— **无法在运行中自证**(Claude 看不到自己 TUI),第一版用常见报错词;每次喂键存现场快照 `~/.claude/logs/feeder-snaps/`,据真实文案迭代校准。**漏喂 = 退回手敲(安全方向),不会误喂拍板**。

### 文件清单

- `~/.claude/bin/claude-tmux.sh`(新,Ghostty 入口)
- `~/.claude/bin/claude-feeder.sh`(新,模式 B 看门人)
- `~/.claude/bin/claude-watchdog.sh`(改,模式 A + 参数保留)
- `~/.config/ghostty/config`(改,自动装载)

### 代价 / 残留风险

1. feeder 靠抓屏文案判定,启发式非 100%;极端情况(报错后又有输出冲掉报错行)可能漏喂 —— 但保守档保证不误喂拍板点。
2. tmux 接管滚屏(`Ctrl-b [`),用户习惯小变。
3. 报错正则需据真实快照校准,第一晚算试运行。
