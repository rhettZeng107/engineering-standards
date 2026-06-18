# Cross-Repo 分层 E2E Cookbook(ADR-045 + ADR-046 落地手册)

> 跨工作区复用:任何工作区(SRMV2/TPMV2/MES/EAM/WMS…)按本手册接入"部署后 E2E 分层定级 + 后端契约改跨仓触发前端"。
> 真理源:[ADR-045](../../decisions/ADR-045-post-deploy-e2e-tiered-scoping-governance.md)(分层) + [ADR-046](../../decisions/ADR-046-cross-repo-contract-driven-e2e-trigger.md)(跨仓触发) + [standards/cicd-e2e-in-pipeline-standard.md §7](../../standards/cicd-e2e-in-pipeline-standard.md)。
> 标杆实现:SYSV2(4 前端分层全绿 + MDM 后端→前端跨仓触发 #823→#824 端到端实证)。

---

## 0. 前提发现(每工作区先实证,勿照抄 SYSV2 的值)

| 要发现的 | 怎么拿 |
|---|---|
| 各仓 ADO pipeline `definitionId` | `GET {collection}/{project}/_apis/build/definitions?api-version=7.0` |
| ADO collection URL + 是否 2020+ | pipeline 内 `$(System.CollectionUri)`;`_apis/pipelines` project 级 200 = 2020+(支持 templateParameters) |
| 前端→后端消费映射 | 各前端 `.env.production` 的 API host(如 VITE_APIHOST/VITE_Url)→ 对到哪个后端 |
| 变量组名 + 是否 per-project 副本 | `GET {collection}/{project}/_apis/distributedtask/variablegroups`(注:常是每 project 同名独立副本,非共享) |
| `enforceJobAuthScope` | `GET {collection}/{project}/_apis/build/generalsettings` → 若 true,**必须用 PAT**(System.AccessToken 跨 project 不通) |

## 1. 层一:分层定级(每个前端仓)

1. **3 个 floor spec**:`pipeline-e2e/tests/` 下确保有 boot / quality / i18n-mix(或等价;双语豁免 i18n 的仓用 i18n 切换;后端壳类用 shell)。给 **describe 标题**末尾加 ` @floor`(例:`test.describe('XX critical boot @floor', ...)`)。
2. **拷 `tier-decide.mjs`**:本目录 `tier-decide.mjs` → 各前端 `pipeline-e2e/`。`node tier-decide.mjs --self-test` 应 17/17。
3. **E2E stage 接线**(`azure-pipelines.yml`):
   - E2E job 的 `checkout: self` 把 `fetchDepth: 1` → `fetchDepth: 2`(tier-decide 要 HEAD~1)。
   - 「Run E2E」步换成分层块(`$E2E_TIER`/`$E2E_GREP` 由 tier-decide 出):L0 跑 `--grep @floor` / L1 跑 `--grep "@floor|$grep"` / L2 全量。

### 1.1 门户登录 wujie 子应用 floor 的稳定化(TPMV2 实证,3 个真坑,务必照做)

> 子应用(嵌门户的 wujie/iframe 子应用)floor 必须经门户登录 + 钻 iframe;**共享 self-hosted agent 高负载时 E2E 时序膨胀 4-5x**(实测 55s/页 vs 本地 1s),固定 sleep 必假红。

- **导航全程 wait-based,禁 fixed sleep**(否则 CI 负载下假红):登录选厂/确认/token 用 `locator.waitFor`/`waitForFunction`(对齐各仓 `login.ts` 25s timeout 范式);菜单展开等 `aria-expanded=true`;叶子 `waitFor visible` 再点;**iframe 挂载轮询 ≥30s**(CPU 饥饿挂载极慢)。本地无法预验(子应用 API 内网不可达)时,把登录段抽 helper 在本机对门户跑通(门户登录页通常可达)再推。
- **资产 MIME/健康检查限本子应用自己的 base 路径**(`/sub-xxx/`):门户走查会带出**其他子应用**(如 `/qms/` `/srm/`)的资产,它们坏(404→门户 SPA fallback 返 index.html)不是你的部署问题,全局 MIME 检查会误报假红。
- **floor 核心页 3 个足够**(跨 2-3 主组)+ beforeAll 一次登录 + serial 3 describe 断言切片:省昂贵重复登录,CPU 饥饿 agent 上更快更稳。`clicked`/`frame` 诊断打日志,红了一眼判 click 失败 vs 挂载超时。
- **firing 探针**(验跨仓触发)用 comment-only 改一个契约面文件(如 AppService)+ `# skip-cr`;实证 `✅ queued def<前端> runId=...` + 被触发前端 run **Build/Deploy SKIPPED**。非契约 commit(pipeline/manifest 改)顺带验「不触发」。

## 2. 层二:后端契约改 → 跨仓触发前端(每个后端仓 + 其消费前端)

### 2a. 后端仓:consumers manifest

`<后端仓>/ci/contract-consumers.json`(**纯 ASCII,勿放中文** —— Windows PS 5.1 读 UTF-8 中文会乱码):见同目录 `contract-consumers.example.json`。
- `contractGlobs`:契约面(`*/Controllers/*` `*Dto*` `*ViewModel*`;ABP 项目按实际)。
  - ⚠️ **ABP dynamic API 必加 AppService glob**(TPMV2 实证踩坑):若后端用 `ConventionalControllers.Create(...)`(`*WebApiModule.cs`),则**真实 wire 契约面是 AppService 而非手写 Controller** —— `JY.X.Application/Services/*AppService.cs` 的公开方法被自动暴露成端点。仅 `*/Controllers/*`+`*Dto*` 会漏「改 AppService 签名/路由不改 Dto」的契约破坏(前端假绿)。**补 `*/Services/*AppService.cs`**(轻微过度触发实现改动,但 ADR-046 过度触发 < 漏触发)。grep `ConventionalControllers` 判定是否 ABP dynamic API。
- `consumers[]`:`{repo, project, definitionId, modules:[]}`(modules 先留 `[]` → 前端跑 @floor;@module 标签到位后填,自动升 L1)。

### 2b. 后端仓:TriggerConsumers stage

把同目录 `trigger-consumers-stage.yml` **整段**追加到后端 `azure-pipelines.yml` 末尾(DeployTest 之后)。它:deploy 绿后 git-diff 命中 contractGlobs → 用 `$(ADO_QUEUE_PAT)` REST queue 各 consumer + 传 affectedModules。best-effort(不阻塞 deploy)。
- **`dependsOn` 按后端有无 post-deploy Verify stage 选**(TPMV2 实证):模板默认 `dependsOn: DeployTest`(MDM 无 Verify);若后端有 **API-Health/Verify stage**(swagger 200 + manifest 非空,ADR-045 后端 floor)→ 改 `dependsOn: Verify`,确保后端进程确认健康后才触发前端 E2E(否则前端可能对未起来的后端跑 → 假红)。

### 2c. 消费前端仓:consumer-trigger 5 处改

见同目录 `consumer-trigger-frontend.md`(参数 + Build/Deploy 跳过条件 + E2EVerify 条件 + E2E 步 consumer-trigger 分支)。

### 2d. 凭据(人工一次性,ADO 管理员)

- **只"触发方"后端需要 `ADO_QUEUE_PAT`**(有 TriggerConsumers stage 的);前端仓 / 不触发别人的后端**不需要**。
- 建 **1 个** PAT(scope **Build: Read & execute**)→ **同一值**粘进**每个触发方后端 project** 的变量组 secret 变量 `ADO_QUEUE_PAT`(变量组常是 per-project 独立副本不共享,故各存一份;若用跨 project 共享变量组则加一次)。
- 变量组链接须带 project 段:`{collection}/{project}/_library?itemType=VariableGroups`。
- 优先 PAT(不动安全设置);System.AccessToken 仅在 `enforceJobAuthScope=false` 才跨 project 可用。

## 3. ⚠️ 踩平的坑(SYSV2 实证,务必照做,否则重踩)

| 坑 | 症状 | 解 |
|---|---|---|
| **PS `$var:`** | `Variable reference is not valid` 解析失败 | 字符串里变量后接冒号用 `${var}`(如 `${code}`),agent 是 **Windows PowerShell 5.1** |
| **Get-Content 编码** | 中文 manifest 乱码 → ConvertFrom-Json 失败 | `Get-Content -Raw -Encoding UTF8` + **manifest 纯 ASCII** |
| **空 templateParameter** | `参数不是有效的 String` queue 被拒 | affectedModules **空则省略**(`if ($mods) {...}`),空用前端默认 |
| **enforceJobAuthScope=true** | System.AccessToken 跨 project 403 | 用 **PAT**(Basic auth `base64(":$pat")`) |
| **触发失败阻塞 deploy** | 后端 deploy 已绿却整体红 | TriggerConsumers 末尾 `exit 0` + try/catch warning(best-effort) |
| **本地无 pwsh** | 改不出能 lint 的 PowerShell | YAML 用 js-yaml 校验结构;PowerShell 靠推 + 小步验;脚本避非 ASCII |
| **pnpm 全局装 EEXIST**(共享 agent) | `npm error EEXIST ...node\..\pnpm file already exists` → Build 红(多 pnpm 项目共享 self-hosted agent 抢装 stale 全局 shim) | Install pnpm 步用 `npm install -g pnpm@<ver> --force`(覆盖 stale);**SRMV2 2026-06-19 实证** |
| **standalone 前端 floor 的 biz-API 豁免**(非 `/api/` 路径) | 部分前端业务 API 路径无 `/api/` 前缀(如供应商 `POController/action`,baseURL=VITE_Url)→ floor 的 `/api/` 豁免漏掉 → 无 token 时**跨源后端 5xx/4xx 假红** | floor 豁免改**「跨源(host≠部署前端)即豁免」+ 保留 /api/**,只检前端**同源**资源(`isExternal(u)=new URL(u).host!==new URL(E2E_TARGET).host`);**SRMV2 2026-06-19 实证** |

## 4. 落地纪律

- **pilot → fanout**:先 1 后端 → 1 前端打通(含真改 Controller 验 firing:日志见 `✅ queued <repo> runId=...` + 前端 run Build/Deploy SKIPPED + E2E 跑),再 fan out 其余。
- **每步双推 + watch**;红则按 `docs/ops/cicd-self-heal-sop.md` 自愈。
- **@module(L1 真定向)**:有页级 module spec 的仓(如 SRM Buyer `m03-batch*`)给 describe 打 `@module:<目录名>`;无则保持 @floor 降级。
- 完结回灌:更新本工作区 spec/进度 + 若发现新坑补本 cookbook。
