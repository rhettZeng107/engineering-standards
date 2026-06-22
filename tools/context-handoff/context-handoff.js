#!/usr/bin/env node
/**
 * context-handoff.js — Stop hook:context 到阈值时自动交接到新 Ghostty 会话
 *
 * 方案 B(涛哥 2026-06-13 拍板)+ 后台任务保护(涛哥同日补充):
 *   每轮答完触发 → 读 transcript 末条 usage 算占用 → ready-file 三态机:
 *     ① 首次超阈值:decision:block,提醒 Claude——
 *        · 若有后台任务(run_in_background 的 Bash/Agent/Workflow)仍在跑,
 *          【先等它跑完并把结果纳入,绝不强制中断】
 *        · 把状态写进 progress.md
 *        · 确认可安全交接后,touch 就绪标记文件,再停
 *     ② 有 pending 但无就绪标记 → Claude 还在等后台 → 放行不打扰(不开窗)
 *     ③ pending + 就绪标记都在 → 开新 Ghostty 跑 claude + 通知老窗可关(不 kill)→ 清标记
 *   新会话靠 SessionStart `core-progress-resume-inject` 自动读进度卡接续(ADR-031)。
 *
 * 阈值 = 状态栏归一化 used%(env 可覆盖):
 *   CONTEXT_HANDOFF_WINDOW        (默认 1000000，1M 窗;token 兜底估算用)
 *   CONTEXT_HANDOFF_USED_PCT      (软阈值,默认 75 —— 归一化 used% 超此触发①态温和提醒:等后台+我主动 touch ready)
 *   CONTEXT_HANDOFF_HARD_USED_PCT (硬上限,默认 80 —— 超此②态不再静默放行,每轮强制 block 逼交接,防无限推迟)
 *   CONTEXT_HANDOFF_OFF=1         临时关闭
 *
 * 防循环 + 不强制中断:pending 标记 + ready 就绪标记双文件,均在
 *   ~/.claude/.handoff/ 下按 session_id 命名;不依赖 stop_hook_active。
 * subagent 的 Stop(有 agent_id)直接放行。
 * 任何异常一律安全放行(exit 0),绝不阻断正常 Stop。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function bail() { process.exit(0); }

if (process.env.CONTEXT_HANDOFF_OFF === '1') bail();

const WINDOW = parseInt(process.env.CONTEXT_HANDOFF_WINDOW || '1000000', 10);

// 官方归一化 used% 阈值(涛哥 2026-06-14:软 70 准备 / 硬 75 强制;2026-06-16 软阈值下调 70→65;
// 2026-06-16 涛哥拍板软阈值回调 65→70;2026-06-18 涛哥再调 70→65:机制触发 65 / 强切换 75;
// 2026-06-18 涛哥再调 软 65→70 / 硬 75→79:机制触发 70 / 强切换 79;
// 2026-06-22 涛哥拍板上调 软 70→75 / 硬 79→80(交接机制稳定运行后放宽);口径对齐状态栏进度条)。
// 数据来自 statusLine wrapper handoff-ctx-statusline.js 写的 ctx-{sid}.json(官方 context_window
// 归一化),非 transcript token;缺失或陈旧(>60s)时回退 normalizedUsedFromTokens(transcript token 估算
// 套同款归一化公式近似对齐 bar 口径,不退到 raw 旧口径)。
const SOFT_USED_PCT = parseInt(process.env.CONTEXT_HANDOFF_USED_PCT || '75', 10);
const HARD_USED_PCT = parseInt(process.env.CONTEXT_HANDOFF_HARD_USED_PCT || '80', 10);
const CTX_STALE_SECONDS = 60;
const GHOSTTY = process.env.CONTEXT_HANDOFF_GHOSTTY || '/Applications/Ghostty.app/Contents/MacOS/ghostty';
const HANDOFF_DIR = path.join(os.homedir(), '.claude', '.handoff');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch (e) {
  bail();
}

// 只处理主会话 Stop;subagent 的 Stop 带 agent_id,跳过
if (input.agent_id) bail();

const { transcript_path: tp, session_id: sid, cwd } = input;
if (!tp || !sid) bail();

// 当前 context 占用 ≈ 末条 assistant 消息 usage 的 input + cache_creation + cache_read
function currentTokens(file) {
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  } catch (e) {
    return 0;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (e) {
      continue;
    }
    const u = (obj && obj.message && obj.message.usage) || (obj && obj.usage);
    if (u && (u.input_tokens != null || u.cache_read_input_tokens != null)) {
      return (
        (u.input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.cache_read_input_tokens || 0)
      );
    }
  }
  return 0;
}

// 官方归一化 used%(statusLine wrapper handoff-ctx-statusline.js 写,对齐状态栏进度条);
// stale > CTX_STALE_SECONDS 或缺失 → 返回 null → 回退 transcript token 旧口径。
function officialUsedPct(sessionId) {
  try {
    const p = path.join(HANDOFF_DIR, `ctx-${sessionId}.json`);
    if (!fs.existsSync(p)) return null;
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (m.used_pct == null || m.timestamp == null) return null;
    if (Math.floor(Date.now() / 1000) - m.timestamp > CTX_STALE_SECONDS) return null;
    return m.used_pct;
  } catch (e) {
    return null;
  }
}

// 兜底归一化:官方 ctx 文件缺失/陈旧时,用 transcript token 估算 raw 占用,再套状态栏同款
// autocompact buffer 归一化公式,得到与进度条同口径的 used%。token 取不到(0)→ 返回 null。
function normalizedUsedFromTokens(tok) {
  if (!tok || tok <= 0) return null;
  const acw = parseInt(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '0', 10);
  const bufferPct = acw > 0 ? Math.min(100, (acw / WINDOW) * 100) : 16.5;
  const rawUsed = Math.min(100, (tok / WINDOW) * 100);
  const remaining = 100 - rawUsed;
  const usableRemaining = Math.max(0, ((remaining - bufferPct) / (100 - bufferPct)) * 100);
  return Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
}

const tokens = currentTokens(tp);
// 触发口径【主 = statusline 归一化 used%】(只认状态栏那个百分比):
//   · used_pct = handoff-ctx-statusline.js 写的归一化值,= 状态栏进度条显示值(扣 16.5% autocompact buffer)。
//   · remaining_percentage = 官方原始剩余,仅存档,【不参与触发】。
//   · ctx json 缺失/陈旧(>60s,statusline 未渲染)→ 回退 transcript token 实时估算并套同款归一化公式
//     近似对齐 bar 口径(同公式,输入为 token 估算非官方 remaining,故近似),消除快速 turn / 长单工具调用
//     致 statusline 未刷新时的漏触发;连 token 都取不到才安全放行。
let usedPct = officialUsedPct(sid);
let useOfficial = true;
if (usedPct == null) {
  usedPct = normalizedUsedFromTokens(tokens);
  useOfficial = false;
}
if (usedPct == null) bail();
const triggered = usedPct >= SOFT_USED_PCT;
const hardTriggered = usedPct >= HARD_USED_PCT;
const marker = path.join(HANDOFF_DIR, `${sid}.pending`);
const ready = path.join(HANDOFF_DIR, `${sid}.ready`);
try {
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });
} catch (e) {
  bail();
}

// 改进2:清理孤儿标记(旧会话遗留的 pending/ready/prompt/promptcheck,mtime > 24h),防 .handoff 堆积。
// 只清非当前会话的;当前会话标记不碰。
try {
  const now = Date.now();
  for (const f of fs.readdirSync(HANDOFF_DIR)) {
    if (f.startsWith(sid)) continue;
    if (!/\.(pending|ready|prompt|promptcheck)$/.test(f)) continue;
    const fp = path.join(HANDOFF_DIR, f);
    try { if (now - fs.statSync(fp).mtimeMs > 24 * 3600 * 1000) fs.unlinkSync(fp); } catch (e) {}
  }
} catch (e) {}

// 未到 context 阈值:清掉残留标记(compact 后占用降回)后放行。
// ⚠️ 账户级 5h 配额"第二触发源"已取消(2026-06-14 涛哥拍板):
//   实证本 CC 版本(Opus 4.8)PostToolUse input 顶层无 rate_limits 字段
//   (dump 实证 top_keys 无该字段 / has_rl_top_field=false / rl_top_value=null),配额无法查询 → 移除该检查点。
//   context 满(本文件主触发源,读 transcript usage)独立工作,不受影响。
if (!triggered) {
  try { if (fs.existsSync(marker)) fs.unlinkSync(marker); } catch (e) {}
  try { if (fs.existsSync(ready)) fs.unlinkSync(ready); } catch (e) {}
  try { const pc = path.join(HANDOFF_DIR, `${sid}.promptcheck`); if (fs.existsSync(pc)) fs.unlinkSync(pc); } catch (e) {}
  bail();
}

// ① 首次超阈值:提醒 Claude 安全收尾(等后台→刷进度→落就绪标记)后停
if (!fs.existsSync(marker)) {
  try { fs.writeFileSync(marker, String(tokens)); } catch (e) { bail(); }
  const ctxShow = useOfficial
    ? `${usedPct}%(官方,软阈值 ${SOFT_USED_PCT}%)`
    : `${usedPct}%(token 兜底估算 ≈${Math.round(tokens / 1000)}k,软阈值 ${SOFT_USED_PCT}%)`;
  const reason =
    `[context-handoff] 当前 context 占用 ${ctxShow},已达软交接阈值。` +
    `请按序安全收尾,不要强制中断任何在途工作:` +
    `① 若有后台任务(run_in_background 的 Bash / Agent / Workflow)仍在执行,先等它跑完并把结果纳入,绝不中途砍断;` +
    `② 把当前 task 最新状态写进本工作区 progress.md(或 .continue-here.md):status / 当前 phase / 已完成 / 下一步具体动作;` +
    `③ 不要开新工作;` +
    `④ 把精确接续提示词写到 \`${path.join(HANDOFF_DIR, sid + '.prompt')}\`(新窗会以它作首条消息精确接续,比裸'继续'准 —— 写明:接哪条主线 + 进度真理源 progress.md 路径 + 下一步第一动作 + 【至少一个 file:line 锚点】(下一步要改/看的文件:行,如 src/Foo.cs:42,让新窗零思考定位;纯无代码改动则在提示词里写明"无代码改动"豁免本要求);中英文皆可,以指令清晰为准);` +
    `⑤ 确认以上全部完成、可安全交接后,执行 \`touch '${ready}'\` 落就绪标记,然后停。` +
    `我会在检测到就绪标记后自动开新 Ghostty 窗接续;未落就绪标记前我不会打扰你,你可继续等后台任务。`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

// ② 有 pending 但无就绪标记:Claude 还在收尾/等后台
if (!fs.existsSync(ready)) {
  // 改进3 硬上限:软阈值后持续未交接、占用达硬上限 → 不再静默放行,每轮强制 block 逼交接(防无限推迟)。
  if (hardTriggered) {
    const ctxShow = useOfficial
      ? `${usedPct}%(官方,硬阈值 ${HARD_USED_PCT}%)`
      : `${usedPct}%(token 兜底估算 ≈${Math.round(tokens / 1000)}k,硬阈值 ${HARD_USED_PCT}%)`;
    const reason =
      `[context-handoff] ⚠️ 已达硬上限(${ctxShow}):超软阈值后持续未交接,必须立即收尾,不再静默放行。` +
      `① 在途后台任务(run_in_background 的 Bash/Agent/Workflow)若仍在跑,等它跑完纳入结果(绝不砍断);` +
      `② 当前进度写进本工作区 progress.md(status/phase/已完成/下一步具体动作,next_action 带 file:line);` +
      `③ 接续提示词写到 \`${path.join(HANDOFF_DIR, sid + '.prompt')}\`(接哪条主线 + progress 路径 + 下一步第一动作 + 至少一个 file:line 锚点,如 src/Foo.cs:42;纯无代码改动写明"无代码改动"豁免);` +
      `④ 确认可安全交接后执行 \`touch '${ready}'\` 落就绪标记再停 → 我自动开新 Ghostty 窗接续。` +
      `(硬上限:每轮 Stop 都会提醒直到你落就绪标记,不再放行。)`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    process.exit(0);
  }
  bail(); // 软阈值~硬阈值区间:放行不打扰,等我收尾
}

// ③ pending + ready 都在:开新 Ghostty 跑 claude + 通知老窗可关,不 kill
function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
const targetDir = cwd || process.cwd();
// 接续提示词:优先用当前会话收尾时留的精确提示词(.handoff/{sid}.prompt);
// 兜底改用明确的英文自治指令(原弱兜底「继续」会触发 SessionStart 多主线候选确认门,
// 夜间 feeder 不喂等拍板的 idle → 卡死一夜)。明确「读进度→接最新主线→直接开干→不等确认」绕过该门。
let initPrompt =
  'Auto-continue in night autonomous mode. Read this workspace progress.md (or .continue-here.md), ' +
  'resume the most recent in_progress mainline, and execute the next concrete step directly. ' +
  'Do not pause to ask which mainline to pick -- pick the most recently updated in_progress one.';
const pf = path.join(HANDOFF_DIR, `${sid}.prompt`);
let promptFromFile = false;
let pContent = '';
try {
  if (fs.existsSync(pf)) {
    pContent = fs.readFileSync(pf, 'utf8').trim();
    if (pContent) { initPrompt = pContent; promptFromFile = true; }
  }
} catch (e) {}

// 点3(2026-06-14,借鉴 handoff-revive validate-handoff.sh:75 的 next_action 硬校验):
// 收尾写了精确接续提示词、但缺 file:line 锚点 → 退回补一次(最多一次,防死循环),让新窗"零思考"定位。
// 纯无代码任务可在提示词里写"无代码改动"豁免。没写 .prompt(走英文兜底)不触发回修(兜底是合法降级)。
const promptcheck = path.join(HANDOFF_DIR, `${sid}.promptcheck`);
const hasAnchor = /[^\s:]+:[0-9]+/.test(pContent);
const docExempt = /无代码改动|no[\s-]?code[\s-]?change|docs?[\s-]?only/i.test(pContent);
if (promptFromFile && !hasAnchor && !docExempt && !fs.existsSync(promptcheck)) {
  try { fs.writeFileSync(promptcheck, '1'); } catch (e) {}
  try { if (fs.existsSync(ready)) fs.unlinkSync(ready); } catch (e) {}
  const reason = `[context-handoff] 接续提示词缺 file:line 锚点(如 src/Foo.cs:42)。`
    + `精确接续要让新窗零思考定位下一步 → 请在 \`${pf}\` 补至少一个 file:line 锚点(下一步要改/看的文件:行),`
    + `补好后重新 \`touch '${ready}'\`。若本次纯无代码改动,在提示词里写明"无代码改动"再 touch 即可跳过本校验。`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
// 校验通过 / 豁免 / 已补过一次:清 promptcheck。
//   ⚠️ prompt 文件(pf)【不删】:方案A 下新 claude 靠 send-keys 注入的指令去读它(读完自删);
//   万一新 claude 没删,context-handoff 开头的孤儿清理(>24h)兜底,不会堆积。
try { if (fs.existsSync(promptcheck)) fs.unlinkSync(promptcheck); } catch (e) {}
try {
  // 用 cw(claude-tmux.sh)起夜间自治会话:tmux 保活 + caffeinate 防深睡 + feeder 看门 + 免权限弹窗。
  // 1) cw 是 .zshrc 交互式 alias,非交互 zsh -lc 读不到 → 必须调实体脚本全路径。
  // 2) 显式带 --dangerously-skip-permissions:cw 默认值仅「无参」时生效,这里有 prompt 参数会顶掉默认,必须显式补。
  // 3) 精确 initPrompt 透传:让新窗跳过 SessionStart「多主线候选」确认门直接接续
  //    (夜间无人,feeder 对「等拍板」的 idle 故意不喂,不传精确 prompt 会卡死一夜)。
  const cw = path.join(os.homedir(), '.claude', 'bin', 'claude-tmux.sh');
  // 交接必须起【全新会话】(context 清零):cw 默认会话名按工作区固定(claude-<目录名>),老窗就是该会话
  //   → cw 默认分支的 `has-session → attach`(claude-tmux.sh:51)会让"新窗"attach 老会话 → context 全继承。
  // 故用 `cw new`(claude-tmux.sh:16-18:唯一会话名 claude-<目录名>-<时间戳>)强制走新建分支
  //   → 全新 claude+prompt,context 从 progress 接续重置;同工作区也可并行多个独立会话(涛哥 2026-06-18 拍板)。
  //
  // 裸窗根治(2026-06-18 重诊 + 实测,替代旧的危险进程杀手):
  //   真凶 = Ghostty【窗口状态恢复】:open -na 起新实例时把上次保存的窗整套恢复进新实例
  //   (实测:新实例恢复出 3 个纯 shell 窗 + 1 个 -e 命令窗 = 多裸窗,非单一空白窗)。
  //   旧档误判为 initial-window,试 `--initial-window=false` → 连 -e 命令窗一起灭(实测 0 窗,印证),
  //   遂改走 handoff-close-blank.js 进程杀手 —— 但本机 Ghostty 是【单进程多窗】,process.kill 任一 ghostty pid
  //   = 连锅端该进程下所有窗(涛哥正常开的无 -e 主实例被误判成裸窗 → 全灭),故杀手已删除。
  //   正确旋钮 = `--window-save-state=never`:新实例不恢复旧窗,实测【恰好 1 个命令窗、零裸窗】→ 无需任何杀手。
  const ghosttyApp = GHOSTTY.includes('.app/') ? GHOSTTY.slice(0, GHOSTTY.indexOf('.app/') + 4) : 'Ghostty';
  // 接续会话打标记(2026-06-18 涛哥):接续窗已是【独立单窗进程】(--window-save-state=never)→ 可【正向识别】,
  //   不再靠旧 killer"无 -e 就当裸窗"的反向猜测(那正是误杀主进程的命门)。
  //   ① 环境变量 CLAUDE_HANDOFF_*:`ps eww` 可查 → 供未来"按标记安全整进程清理"正向定位(整进程=该接续单窗,绝不误伤涛哥多窗主进程)。
  //   ② Ghostty --title:涛哥肉眼区分自动接续窗 vs 自己手开/cw 的窗。
  const wsName = path.basename(targetDir);
  // 方案A(2026-06-22 涛哥拍板 + 裸测实证):交互式 TUI 在【窗口不可见/最小化/熄屏】时【不提交 argv prompt】
  //   (官方确认 = PTY/首屏渲染依赖,issue #60987;旧 osascript activate 熄屏无效 = 屏不亮无渲染)。
  //   改为:cw new【裸起 claude(不带 prompt)】+ handoff-feed-prompt.sh 在 TUI ready 后 `tmux send-keys`
  //   注入接续指令 —— send-keys 走 PTY 输入层,不依赖窗口可见(裸测:detached 全程不 attach 仍正常执行返回)。
  //   预指定唯一 session 名(CLAUDE_TMUX_SESSION,cw new 优先用它;点/冒号脱成 _),注入器按同名定位 send-keys。
  const wsSafe = wsName.replace(/[.:]/g, '_');
  const feedSession = `claude-${wsSafe}-h${Date.now()}`;
  const handoffEnv =
    `export CLAUDE_HANDOFF_CONTINUATION=1 ` +
    `CLAUDE_HANDOFF_WS=${shq(wsName)} ` +
    `CLAUDE_HANDOFF_FROM_SID=${shq(sid)} ` +
    `CLAUDE_TMUX_SESSION=${shq(feedSession)}; `;
  spawn(
    'open',
    ['-na', ghosttyApp, '--args', '--window-save-state=never', `--title=↻ Claude接续 · ${wsName}`, '-e', 'zsh', '-lc',
      `${handoffEnv}cd ${shq(targetDir)} && exec ${shq(cw)} new --dangerously-skip-permissions`],
    { detached: true, stdio: 'ignore' }
  ).unref();
  // 接续指令注入(纯 ASCII 单行,规避 send-keys 中文/换行坑):
  //   prompt 在文件 → 注入"读文件+执行+删除"短指令(新 claude 读 pf 拿完整接续指令);
  //   无文件(英文兜底)→ 直接注入兜底英文串(已脱 em-dash 为 ASCII)。
  const feedText = promptFromFile
    ? `Read the continuation prompt saved in the file ${pf} and follow its instructions exactly, then delete that file.`
    : initPrompt;
  try {
    const feeder = path.join(os.homedir(), '.claude', 'bin', 'handoff-feed-prompt.sh');
    spawn(feeder, [feedSession, feedText], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {}
} catch (e) {}
try {
  spawn(
    'osascript',
    [
      '-e',
      'display notification "已在新 Ghostty 窗接续会话(读 progress.md 自动继续)。本窗 context 已满,可关闭。" with title "Claude context 交接" sound name "Glass"',
    ],
    { detached: true, stdio: 'ignore' }
  ).unref();
} catch (e) {}
try { fs.unlinkSync(marker); } catch (e) {}
try { fs.unlinkSync(ready); } catch (e) {}
process.exit(0);
