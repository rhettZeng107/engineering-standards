export const meta = {
  name: 'baseline-adversarial',
  description:
    '迁移基准建立 adversarial verification 门 — 每判定 N 个独立 skeptic 多视角 refute + 多数票,查"误判"(correctness)。ADR-014 修订 2026-06-18 / ADR-044 G5,跨项目通用',
  phases: [
    { title: 'Refute', detail: '每条基准判定派多视角独立 verifier 尽力推翻 + 多数票裁决' },
  ],
}

// ============================================================================
// 迁移「基准建立」adversarial verification 门 —— 与 migration-audit 正交互补:
//   · migration-audit  = 查「漏」(completeness):哪些维度/模块没枚举(multi-modal sweep + loop-until-dry)
//   · baseline-adversarial(本工具) = 查「误判」(correctness):枚举到了但判错
//     —— 单视角审查必漏的两类高代价坑:
//       坑 2  半成品被当完好迁(源本就未完成)
//       坑 10 历史退化产物被当设计意图(MDM 期初导入 5 类 MES → 退化成 1 卡,涛哥两次纠正)
//   这两类「看了但判错」靠 completeness 抓不到 —— 需多个独立 skeptic 各被 prompt 去 refute、多数票才抓。
//
// 模式(官方 dynamic-workflows / building-effective-agents):adversarial verification +
//   perspective-diverse(每 voter 不同 lens,避免冗余)+ 多数票。固定一轮 fan-out-and-vote(非 loop)。
//
// 定位:只读判定门,不改码、不拍板。disputed(多数 refute)= 基准不得锁定,交主会话/涛哥复核;
//   契约锁定仍由主会话本体做(ADR-037)。confirmed 才可锁为契约基准。
//
// 触发时机(ADR-014 修订 2026-06-18):迁移启动产源工件清单/UI 功能清单/退化判定【后、锁基准前】跑主门;
//   STEP1 验收只按已确认 checklist 赴约打钩(不重复 adversarial)。
//
// 用法:Workflow({ scriptPath: <本文件>, args: {...} })
//
// args = {
//   artifacts,    // 待裁决判定清单(必填),每项:
//                 //   { id, kind:'status'|'degradation'|'completeness', subject, claim, evidence }
//                 //     status       = 源工件状态判定(完好/半成品/坏)
//                 //     degradation  = 退化产物判定(设计意图 vs 历史退化)
//                 //     completeness = UI 功能清单完整性判定(每列/按钮/弹窗/必填/交互齐全)
//   frontendDir, backendDir, legacyRepo,  // verifier 取反证用(grep/read/git)
//   maxArtifacts, // 防跑飞上限(默认 60)
// }
// ============================================================================

const cfg = args || {}
const FE = cfg.frontendDir || '(未指定前端仓 frontendDir)'
const BE = cfg.backendDir || '(未指定后端仓 backendDir)'
const LEGACY = cfg.legacyRepo || '(未指定老仓 legacyRepo — 退化判定取反证需要)'
const MAX = cfg.maxArtifacts || 60
const ARTIFACTS = Array.isArray(cfg.artifacts) ? cfg.artifacts.slice(0, MAX) : []

const EVIDENCE_RULE =
  '【证据纪律】反证必带实证来源(file:line / grep -c 数字 / git ref / SQL 结果 其一);' +
  '无确凿反证的推断标 [假设];只读取证,禁改任何文件。'

// perspective-diverse:每 kind 三个互补 lens(各一票),多数 = 2/3
const LENSES = {
  status: [
    { key: 'source-completeness', instr: '从「源工件本身是否完整」找反证:被判【完好】的源是否其实半成品(TODO/空函数/未接线/注释掉逻辑/报错)?被判【坏】的是否其实可用?' },
    { key: 'origin-history', instr: '从「git 原始版本」找反证:git log --all + git show <first-commit> 看原始设计,当前状态判定是否忽略了原始更完整/不同形态?' },
    { key: 'runtime-behavior', instr: '从「能否真正跑通」找反证:依赖是否齐(import/api/路由/权限),判【完好】但运行时其实 500/白屏/空数据?' },
  ],
  degradation: [
    { key: 'git-archaeology', instr: 'git show <first-commit>:<path> 对照原始版本:功能是否被历史 commit 悄悄砍掉(退化)却被当设计意图?当前判定与 git 历史是否矛盾?' },
    { key: 'legacy-repo', instr: `核老仓(${LEGACY})对应工件:老仓版本是否比当前丰富?当前是不是退化产物?(锚:MDM 期初导入 5 类 MES → 退化成 1 卡)` },
    { key: 'business-intent', instr: '从业务意图找反证:当前残缺态是否符合该业务真实需求?「现在只是 X / 已经整合了 / 已替换」类断言是否经得起业务推敲(trust-but-verify)?' },
  ],
  completeness: [
    { key: 'column-button', instr: '逐列/逐按钮核:源视图(cshtml/老页)每列、每按钮、每弹窗是否都在 UI 功能清单里?有无遗漏项?' },
    { key: 'validation-rules', instr: '逐必填/校验核:每个必填字段、校验规则(格式/范围/联动校验)是否都被清单捕获?' },
    { key: 'interaction', instr: '逐交互核:联动、默认值、显隐条件、级联下拉是否都在清单?这些最易漏。' },
  ],
}
const GENERIC_LENSES = [
  { key: 'evidence-strength', instr: '原判依据是否足以支撑结论?证据是否过弱/过时/来源不可靠?' },
  { key: 'counter-case', instr: '主动构造一个反例:在什么情况下该判定为假?该情况是否成立?' },
  { key: 'cross-source', instr: '换一个真理源(代码 vs git vs 老仓 vs DB)交叉核,是否与原判矛盾?' },
]

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted'],
  properties: {
    refuted: { type: 'boolean', description: '是否找到反证推翻该判定(证据不足以支撑原判→true,adversarial 默认存疑)' },
    counterEvidence: { type: 'string', description: '反证(file:line / git ref / grep -c / SQL);refuted=true 必填' },
    confidence: { type: 'string', enum: ['high', 'med', 'low'] },
    note: { type: 'string' },
  },
}

