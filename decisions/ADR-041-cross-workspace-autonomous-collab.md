# ADR-041 — 跨工作区自治协作(文件载任务 + tmux 短触发注入 + 注入前判态)

- **状态 / Status**:Accepted
- **日期 / Date**:2026-06-18
- **决策人**:涛哥(PM)
- **影响范围**:跨项目工程标准 — 多工作区夜间 cw 模式(SYSV2 / TPMV2 / SRMV2 / MES / WMS / EAM 等)
- **参见**:ADR-031 工作流自动恢复(同工作区接续) / ADR-029 工作区治理 / `~/.claude/bin/claude-feeder.sh`

---

## 背景 / Context

多工作区同时启用夜间模式(cw:tmux + caffeinate + feeder)后,各工作区的 claude 会话之间存在**真实的跨工作区依赖**:典型如 SYSV2 改了对外契约,需要 TPMV2 / SRMV2 子应用跟进调整。

实证现状(2026-06-18):

- **无任何自动跨工作区机制**。此前 SYSV2↔TPMV2 的协同靠涛哥**手动转发**文档(在两个会话间复制粘贴),夜间无人值守时断链。
- `~/.claude/.handoff/{sid}.prompt`(context-handoff 接续提示词)是 **per-session**,不跨工作区。
- 每个工作区夜间会话跑在独立 tmux 会话(命名 `claude-<工作区>` 或 handoff 后 `claude-<工作区>-<时间戳>`),feeder 已用 `tmux send-keys` 往会话喂键(`claude-feeder.sh:73/75/93`)。

**[实证]** tmux 跨会话注入可行:`tmux send-keys -t <目标会话> "<中文提示词>" Enter` → `capture-pane` 验证目标会话**完整收到、中文不乱码**,双向对称(2026-06-18 本会话用测试会话验,不碰真实会话)。

**批判前提(决定形态的关键)**:全自动「一个 claude 直接驱动另一个 claude」是高风险的——A 误判 → 盲注错任务到 B → B 自治执行 → 双向污染放大。feeder 的「假运行黑洞」教训(ADR-031 D8:运行态盲喂出问题)同源:**盲注时机不对会污染目标会话**。ADR-031 D7 已为「同工作区多主线」设防串场确认门,跨工作区是更强的串场。故形态不能是「盲发长提示词」,必须收敛为「结构化投递 + 受控注入」。

## 决策 / Decision

### D1. 形态 = 文件载任务 + tmux 短触发注入 + 注入前判态

跨工作区协作**不直接 send-keys 长提示词**。投递分两段:

1. **任务内容写文件**(inbox 任务卡,留痕可审计):`~/.claude/.cross-ws/<目标工作区>/inbox/<时间戳>-from-<来源工作区>.md`,YAML frontmatter(`from/to/created/thread-id/kind/status`)+ 任务正文(任务描述 + 进度真理源 + `file:line` 锚点 + 回执方式)。**inbox 生命周期(architect M2)**:`status` 状态机 `pending→consumed→archived` + `thread-id` 幂等去重;消费后 mv `inbox/_archive/`(对齐 spec 完结 archive 惯例)——状态机本期定义,流转由 resume-inject inbox 扩展(P2)实现。
2. **tmux 只发一句短触发**唤醒目标会话去读文件:`[跨工作区协作 from X] 读 <任务卡路径> 接此协作任务:先 Read 全文按它执行;完成后回执 ...`。

收益:实时(秒级唤醒)+ 不乱码/不半渲染(只注短指令)+ 可审计(文件留痕)+ 可加确认门。

### D2. 投递器 `~/.claude/bin/cross-ws-send.sh`

唯一投递入口,封装寻址 / 判态 / 写文件 / 短触发 / 回执:

```
cross-ws-send.sh --to <目标工作区> --task-file <md> [--from <来源>]
cross-ws-send.sh --to <目标工作区> --msg "<短任务>"  [--from <来源>]
  --force(跳过判态强注,谨慎) / --dry-run(只写文件不注入)
```

- **寻址**:`tmux ls | grep '^claude-<目标工作区>'` 取最新活跃会话(handoff 后带时间戳,动态取不写死)。
- **回执对称**:短触发内嵌回执命令,B 完成后 `cross-ws-send.sh --to <A> --msg '回执:...'` 投回 A,闭环。

