# Codex CLI / Astra 环境与全局工作流评估

日期：2026-09-07。结论：模型与CLI安装正常；需要调整的是旧模型路由、互相冲突的评审指令、两个错误skill，以及文件hook对原生输入的兼容。模型升级本身不能证明流程质量提升，本次以实际加载、握手和回放验证为依据。

## 模型路由（用户拍板）

| 场景 | 模型 / 强度 | 使用方式 |
|---|---|---|
| 跨仓契约、架构、DB/鉴权/生产风险、迁移完整性、外部集成、复杂诊断及全局Harness | gpt-6-astra / high | `codex -p astra`；复杂agent显式指定 |
| 边界清楚的常规实现、修复、测试、文档及配置小改 | gpt-5.6-sol / high | 普通`codex`或`codex -p sol` |
| 检索、build/test、哈希、格式和清单校验 | 工具或脚本 | 模型解释结果，不代替实际验证 |

Sol强度沿用原常规工作High。当前主会话不会因编辑配置热切换；profile用于启动时选择，客户端模型选择或显式目标agent用于运行中的任务分派。没有启用实验性自动切换或用关键词脚本猜复杂度。用户本轮点名优先；不自动使用Terra/Luna或升级xhigh/max/ultra。

实测两次隔离只读`codex exec`均返回`ROUTE_OK`：启动诊断分别显示`gpt-5.6-sol/high`、`gpt-6-astra/high`，provider均为OpenAI，exit 0。不是让模型自报身份。

## 各配置层的判断

| 层 | 当前证据 | 处理 |
|---|---|---|
| CLI | 0.153.4；doctor显示安装一致、当前版本不旧于检查到的版本 | 保留；不重复安装或切换发行渠道 |
| 模型与推理 | 默认已按拍板调整，两个profile实际推理成功 | 修复旧Sol xhigh/Terra强制路由；复杂Astra High、其它Sol High |
| 上下文 | 无手工context/auto-compaction覆盖；当次CLI Astra目录默认272000、最大872000 | 保留CLI目录及自动压缩默认；API最大窗口不是CLI默认。未证明扩大窗口能改善业务验收 |
| Agent | 52份本地TOML均可解析，无角色级固定模型；原8份Reviewer描述强制调用 | 保留专业角色；取消8份描述中的强制调用，明确目标模型与继承行为；并行仅用于可独立的有界任务 |
| Skill | 原生`skills/list`：186条、184启用、0错误；磁盘扫描未发现坏链接 | 定向禁用错误API、未接入DevFleet两项，保留文件；修复stocktake元数据，更新Harness与迁移入口 |
| MCP | 原生`mcpServerStatus/list`：SQL各14工具、官方文档5、Context7 2、node_repl 4、cua_repl 2、apps 171 | 保留已能握手并发现工具的服务；没有把配置文件存在冒充业务操作已通过 |
| 插件 | 官方文档/浏览器/文档办公/GitHub等能力保留；hooks接口可加载Warp兼容钩子 | 不按历史provider名称或低频使用清空插件；已禁用旧computer-use独立条目保持禁用 |
| Hook | 原生列表34项、30启用、全部trusted、0错误/警告；3项CR和1项Warp旧handler禁用 | 保留handler顺序与trust状态；文件输入兼容修复见下节，不批量删除15个无效位置状态键 |
| 全局流程 | AGENTS、Harness skill/standard、policy模板与ADR曾相互冲突 | 更新当前规则；保留完整范围、反例检查、build/test、真实UI语义验收、凭证、分支及部署边界 |
| 自动化/恢复 | 本地有月度审计提示模板；原生doctor数据库完整性正常 | 保留只读月检模板与进度接续；本次未取得定时任务实际注册/触发证据，不报告“自动月检已运行” |

技能的184是本次CLI实际启用数量，不等于所有插件缓存文件数量。本次做全量元数据/加载检查及相关正文抽查，不声称逐条验证全部技能的业务输出。

## Hook以官方行为为准

官方定义：`Edit/Write`是`apply_patch`允许使用的matcher别名；传入`tool_name`仍是`apply_patch`，补丁在`tool_input.command`。因此不能用旧`file_path/content`格式判断原生输入。本次发现的静默跳过属于本地脚本兼容问题，不是Astra故障。

