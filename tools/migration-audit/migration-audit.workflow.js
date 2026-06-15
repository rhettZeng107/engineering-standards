export const meta = {
  name: 'migration-audit',
  description:
    '迁移完整性审计 — multi-modal sweep + completeness critic + loop-until-dry,主动穷扫迁移盲区(只读,不改码)。ADR-014 修订 2026-06-15,跨项目通用',
  phases: [
    { title: 'Sweep', detail: '多维并扫(各 agent 互盲):前后端归属 / 壳层功能 / 三方交叉 / 源工件退化' },
    { title: 'Critic', detail: '完整性批判收口:漏哪个维度 / 哪个模块停中间态 / 哪个声称迁完无证据' },
  ],
}

// ============================================================================
// 迁移「完整性审计」workflow —— 解 MDM→SRM→TPM 三次迁移的同一类大坑:
//   完整性盲区(整模块后端漏迁 / 壳层功能随 layout 整删 / 菜单种子整组漏种)。
//
// 病根(ADR-014 修订 2026-06-15):完整性检查项 playbook 都有,但检查方式是
//   「人工/单 agent 一遍过」—— 线性、靠记忆穷举维度、漏掉的那一维自己不会冒出来提醒。
//   本 workflow 把它升级为「多维并扫 + 收敛循环」:N 个 agent 并行扫多维、互不遗忘,
//   critic 收口补漏,连续 2 轮无新发现才停。
//
// 定位:与 migration-fanout(执行=批量落盘页面)互补 —— 本工具只审计、只读、
//   不改码、不拍板。产出 gap 清单交主会话/涛哥决策(契约锁定/拍板不进 workflow,ADR-037)。
//
// 触发时机(ADR-014):① 迁移启动强制前置(扫存量盲区)② 每模块 STEP1 验收前
//   ③ 迁移完结 DoD(后端归属清零未达不得宣告迁完)。
//
// 用法:Workflow({ scriptPath: <本文件>, args: {...} }) —— args 见下。
// ============================================================================
//
// args = {
//   frontendDir,        // 前端仓路径
//   backendDir,         // 后端仓路径
//   apiAddrFiles,       // 前端 api 寻址真理源(如 'src/hostMap.js, src/api/index.js')
//   oldBackendMarkers,  // 老后端标识(如 'CoreTPMWebApi, TPMWebApi, tpmApi')—— 命中=未迁/半迁
//   newBackendMarkers,  // 新后端标识(如 'JYTPMWebApi, jyTpmApi')
//   layoutPaths,        // 壳层目录(如 'src/layouts, src/components/global')
//   menuDbQuery,        // 菜单库查询线索(如 SYS_AuthInfo WHERE AppName='TPM' AND PortalScope='bp')
//   legacyRepo,         // 老仓路径或 git ref(源工件退化/半成品核对用)
//   modules,            // 已知模块清单(四象限登记用)
//   maxRounds,          // loop-until-dry 上限(防跑飞,默认 5)
// }

const cfg = args || {}
const FE = cfg.frontendDir || '(未指定前端仓 frontendDir)'
const BE = cfg.backendDir || '(未指定后端仓 backendDir)'
const API_ADDR = cfg.apiAddrFiles || 'src/hostMap.js, src/api/index.js'
const OLD = cfg.oldBackendMarkers || '(未指定老后端标识 oldBackendMarkers — 归属维度必填!)'
const NEW = cfg.newBackendMarkers || '(未指定新后端标识 newBackendMarkers)'
const LAYOUTS = cfg.layoutPaths || 'src/layouts'
const MENU_Q = cfg.menuDbQuery || '(未指定菜单库查询 menuDbQuery — 三方交叉维度需要)'
const LEGACY = cfg.legacyRepo || '(未指定老仓 legacyRepo — 源工件退化维度需要)'
const MODULES = cfg.modules || '(未指定模块清单 modules)'
const MAX_ROUNDS = cfg.maxRounds || 5

// 证据纪律(ADR-015 / ADR-030 A3):每个 gap 必带实证,禁臆测
const EVIDENCE_RULE =
  '【证据纪律】每个 gap 必标实证来源(file:line / grep -c 数字 / git ref / SQL 结果 其一);' +
  '无证据的推断标 [假设] 不混入 gap;只读审计,禁改任何文件。'

