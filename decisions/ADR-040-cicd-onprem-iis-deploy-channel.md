# ADR-040: 自托管 Agent → 内网 IIS 部署通道 — MsDepSvc 远程代理(弃 WMSvc Handler)

- **Status**: Accepted
- **Date**: 2026-06-17
- **Decider**: 涛哥
- **Scope**: 跨项目(SYSV2 6 仓 + MES 2 仓 + 未来 WMS / EAM / TPM 等所有「ADO 自托管 Agent → 内网 IIS」部署的项目)
- **配套 playbook**: [`standards/cicd-onprem-iis-deploy-standard.md`](../standards/cicd-onprem-iis-deploy-standard.md)

---

## Context

**拓扑**:ADO self-hosted Agent(VM,如 SYSV2 = `172.21.10.15`)与 IIS 部署目标(如 SYSV2 = `172.21.10.8`)是**两台不同机器**。Agent 不能本地拷文件,必须走**远程部署通道**。

**原通道**:Web Deploy 的 **WMSvc Handler** —— `https://<host>:8172/msdeploy.axd?site=<site>`,`authType=Basic`,IIS 集成、走非管理员委派。

**痛点实证(2026-06-16~17)**:排查 SYS 后端部署时,WMSvc 被注册表 / 证书误操作搞坏后 **`msdeploy.axd` 503 长期不可恢复**:
- 多日非破坏抢修(注册表 `WebManagement\Server` 重建、`SslCertificateHash` REG_BINARY 修复、证书私钥授权、`http.sys` urlacl `https://*:8172/`、Web Deploy 4.0 重装、`LocalAccountTokenFilterPolicy`)—— WMSvc 一度能 Running,但 **handler 层始终 503**。
- Web Deploy MSI 因收尾要启动 WMSvc 起不来而回滚(1603)。
- 结论:**WMSvc 是脆弱单点**,handler 层 503 后几乎不可恢复,且把部署通道与"IIS 管理服务"这条易坏链路强耦合。

**关键发现**:Web Deploy 有**两个**远程端点,彼此独立 —— WMSvc Handler(8172)与 **Remote Agent Service(MsDepSvc,:80 `/MsDeployAgentService`)**。实测 **WMSvc 死时 MsDepSvc 存活**。

**不做这条决策的代价**:每台部署目标机的 WMSvc 一旦坏,该项目 CI/CD 部署整条阻塞、且抢修成本无底;6+ 仓共用一台 IIS,影响面是环境级。

## Decision

**一句话**:「自托管 Agent → 内网 IIS」的部署通道统一走 **Web Deploy 远程代理服务 MsDepSvc**(`http://<host>/MsDeployAgentService` + `authType=NTLM` + 目标机**本地管理员**凭据),**不再依赖 WMSvc Handler(8172)**。

**要点**(完整配置 / yml 模板 / 排错见配套 playbook):
1. 端点 `http://<host>/MsDeployAgentService`,`authType=NTLM`。
2. 凭据 = IIS 目标机**本地管理员**账号(`<MACHINE>\<account>`),存 ADO 变量组 **secret**;前置 `LocalAccountTokenFilterPolicy=1`(工作组环境放行远程本地管理员的完整令牌)+ MsDepSvc 已装并 Running。
3. `-dest:contentPath` 用 **IIS 站点 / 应用路径**(`Site/SubApp` 或站点名),**禁用盘符物理路径** `C:\...` —— 远程代理会把冒号前盘符当站点名,报 `ERROR_SITE_DOES_NOT_EXIST`。
4. 保留 `-enableRule:AppOffline`(释放 in-process .NET DLL 锁)+ `-enableRule:DoNotDeleteRule`。

## Consequences

**正面**:
- 绕开脆弱的 WMSvc;部署通道与 IIS 管理服务解耦。
- MsDepSvc 以 LocalSystem 运行,部署权限充分,IIS 站点 / 子应用路径直接可写。
- 改动最小 —— 只换端点 + 认证方式,Build / Test / EF / Smoke 各步不变。

**负面 / 代价**:
- 需目标机有本地管理员账号 + `LocalAccountTokenFilterPolicy=1`(工作组场景)。
- NTLM 用本地管理员凭据,权限大于 WMSvc 委派账号 —— **测试环境可接受;生产部署需评估最小权限 / 专用部署账号**(记 backlog,不在本 ADR 默认范围)。
- ADO 变量组按**项目**隔离,每个项目的部署变量组都需补 `DEPLOY_ADMIN_USER` / `DEPLOY_ADMIN_PWD`。

**回滚**:WMSvc 若彻底修复可切回,但不建议(脆弱性未变)。

## Alternatives

| 方案 | 结论 |
|---|---|
| A. 继续修 WMSvc(8172) | 已多日证伪,handler 503 不可恢复成本无底 —— 弃 |
| B. SMB 文件直拷 + app_offline | 目标机防火墙 445 关闭(实测 `error 53 网络路径未找到`)+ 需共享 / 权限 —— 弃 |
| C. WinRM 远程执行本地 msdeploy | WinRM 服务在,但工作组 + 本地账号需 Agent 配 `TrustedHosts`,链路更长 —— 留作备选 |
| **D(选). MsDepSvc 远程代理** | 实测存活、改动最小、认证已验证 —— **采纳** |

**实证锚点**:
- 通道存活:Agent 上 `msdeploy -verb:dump ... :8172` = `503`;`http://<host>/MsDeployAgentService` = `401`(服务在)。
- 认证有效:`curl --ntlm -u '<MACHINE>\<account>:<pwd>' http://<host>/MsDeployAgentService` —— 错密码 `401` / 对密码 `500`(认证通过,GET 非 msdeploy 请求才 500)。
- 部署成功:`AI.Extend.SYS` pipeline #724 全绿(Build → Test → Deploy(MsDepSvc) → Smoke);`http://172.21.10.8:8001/JYCoreSysWebApi/swagger/index.html` = `200`。

参见 [[ADR-022]](CI/CD Monitor & Feedback)、[[ADR-024]](Plan E2E 分级 + CI/CD 接管)。