### D3. 显式依赖图(协作关系由人定,不靠 agent 自由判断)

**禁止 agent 凭感觉判断「该不该通知别的工作区」**。跨工作区投递只在**预定义事件**触发:契约锁(contract-lock)变更 / 对外 DTO·路由变更 / 影响下游的 ADR 落地。各工作区在自己的 `CLAUDE.md` 显式声明**下游依赖**(谁消费我的契约 → 改契约时投递通知谁),投递动作引用这张依赖图,不自由发挥。

**投递扩散收敛(architect H2)**:

- **只发直接下游一跳**,不沿依赖图传递 —— B 收到后若需通知 C,那是 B 自己契约变更时的独立投递事件(由 B 的依赖图驱动),不由 A 代发。一跳止血是最简失控收敛。
- **环标记**:依赖图声明检测到双向依赖(A↔B 互为下游)→ 标 `cycle-with`,该方向投递降级 **inbox-only 不短触发**(打破实时注入环),留人工裁。
- **节流去重**:同 `thread-id` + 同 (from,to) 在 N 分钟内已投 → 不重复短触发(防同一契约多次保存触发多次投递)。
- **依赖图落地前(P2)**:投递触发严格限定「涛哥手动调 `cross-ws-send.sh`」或「明确的 contract-lock 文件变更」,**禁 agent 在依赖图缺位时自决投递对象**。

### D4. 消费侧约定(防串场)

- **即时消费**:短触发是**明确指令**(「读 X 接跨工作区任务」含具体路径 + 「直接执行」),目标会话当场按指令执行——**不撞 ADR-031 D7 的多主线确认门**(那门只拦模糊的「继续」)。
- **离线消费(后续接进夜间机制)**:目标工作区当时无活跃会话 → 任务卡留在 inbox;其下次 SessionStart 由 `core-progress-resume-inject` 的 **inbox 扩展**(本 ADR 规划,分期实现)列为「跨工作区协作候选」,带确认门 + 涛哥可见。

### D5. 安全边界(保守优先,失控不可逆)

| 边界 | 规则 |
|---|---|
| **判态【白名单式】** | 只在目标**纯静默 idle** 才注入;运行态(`esc to interrupt`)/ 报错态 / **认证态(403/login)** / 等拍板菜单(行首 `❯`)任一 → **不注入**,入 inbox + 通知(本期已实现,正则同源 `claude-feeder.sh` RUN/ERR/AUTH/菜单);**目标有 `in_progress` 主线时不抢占** → P2(脚本扫目标工作区 progress.md)。漏判方向 = 不注入(安全方向)。 |
| **离线不自动起会话** | 目标无活跃 cw 会话 → 只写 inbox + 通知,**不自动 `cw new` 起会话**(夜间无人放大失控) |
| **回执不抢占** | 回执 `kind=receipt` → **inbox-only 不短触发**(回执是通知非任务,无实时性要求,防 A↔B 乒乓震荡);A 仍可追溯 B 是否完成 |
| **审计留痕** | 投递落 inbox 卡(frontmatter:from/to/created/thread-id/kind/status[/forced]);`--force` 跳判态须标 `forced:true` + 通知人工 |

## 影响 / Consequences

**正面**:

- SYSV2↔TPMV2 等跨工作区协同从「涛哥手动转发」自动化为「契约事件驱动投递」,夜间无人值守也不断链。
- 复用现有基建(tmux 会话 / feeder send-keys / progress 体系 / 治理三层),新增面小(一个 helper + 一个 inbox 目录 + 后续 resume-inject 扩展)。
- **本期生效两重收敛** = 文件载任务 + **白名单判态**;依赖图扩散收敛(D3)+ 离线确认门(D4)为 **P2**(诚实标注,architect M3)——依赖图落地前投递触发限手动/contract-lock 事件,禁 agent 自决。

**代价 / 风险**:

1. **判态启发式非 100%**:`esc to interrupt` / 菜单正则同 feeder 局限,极端屏态可能误判;缓解:误判方向是「不注入」(漏投退回人工,不盲注污染)。
2. **依赖图需人工维护**:各工作区 CLAUDE.md 下游依赖声明若不更新 → 漏通知;缓解:契约锁变更时同步更新依赖图(纳入 8 项核对延伸)。
3. **离线消费暂未落地**:本期只做即时投递(D1/D2/D5),离线 inbox 消费(D4)分期;期间目标离线只通知不自动消费。
4. **跨工作区注入仍是「驱动另一个 agent」**:即便有判态 + 短触发,目标 claude 仍会按注入指令自治执行;缓解:任务卡必须带进度真理源 + file:line 锚点(零思考定位),且回执闭环可追溯。

