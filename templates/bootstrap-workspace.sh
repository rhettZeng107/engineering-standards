#!/usr/bin/env bash
# 新工作区一键 bootstrap 脚手架(ADR-029 工作区治理三层模型)
#
# 作用:把「工作区层」的机械骨架一键搭好 —— 目录结构 + CLAUDE.md(待填占位)
#       + CI/CD 监控脚本 + git init。全局层与跨项目标准层无需操作(自动继承 / 引用)。
#
# 用法:  ./bootstrap-workspace.sh <工作区绝对路径>
# 示例:  ./bootstrap-workspace.sh ~/Projects/SRMV2
#
# 搭完后仍需手动:填 CLAUDE.md 占位 / clone nested 项目仓 / 跑 /gsd-map-codebase 生成项目地图。

set -euo pipefail

TEMPLATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="${1:-}"

if [ -z "$WS" ]; then
  echo "用法: $0 <工作区绝对路径>"
  echo "示例: $0 ~/Projects/SRMV2"
  exit 1
fi
WS="${WS/#\~/$HOME}"
if [ -e "$WS" ]; then
  echo "✗ 目标已存在,中止(不覆盖): $WS"
  exit 1
fi

# 1. 目录骨架
mkdir -p "$WS"/docs/superpowers/{specs,plans,backlog,_archive} \
         "$WS"/docs/decisions \
         "$WS"/docs/ops \
         "$WS"/.planning/codebase

# 2. CLAUDE.md 模板(待填占位)
cp "$TEMPLATES_DIR/workspace-CLAUDE.md.template" "$WS/CLAUDE.md"

# 2b. QWEN.md 模板(给 qwen CLI 的项目上下文,待填占位)— ADR-029 + qwen-frontend-default 沉淀
cp "$TEMPLATES_DIR/workspace-QWEN.md.template" "$WS/QWEN.md"

# 3. CI/CD 监控脚本 + 跨项目运维基线(SYSV2 沉淀,新工作区开箱即有)
#    含:监控(monitor/self-heal/failure-notify)+ 凭据外部化 + IP 中心表
#      + 部署手册(IIS 建站 / Agent VM / pipeline 模板)— 新工作区适配自身 IP/站点名后即可照搬部署
cp "$TEMPLATES_DIR/cicd-ado-monitor.js" "$WS/docs/ops/cicd-ado-monitor.js"
for f in cicd-self-heal-sop.md credential-injection.md cicd-ado-monitor.md cicd-ado-failure-notification.md deployment-ip-map.md \
         cicd-iis-server-setup.md cicd-agent-vm-setup.md cicd-sys-pipeline-draft.md; do
  cp "$TEMPLATES_DIR/docs-ops-baseline/$f" "$WS/docs/ops/$f"
done

# 3b. IIS web.config 模板(子应用部署两种模式)
#     spa-root  = external 独立站点(base='/',如 SRM Contract);spa-subapp = shared_iis 子 VDir(base='/<app>/',如 MDM)
cp "$TEMPLATES_DIR/iis-web.config-spa-root.template.xml"   "$WS/docs/ops/iis-web.config-spa-root.template.xml"
cp "$TEMPLATES_DIR/iis-web.config-spa-subapp.template.xml" "$WS/docs/ops/iis-web.config-spa-subapp.template.xml"

# 3c. 子应用迁移/接入前置自检(ADR-012 SOP,SRMV2 Contract 踩坑沉淀:每菜单同页/网络异常/假 E2E)
#     checklist 复制到工作区;guard hook 确保装在全局 ~/.claude/hooks(所有工作区共享,机械拦 baseURL/postMessage 漏)
cp "$TEMPLATES_DIR/subapp-migration-checklist.md" "$WS/docs/ops/subapp-migration-checklist.md"
GUARD_DST="$HOME/.claude/hooks/subapp-frontend-guard.js"
if [ ! -f "$GUARD_DST" ]; then
  mkdir -p "$HOME/.claude/hooks"
  cp "$TEMPLATES_DIR/hooks/subapp-frontend-guard.js" "$GUARD_DST"
  echo "  ⚠ 已装 subapp-frontend-guard.js → ~/.claude/hooks/;请在 ~/.claude/settings.json 的 PostToolUse 接线(matcher Edit|Write|MultiEdit → node ~/.claude/hooks/subapp-frontend-guard.js)"
fi

# 4. .gitignore(容器仓:排除 .mcp.json + nested 项目仓)
cat > "$WS/.gitignore" <<'EOF'
# MCP 配置含密码,永不入库
.mcp.json
# nested 项目仓各自独立 git,在此逐个排除(bootstrap 后按实际补):
# <nested-repo-1>/
# <nested-repo-2>/
EOF

# 5. git init(workspace 容器仓)
( cd "$WS" && git init -q )

# 6. memory 索引初始化 ─ 从 MEMORY.md.template 实例化(D2,2026-05-20)
WS_NAME="$(basename "$WS")"
WS_USER="$(id -un | sed 's/[^a-zA-Z0-9]/_/g')"
MEM_DIR="$HOME/.claude/projects/-Users-${WS_USER}-Projects-${WS_NAME}/memory"
mkdir -p "$MEM_DIR"
if [ ! -f "$MEM_DIR/MEMORY.md" ]; then
  sed "s/{{WORKSPACE_NAME}}/$WS_NAME/g" "$TEMPLATES_DIR/MEMORY.md.template" > "$MEM_DIR/MEMORY.md"
  echo "  - memory/MEMORY.md(从模板实例化,$WS_NAME)"
fi

echo "✓ 工作区骨架已建: $WS"
echo "  - CLAUDE.md / QWEN.md(待填占位)"
echo "  - docs/ops/ 监控+凭据+IP表:{cicd-ado-monitor.js,cicd-self-heal-sop.md,credential-injection.md,cicd-ado-monitor.md,cicd-ado-failure-notification.md,deployment-ip-map.md}"
echo "  - docs/ops/ 部署手册:{cicd-iis-server-setup.md,cicd-agent-vm-setup.md,cicd-sys-pipeline-draft.md}"
echo "  - docs/ops/ web.config 模板:{iis-web.config-spa-root(external),iis-web.config-spa-subapp(shared_iis)}"
echo "  - docs/ops/subapp-migration-checklist.md(子应用迁移前置自检)+ subapp-frontend-guard.js(全局 hook,机械拦 baseURL/postMessage 漏)"
echo ""
echo "后续手动(bootstrap 指南 §3):"
echo "  1. 填 $WS/CLAUDE.md 与 $WS/QWEN.md 的 <占位符>(交付线 / 双推 / 构建 / CI-CD / 测试环境 / qwen 边界)"
echo "  2. clone nested 项目仓到工作区,并写进 .gitignore"
echo "  3. 跑 /gsd-map-codebase 生成 .planning/codebase/ 项目地图(A1/B4 hook 的数据源)"
echo "  4. 配 CI/CD 流水线 + 接监控(docs/ops/cicd-ado-monitor.js + 自治修复 SOP 已在;ADO_BASE/PAT 按需调)"
echo "  5. 老项目迁移工作区:按 legacy-migration-playbook 声明基线 + 产源工件清单"
echo "  6. 后续 memory 沉淀按 standards/memory-maintenance-standard.md 规范"