// 初始 4 维(对应四类历史迁移坑;critic 可追加维度)
const BASE_DIMENSIONS = [
  {
    key: 'ownership',
    title: '前后端归属(治:整模块后端漏迁)',
    instr:
      `扫前端 api 寻址层(${FE} 的 ${API_ADDR}),逐 endpoint 标指向【老后端】还是【新后端】。` +
      `老后端标识 = ${OLD};新后端标识 = ${NEW}。` +
      `凡命中老后端 = 未迁/半迁,登记 gap:{ module, type:'backend-not-migrated', evidence }。` +
      `重点抓「前端已 React 化、api 仍指老后端」的隐性半迁态(锚:TPM 计量/特种检定)。`,
  },
  {
    key: 'shell',
    title: '壳层功能(治:壳层功能随 layout 整删)',
    instr:
      `扫壳层目录(${FE} 的 ${LAYOUTS} + 全局组件)。源壳层每个功能项(顶栏导航/购物车类入口/数量徽标/` +
      `用户区/退出/搜索/移动端 TabBar/Footer/路由守卫/全局浮层)逐项核在新基线的去向:` +
      `等价迁 / 由宿主门户承担 / 漏(无去向)。凡「漏」或「无明确去向」= ` +
      `gap:{ module:'layout', type:'shell-feature-dropped', item, evidence }。锚:SRMShop 购物车入口随 ResponsiveLayout 整删。`,
  },
  {
    key: 'tripartite',
    title: '三方交叉(治:菜单种子整组漏种)',
    instr:
      `做菜单↔页面↔后端三方交叉,查 4 类异常:① 有页面无菜单 ② 有菜单无页面 ③ 有页面/菜单但后端空壳或缺 ④ 后端孤儿(已迁未接入)。` +
      `菜单真理源:门户菜单库(查询线索:${MENU_Q},如需可 Bash 跑 SQL);页面真理源:${FE} 前端路由(App.jsx/routes);` +
      `后端真理源:${BE} Controller 实装(非空壳)。每异常 = gap:{ module, type:'tripartite-orphan-page'|'tripartite-orphan-menu'|'tripartite-empty-backend'|'tripartite-orphan-backend', evidence }。` +
      `锚:SRM 外协单元菜单种子整组漏种、render-walk 22/22 绿仍漏。`,
  },
  {
    key: 'regression',
    title: '源工件退化/半成品(治:把退化产物当设计意图)',
    instr:
      `对照老仓(${LEGACY})核源工件【原始版本】 vs 当前版本:git log --all + git show <first-commit> 看原始设计。` +
      `识别两类:① 半成品被当完好迁(源本就未完成)② 历史退化产物被当设计意图(某功能被历史演变退化成残缺态,迁移照搬残缺)。` +
      `每项 = gap:{ module, type:'source-degraded'|'source-halfbaked', evidence:'git ref + 对照' }。锚:MDM 期初导入 5 类退化成 1 卡。`,
  },
]

const SWEEP_SCHEMA = {
  type: 'object',
  required: ['dimension', 'gaps'],
  properties: {
    dimension: { type: 'string' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['module', 'type', 'evidence'],
        properties: {
          module: { type: 'string' },
          type: { type: 'string' },
          item: { type: 'string' },
          evidence: { type: 'string', description: 'file:line / grep -c / git ref / SQL 结果' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MED', 'LOW'] },
        },
      },
    },
  },
}

const CRITIC_SCHEMA = {
  type: 'object',
  required: ['complete'],
  properties: {
    complete: { type: 'boolean', description: '是否已无遗漏维度/中间态/无证据声称' },
    missedDimensions: { type: 'array', items: { type: 'string' }, description: '还没扫的维度(下一轮补扫)' },
    midStateModules: { type: 'array', items: { type: 'string' }, description: '停在(新前端+老后端)等中间态的模块' },
    unverifiedClaims: { type: 'array', items: { type: 'string' }, description: '声称迁完但无证据的点' },
    note: { type: 'string' },
  },
}

const gapKey = (g) => `${g.dimension || ''}::${g.module || ''}::${g.type || ''}::${g.item || ''}`

log(
  `迁移完整性审计启动 | 前端 ${FE} | 后端 ${BE} | 初始 ${BASE_DIMENSIONS.length} 维 | ` +
    `loop-until-dry(连续 2 轮无新发现停,上限 ${MAX_ROUNDS} 轮)`
)

const seen = new Set()
const allGaps = []
const criticTrail = []
let dimensions = BASE_DIMENSIONS.map((d) => ({ ...d }))
let dry = 0
let round = 0