const refutePrompt = (a, lens) =>
  `迁移基准 adversarial 校验 — 你是独立 skeptic,任务是【尽力推翻】下面这条迁移基准判定(不是确认它)。\n` +
  `判定类型:${a.kind} | 对象:${a.subject}\n` +
  `待裁决判定(claim):${a.claim}\n` +
  `原判依据:${a.evidence || '(未提供)'}\n` +
  `你的视角(lens=${lens.key}):${lens.instr}\n` +
  `上下文:前端 ${FE} / 后端 ${BE} / 老仓 ${LEGACY}。可 grep / read / git 取反证。\n` +
  `${EVIDENCE_RULE}\n` +
  `立场:默认存疑 —— 找不到确凿反证才 refuted=false;有合理反证或原判证据不足 → refuted=true(宁可存疑交人复核)。\n` +
  `返回 VERDICT_SCHEMA。`

if (ARTIFACTS.length === 0) {
  log('⚠️ 未传 artifacts(待裁决判定清单)。本工具裁决「源工件清单/退化判定/UI 清单」是否被误判,需主会话先产出判定清单再传入。')
  return { audit: 'baseline-adversarial', error: 'no-artifacts', confirmed: [], disputed: [] }
}

log(
  `迁移基准 adversarial 门启动 | ${ARTIFACTS.length} 条判定 | 每条 3 视角独立 skeptic refute + 多数票 | ` +
    `disputed = 基准不得锁定,交主会话/涛哥复核`
)
if (Array.isArray(cfg.artifacts) && cfg.artifacts.length > MAX)
  log(`⚠️ artifacts ${cfg.artifacts.length} 条超上限 ${MAX},仅裁决前 ${MAX} 条,余 ${cfg.artifacts.length - MAX} 条未裁决`)

// fan-out-and-vote:每 artifact 独立跑(外层 parallel),其内 3 个 lens 各一独立 verifier(内层 parallel barrier 收齐再投票)。
// 嵌套 parallel 在此安全:verifier 全是只读 Explore(grep/read/git),无写竞争/无共享可变资源 —— 不像 migration-fanout 需 pipeline 限并发。
const results = await parallel(
  ARTIFACTS.map((a) => () => {
    const lenses = LENSES[a.kind]
    if (!lenses) log(`⚠️ artifact ${a.id || a.subject}:未知 kind='${a.kind}',回退通用 lens(专用 lens 未生效)`)
    const usedLenses = lenses || GENERIC_LENSES
    return parallel(
      usedLenses.map((lens) => () =>
        agent(refutePrompt(a, lens), {
          label: `refute:${a.id || a.subject}:${lens.key}`,
          phase: 'Refute',
          schema: VERDICT_SCHEMA,
          agentType: 'Explore',
        })
          .then((v) => ({ lens: lens.key, ...v }))
          .catch((e) => ({ lens: lens.key, refuted: false, _error: String(e).slice(0, 160) }))
      )
    ).then((votes) => {
      const valid = votes.filter(Boolean)
      // 只用「真正投了票」的(剔除 errored)做多数分母 —— 崩溃的 verifier 不得算作「确认基准」的一票
      const substantive = valid.filter((v) => !v._error)
      const refuteCount = substantive.filter((v) => v.refuted).length
      // fail-safe(adversarial 默认存疑):不足 2 个 verifier 真正投票(panel 退化)→ 强制 disputed;
      // 否则崩溃的 panel 会静默 confirmed,而 disputed 正是本门要产出的 DoD 阻塞信号
      const disputed = substantive.length < 2 ? true : refuteCount * 2 > substantive.length
      return {
        id: a.id || a.subject,
        kind: a.kind,
        subject: a.subject,
        claim: a.claim,
        voterCount: substantive.length,
        refuteCount,
        status: disputed ? 'disputed' : 'confirmed',
        panelDegraded: substantive.length < valid.length || undefined,
        counterEvidence: substantive.filter((v) => v.refuted).map((v) => `[${v.lens}] ${v.counterEvidence || v.note || ''}`),
        votes: valid,
      }
    })
  })
)

const confirmed = results.filter((r) => r && r.status === 'confirmed')
const disputed = results.filter((r) => r && r.status === 'disputed')
log(`裁决完成:confirmed ${confirmed.length} / disputed ${disputed.length}(disputed 阻塞锁基准)`)

return {
  audit: 'baseline-adversarial',
  totalArtifacts: ARTIFACTS.length,
  confirmedCount: confirmed.length,
  disputedCount: disputed.length,
  disputed, // 多数 verifier 找到反证:基准误判嫌疑,交主会话/涛哥逐条复核
  confirmed: confirmed.map((r) => ({ id: r.id, subject: r.subject, kind: r.kind })),
  note:
    'disputed = 多数独立 skeptic 找到反证 → 该判定不得锁为契约基准,交主会话/涛哥逐条复核(ADR-037 契约锁定不进 workflow);' +
    'confirmed 才可锁基准。本门只读、不改码、不拍板。与 migration-audit 配合:audit 查漏(completeness)+ adversarial 查误判(correctness),建基准时两者都跑。',
}
