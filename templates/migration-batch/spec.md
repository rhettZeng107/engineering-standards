# <Migration Batch Title>

## Baseline

- Workspace: `<workspace>`
- Legacy source: `<legacy repo/path + branch/ref>`
- Target frontend: `<target frontend repo/path>`
- Target backend: `<target backend repo/path>`
- Runtime baseline: `<backend/runtime + frontend/toolchain>`
- Source decision evidence: `<file:line / git ref / command>`

## Scope

### In

- `<module/page/API/menu>`

### Out

- `<explicit exclusions>`

## Source Inventory

See `source-inventory.json`.

## Migration Matrix

See `migration-matrix.json`.

## Acceptance

- Source inventory has no unreviewed legacy artifact in scope.
- Migration matrix has no open `CRITICAL` or `HIGH` gap.
- `codex-migration-audit gate` is green or every finding is recorded in the matrix.
- `codex-migration-audit fields` is green or every field gap is recorded in the matrix.
- Baseline vote has no `disputed` item before baseline lock.
- `local-verify.commands` includes touched repo build/test/E2E commands and `codex-migration-audit verify` passes before commit.
- Commit triggers CI/CD E2E; failed CI enters self-heal before delivery closure.