while (dry < 2 && round < MAX_ROUNDS) {
  round++

  // ── Sweep:multi-modal,每维一个只读 Explore agent,互相盲(barrier 收齐后统一去重)──
  phase('Sweep')
  const sweeps = await parallel(
    dimensions.map((d) => () =>
      agent(
        `迁移完整性审计 — 维度【${d.title}】(第 ${round} 轮)。\n${d.instr}\n${EVIDENCE_RULE}\n` +
          `已知模块清单:${MODULES}。\n返回:{ dimension:'${d.key}', gaps:[...] }(无 gap 则 gaps 空数组)。`,
        { label: `sweep:${d.key}`, phase: 'Sweep', schema: SWEEP_SCHEMA, agentType: 'Explore' }
      ).catch((e) => ({ dimension: d.key, gaps: [], _error: String(e).slice(0, 160) }))
    )
  )

  // 去重 vs seen(完整性扫描去重靠 gap key;判 dry 的依据)
  const fresh = []
  for (const s of sweeps.filter(Boolean)) {
    for (const g of s.gaps || []) {
      const k = gapKey({ ...g, dimension: g.dimension || s.dimension })
      if (!seen.has(k)) {
        seen.add(k)
        const rec = { ...g, dimension: g.dimension || s.dimension, round }
        fresh.push(rec)
        allGaps.push(rec)
      }
    }
  }
  log(`第 ${round} 轮 sweep:${dimensions.length} 维 → 新增 ${fresh.length} gap(累计 ${allGaps.length})`)

  // ── Critic:completeness 收口,挖遗漏维度/中间态/无证据声称 ──
  phase('Critic')
  const critic = (await agent(
    `迁移完整性审计 — 完整性批判(第 ${round} 轮收口)。\n` +
      `已扫维度:${dimensions.map((d) => d.key).join(', ')}。模块清单:${MODULES}。\n` +
      `累计 gap 摘要:${JSON.stringify(allGaps.map((g) => ({ d: g.dimension, m: g.module, t: g.type })))}\n` +
      `批判三问:① 还有哪个【维度】没扫到(如定时任务/上传链路/字典枚举接口/导出/打印/报表归属)?` +
      `② 哪些模块停在(新前端+老后端)等中间态、被当迁完?③ 哪些「已迁完」声称缺实证?\n` +
      `${EVIDENCE_RULE}\n返回 CRITIC_SCHEMA;missedDimensions 写维度短名(下一轮补扫)。`,
    { label: `critic:r${round}`, phase: 'Critic', schema: CRITIC_SCHEMA }
  ).catch((e) => ({ complete: false, missedDimensions: [], note: `critic失败:${String(e).slice(0, 160)}` }))) ||
    { complete: false, missedDimensions: [], note: 'critic返回null(skip)' }
  criticTrail.push({ round, ...critic })

  // critic 追加的新维度 → 下一轮补扫(机器不会像人一样「忘了还有 X 没查」)
  const known = new Set(dimensions.map((d) => d.key))
  const newDims = (critic.missedDimensions || [])
    .filter((d) => d && !known.has(d))
    .map((d) => ({
      key: d,
      title: `critic 追加:${d}`,
      instr: `审计迁移完整性维度【${d}】:核此维度下每项在新基线的去向(已迁/半迁/漏),登记 gap。${EVIDENCE_RULE}`,
    }))

  if (fresh.length === 0 && critic.complete && newDims.length === 0) {
    dry++
    log(`第 ${round} 轮无新发现且 critic 判完整 → dry=${dry}/2`)
  } else {
    dry = 0
    if (newDims.length) {
      dimensions = [...dimensions, ...newDims]
      log(`critic 追加 ${newDims.length} 维:${newDims.map((d) => d.key).join(', ')} → 下一轮补扫`)
    }
  }
}

// 严重度分桶 + 中间态汇总
// 漏标 severity 时按 type 兜底高危(防 backend-not-migrated / shell-feature-dropped 被静默降 MED、逃逸 DoD 阻塞)
const sevOf = (g) =>
  g.severity ||
  (g.type === 'backend-not-migrated' || g.type === 'shell-feature-dropped'
    ? 'CRITICAL'
    : g.type && g.type.indexOf('tripartite') === 0
    ? 'HIGH'
    : 'MED')
const bySeverity = { CRITICAL: [], HIGH: [], MED: [], LOW: [] }
for (const g of allGaps) (bySeverity[sevOf(g)] || bySeverity.MED).push(g)
const midState = [...new Set(criticTrail.flatMap((c) => c.midStateModules || []))]

return {
  audit: 'migration-audit',
  rounds: round,
  stoppedBy: dry >= 2 ? 'dry(连续2轮无新发现)' : `maxRounds(${MAX_ROUNDS})`,
  dimensionsScanned: dimensions.map((d) => d.key),
  totalGaps: allGaps.length,
  gapsBySeverity: {
    CRITICAL: bySeverity.CRITICAL.length,
    HIGH: bySeverity.HIGH.length,
    MED: bySeverity.MED.length,
    LOW: bySeverity.LOW.length,
  },
  midStateModules: midState,
  allGaps,
  criticTrail,
  note:
    '只读审计产出,交主会话/涛哥决策(契约锁定/拍板不进 workflow,ADR-037)。' +
    'CRITICAL/HIGH(尤其 backend-not-migrated / shell-feature-dropped / tripartite)= 迁移完结 DoD 阻塞项,清零才认定迁完。',
}
