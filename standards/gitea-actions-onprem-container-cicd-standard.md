# Gitea Actions 内网容器 CI/CD 标准

> 状态：Stable v1.1（2026-09-15）
> 决策依据：[ADR-050](../decisions/ADR-050-gitea-actions-onprem-container-delivery.md)
> 适用：已容器化或正在迁入容器平台的内网业务仓。尚未容器化的 IIS 存量应用继续使用其现行发布标准，完成迁移验收后再切换。

## 1. 目标拓扑

```text
开发工作区
  ├─ 本地 unit / contract / build / 受影响页面 E2E
  └─ push Gitea 主仓
          │
          ▼
Gitea Actions ──调度──> 独立 Linux Runner
                         ├─ 标签选择固定 Job 镜像
                         ├─ Build/Test 并发
                         ├─ 生成不可变容器上下文
                         └─ 受限 SSH 上传
                                  │
                                  ▼
                     部署目标：强制命令 + 应用白名单 + 环境锁
                                  │
                                  ▼
                     容器 revision/health → 网关 smoke → 定向 E2E
                                  │
                                  ▼
                     Gitea 制品回读 → GitHub 镜像
```

- Gitea 只负责代码、编排、日志和制品，不运行构建负载。
- Runner 独立部署；Job 默认在临时 Docker 容器中执行。只有明确批准的基础设施任务才可使用 host 标签。
- Build 可以并发；同一测试/生产环境的 Deploy 必须串行。优先在目标机用 `flock`/等价分布式锁兜底，独立单槽 Deploy Runner 可作为第二道隔离。

## 2. 仓库切换顺序

迁移不是复制仓库后立刻停掉旧 CI。每个仓按以下门逐项切换：

1. 盘点旧流水线的 build、test、DB migration、publish、deploy、health、E2E、消费者触发和 artifact；形成等价矩阵。
2. 把当前活动分支和 tags 同步到 Gitea，并独立核对 refs/SHA。
3. 添加 `.gitea/workflows/*.yml`，本地先通过适用构建、测试和定向 E2E。
4. Gitea 真实 Run 完成精确 SHA 部署，回读日志、制品、容器 revision 与网关结果。
5. 对同 SHA 或同覆盖样本与旧 CI 比较；未覆盖能力保持 `pending/blocked`，不得用首页 200 代替。
6. 验收通过后把 Gitea 设为协作主仓；旧 CI/仓库改为历史只读并停止触发。
7. 仅在 Gitea 终态和部署验收成功后推 GitHub 镜像。

推送前仍执行目标主仓的 `fetch + pull --rebase`，禁止裸 force。项目根治理仓与业务仓可能有不同远端策略，以最近的项目 `AGENTS.md` 为准。

## 3. Runner 与工具链标签

标签的格式是 `<name>:docker://<image>`；工作流的 `runs-on` 匹配标签名称，Runner 再以绑定镜像创建临时 Job 容器。标签不是常驻容器，也不是业务版本号。

推荐命名：

| 标签 | 用途 | 必须校验 |
|---|---|---|
| `linux-amd64-build` | 通用脚本/轻量构建 | OS、Git、基础工具 |
| `linux-amd64-frontend` | React/Vite/Playwright | Node、pnpm、Playwright 浏览器版本 |
| `linux-amd64-dotnet8` | `net8.0` 后端 | 精确 .NET SDK 8 版本 |
| `linux-amd64-dotnet10` | `net10.0` 后端 | `global.json` 对应的精确 .NET SDK 10 版本 |

约束：

- 仓库必须用 `global.json`、锁文件或 workflow 常量固定工具链，并在第一段显式断言实际版本。
- 不因迁移 CI 把 `net8.0` 项目升级到 `net10.0`；不同目标框架使用不同标签。
- 镜像使用不可变内部 tag并记录 digest，支持时优先按 digest 固定。Runner 主机预置镜像后才开放标签。
- 禁止企业仓声明含糊的 `ubuntu-latest`；标签无匹配时必须通过启动版本断言快速失败，不能在未知默认镜像继续运行。
- capacity 是单 Runner 可同时执行的 Job 数，不是线程数。扩容优先增加独立 Runner，并使用相同标签水平分发；不得共享工作目录或可变 Docker 状态。

