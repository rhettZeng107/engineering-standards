# SYSV2 部署 IP 中心化表

> 真理源:所有项目 appsettings.* / .env.production / pipeline yaml / web.config 引用的 IP 在此一处对账
> 维护:任何 IP 调整(新增 / 迁移 / 退役)必须先改本表 + 通知影响的项目同步;违反 = code-reviewer HIGH
> 关联:`docs/ops/cicd-iis-server-setup.md` / `docs/ops/cicd-agent-vm-setup.md` / [P2-1 模板](../../../engineering-standards/templates/)

## 当前 IP 分布(2026-05-14)

| IP | 角色 | 用途 | 端口 | 关联项目 / 配置文件 |
|---|---|---|---|---|
| **172.21.10.8** | **IIS Web 服务器** | SYSV2 所有前后端 production 部署 | 8001 / 8002 / 8003 / 5026 / JYCoreSysWebApi | 全部 `.env.production` `VITE_APIHOST` + appsettings JWT issuer / CORS |
| **172.21.10.26** | **SQL Server**(测试库) | `ExtendLibrary` / `Supplier_Platform` 等业务数据库 | 1433 | 全部 `appsettings.*.json` `ConnectionStrings`;`mssql-test` MCP 也指此 |
| **172.21.10.15** | **ADO Self-hosted Agent VM** | CI/CD pipeline 执行节点 | 8080 / agent listener | ADO Server 控制 |
| **172.21.10.30** | **ADO Server**(JYDevOps) | git origin + pipeline 编排 | 8090 (HTTP) | 全部 nested repo `origin` remote |
| **172.21.10.22** | **Consul** | 服务注册发现 | 8500 (HTTP UI) / 8300-8302 | 各微服务 `appsettings:Consul:Address` |
| **172.21.10.20** | **Gitea 老仓库** | 一体仓老代码归档参考源 `tlzbp/<项目>` | 4000 (HTTP) | 只读引用,不再 push |

## 退役 / 严禁使用的 IP

| IP | 原用途 | 退役日期 | 教训 |
|---|---|---|---|
| **172.21.10.18** | 旧 SRM 测试 DB(`Supplier_Platform`) | 2026-05-14 | MDM `appsettings.json` srm 连接串误留 10.18 → ScmServer linked server 500 / 供应商列表空。修法:统一改 10.26 |

## 端口分配约定(10.8 IIS 上)

| 端口 | 项目 | 站点路径 | 主 application | 子 application |
|---|---|---|---|---|
| 8001 | SYS.3 控制台 | SYS3-Console/ | SYS.3 前端(Vite) | JYCoreSysWebApi(SYS 后端) |
| 8002 | BP 业务门户 | BusinessPortal/ | BP 前端(Vite) | MDM/(MDM 前端 wujie 子 VDir) |
| 8003 | AP 审计门户 | AuditPortal/ | AP 前端(Vite) | — |
| 5026 | MDM 后端 WebApi | MDMWebApi/ | MDM 后端(.NET 8) | — |

## 已知踩坑案例(防 ChatGPT/Claude 重复犯)

1. **MDM srm IP 10.18 残留**(2026-05-14): `appsettings.json` + `appsettings.JingYan.json` srm 连接串没改,导致 `supplierlabel/GetSupplierLabel` 报 ScmServer linked server。修法 = 中心化对账(本文档)+ pre-check 静态校验
2. **localhost 写入 production**: SYS.3 早期 `.env.production` 没建,Vite 默认走 `http://localhost:<dev port>` → 10.8 部署后登录 fail。修法 = `engineering-standards/templates/frontend-env-production.template` 强制
3. **客户简称误改**: 之前误把"景颜"标为客户,实际是本公司。客户码表见 `engineering-standards/references/customer-codes.md`

## 配置文件清单 — 引用 IP 的所有文件(按变更影响面)

> 改 IP 时按此清单逐项扫,grep 全 SYSV2 + engineering-standards 仓:`grep -rn "172\.21\.10\." --include='*.json' --include='*.env*' --include='*.config' --include='*.yml' --include='*.md'`

| 配置类别 | 文件 glob | 关键 key |
|---|---|---|
| 前端环境 | `<前端>/.env.production` | `VITE_APIHOST` / `VITE_Url` |
| 后端 appsettings | `<后端>/appsettings.*.json` | `ConnectionStrings:*` / `JWT:Issuer` / `Cors:Origins` / `Consul:Address` |
| IIS web.config | `<前端>/public/web.config` | 跨域 / API 反代规则(若有) |
| Pipeline YAML | `<项目>/azure-pipelines.yml` | `deployTargetHost` / `deployTargetPath` |
| 部署手册 | `docs/ops/cicd-*.md` | IIS / Agent / Pipeline 章节 |
