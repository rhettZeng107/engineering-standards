# Templates — 跨项目共享模板

> 适用:新工作区及已有工作区增量接入；按任务选模板，先核项目事实，不全量复制。
> 落地原则:同质问题不重复踩坑,新项目立项时引用模板

## 模板清单

| 模板 | 用途 | 目标位置 |
|---|---|---|
| `workspace-AGENTS.md.template` | 最小 Codex 项目特化指令模板 | `<工作区>/AGENTS.md` |
| `bootstrap-workspace.sh` | 新建最小治理工作区；不写个人 memory/凭据/hooks/全量 Skill | 新工作区初始化入口 |
| `ai-harness/repo-preflight.template.md` | 标准/迁移/跨仓/高风险任务 preflight | `<run-record-dir>/repo-preflight.md` |
| `ai-harness/run-record.template.json` | 有机器汇总消费者时才使用；不重复叙述 progress | `<run-record-dir>/run-record.json` |
| `MEMORY.md.template` | 明确授权后可选的人工召回索引；非默认初始化产物 | 项目明确指定的文档位置，非 Codex 生成目录 |
| `frontend-i18n-init.template.js` | React i18next 标准初始化(单 ns + cookie + zh-CN 强制 + useSuspense:false) | `<前端>/src/utils/i18n.js` |
| `frontend-env-production.template` | Vite 前端 production 环境变量 | `<前端>/.env.production` |
| `iis-web.config-spa-root.template.xml` | IIS SPA 主应用 web.config(含 inheritInChildApplications=false 防穿透) | `<前端>/public/web.config` |
| `iis-web.config-spa-subapp.template.xml` | IIS SPA 子应用 web.config(wujie 子 VDir 用) | `<子应用前端>/public/web.config` |
| `pipeline-pre-check.snippet.yml` | ADO pipeline pre-check YAML 片段 | `<项目>/azure-pipelines.yml` Stage 1 第 1 步 |
| `onprem-ssh-pubkey-install.ps1` | 已授权 On-Prem 服务器安装运维 SSH 公钥(管理员组;含 ACL 坑) | 服务器管理员 PowerShell；先确认目标与实际公钥路径 |

## 关联标准

- `standards/frontend-i18n-standard.md` — i18n 完整规范
- `standards/frontend-ui-standard.md` — UI 完整规范
- `decisions/ADR-008-end-to-end-8-checks.md` — 端到端交付 8 项核对
- `docs/ops/deployment-ip-map.md` — IP 中心化表(SYSV2 项目内)
- `standards/onprem-server-ssh-ops-standard.md` — On-Prem 部署服务器 SSH 运维完整 SOP(ADR-043)

## 使用流程

1. 新建工作区先运行 `bootstrap-workspace.sh`;已有工作区只做增量合并,禁止覆盖现有规则与用户改动
2. 立项 / 新前端时,从本目录复制相关模板到目标位置
3. 按模板顶部注释替换 `{{占位符}}`
4. 提交时附:`Copy from engineering-standards/templates/<模板名> v<sha>` 备忘
5. 标准升级时 → 模板同步更新 + 通知各项目按需对齐

## 适用边界

模板不是强制新增文件或独立 Reviewer 的理由。保留最近 AGENTS 中已批准的项目特化；模板不适配时记录差异，修改真实需要的部分。新的业务/授权边界歧义再提请决策，不为已有特化重复审批。
