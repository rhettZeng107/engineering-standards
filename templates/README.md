# Templates — 跨项目共享模板

> 适用:SYSV2 + 后续新项目;复制即用,占位替换后落盘到目标项目对应位置
> 落地原则:同质问题不重复踩坑,新项目立项时引用模板

## 模板清单

| 模板 | 用途 | 目标位置 |
|---|---|---|
| `frontend-i18n-init.template.js` | React i18next 标准初始化(单 ns + cookie + zh-CN 强制 + useSuspense:false) | `<前端>/src/utils/i18n.js` |
| `frontend-env-production.template` | Vite 前端 production 环境变量 | `<前端>/.env.production` |
| `iis-web.config-spa-root.template.xml` | IIS SPA 主应用 web.config(含 inheritInChildApplications=false 防穿透) | `<前端>/public/web.config` |
| `iis-web.config-spa-subapp.template.xml` | IIS SPA 子应用 web.config(wujie 子 VDir 用) | `<子应用前端>/public/web.config` |
| `pipeline-pre-check.snippet.yml` | ADO pipeline pre-check YAML 片段 | `<项目>/azure-pipelines.yml` Stage 1 第 1 步 |
| `onprem-ssh-pubkey-install.ps1` | On-Prem 部署服务器为 Claude 装 SSH 公钥(管理员组;含 ACL 去 Authenticated Users 坑) | 服务器【管理员】PowerShell 执行(填本机 `~/.ssh/id_sys_deploy.pub`) |

## 关联标准

- `standards/frontend-i18n-standard.md` — i18n 完整规范
- `standards/frontend-ui-standard.md` — UI 完整规范
- `decisions/ADR-008-end-to-end-8-checks.md` — 端到端交付 8 项核对
- `docs/ops/deployment-ip-map.md` — IP 中心化表(SYSV2 项目内)
- `standards/onprem-server-ssh-ops-standard.md` — On-Prem 部署服务器 SSH 运维完整 SOP(ADR-043)

## 使用流程

1. 立项 / 新前端时,从本目录复制相关模板到目标位置
2. 按模板顶部注释替换 `{{占位符}}`
3. 提交时附:`Copy from engineering-standards/templates/<模板名> v<sha>` 备忘
4. 标准升级时 → 模板同步更新 + 通知各项目按需对齐

## 违反 = code-reviewer HIGH

不允许"我们项目特殊就不用模板" — 真有特殊需求,先在标准里加例外条款 + 提 ADR,再不走模板。