修复范围：10个文件类hook接入共享输入适配器，保留原有业务规则和例外。PreToolUse在覆盖的补丁语法内重建完整候选后检查；PostToolUse读取实际文件；多文件逐项处理。提醒使用官方`hookSpecificOutput.additionalContext`，拒绝保留官方permissionDecision格式。未改原生apply_patch、hook定义、信任哈希或审批策略。

本地候选预览并非官方完整解析器。无法重建时输出明确的“未验证”上下文并要求后续复核，由原生工具判定补丁是否合法；不静默报通过，不另加审批或全局误阻断。已支持输入命中原业务拒绝条件时仍拒绝。

验证：主会话独立运行15/15针对性测试通过，包含10个hook和13类本机原生apply_patch逐字节对比；旧CR实现24/24回归通过，3个CR handler仍禁用。定向技术评审发现1项HIGH（一个候选预览失败跳过后续独立文件），已修复为逐文件/依赖链报告未验并继续检查独立文件；针对性复核通过。预览不是完整安全边界，仍保留前述未验证限制。

## HC MDM返工案例与CR质量调整

本轮以`git + rg`只读核对R80：MDM提交`b9a9f83`及当前未提交修复，未运行HC build/LSP/业务测试、未访问服务器或数据库。以下现场状态来自HC现有记录，不能当作本轮现场验收；当前接续文件明确72仍v6、UAT未过，本地修复等待重启会话后继续。

| 实证案例 | 旧检查漏点 | 本次全局要求如何提前发现 |
|---|---|---|
| 隐藏ERP字段仍整对象写回、联系人被SetValues覆盖；progress第97–103行记录独立CR曾抓到并回修 | 独立评审有价值，但保存/审批应用和保留语义分多轮才查全 | 每个字段记录显示、初始化、提交、保存、审批应用和重读；隐藏与删除/清空分开 |
| `SupplierEdit02`旧逻辑检查`LabelId`，控件实际写`MaterialLable`，后端需要`SupplyCategoryLabelIdList`；当前diff才补ID转换 | 三个不同业务字段被当成同一分类，缺控件→请求DTO→后端校验逐字段核对 | CR枚举真实控件值、submit mapper、DTO值域/必填与保存；用旧错可复现的调用链测试 |
| 已退役字段仍请求`GetAttrList/factoryattrs`，失败导致整页加载失败；当前diff取消该活动依赖 | 只移除显示字段，未删除/隔离退役请求与失败传播 | 页面当前依赖清单，逐个核对用途、等待关系、空值/失败及loading结束条件 |
| 两张兄弟建档页在异步mainData返回前解引用联系人；U9页已有with保护 | 修改页范围没覆盖共享字段的全部实际消费者 | 关联未改代码、兄弟入口的加载前/空集合/失败与回显用例 |
| “新增”草稿按钮进入SupplierEdit02，保存API旧分支却拒绝已有新增草稿 | 路由存在，但记录状态与API允许分支不一致 | 按钮→目标页→参数/业务ID/状态→提交API分支，而非仅检索路由字符串 |

可定位证据（HC目录只读）：

- `docs/superpowers/specs/2026-08-12-hc-supplier-certification-blacklist-quality-claim/progress.md:22–27,97–103`：现场异常、受控测试边界、独立CR真实发现。
- `MDM/AL.Extend.MDM/AL.Extend.MDMWeb/Views/DataChange/SupplierEdit02.cshtml:2286`与`AL.Extend.MDM.WebApi/Controllers/DataChangeController.cs:528`：供货分类转换和后端必填。
- `MDM/AL.Extend.MDM/AL.Extend.MDMWeb/Views/DataChange/Supplier.cshtml:91–99`：新增/变更草稿按钮目标；对应后端当前diff新增`isExistingNewDraft`分支。
- `e2e/tests/r80-mdm-registration-fields.spec.ts:9–18`：readFileSync、page.setContent及抽取控件；可验证局部控件，不等于完整MVC/IIS/菜单/API/DB验收。

根因判断：已有ADR-008早就要求DTO与路由对齐，但触发条件曾局限于“同task同时改DTO和前端”，Reviewer又按变更文件/语言局部检查；通过数量没有说明测试替身和实际业务链的边界。不是再增加一次相同材料的评审就能解决。

