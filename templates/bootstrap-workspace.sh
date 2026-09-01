#!/usr/bin/env bash
# Create a minimal Codex-first governance workspace.
# Never writes credentials, personal memory, hooks, skills, or runtime config.

set -euo pipefail

TEMPLATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_PATH="${1:-}"

if [ -z "$TARGET_PATH" ]; then
  echo "Usage: $0 <workspace-path>" >&2
  exit 1
fi

case "$TARGET_PATH" in
  "~") TARGET_PATH="$HOME" ;;
  "~/"*) TARGET_PATH="$HOME/${TARGET_PATH#\~/}" ;;
esac

case "$TARGET_PATH" in
  /*) ;;
  *)
    echo "Target must be an absolute path: $TARGET_PATH" >&2
    exit 1
    ;;
esac

case "/$TARGET_PATH/" in
  *"/../"*|*"/./"*)
    echo "Target must not contain . or .. path segments: $TARGET_PATH" >&2
    exit 1
    ;;
esac

TARGET_PARENT="$(dirname "$TARGET_PATH")"
TARGET_NAME="$(basename "$TARGET_PATH")"
if [ ! -d "$TARGET_PARENT" ]; then
  echo "Target parent must already exist: $TARGET_PARENT" >&2
  exit 1
fi
TARGET_PARENT="$(cd "$TARGET_PARENT" && pwd -P)"
TARGET_PATH="$TARGET_PARENT/$TARGET_NAME"

if [ -e "$TARGET_PATH" ] || [ -L "$TARGET_PATH" ]; then
  echo "Target already exists; refusing to overwrite: $TARGET_PATH" >&2
  exit 1
fi

mkdir "$TARGET_PATH"
mkdir -p \
  "$TARGET_PATH/docs/superpowers/specs" \
  "$TARGET_PATH/docs/superpowers/backlog" \
  "$TARGET_PATH/docs/superpowers/_archive" \
  "$TARGET_PATH/docs/decisions" \
  "$TARGET_PATH/docs/ops" \
  "$TARGET_PATH/.planning/codebase"

cp "$TEMPLATES_DIR/workspace-AGENTS.md.template" "$TARGET_PATH/AGENTS.md"

cat > "$TARGET_PATH/.gitignore" <<'EOF'
# Secrets and local runtime state
.env
.env.*
!.env.example
.mcp.json
*.pem
*.key
.codex/
.claude/
docs/ops/ci-watch/

# OS/editor
.DS_Store
Thumbs.db
.idea/
.vscode/

# Nested repositories are listed explicitly by each workspace:
# app-one/
# app-two/
EOF

(
  unset \
    GIT_DIR \
    GIT_WORK_TREE \
    GIT_COMMON_DIR \
    GIT_OBJECT_DIRECTORY \
    GIT_ALTERNATE_OBJECT_DIRECTORIES \
    GIT_INDEX_FILE \
    GIT_CEILING_DIRECTORIES \
    GIT_DISCOVERY_ACROSS_FILESYSTEM \
    GIT_CONFIG_PARAMETERS \
    GIT_CONFIG_COUNT
  git -C "$TARGET_PATH" init -q
)

if [ ! -d "$TARGET_PATH/.git" ]; then
  echo "Git initialization did not create an independent repository: $TARGET_PATH" >&2
  exit 1
fi

echo "Workspace created: $TARGET_PATH"
echo "Next: fill AGENTS.md placeholders, add nested-repo ignores, and record real verification commands."
