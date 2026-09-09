# 全局标准与初始化同步

## 范围与状态

- 授权：更新过时全局工程标准、工作区初始化 Skill 和团队 Starter Kit。Memory 生成文件不动。
- 新增需求：初始化不再采用 GSD/superpowers 默认目录；先评估中性目录，已有工作区不批量搬迁。
- 实施与验证状态：complete；范围内入口、标准、模板、脚本及测试已同步。Git 同步状态必须单独查各远端，本文不是 push 成功凭证。
- 保留：完整业务范围、真实字段闭环、迁移机器门、授权边界、项目真理源/分支/环境/交付顺序及批准的例外。
- 不做：业务代码、DB、部署、模型配置、hook 行为和历史证据改写。

## Preflight

| 落点 | 分支/远端 | 开工状态 | 验证 |
|---|---|---|---|
| engineering-standards | master / origin | clean | 文档一致性、链接、bootstrap smoke、diff |
| team-engineering-starter-kit | main / github + origin | clean | validate-kit、bootstrap/installer/validation/hooks smoke、模板一致性 |
| ~/.agents/skills/workspace-bootstrap | 非 Git 目录 | 单文件已读 | quick_validate、与标准一致性 |

## 实证与方案

- Bootstrap guide、模板及本机/团队 Skill 仍要求独立 critic、第二审或地图 15 天提醒；改为主会话最终差异自查，独立 Reviewer 仅用户点名，地图按需。
- Memory 标准及可选模板仍要求默认初始化和置顶规则；改为偏好、规则索引、历史证据，并区分提交输入与生效。本批仅改标准/模板。
- 迁移手册重复旧 critic 流程；改为主会话反例检查与高影响两证据核对，保留机器 schema 字段及真实证据要求。
- 项目模板补唯一接续入口及按批次的交付顺序，未知项不猜、无远端仅本地提交。
- ADR 历史不删除；添加当前口径导航。
- 目录已获用户批准：docs/decisions、docs/runbooks、docs/tasks；按任务需要创建 spec/plan/progress，不默认建地图或空任务文件。仅用于后续新工作区，已有工作区不搬迁、不更新布局。

## 官方依据（2026-09-09 核对）

- https://developers.openai.com/codex/guides/agents-md — 就近指令与分层；nested 独立仓需核对真实加载链。
- https://developers.openai.com/codex/skills — 精确触发、按需加载与自包含安装包。
- https://learn.chatgpt.com/docs/customization/memories — 生成式召回不是强制政策，后台生成不是立即生效。

## 验证证据

- 先补新目录测试，两个旧 bootstrap 测试退出 1；修改脚本后 `bash tools/bootstrap-workspace.test.sh`、Kit 的 `bash tests/bootstrap-smoke.sh` / `bash tests/installer-smoke.sh` 均通过。
- 新生成目录只有 docs/decisions、docs/runbooks、docs/tasks；无 `.planning`、superpowers、docs/ops 或空任务文件；安装后 Skill 也独立验证同样产物。
- 保留已有目标拒绝、路径穿越拒绝、悬空符号链接拒绝、GIT_DIR 重定向防护。脚本 shell syntax 通过。
- Kit 的 `scripts/validate-kit.sh`、`tests/validation-smoke.sh`、`tests/hooks-smoke.sh` 均通过；本机 workspace-bootstrap、Kit 两个相关 Skill 的 quick_validate 均通过。
- quick_validate 首次因全局 Python 无 PyYAML 无法启动；在临时 venv 安装依赖后通过，未改全局 Python。
- `node tools/migration-audit/codex-migration-audit.test.js` 通过；未改机器字段、判定器或 hook 行为。
- 两仓变更 Markdown 检查 42 个相对链接，无新增断链；`git diff --check` 通过。主会话核对最终差异、完整性和授权边界。
- fetch 后 standards HEAD 与 origin/master、Kit HEAD 与 github/main/origin/main 均无分歧；提交后再执行 pull/rebase/push 和远端 hash 独立核验。

## 后续边界

只观察后续新工作区的初始化结果；不自动重构已有业务工作区目录。本机 Skill 非 Git 文件，已落盘验证；两个发行仓分别提交同步。最终 hash 查 Git，不为记录 hash 递归提交。Memory 正文仍未处理，不将标准更新当 Memory 生效。
