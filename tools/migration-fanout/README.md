# migration-fanout — 迁移轨批量页面迁移 workflow fan-out 试点工具

> 涛哥 2026-06-14 拍板:动态 workflow **混合嵌入**迁移轨(ADR-014)Back-automate 阶段,
> 对【同构批量前端页面】用 fan-out 并行迁移,验证价值后推广。**简单 / 标准轨不用此工具。**

## 文件

| 文件 | 作用 |
|---|---|
| `migration-fanout.workflow.js` | workflow 脚本(args 驱动,跨项目通用) |
| `PILOT-PROMPT.md` | 接续会话执行指引(复制给执行试点的会话) |

## 何时用

迁移轨某模块同时满足:**后端契约已锁 + 前端批量同构页待迁 + 工作树干净 + 单执行者(无并发会话)**。
任一不满足别用(尤其工作树脏 / 有别的会话在写同一前端 = 串场)。

## 设计要点(为什么这么做)

- **契约锁文件作 fan-out 唯一真理源**(ADR-037):主会话本体先锁契约成文件,fan-out agent 按文件落盘,**禁各自臆测字段**(subagent context 隔离会传话失真)。
- **sink 按复杂度分流**:简单 CRUD → `qwen`(省成本);复杂业务页 → `frontend-developer`。真正复杂的异构页**不进 fan-out**,仍串行(fan-out 只对同构有质量保证)。
- **barrier 统一 build**:fan-out 阶段不 build(并发 build 互相污染),Verify 阶段统一跑一次。
- **Verify = 契约对齐 + 入口可达**:payload⊆DTO(ADR-008 ①④)+ router/菜单/权限码齐(ADR-008 ⑤)。
- **主 context 省**:主会话只收 schema 摘要,不吃各页迁移全过程 —— 直接解迁移轨「大型迁移 context 过满」。

## 不进 workflow 的(留主会话本体)

契约锁定 / spec 风险识别 / 涛哥拍板 / 架构决策 —— 这些是单点深度推理 + 人在环,fan-out 帮不上(ADR-037 + ADR-014)。

## 验证后

试点三指标(主 context 省 / wall-clock / 质量 pass 率)达标 → **落 ADR-014 修订**,把"Back-automate 批量段默认启用 workflow fan-out + 本工具用法 + 契约锁文件作输入"写进迁移轨标准,推广 SRM/MES/WMS/EAM/TPM。

## 状态

🧪 **试点中**(2026-06-14 建)。首个试点对象:某迁移模块的同构前端批量段(P3 因并发会话占用工作树,改下个干净模块试)。
