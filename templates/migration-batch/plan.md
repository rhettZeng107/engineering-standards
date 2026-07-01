# Plan — <Migration Batch Title>

## Spec

`spec.md`

## Phase 0 — Baseline Lock

- Fill `migration.yaml`.
- Fill `source-inventory.json`.
- Fill `migration-matrix.json`.
- Run `codex-migration-audit gate --config migration.yaml`.
- Run `codex-migration-audit fields --config migration.yaml`.
- Run `codex-migration-audit vote --config migration.yaml`.
- Fill `local-verify.commands`.

## Phase 1 — STEP1 Baseline Migration

- Port legacy behavior to the new baseline.
- Keep old-to-new equivalence first; do not add STEP2 feature evolution here.
- Update matrix rows as evidence changes.

## Phase 2 — Verification

- Run build/test for touched repos.
- Run code review before commit.
- Run real UI E2E for cross frontend/backend paths.
- Run `codex-migration-audit verify --config migration.yaml`; only green local verification can be committed.

## Tasks

| ID | Task | Input | Output | Acceptance | Status |
|---|---|---|---|---|---|
| T0 | Lock migration config | `migration.yaml` | reviewed config | source/target paths valid | pending |
| T1 | Build source inventory | legacy source | `source-inventory.json` | all in-scope artifacts classified | pending |
| T2 | Build migration matrix | inventory + target code | `migration-matrix.json` | old-to-new mapping complete | pending |
| T3 | Run audit gates | config | `audit-report.*` | no untriaged blocking finding | pending |
