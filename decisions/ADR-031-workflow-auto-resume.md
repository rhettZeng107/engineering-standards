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

---

## 修订(2026-05-31)— 多 spec 并行防串场(D7,涛哥拍板 A+B 双档)

### 触发 / Context

多 spec 并行(HC 工作区同时存在 field-parity 迁移主线 + deploy 部署线 + 旧 v1.0 paused 线 3 个进度文件)时,涛哥发「继续」短指令**无指向**,原 D2 第 4 条「需 Claude 判断最新 + 最相关」是薄弱点 —— 决策权交给 Claude 的弱信号(mtime)判断,串场风险高:

- **接错任务** → 在错 spec/错分支落 commit,污染另一条线进度,事后清理成本高
- **误接 deploy 线** → deploy 的 next_action 含「改物理路径 + 部署到 192.169.12.72/73 客户测试环境」,自动往下跑可能动客户机器(破坏性低但隐蔽且外向)
- **后续常态化**:SRMV2/MES/WMS/EAM/TPM 上线后多 in_progress 越来越多,不治理串场是迟早的事

实证(2026-05-31,本会话亲历):SessionStart 注入 2 个 in_progress,Claude 据「最新=05-31」猜对了主线但**这是脆弱信号**,且被迫弹 AskUserQuestion 才敢动 —— 暴露机制缺确定性。

### D7. 进度三分类 + 强制确认门 + 部署线硬隔离

**进度三分类**(SessionStart 注入时即归类):

| 类 | 判据 | 「继续」行为 |
|---|---|---|
| **主线候选** | status=in_progress 且非部署目录 | 1 个=可接;≥2 个=强制确认门 |
| **阻塞挂起** | status=paused / blocked | **不主动接**,仅备查(多为等外部输入/旧线) |
| **部署/生产类** | 路径含 `deploy/release/生产/prod` 目录(且非 spec/plan 主线目录) | **永不自动接**,必须涛哥显式点名 |

**A 档(规则,本 ADR + 全局 CLAUDE.md):**

1. **多主线强制确认门**:≥2 个主线候选时,「继续」**禁止自动挑一个开干**;第一动作必须输出「检测到 N 个活跃主线:①… ②…,我判断接 X(理由 1 句),非 X 请纠正」,**等涛哥一字确认**再动手。
2. **mtime 最新 ≠ 优先级**:不得据修改时间擅自拍板接哪条。
3. **部署线硬隔离**:部署/生产环境进度永不进自动接续池,只有涛哥明确说「做部署 / 接 deploy / 部署到 XX」才执行。
4. 单主线候选维持原 D2 行为(输出锚点后接续)。

**B 档(hook,core-progress-resume-inject.js):**

1. 注入按三类分区展示(主线候选 / 阻塞挂起 / 🚫部署生产类)。
2. deploy 归类**只按路径**(`DEPLOY_PATH_RE` 命中目录),**正文不参与降级** —— 避免迁移主线 progress 因 task 里提「末端部署/部署包」被误伤(本会话实证此误判后修正);spec/plan 主线目录(`MAINLINE_PATH_RE`)永不降级。
3. ≥2 主线候选自动注入强制确认门文案;单主线注入 ✅ 可接提示。
4. 文案从「优先接续」改「先确认再接」,决策权交回涛哥。

### 修订 D2(原第 4 条作废)

原「需 Claude 判断最新 + 最相关」→ 替换为 D7:**Claude 不再据 mtime 自行判断主线**;单主线直接接,多主线必确认,部署线硬隔离。

### 实证 / Evidence(2026-05-31)

- **[实证]** hook 改后用 HC 真实数据测:field-parity → 主线候选 / deploy → 部署危险线 / specs下含"部署"词不被降级,全对(node 单测 + 真实数据双验)。
- **[实证]** 误判修正:首版正文正则 `DEPLOY_BODY_RE` 把 field-parity(task 含"末端部署包UAT")误判 deploy → 改为只按路径 + MAINLINE 豁免后修复。