## 关系 / Relationship

- **协同 ADR-031**:ADR-031 是「同工作区断点接续」,本 ADR 是「跨工作区任务投递」;两者都建在 tmux/feeder/progress 之上,互补不重叠。
- **协同 ADR-029 工作区治理**:跨工作区协作章节纳入 `workspace-bootstrap` skill §6.3,新工作区 bootstrap 即继承。
- **复用 feeder(ADR-031 D6/D8)**:判态正则(运行态/菜单)与 feeder 同源,送键能力同 `tmux send-keys`。

## 实施 / Implementation

1. **`~/.claude/bin/cross-ws-send.sh`**(本 ADR 落地,投递器:寻址/判态/写文件/短触发/回执/离线兜底/dry-run)。
2. **`~/.claude/skills/workspace-bootstrap/SKILL.md` §6.3「跨工作区自治协作」**(治理真理源 skill,非已冻结的 workspace-bootstrap-guide.md):依赖图声明 + 投递用法 + inbox 结构 + 消费约定。
3. **各工作区 CLAUDE.md** 加「下游依赖图」段(显式声明改契约时通知谁)。
4. **(分期)`core-progress-resume-inject.js` inbox 扩展**:SessionStart 扫 `~/.claude/.cross-ws/<本工作区>/inbox/` 列协作候选 + 确认门——离线消费落地时实现。

## 参考 / References

- **[实证]** tmux 跨会话中文注入 / 双向对称 / capture-pane 到达验证(2026-06-18 本会话)
- **[实证]** feeder 已用 `tmux send-keys`(`~/.claude/bin/claude-feeder.sh:73/75/93`)
- **[假设]** 判态正则覆盖真实 claude 输入态 —— 同 feeder 局限,启发式;漏判方向为「不注入」(安全方向)
- ADR-031(工作流自动恢复 / feeder)/ ADR-029(工作区治理)

---

## CR 复核与加固(2026-06-18)

落盘后过 `code-reviewer`(脚本)+ `architect`(本 ADR)双审,吸收如下:

**已吸收(脚本 + ADR 同步加固,本期实现)**:

- **认证态盲注(architect C1,CRITICAL)**:判态翻为**白名单式**(只打纯静默 idle),补认证态(403/login)+ 报错态;`cross-ws-send.sh` 判态正则与 `claude-feeder.sh` 同源(RUN/ERR/AUTH)。
- **`--to` 注入(code-reviewer HIGH×2)**:`--to`/`--from` 白名单校验(`[A-Za-z0-9._-]`)+ tmux **字面匹配**寻址(非正则)→ 同时堵正则误命中 + 路径穿越。
- **回执乒乓(architect H1)**:任务卡加 `kind: task|receipt`,回执 inbox-only 不短触发。
- **菜单误判 / 抢占(architect H3)**:菜单正则收紧为行首 `❯`(不用 `>`);忙碌态一律转 inbox-only。
- **裸窗清理误杀(code-reviewer MED,`handoff-close-blank.js`)**:杀第一个裸窗即收手(裸窗 bug 形态=恰好一个),防误杀用户手开窗。
- **set -u 多字节 bug**:中文串内变量插值 `${}` 界定(macOS bash 3.2 把中文括号紧贴 `$BUSY` 当变量名 → unbound;实证修复 + C2 回归测试)。

**约定层吸收(P2 实现,本 ADR 记约束)**:扩散收敛(H2,见 D3 一跳/环标记/节流)+ inbox 生命周期(M2,见 D1 状态机)。

**未采纳**:

- **architect M1(称 `~/.claude/skills/workspace-bootstrap/SKILL.md` 不存在、guide 才是真理源)**:经复核为**假阳性** —— 本会话实际 Read + Edit 成功该 SKILL.md(系统回显其 description 更新),且 `workspace-bootstrap-guide.md:3` 明写「已降级归档(2026-05-18),冻结只读,真理源转为 skill」。SKILL.md 确为现行真理源,引用不改(architect 的 Glob 未覆盖 `~/.claude/skills/`,非文件不存在)。
