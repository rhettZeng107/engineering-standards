# Astra High 本机 Codex 环境优化

状态：complete。用户要求：按 GPT-6 Astra High 与当前 OpenAI 官方实践检查并优化 CLI、agent、skill、MCP、hook、插件和全局流程，保留完整业务验证能力。

用户新增拍板（执行中立即登记）：复杂任务默认 `gpt-6-astra` / `high`；其它任务使用 Sol。Sol强度沿用现有常规工作High；确定性检查仍由工具执行。覆盖本次尚未完成的“所有工作统一继承Astra”候选，继续当前配置/规则修复节点，不中断hook兼容工作。验证必须区分CLI启动默认、任务profile与agent继承，不声称提示文字能热切换运行中的主会话。

用户新增拍板：hook以官方逻辑为准。`apply_patch`静默跳过是本地旧输入处理问题的实证描述，不把它当作Astra缺陷；实现须遵从官方tool_name/tool_input.command、matcher别名、JSON阻断与additionalContext契约，避免另造与原生流程冲突的门禁。

用户新增需求：分析HC工作区近两天MDM页面字段精简/优化后，DTO、前后端逻辑、按钮路由异常与多次部署返工的根因；减少形式化独立Reviewer但提高CR质量。页面字段变更必须进行字段级影响检查，覆盖关联兄弟页面、对应DTO及前后端逻辑一致性。追加到当前hook修复节点后：先只读复核HC近期实际代码/提交/验收记录，再将可防低级错误的CR及验证要求落到最窄全局标准/skill，并以本次案例检验。未授权改HC业务或部署。

用户新增确认：涉及页面调整时，CR要覆盖当前全部相关的联查依赖请求、字段联动、空值、回显、保存约束，并联查后端/DTO。合并到第7项的页面影响检查，按受影响页面完整依赖链枚举，退役字段依赖和失败传播也必须检查；不能只看新增/修改代码行。

用户新增格式约束：以上页面CR要求使用专业术语压缩写入全局AGENTS.md，控制全局文档行数；全局保留触发/质量边界和指针，字段矩阵、检查细则、HC案例保留在ADR/标准/报告，不把长SOP复制进全局入口。

## Plan

用户后续确认（2026-09-07）：落实“一个业务批次、一份精简任务记录、一次最终验收”，减少形式评审及重复文档/测试，后续5–10个可比批次观察效果。全局/首页规则、ADR及skill已收敛，SYSV2即时文档推送冲突已修正；实现与本机原生加载验证complete，交付Git状态以本机`~/.codex/backups/20260907-workflow-pilot-212400/`外部回执及独立Git核验为准，不再为回填hash产生收尾提交。业务试行状态pending-samples，效果尚未验证；新增样本在原业务记录关闭时记一次，本次治理不计入业务样本。

用户追加：分析并优化相关Skills是否加载过多；统计目录元数据与正文按需加载，定向处理工作流重复入口、过宽触发和旧流程冲突。保留能力与恢复路径，不因未见使用即删技能。

1. covered：刷新官方 manual；确认 CLI 0.153.4、默认 gpt-6-astra/high；标准仓 master 干净，SYSV2 既有三份 auth-bridge 文档改动不属于本批。
2. covered：有效模型目录、指令/技能/agent继承、MCP/插件原生加载、hook信任已检查；automation仅模板，无注册实证。
3. covered：备份后落实复杂Astra High、其它Sol High；清理强制独立评审冲突，定向禁用2个错误skill，保留功能入口。
4. covered：严格配置、原生config/skills/hooks/MCP接口与两个profile推理验证通过；hook15/15及历史CR24/24通过；staged脱敏扫描与自查完成，内容提交4a08485已推送并独立验证HEAD/upstream/远端一致。
5. covered：报告已记录官方依据、处理/保留/未验范围与恢复路径；交付状态最后更新。
6. covered：10个文件hook原生apply_patch兼容；不改hook定义/trust/原规则，不能重建时明确未验，继续检查其它独立文件。13类原生差异验证通过。
7. covered：HC R80只读取证，字段—依赖—DTO/映射—兄弟页面—按钮状态矩阵与部署前验收要求落ADR-008；Reviewer/skill同步。未修HC业务/未部署；新规则后续真实交付效果未验证。

## 边界

- 不改项目业务文件、不写生产DB、不发送对外消息、不改memory、不删除历史会话。
- 不因新模型升级盲目放大上下文/并发、开启实验特性或删除低频工具。
- 用户已取消强制独立Reviewer；保留主会话自查、build/test、真实UI语义验收、凭证及部署边界。
- 标准仓唯一远端origin（GitHub）；本机私有配置与备份不进入公开仓。

## 已有证据

- method=CLI：`codex --version` => 0.153.4；`codex --strict-config doctor --json`配置/安装/鉴权/网络/DB完整性正常；历史索引1条缺文件警告，未修改历史DB。
- method=file：`~/.codex/config.toml` 默认 gpt-6-astra / high；无context/auto_compact硬覆盖。
- method=rg：全局AGENTS与enterprise-ai-coding-harness仍硬路由Sol/Terra；AGENTS第3行取消独立评审但后续章节保留回执强制流程。
- 官方manual：2026-09-07刷新；Best practices 1788–2019、Multi-agent 2020–2457、config 11436–11960、hooks 23366–24481、MCP 25581–25995。

## 验证快照

- CLI：0.153.4，strict-config doctor除1条历史索引缺文件警告外正常；有效model=Sol/high。
- runtime：sol/astra两次隔离只读exec均ROUTE_OK，启动诊断确认正确model/high；未靠模型自报身份。
- 原生接口：skills186/启用184/错误0；hooks34/启用30/全部trusted/错误0；MCP已发现SQL/官方文档/浏览器/Context7/apps工具。
- hook：主会话复放15/15，13类候选与本机原生结果相同；旧CR24/24，三个handler仍禁用。
- review：hook定向技术检查发现1HIGH并回修，定向复核无剩余HIGH；这是当前runtime要求，不恢复本地强制Reviewer。
- 文档：全局AGENTS 185→183行、16846→16811字节，详细字段依赖SOP集中ADR-008。
- HC：仅git/rg静态及现有现场记录，未运行HC测试/访问远程/修改业务。

交付：内容提交`4a08485`已完成pull/rebase、push及独立HEAD/upstream/ls-remote一致验证；GitHub 22端口瞬断后本次命令改走SSH443成功，未永久修改SSH或remote配置。仓库无配置CI工作流，本次不涉及业务部署。此收尾记录另作文档提交，最终哈希以git及会话交付回执为准。

后续：新CLI/会话加载新规则；HC仍需在原任务中按字段依赖矩阵完成真实页面验收。本次不自动恢复HC部署。其它保留限制见report.md。