## 4. Workflow 最小合同

每个 workflow 至少包含：

1. **Exact checkout**：`git rev-parse HEAD == GITHUB_SHA`，SHA 长度为 40。
2. **Toolchain gate**：校验 SDK/Node/pnpm/Playwright 和关键生产配置文件。
3. **Build/Test**：复用旧 CI 的全部确定性门；存在 EF migration 时先生成 bundle并在授权测试库执行。
4. **Immutable package**：生成预构建容器上下文，计算 SHA-256；镜像 tag 包含 `run_id + commit SHA`。
5. **Restricted upload/deploy**：使用仓库级部署 Secret，经强制命令上传并只部署声明的应用。
6. **Runtime verify**：容器 healthy、OCI revision 精确等于 commit、网关静态/API smoke。
7. **Affected E2E**：L0 floor 永远跑；再跑改动页面、直接关联项和共享消费者。映射未知时失败并补映射，不以全量测试掩盖缺失的影响关系。
8. **Evidence artifact**：保留版本、JUnit/TRX、截图/诊断、上下文 hash、migration bundle hash和影响面决策，默认至少 14 天。

如果生效配置位于目标主机而非业务仓，例如SYS的OIDC Compose覆盖文件，源码exact SHA不能证明该配置已同步。部署前须独立对账配置的仓内版本/目标文件SHA-256、保留可恢复备份并按真实Compose合并验证；部署后回读容器实际环境和代码revision，把两个版本证据一起纳入Run/交付记录。CI重新发布业务仓不会自动更新主机覆盖文件。

Gitea 内网环境应使用明确 URL 的内网 Action，例如 `uses: https://<gitea>/<owner>/<action>@<version>`；不要在受限网络中隐式依赖 GitHub 下载。Action 升级先用试验仓验证 checkout、cache、artifact 上传与下载回读。

### 4.1 Runner共享缓存

- Actions依赖缓存使用Gitea Runner提供的HTTP缓存协议，Redis不能直接作为`actions/cache`或`cache.external_server`后端。需要多Runner共享时，运行独立的`gitea-runner cache-server`进程，并让各Runner通过`external_server`连接。
- 单Runner或小规模内网环境可把独立Cache Server作为同一Runner VM上的单独systemd服务，使用独立目录、端口和非root账号；缓存是可丢弃加速数据，不要求为其单独增加VM。只有缓存I/O、磁盘或故障域需要独立隔离时再拆机。
- Cache Server共享密钥不得进入仓库、日志或制品。若当前Runner版本只支持`external_secret`，服务端和客户端配置文件必须归Runner专用账号所有且权限为`0600`；升级验证支持密钥文件后再改用`external_secret_file`。
- 受限网络中的缓存Action必须镜像到内网Gitea，并固定到已验证兼容版本。Runner 2.0的缓存服务为v1协议时，使用仍支持v1协议的Action版本；不得直接跟随外部`latest`。
- 前端缓存pnpm store，缓存键至少包含Node/pnpm主版本和全部相关`pnpm-lock.yaml`哈希；后端缓存NuGet packages，缓存键至少包含目标SDK及`csproj/props/targets/global.json/NuGet.config`哈希。恢复旧前缀仅用于内容寻址包缓存，最终安装仍必须使用锁文件和`--frozen-lockfile`/等价确定性门。
- 正式扩展业务仓前必须在隔离仓证明：首次miss后保存、同键精确hit、依赖哈希变化后miss、缓存不可用时构建可回退或明确失败。业务仓首次运行应记录save，第二次同SHA运行应记录restore；不能以缓存目录增长代替协议日志。
- 缓存目录不进入业务备份。持续监控容量和磁盘余量；缓存使用率超过约定阈值时优先按Runner原生保留策略清理或升级支持该策略的版本，禁止在Cache Server运行期间直接删除其数据库或blob文件。