### 文件清单

- `~/.claude/hooks/core-progress-resume-inject.js`(改,B 档三分类 + 强制门)
- `~/.claude/CLAUDE.md`「进度文件 + 自动接续」段(改,A 档简化规则)
- 备份:`~/.claude/hooks/core-progress-resume-inject.js.bak-20260531`

### 代价 / 残留风险

1. deploy 归类靠路径目录名;若部署进度文件不放 `deploy/` 目录(如放 spec 下)会漏判 → 缓解:部署类 progress 统一放 `<工作区>/.planning/artifacts/deploy/` 或 `release/`(已是现状惯例)。
2. 强制确认门多一轮交互;但相比串场污染,这轮成本值得。
3. status 维护责任加重:done 必须及时切(否则废线长期占主线候选位,可能触发不必要的强制门)。

## 修订(2026-06-11)— 去 watchdog 崩溃层 + 假运行检测 + 403 通知(D8,涛哥拍板)

### 背景(HC 2026-06-10 夜间实证复盘)

cw 夜间模式跑 HC 批次,feeder 日志 + 屏幕快照还原出两个自动推进失效点:

1. **6 小时假运行黑洞(23:02→05:39)**:API `Stream idle timeout` 后 stream 彻底挂死,但 CLI 界面仍显示 "Cogitating…(esc to interrupt)" 运行态(最终屏显 `Cogitated for 5h 57m 58s`)。feeder 旧规则「运行中一律不喂」把假运行当真运行永久 HOLD;直到 CLI 自己吐出 socket closed 报错转 ERR 态才喂 go(go 生效,恢复执行)。
2. **403 白喂(09:58/10:01)**:OAuth 过期 `Please run /login · 403`,feeder 喂 go 两次无效——登录需浏览器交互,喂键不可自愈,需人工。

另:涛哥实证 claude 进程从未崩溃过 → watchdog(失败模式 A 崩溃重启)从未触发,属冗余层。

### 决策(涛哥 2026-06-11 拍板:去崩溃防护,保异常自动推进)

**单看门人架构**:cw(claude-tmux.sh)tmux 内**裸跑 claude**,删除 claude-watchdog.sh;feeder 为唯一看门人,三档:

| 档 | 检测 | 动作 |
|---|---|---|
| 报错卡死(原有) | idle + ERR_RE 文案,去抖 2 次 | 喂 go |
| **假运行挂死(新增)** | 运行态屏幕规范化(剥数字/spinner)后连续 20 次轮询(≈30 分钟)不变 | `Escape` 打断挂死 stream + 喂 go |
| **认证过期(新增)** | `Please run /login / 403 / oauth` 等 AUTH_RE | **不喂**(技术上限),macOS 通知人工 /login,30 分钟节流重提醒 |

- 阈值取舍:30 分钟纯无变化的 thinking 极罕见(正常 turn 工具输出会滚屏),误打断代价小(Escape+go 会从 progress 接续);对照黑洞 6 小时,收益显著。
- 失败模式 A(进程崩溃)条目作废;若未来真遇崩溃,tmux 会话留尸现场可人工查,不自动重启。
- 判据日志:`~/.claude/logs/feeder.log` 中 `STUCK-RUN 判定` / `AUTH-STUCK` / `FEED` 三类锚点 + feeder-snaps/ 快照。

---

## 修订(2026-06-26)— context-handoff 接续防杜撰验证 gate(D9,涛哥拍板)

### 触发 / Context

多次「context-handoff 自动接续打开的新窗」复发**杜撰工具输出 / 主题偏离**:上窗乐观或杜撰的「已完成」声明,经接续提示词遗传给新窗后被当既成事实,新窗在错误地基上继续推进。实测案例(2026-06-26 TPMV2):某 CI 优化整段工作(编辑 / self-test / yaml / 读写文件)被杜撰,**双 CR agent 独立 git 核实**才戳破。

根因(代码实证 `~/.claude/bin/context-handoff.js`):

