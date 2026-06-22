#!/usr/bin/env node
/**
 * context-handoff-early-warn.js — PostToolUse hook:轮内(turn 未结束)中途预警。
 *
 * 背景:实际交接挂在 Stop hook(context-handoff.js),只在 turn 答完那刻采样 → 进度条半路冲过软阈值后,
 *   要等整个 turn 结束才提醒("回合制采样"滞后)。本 hook 在【每次工具调用后】中途采样,used% 一过软阈值
 *   就用 additionalContext 把"开始准备交接"提醒直接注入本体上下文(本刻不强制交接,强制开窗仍由 Stop hook
 *   在 ready 后做)。把"回合制"滞后从"等整个 turn"压缩到"下一个工具调用"。
 *
 * 口径(与 context-handoff.js / 状态栏进度条严格一致,避免 gsd-context-monitor 当年 raw 口径低 10-15 点的坑):
 *   主 = .handoff/ctx-{sid}.json 的归一化 used%(statusline 写);陈旧>60s/缺失 → 回退 transcript token 实时
 *   估算并套同款归一化公式。阈值 SOFT_USED_PCT=75 / HARD_USED_PCT=80(同 context-handoff.js,env 可覆盖)。
 *   ⚠️ helper 与 context-handoff.js 同源,改归一化公式/阈值须两处同步。
 *
 * 去抖:首次越线立即发 → 之后每 DEBOUNCE_CALLS(5)个工具调用再发 → 软→硬升级绕过去抖立即发。
 * 铁律:全程 silent-fail / stdin 10s 超时兜底 / subagent 跳过 / 绝不阻断工具执行。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.env.CONTEXT_HANDOFF_OFF === '1') process.exit(0);

const WINDOW = parseInt(process.env.CONTEXT_HANDOFF_WINDOW || '1000000', 10);
const SOFT_USED_PCT = parseInt(process.env.CONTEXT_HANDOFF_USED_PCT || '75', 10);
const HARD_USED_PCT = parseInt(process.env.CONTEXT_HANDOFF_HARD_USED_PCT || '80', 10);
const CTX_STALE_SECONDS = 60;
const DEBOUNCE_CALLS = parseInt(process.env.CONTEXT_HANDOFF_EARLY_DEBOUNCE || '5', 10);
const HANDOFF_DIR = path.join(os.homedir(), '.claude', '.handoff');

// 末条 assistant usage 的 input + cache_creation + cache_read ≈ 当前 context 占用。
// PostToolUse 高频 → 只读 transcript 尾部 256KB 定位最后一条 usage(全文读太慢),结果与读全文一致。
function currentTokensTail(file) {
  try {
    const stat = fs.statSync(file);
    const MAX = 256 * 1024;
    const start = Math.max(0, stat.size - MAX);
    const fd = fs.openSync(file, 'r');
    let content;
    try {
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      content = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
    const lines = content.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try {
        obj = JSON.parse(lines[i]);
      } catch (e) {
        continue;
      }
      const u = (obj && obj.message && obj.message.usage) || (obj && obj.usage);
      if (u && (u.input_tokens != null || u.cache_read_input_tokens != null)) {
        return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      }
    }
  } catch (e) {}
  return 0;
}

// 官方归一化 used%(statusline 写);缺失/陈旧>60s → null。
function officialUsedPct(sid) {
  try {
    const p = path.join(HANDOFF_DIR, `ctx-${sid}.json`);
    if (!fs.existsSync(p)) return null;
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (m.used_pct == null || m.timestamp == null) return null;
    if (Math.floor(Date.now() / 1000) - m.timestamp > CTX_STALE_SECONDS) return null;
    return m.used_pct;
  } catch (e) {
    return null;
  }
}

// 兜底:token 估算 raw 占用 → 套状态栏同款 autocompact buffer 归一化公式,得与进度条近似同口径的
// used%(同公式,输入为 token 估算非官方 remaining,故近似)。
function normalizedUsedFromTokens(tok) {
  if (!tok || tok <= 0) return null;
  const acw = parseInt(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '0', 10);
  const bufferPct = acw > 0 ? Math.min(100, (acw / WINDOW) * 100) : 16.5;
  const rawUsed = Math.min(100, (tok / WINDOW) * 100);
  const remaining = 100 - rawUsed;
  const usableRemaining = Math.max(0, ((remaining - bufferPct) / (100 - bufferPct)) * 100);
  return Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input || '{}');
    const sid = data.session_id;
    // subagent 的 PostToolUse 带 agent_id,跳过;无 sid / session_id 防路径穿越
    if (data.agent_id || !sid || /[/\\]|\.\./.test(sid)) process.exit(0);
    const tp = data.transcript_path;

    // 口径:优先官方归一化(便宜);陈旧/缺失才回退 token 实时估算(同 Q2:A)
    let usedPct = officialUsedPct(sid);
    if (usedPct == null && tp) usedPct = normalizedUsedFromTokens(currentTokensTail(tp));
    if (usedPct == null) process.exit(0);

    const statePath = path.join(HANDOFF_DIR, `${sid}.earlywarn`);

    // 未越软阈值(含 compact/交接后占用降回):清去抖状态后静默退出
    if (usedPct < SOFT_USED_PCT) {
      try { if (fs.existsSync(statePath)) fs.unlinkSync(statePath); } catch (e) {}
      process.exit(0);
    }

    const level = usedPct >= HARD_USED_PCT ? 'hard' : 'soft';

    // 去抖:首次立即发 → 之后每 DEBOUNCE_CALLS 个工具调用再发 → 软→硬升级绕过去抖立即发
    let st = { calls: 0, lastLevel: null };
    let firstWarn = true;
    try {
      if (fs.existsSync(statePath)) { st = JSON.parse(fs.readFileSync(statePath, 'utf8')); firstWarn = false; }
    } catch (e) {}
    st.calls = (st.calls || 0) + 1;
    const escalated = level === 'hard' && st.lastLevel === 'soft';
    try { fs.mkdirSync(HANDOFF_DIR, { recursive: true }); } catch (e) {}
    if (!firstWarn && st.calls < DEBOUNCE_CALLS && !escalated) {
      try { fs.writeFileSync(statePath, JSON.stringify(st)); } catch (e) {}
      process.exit(0);
    }
    st.calls = 0;
    st.lastLevel = level;
    try { fs.writeFileSync(statePath, JSON.stringify(st)); } catch (e) {}

    const message = level === 'hard'
      ? `[context-early-warn] ⚠️ 当前 context 已达 ${usedPct}%(硬上限 ${HARD_USED_PCT}%)。请立即收尾并完成交接准备,不要再开新工作:` +
        `① 在途后台任务(run_in_background 的 Bash/Agent/Workflow)等它跑完纳入结果(绝不砍断);` +
        `② 当前进度写进本工作区 progress.md(status/phase/已完成/下一步具体动作,next_action 带 file:line);` +
        `③ 把精确接续提示词写到 .handoff/${sid}.prompt(接哪条主线 + progress 路径 + 下一步第一动作 + 至少一个 file:line 锚点);` +
        `④ 确认可安全交接后 touch .handoff/${sid}.ready(由 Stop hook 实际开新窗接续)。`
      : `[context-early-warn] 当前 context 已达 ${usedPct}%(软交接阈值 ${SOFT_USED_PCT}%)。请开始为交接做准备(本刻不强制交接,可继续把在途后台任务跑完):` +
        `① 收尾手头工作,不要再开新的大任务;` +
        `② 把当前进度写进本工作区 progress.md(status/phase/已完成/下一步具体动作,next_action 带 file:line);` +
        `③ 准备好精确接续提示词(.handoff/${sid}.prompt:接哪条主线 + progress 路径 + 下一步第一动作 + 至少一个 file:line 锚点);` +
        `④ 等后台任务跑完、确认可安全交接后再 touch .handoff/${sid}.ready(Stop hook 会据此开新窗)。`;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
    }));
  } catch (e) {
    process.exit(0);
  }
});