## 5. Secret 与部署边界

- Gitea Actions Secret 按最小作用域创建；同名时仓库级优先，跨仓共享前先评估是否真的需要组织级。
- 部署私钥一仓一把。目标机 `authorized_keys` 使用 `restrict,command="<gateway> <app>"` 或等价限制，把该密钥绑定到单一应用。
- 部署网关只接受结构化参数（如数字 Run ID、40位 SHA），拒绝任意远程命令、未知应用、路径穿越、符号链接和超限压缩包。
- 数据库连接、签名密码、跨仓调度令牌只在 Step 的最小 `env` 中注入；禁止输出、写进仓库、镜像层或普通制品。
- 跨仓调度使用专用服务账号，只授予 manifest 声明的消费仓权限；禁止个人管理员 PAT。
- Runner 只服务可信仓库。Docker socket 等同宿主高权限，不向不可信 fork/外部仓开放。

## 6. 后端契约触发消费者

后端仓维护版本化消费者 manifest，至少包含：

```json
{
  "schemaVersion": 2,
  "contractGlobs": ["*/Controllers/*", "*Dto*", "*/Authentication/*"],
  "consumers": [
    {
      "owner": "<owner>",
      "repo": "<frontend-repo>",
      "workflow": "<workflow>.yml",
      "ref": "<branch>",
      "modules": ["<module>"]
    }
  ]
}
```

后端部署成功且 diff 命中契约面后，通过 Gitea `workflow_dispatch` 给消费前端传 `affected_modules`。base SHA 缺失、不可达或无法判断时采用保守触发；调度失败使当前交付保持红色。消费 Run 的终态仍要由监控/项目交付记录闭环，不能把“已发出请求”写成“消费者已通过”。

## 7. 并发、队列与部署串行

- 同一 Runner 的可用槽内，不同仓库 Build 可同时运行；超过 capacity 后排队。
- 同一目标环境的替换部署必须互斥，即使来自不同仓库。部署锁覆盖 build image、compose replace、health 和失败回滚，不能只锁上传。
- 前后端可并行构建；若后端 migration 或共享认证契约会改变前端验收前提，应按依赖顺序部署。
- 排队持续时间、CPU、内存、磁盘、Docker layer、cache 命中率与失败率达到项目阈值后，再增加 Runner。不得仅为消除正常 CD 串行而扩槽。
- 影响面计算基准是最近一次**完成部署态受影响E2E**的提交，而非无条件取前一个commit。若前一次Run在影响面选择/E2E前失败、取消或超时，后续修复提交必须继承上一失败提交的业务影响面；可由受控manifest记录最后成功SHA，或在当前exact SHA的`workflow_dispatch`显式传完整`affected_modules`。仅`@smoke`成功不得消除之前未验的模块债。

## 8. 监控与终态判定

Gitea Web 的仓库 `Actions` 页面是人工入口；自动化使用 Actions API读取：

- Run：`GET /api/v1/repos/{owner}/{repo}/actions/runs/{run}`
- Jobs/Steps：`GET .../actions/runs/{run}/jobs`
- Job 日志：`GET .../actions/jobs/{job_id}/logs`
- Run 制品：`GET .../actions/runs/{run}/artifacts`
- 制品下载：`GET .../actions/artifacts/{artifact_id}/zip`（处理 302 跳转并校验 SHA-256）

只接受 `completed/success` 作为 CI 终态。交付完成还需同时满足：