| 环节 | 缺陷 |
|---|---|
| 接续提示词由上窗自由书写 | 原仅校验 file:line 锚点,**不区分 / 不校验「已完成」声明真伪** → 上窗乐观 / 杜撰遗传下窗当事实 |
| 兜底 prompt 含「直接开干」措辞(`directly`) | 鼓励不复核直接推进 |
| 验证覆盖不均 | `git push` 撞 `core-git-push-verify` hook(故 push 类断言可信);但**编辑文件 / 跑 test / 读文件无强制验证点** → 杜撰重灾区 |

**一句话根因**:哪里有强制验证 gate,哪里就不塌;靠「人在场」是拐杖,真正缺的是「对自己产出的强制独立验证」——可机制化,不靠人。

### 决策(涛哥 2026-06-26 拍板,三方向)

1. **触发器与「人是否在场」脱钩**:交接触发纯看 context 阈值,按 plan 自动跑完;可靠性归**验证 gate** 不归人。**否决**旧「在线时不自动交接」提案。
2. **新窗第一动作 = 独立复核 ✅区**:`git log -1 / git status -sb / grep` 复核继承的「已完成」声明,与事实不符以 git 为准、记 progress 后**继续不阻塞**(异步浮报,夜间勿停等拍板),复核通过再动未验证项。
3. **接续提示词结构化 + 凭证化**:强制分区 `✅ 已验证完成`(每条带 commit / curl / test 证据)vs `⬜ 计划 / 未验证`;promptcheck 在原 file:line 锚点外**加查 ✅ 段头标记**,缺则退回补写(一次性,防死循环)。

### 实现 / Implementation(D9)

`~/.claude/bin/context-handoff.js` 五处(均加法,复用既有一次性 promptcheck 范式,未触碰开窗 O_EXCL 锁 / 去重 / 触发逻辑):① 触发器脱钩决策固化为注释 ② 兜底 initPrompt 在「开干」前插入「先 git log/status/grep 复核继承声明」(删 `directly`、**保留** `Do not pause to ask which mainline` 绕多主线确认门语义)③④ 软 / 硬阈值给上窗的写作指令追加分区 + 复核要求 ⑤ promptcheck 合并「缺锚点 OR 缺 ✅ 段头」到同一一次性标记。配套:兄弟 hook `context-handoff-early-warn.js` 写作引导同步 ✅ 要求;新增 `context-handoff.test.js`(26 断言:软 / 硬 / promptcheck block + 合规放行 + 一次性放行不变量 + docExempt + initPrompt 静态)。

落点:`claude-governance` commit `edabfe8`。

### 实证 vs 假设(诚实标注,ADR-015)

- **[实证]** `node --check` 三文件语法过 / 单测 26 passed 0 failed(spawnSync 喂真 stdin 跑真实脚本,非 mock)/ initPrompt 程序化确认纯 ASCII 单行(send-keys 安全)/ architect + code-reviewer 双 CR **APPROVE 0 HIGH**(独立 git diff + 跑单测核实)。注:双 CR 审的是 18 断言初版;最终落盘的段头正则收紧(`/✅/` → `/✅\s*已验证/`)、early-warn 同步、测试扩至 26 断言 = **CR 后回修自审增量**(落实 reviewer LOW/MED 反馈、与决策方向一致,未重新 CR)。
- **[假设 / 残留]** promptcheck 的 `/✅\s*已验证/` 只验**段头结构存在**、不验声明真伪;最终戳破「继承的假声明」仍依赖新窗**真去执行**第一动作复核——这一步是**提示词指令、非机械 gate**,与原失效同型。**未闭环**(见 backlog),但本次为真实净改进(分区是复核的必要脚手架 + 复核指令更靠前显著)且不回退。

### Backlog(下一步闭环,双 CR 提出)

