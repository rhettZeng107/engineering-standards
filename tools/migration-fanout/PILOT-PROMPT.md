# workflow fan-out 迁移试点 — 接续会话执行指引(复制本文给执行试点的会话)

> 目标:用 workflow 并行 fan-out 一个迁移模块的**批量同构前端页面**,验证「动态 workflow 嵌入迁移轨 Back-automate」的价值(ADR-014 增强,涛哥 2026-06-14 拍板)。验证 OK → 落 ADR-014 修订推广。

---

## ⚠️ 前置硬门(任一不满足就别跑 —— 防串场 + 防臆测)

1. **后端契约已锁**:目标模块 contract 文件存在(动词/路由/字段/camelCase/必填齐)。这是 fan-out 的**唯一真理源(ADR-037)**,主会话本体已锁,**禁让 fan-out agent 各自臆测字段**。
2. **前端工作树干净**:`git status` 无其他会话的未提交改动 —— 否则 fan-out 和别人的工作混进同一棵脏树,git/CR/build 互相污染。
3. **单执行者**:本模块前端没有别的会话 / 串行任务在做。

## 执行

**1. 列 work-list**(用你对本模块的上下文,逐页):
- 只把【同构简单页】放进 fan-out;真正复杂的异构页(多步流程 / 复杂联动)**仍串行,别硬塞**(fan-out 只对同构有质量保证)。
- 每页:`{ name, endpoints(契约里的路由), dest(落盘路径), complexity: 'CRUD'|'complex', sink: 'qwen'(简单CRUD省成本)|'frontend-developer'(复杂业务页) }`

**2. 跑 workflow**(显式 opt-in):
```js
Workflow({
  scriptPath: "~/Projects/engineering-standards/tools/migration-fanout/migration-fanout.workflow.js",
  args: {
    pages: [ /* 你的 work-list */ ],
    contractFile: "<契约锁文件绝对路径>",
    refPaths: "<已迁同族页 + src/components/v2 + 前端4标准 路径>",
    frontendDir: "<前端仓绝对路径>",
    buildCmd: "pnpm build"
  }
})
```

**3. 补 6 项硬冒烟**:workflow 返回后,走**真实 UI 表单**提交验 CRUD(捕真实 payload⊆DTO),不用合成 payload 顶替。

## 采集试点三指标(对比「串行迁同样页数」基线)

| 指标 | 怎么测 | 预期 |
|---|---|---|
| **主 context 省** | workflow 期间你主会话 context 增量 vs 预估串行 | workflow 明显更省(主会话只收 schema 摘要,不吃各页全过程) |
| **wall-clock** | `/workflows` 看 workflow 总耗时 vs 预估串行(Σ单页) | fan-out ≈ 最慢一页 |
| **质量** | `verify.perPage` 的 pass 率 + `buildPass` | 几页一次过 / 几页返修 |

## 报告给涛哥

三指标 + 「workflow 值不值得推广到迁移轨全部批量段」结论 + 坑(qwen/fe-dev fan-out 质量、并发问题、契约传递是否失真)。**验证 OK → 落 ADR-014 修订。**
