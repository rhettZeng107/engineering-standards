#!/usr/bin/env bash
# Migration audit pre-commit hard gate.
#
# Install by copying to .git/hooks/pre-commit and chmod +x, or call it from an
# existing pre-commit hook. Set MIGRATION_CONFIG to the active batch config.
#
# Example:
#   MIGRATION_CONFIG=docs/superpowers/specs/2026-07-xx-xxx-migration/migration.yaml git commit
#
# If MIGRATION_CONFIG is not set, the hook checks staged migration.yaml files.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TOOL="${MIGRATION_AUDIT_TOOL:-$HOME/Projects/engineering-standards/tools/migration-audit/codex-migration-audit.js}"

if [ ! -x "$TOOL" ]; then
  echo "[migration-audit] tool not executable: $TOOL" >&2
  exit 1
fi

configs=()
if [ -n "${MIGRATION_CONFIG:-}" ]; then
  configs+=("$MIGRATION_CONFIG")
else
  while IFS= read -r f; do
    [ -n "$f" ] && configs+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR | grep -E '(^|/)migration\.yaml$' || true)
fi

if [ "${#configs[@]}" -eq 0 ]; then
  exit 0
fi

for cfg in "${configs[@]}"; do
  case "$cfg" in
    /*) abs="$cfg" ;;
    *) abs="$ROOT/$cfg" ;;
  esac
  echo "[migration-audit] hard verify: $abs"
  "$TOOL" verify --config "$abs"
done