| 证据 | 要求 |
|---|---|
| Git | 本地 HEAD、Gitea 主分支、GitHub 镜像一致；旧 ADO 保留在切换前 SHA是允许状态 |
| CI | Run 与 Job 全部成功，失败/跳过项有业务解释 |
| Test | JUnit/TRX 可下载回读，数量、失败、跳过与报告一致 |
| Deploy | 运行容器 healthy，revision 与 Run SHA一致 |
| Gateway | 受影响静态/API入口成功，错误 audience/匿名反例按契约返回 |
| E2E | floor + 本次改动 + 直接关联项通过；真实数据不可用则标 `blocked` |

## 9. 回滚与故障处理

- Build/Test 失败：不部署、不推 GitHub；修复后以新 commit 重跑，不覆盖失败历史。
- 影响面守卫失败：即使容器部署步骤已成功，当前Run仍不是交付终态。修复映射后必须以最近一次通过部署态E2E的SHA为base或对新exact SHA显式重跑完整模块；不得因修复提交只改CI配置而接受1条smoke绿色结果。
- DB migration 失败：停止部署，保留 bundle、日志和目标库；禁止跳过迁移强行换容器。
- 部署或 health 失败：目标网关回滚到上一已验证镜像/compose状态，并记录失败 SHA；不得把容器 `running` 当健康。
- Consumer dispatch 失败：后端即使已健康也保持交付未闭环；恢复专用账号/权限后重试调度并监控消费 Run。
- Runner 失联：检查服务、Docker、磁盘、Gitea可达性和标签声明；禁止直接把 workflow 改成 host 执行绕过。
- Cache Server失联：停止把缓存命中当交付前提，检查独立服务、端口、共享密钥和磁盘；恢复后重跑miss/hit探针。不得临时改接Redis或直接删除运行中的缓存数据文件。
- Gitea 升级、Runner 升级或 Action 协议变化：先在隔离仓验证正常、失败、取消、artifact和并发样本，再滚动到业务仓。

## 10. 工作区采用清单

- [ ] 当前业务分支、Gitea/GitHub/旧远端职责已写入项目 `AGENTS.md`
- [ ] 旧 CI 等价矩阵已覆盖 build/test/migration/deploy/E2E/artifact/消费者触发
- [ ] Actions 已启用，workflow 使用明确且已预置的 Runner 标签
- [ ] 工具链版本与运行镜像已固定并在 Job 起始校验
- [ ] 独立Cache Server（如启用）已验证miss/hit/依赖变更失效，密钥未进仓库，pnpm/NuGet键包含锁文件或项目依赖哈希
- [ ] 仓库部署 Secret、强制命令与单应用权限已验证
- [ ] 同目标环境部署锁已实跑，Build 并发不绕过 CD 串行
- [ ] 精确 SHA、容器 revision、网关 smoke和部署态定向 E2E 已闭环
- [ ] JUnit/TRX/截图/hash制品已下载回读
- [ ] Gitea 成功后 GitHub 镜像已对账；ADO 已转历史只读且未再触发
- [ ] 失败、取消、超时、Runner失联与回滚路径已至少演练或明确记录为 `pending`

## 11. 官方依据

- [Gitea Actions Quick Start](https://docs.gitea.com/usage/actions/quickstart/)：Runner与Gitea服务分离部署的基础入口。
- [Gitea Runner Labels](https://docs.gitea.com/runner/labels/)：`runs-on`、标签与Job容器镜像的映射语义。
- [Gitea Runner Caching](https://docs.gitea.com/runner/2/cache/)：内置缓存、独立Cache Server、多Runner共享及协议兼容边界。
- [Gitea Actions Secrets](https://docs.gitea.com/usage/actions/secrets/)：用户、组织和仓库Secret作用域。
- [Gitea API](https://docs.gitea.com/api/)：Run、Job、日志和制品的自动化查询入口。
- [Gitea Actions Job permissions](https://docs.gitea.com/usage/actions/token-permissions/)：默认Job令牌边界及跨仓操作需要显式凭据的依据。
