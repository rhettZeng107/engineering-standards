#!/usr/bin/env bash

set -euo pipefail

STANDARDS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT
TEST_HOME="$TEST_ROOT/home"
mkdir -p "$TEST_HOME"

HOME="$TEST_HOME" "$STANDARDS_ROOT/templates/bootstrap-workspace.sh" "~/workspace" >/dev/null
test -f "$TEST_HOME/workspace/AGENTS.md"
test ! -e "$TEST_HOME/workspace/CLAUDE.md"
for dir in decisions runbooks tasks; do
  test -d "$TEST_HOME/workspace/docs/$dir"
done
test ! -e "$TEST_HOME/workspace/.planning"
test ! -e "$TEST_HOME/workspace/docs/superpowers"
test ! -e "$TEST_HOME/workspace/docs/ops"
test -z "$(find "$TEST_HOME/workspace/docs" -type f -print -quit)"
grep -Fx 'docs/runbooks/ci-watch/' "$TEST_HOME/workspace/.gitignore" >/dev/null

mkdir -p "$TEST_HOME/existing"
printf 'preserve\n' > "$TEST_HOME/existing/marker"
if HOME="$TEST_HOME" "$STANDARDS_ROOT/templates/bootstrap-workspace.sh" \
  "$TEST_HOME/missing/../existing" >/dev/null 2>&1; then
  echo "Expected traversal target rejection." >&2
  exit 1
fi
test "$(cat "$TEST_HOME/existing/marker")" = "preserve"
test ! -e "$TEST_HOME/existing/AGENTS.md"

if "$STANDARDS_ROOT/templates/bootstrap-workspace.sh" "$TEST_HOME/workspace" >/dev/null 2>&1; then
  echo "Expected existing-target rejection." >&2
  exit 1
fi
ln -s "$TEST_ROOT/missing-target" "$TEST_HOME/dangling"
if "$STANDARDS_ROOT/templates/bootstrap-workspace.sh" "$TEST_HOME/dangling" >/dev/null 2>&1; then
  echo "Expected dangling-symlink rejection." >&2
  exit 1
fi
test ! -e "$TEST_ROOT/missing-target"

EXTERNAL_GIT="$TEST_ROOT/external.git"
GIT_DIR="$EXTERNAL_GIT" HOME="$TEST_HOME" \
  "$STANDARDS_ROOT/templates/bootstrap-workspace.sh" "$TEST_HOME/git-env-workspace" >/dev/null
test -d "$TEST_HOME/git-env-workspace/.git"
test ! -e "$EXTERNAL_GIT"

echo "Engineering bootstrap tests passed."
