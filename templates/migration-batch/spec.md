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

Normalized page, UI-function, API, field, service, menu, shell, and integration contracts are declared by `contract-index.json`. Implementation state is stored separately in `migration-progress.json` so progress updates cannot silently rewrite the locked baseline.

`spec.md` itself is a baseline-lock input. Any scope, runtime, toolchain, or source decision change invalidates the lock and requires review plus an explicit re-lock.

## Acceptance

- Source inventory has no unreviewed legacy artifact in scope.
- `codex-migration-audit contract` proves unique IDs, complete old-to-new coverage, valid references, and no draft/disputed contract.
- `codex-migration-audit completeness` proves all required sweep dimensions completed with evidence, all discovered gaps resolved, and the final independent critic round dry. If a critic finds a new gap or the source/contract changes, resolve it and run another focused critic round.
- Every matrix row closes pages, UI functions, APIs, fields, services, menu/routes, shell features, and integrations as covered or evidenced N/A.
- Migration matrix has no open `CRITICAL` or `HIGH` gap.
- `codex-migration-audit gate` is green or every finding is recorded in the matrix.
- `codex-migration-audit fields` is green or every field gap is recorded in the matrix.
- Deterministic failures block directly without voting. Baseline vote is required only for high-impact, non-deterministic judgments and has no `disputed` item before baseline lock.
- `codex-migration-audit lock` locks the spec, completeness sweep, normalized contracts, field coverage (including each per-entry coverage file), and risk votes; STEP1 does not start while the lock is absent or stale.
- Final verification requires every `migration-progress.json` row to be `verified` with evidence and no open gap.
- `local-verify.commands` includes touched repo build/test/E2E commands and `codex-migration-audit verify` passes before commit.
- Commit triggers CI/CD E2E; failed CI enters self-heal before delivery closure.
