export const meta = {
  name: 'migration-fanout',
  description: '迁移轨批量页面迁移 — workflow fan-out 试点(ADR-014 Back-automate 增强,跨项目通用)',
  phases: [
    { title: 'Scaffold', detail: 'fan-out 每页:按契约锁+范式落盘(qwen/fe-dev 按复杂度分流)' },
    { title: 'Verify', detail: 'barrier:统一 build + 逐页 payload⊆DTO 契约对齐 + 入口可达' },
  ],
}

// ============================================================================
// 迁移轨「批量同构页面迁移」workflow fan-out 试点模板(涛哥 2026-06-14 拍板)
//
// 价值:解大型迁移「主 context 过满」——主会话只收 schema 摘要,不吃各页全过程;
//       N 页并行(wall-clock≈最慢一页,非 Σ单页);契约锁文件作 fan-out 唯一真理源。
//
// 边界:只 fan-out【同构简单页】;真正复杂的异构页(多步流程/复杂联动)仍串行,别硬塞。
//       契约锁定 / 风险识别 / 涛哥拍板 不进 workflow(主会话本体做,ADR-037)。
//
// 用法:Workflow({ scriptPath: <本文件>, args: { ... } }) —— args 见下,详见 PILOT-PROMPT.md
// ============================================================================
//
// args = {
//   pages: [{
//     name,                              // 页面名(如 '润滑油品 LubricationOil')
//     endpoints,                         // 契约里的路由段(如 '/api/app/lubricationOil CRUD')
//     dest,                              // 落盘路径(如 'src/views/LubricationOil/')
//     complexity: 'CRUD' | 'complex',    // 同构 CRUD / 复杂业务
//     sink: 'qwen' | 'frontend-developer'// 落盘方:简单→qwen 省成本;复杂→fe-dev
//   }],
//   contractFile,   // 契约锁文件绝对路径(ADR-037 唯一真理源:动词/路由/字段/camelCase/必填)
//   refPaths,       // 范式参考(已迁同族页 + V2 组件 + 前端4标准)
//   frontendDir,    // 前端仓路径(build 在此跑)
//   buildCmd,       // 默认 'pnpm build'
// }

const cfg = args || {}
const PAGES = cfg.pages || []
const CONTRACT = cfg.contractFile || '(未指定契约锁文件 — 必填!)'
const REF = cfg.refPaths || '(未指定范式参考)'
const FE_DIR = cfg.frontendDir || '.'
const BUILD = cfg.buildCmd || 'pnpm build'

if (!PAGES.length) {
  log('⚠️ args.pages 为空 —— 请按 PILOT-PROMPT.md 传入 work-list 再跑')
  return { error: 'no pages', hint: '见 migration-fanout/PILOT-PROMPT.md' }
}

const PAGE_SCHEMA = {
  type: 'object',
  required: ['page', 'files', 'contractSelfCheck'],
  properties: {
    page: { type: 'string' },
    files: { type: 'array', items: { type: 'string' }, description: '落盘文件路径清单' },
    contractSelfCheck: { type: 'string', description: '请求体字段 vs 契约 DTO 对齐自查(字段名/大小写/必填)' },
    sink: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object',
  required: ['buildPass', 'perPage'],
  properties: {
    buildPass: { type: 'boolean' },
    buildError: { type: 'string' },
    perPage: {
      type: 'array',
      items: {
        type: 'object',
        required: ['page', 'verdict'],
        properties: {
          page: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'fail'] },
          reason: { type: 'string' },
        },
      },
    },
    gaps: { type: 'array', items: { type: 'string' }, description: '缺口(路由/菜单/权限码/契约不符)' },
  },
}

log(`fan-out ${PAGES.length} 页 | 契约锁:${CONTRACT} | sink 按复杂度分流(simple→qwen / complex→fe-dev)`)

// ── Scaffold:每页独立 fan-out 落盘(pipeline,无 barrier);不在此 build(并发 build 冲突)──
phase('Scaffold')
const scaffolded = await pipeline(
  PAGES,
  (p) => {
    const useFeDev = p.sink === 'frontend-developer'
    const sinkInstr = useFeDev
      ? '落盘方:你(frontend-developer subagent)直接落盘(复杂业务页;qwen-guard 已改 warn 不拦)。'
      : '落盘方:Bash 调 `qwen -y -p "<完整指令含落盘路径+验收点>"`(简单 CRUD,省成本)。'
    return agent(
      `迁移前端页面【${p.name}】到 ${p.dest}。\n` +
        `【契约唯一真理源(ADR-037)】读 ${CONTRACT} 的 ${p.endpoints} 段,` +
        `字段名 / 大小写(camelCase)/ 必填 严格对齐,禁臆测字段。\n` +
        `【范式】照 ${REF}:列表 ProTable + Drawer 表单 + service/api/router 接线 + V2 SectionCard + 前端4标准。\n` +
        `【产出】index.jsx + components/Edit + service 条目 + api 接线 + router 注册 + 菜单/权限码。\n` +
        `${sinkInstr}\n` +
        `【禁】不要跑 ${BUILD}(留 Verify 阶段统一跑,避免并发 build 互相污染)。\n` +
        `返回:落盘文件清单 + 请求体字段 vs 契约 DTO 的对齐自查结论。`,
      {
        label: `scaffold:${p.name}`,
        phase: 'Scaffold',
        schema: PAGE_SCHEMA,
        ...(useFeDev ? { agentType: 'frontend-developer' } : {}),
      }
    ).catch((e) => ({
      page: p.name,
      files: [],
      contractSelfCheck: `FAILED: ${String(e).slice(0, 200)}`,
      sink: p.sink,
    }))
  }
)

const ok = scaffolded.filter(Boolean)
log(`Scaffold 完成 ${ok.length}/${PAGES.length} 页`)

// ── Verify:barrier 统一 build 一次(不并发)+ 逐页契约对齐 + 入口可达 ──
phase('Verify')
const verdict = await agent(
  `验证迁移 fan-out 产出(共 ${ok.length} 页):\n` +
    `1. 在 ${FE_DIR} 跑 \`${BUILD}\` 一次,0 error 才算 buildPass(记 buildError);\n` +
    `2. 逐页核对请求 payload ⊆ 后端 DTO(契约锁 ${CONTRACT}):字段名/大小写/必填,不符记 fail+原因(ADR-008 ①④);\n` +
    `3. 逐页核对 router 注册 + 菜单种子 + 权限码接线齐(ADR-008 ⑤ 入口可达);\n` +
    `落盘清单:${JSON.stringify(ok.map((r) => ({ page: r.page, files: r.files })))}\n` +
    `返回:buildPass + 逐页 verdict(pass/fail+reason) + 缺口清单。`,
  { label: 'verify:build+contract+entry', phase: 'Verify', schema: VERIFY_SCHEMA }
)

return {
  pilot: 'migration-fanout',
  pageCount: PAGES.length,
  scaffolded: ok,
  verify: verdict,
  metricsHint:
    '试点三指标:① wall-clock 见 /workflows 计时(对比预估串行 Σ单页)② 主 context 省=本结果仅 schema 摘要,非各页全过程 ③ 质量=verify.perPage pass 率 + buildPass',
}