1. **机械化复核闭环(MED,推荐做)**:利用新窗已带的 `CLAUDE_HANDOFF_CONTINUATION=1` 环境变量,在 **SessionStart hook 确定性注入**「必先独立复核继承 ✅ 声明」强制 `additionalContext` —— 把复核从「上窗 prompt 写得好不好」解耦为机制保证,才算真闭环。
2. **绕门启发式描述同步(LOW)**:`core-progress-resume-inject.js` 多主线确认门例外项描述补「`Do not pause to ask which mainline` 亦视为绕门信号」。

### 否决「人在场探测」依据

「在线时不交接 / 探测人是否在场再决定可靠性」被否决:① 触发是否安全应由 context 阈值客观决定,不由「人在不在」主观决定 ② 把接续可靠性寄托于「人会盯着」= 拐杖,长 context 自治正是人不盯着的场景 ③ 正解 = 对自己产出的强制独立验证(可做成 gate / test / 复核指令),与人是否在场正交。

---

## 修订(2026-06-29)— 推翻 D9 验证 gate 路线,回归极简「模拟手动开窗 + 新窗零状态继承」(D10,涛哥拍板大砍)

### 触发 / Context

D9(2026-06-26)加「接续提示词分区 + 锚点 / ✅ 校验 + 复核指令」验证 gate 后,自动接续窗**仍复发工具层异常 / 幻觉**。实证铁证(SRMV2 2026-06-29,session `a552ec88` 自动接续窗):模型断言「后端 build 后台任务已完成」并调 `TaskOutput task_id=60c1fc` → 工具层报 **`No task found with ID: 60c1fc`**;该 id 在母会话(`7fcdbd36`,交接时有 13 个 `run_in_background` 在途)出现 **0 次**、本窗无 compaction = **纯臆造的工具句柄**。对照:同期**手动**开窗输入「继续」的窗(`83aa2bf8`)零伪造、干净接续。

**根因升级认知**:D9 把问题理解为「上窗假『已完成』声明遗传」——只对了一半。更深层是 **进程边界丢运行时状态**:一个「窗口」= 一个新 OS 进程,后台 `run_in_background` 的 task id / Agent 句柄 / BashOutput 流活在**旧进程内存**、活不过进程边界;而 D9 用 `.prompt` + 层层校验把上窗**叙事**精确传给下窗,新窗继承了「后台 build 在跑」的叙事却拿不到**真句柄** → 用续写先验**伪造**一个格式合理的句柄(`60c1fc`)。**D9 的验证 gate 只校验静态产物(commit/文件),覆盖不到「在途运行时句柄」这一维,且每补一层都在加大「新窗继承上窗叙事」的面 = 越补越脆。**

### 决策(涛哥 2026-06-29 拍板:大道至简,推翻 D9 加法路线)

1. **回归「模拟手动开窗」**:交接 = 等在途后台任务跑完 → 刷 progress.md → 开新窗读最新 `status=in_progress` 的 progress.md 按全局工作流继续。**真理源唯一 = progress.md**(SessionStart `core-progress-resume-inject` 自动注入),**新窗零状态继承**。
2. **删 D9 全套**:不再写 `.prompt` 接续提示词、不做 file:line 锚点 / ✅ 分区 promptcheck 校验。feeder 注入**固定 `FEED_TEXT`**(英文纯 ASCII 单行,经 send-keys;含「take the most recently updated in_progress one」绕 D7 多主线确认门)。
3. **防漂移 / 防杜撰新机理 = 零继承**:新窗**碰不到**上窗的后台 task id / Agent 死句柄 → `60c1fc` 类伪造**从机制上不可能**;不靠「层层校验」(那是 D9 越补越脆的根)。
4. **阈值**:软 `70`(不变,达到提示准备交接)/ 硬 `79→95`(超此才强制切换)。**在途后台任务绝不砍断**(收尾 gate「等 run_in_background 跑完才 `touch ready`」+ 新窗零继承双保险:即便上窗漏等,下窗也碰不到死句柄)。

### 实现 / Implementation(D10)