已落实：ADR-008新增“页面字段与操作变更的影响闭环”，详细要求当前依赖、联动、空值、回显、保存约束、DTO/映射/实体/审批应用、兄弟页面及路由状态；前端标准取消盲目大小写双兜底及占位符掩盖字段缺失。通用Reviewer允许追查关联未改代码；C# Reviewer同时检查staged/unstaged候选及前端消费者；TS Reviewer补字段级消费链。相关skill与Harness引用同一规则，不新增重复SOP或形式化回执。

全局AGENTS只保留“页面变更CR”“验收证据”两条摘要；本次由185行调整到183行，字节数不增。详细矩阵保留ADR-008，HC例子保留本报告。新规则尚未在下一批HC真实UI交付中验证，不能宣称返工率已经下降。

## 全局执行流程

需求与复杂度判断 → 当前源/契约实证 → 完整范围与必要计划 → 执行 → 主会话最终diff自查、适用build/test/UI验收 → 提交/推送/CI独立验证 → 汇报和接续记录。

移除的是固定独立Reviewer与回执流程；主会话质量检查仍保留。代码hook本轮因运行时更高优先级要求进行一次定向技术评审，这不恢复本机的强制独立Reviewer默认。

## 保留与未验证事项

- `danger-full-access + never`是既有交互授权，本次未扩大权限；月度自动化仍以只读为基线。
- 历史索引有1条记录指向缺失会话文件；其余DB完整性正常、磁盘空间充足。未删历史或直接改运行时数据库。
- SYSV2两个SQL服务名当前配置指向同一目标；没有根据primary/test名称擅自换地址。本次验证到MCP握手/工具发现，未执行数据库查询或写入，生产路由仍需以实际连接契约核对。
- 原始`mcp list --json`会包含env凭证；检查过程中该输出曾在只读子任务工具结果中回显，后续改为进程内白名单脱敏。公开报告不包含原值，未上传原始配置或日志，未擅自轮换凭证。
- 未进行全部业务页面E2E、DB CRUD、通知到达或所有插件动作测试；这次没有修改项目业务代码。SYSV2原有三份auth-bridge文档改动未触碰。

## 官方依据

| 官方来源 | 本次采用的原则 |
|---|---|
| [GPT-6 Astra指南](https://developers.openai.com/api/docs/guides/latest-model) | 依据任务和验证使用推理强度；新API能力不等于CLI可手工强开配置 |
| [Best practices](https://learn.chatgpt.com/guides/best-practices) | 简短准确的项目规则、真实环境配置、清晰验收与测试/diff检查 |
| [Advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#profiles) | 独立`<name>.config.toml` profile；不使用已废弃的内嵌profiles表 |
| [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) | 配置项与分层；使用本机strict-config和有效config/read复核 |
| [Hooks](https://learn.chatgpt.com/docs/hooks) | 原生输入、matcher别名、JSON上下文/拒绝输出、精确hook信任 |
| [Build skills](https://learn.chatgpt.com/docs/build-skills) | 元数据发现、按需加载；错误技能定向处理 |

当次官方manual于2026-09-07刷新；定位：Best practices 1788–2019，Multi-agent 2020–2457，Profiles 12060起，skills禁用22030起，Hooks 23366–24481，apply_patch契约24106起。实际CLI目录/工具能力优先于对API上限或历史文档的推测。

## 文件与恢复

- 本机：`~/.codex/config.toml`、`astra.config.toml`、`sol.config.toml`、`AGENTS.md`、8份Reviewer描述（其中3份补影响检查）、4份skill入口、10份hook及共用适配器/测试。
- 标准仓：Harness standard/policy、前端UI标准、ADR-008/014/036、本目录报告与进度记录。
- 私有备份：`~/.codex/backups/20260907-astra-audit/`，目录权限0700；`manifest.json`和`hooks-before/manifest.json`记录原路径与SHA256。原配置、原hook和诊断原始输出只保留本机，不入公开仓。
- 恢复按清单逐文件比较后恢复，避免覆盖备份之后的其它会话改动；删除新增profile前先确认未被使用。不一键覆盖整个Codex目录，不恢复已取消的CR强制策略。
- 模型/指令/agent/skill目录变更需新开CLI或新会话才能完整加载；现有会话不能声称已重载。
