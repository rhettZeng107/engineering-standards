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

# 3. CI/CD 监控脚本
cp "$TEMPLATES_DIR/cicd-ado-monitor.js" "$WS/docs/ops/cicd-ado-monitor.js"

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

echo "✓ 工作区骨架已建: $WS"
echo ""
echo "后续手动(bootstrap 指南 §3):"
echo "  1. 填 $WS/CLAUDE.md 的 <占位符>(交付线 / 双推 / 构建 / CI-CD / 测试环境)"
echo "  2. clone nested 项目仓到工作区,并写进 .gitignore"
echo "  3. 跑 /gsd-map-codebase 生成 .planning/codebase/ 项目地图(A1/B4 hook 的数据源)"
echo "  4. 配 CI/CD 流水线 + 接监控(docs/ops/cicd-ado-monitor.js;ADO_BASE/PAT 按需调)"
echo "  5. 老项目迁移工作区:按 legacy-migration-playbook 声明基线 + 产源工件清单"