- `~/.claude/bin/context-handoff.js`:净删 ≈95 行(178 删 / 83 增)—— 删 initPrompt 兜底 + 读 `.prompt` + promptcheck 整块;`FEED_TEXT` 常量化;软 / 硬阈值收尾 reason 简化为「等后台→刷 progress→touch ready」;硬阈值默认 79→95。
- `~/.claude/bin/context-handoff-early-warn.js`:硬阈值 79→95;reason 同步删 `.prompt` 写作;软档加「近阈值不要再起新 `run_in_background` 后台任务」(M3,丢结果风险的真正控制点)。
- `~/.claude/hooks/core-progress-resume-inject.js`:D7 多主线确认门例外项描述对齐新 `FEED_TEXT`,自动交接窗不卡门(H1)——**闭合 D9 backlog #2**。
- `~/.claude/bin/context-handoff.test.js`:重写,22 断言(软 / 硬=95 block + ready 三态机放行【无 .prompt 也放行=零继承不卡死】+ FEED_TEXT 内容 + 旧 prompt/锚点逻辑已删静态断言),`node` 跑真实脚本 22 passed 0 failed。

落点:`claude-governance`(机器级,跨工作区)。

### CR + 取舍(涛哥「大道至简」标尺过滤 architect 四条)

双 CR:**code-reviewer APPROVE(0 HIGH)** / **architect APPROVE-WITH-FIXES**(独立读 diff + 跑单测核实)。architect 四条按「能交接即可、别再加门」标尺过滤:

| 条目 | 处置 | 依据 |
|---|---|---|
| **M1** spawn 前加「progress.md 不存在就别开窗」门 | **否决** | 又一道校验门 = 打补丁;最坏=新窗裸奔,属可接受「无碍」,不值一道门 |
| **H1** ≥2 主线确认门措辞未对齐 FEED_TEXT,夜间可能停下问 | **采纳** | 守「保证能交接」底线;非加门,是把**已有 D7 门**的一句话改准让它对自动窗让位,零新逻辑 |
| **M3** early-warn 软档提醒别再起新后台任务 | **采纳** | 纯一行文案,服务「不丢后台结果」,零逻辑 |
| **M2** 硬 95 离 autocompact 触发线仅 ~42k token | **保留 95** | 涛哥拍板值;真正给余量的是软 70,95 仅 backstop。留观察,若实测「autocompact 先于交接」再回拉 ~90 |

### 实证 vs 假设(诚实标注,ADR-015)

- **[实证]** 工具层异常铁证 = `a552ec88` 伪造 `60c1fc` → `No task found`(transcript 逐条 + `60c1fc` 母会话 grep 0 命中 + 本窗无 compaction);手动「继续」窗 `83aa2bf8` 0 伪造对照;母会话 13× `run_in_background:true`。三文件 `node --check` 过 / 单测 22 passed 0 failed / 双 CR APPROVE。
- **[假设 / 残留]** ① 「绝不砍后台任务」对进程内 `run_in_background` 句柄 Stop hook 无可见性,做不出硬门,仍是「收尾 reason 软约束 + 25 点 gap + 新窗零继承」三层软防(可接受,非过度工程天花板)② 硬 95 的 autocompact 薄垫(M2,留观察)③ ≥2 主线时 FEED_TEXT 绕门靠模型遵从用户级指令(H1 已对齐门描述降险,但非机械保证)—— 这三项涛哥明确接受(「仍存在开双窗 / 小毛病无碍,只要能正常交接」)。

### 推翻 D9 依据

D9 的「分区 + 锚点 / ✅ 校验」**不删反留会与本修订冲突**(继续诱导上窗写接续提示词 = 继续传叙事 = 继续制造伪造温床),故**整套移除**,非叠加。一句话:**防漂移的正解不是给「传状态」加更多校验,而是把「传的状态」砍到零**(新窗 = 干净会话,真理源只剩 progress.md)。D9 方向(靠验证 gate)在「运行时句柄伪造」维度被实证证伪,以本 D10 supersede。
