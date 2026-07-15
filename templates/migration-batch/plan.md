# Plan — <Migration Batch Title>

## Spec

`spec.md`

## Phase 0 — Baseline Lock

- Keep the program objective in `spec.md`; use the active Codex Goal only for this baseline-lock milestone.
- Fill `migration.yaml`.
- Fill `source-inventory.json`.
- Fill normalized page, UI, API, field, service, menu, shell, and integration contracts from `contract-index.json`.
- Fill `migration-matrix.json`.
- Close every row's eight `dimensionCoverage` entries; silent omission is not allowed.
- Run independent enumeration, frontend/backend ownership, shell/layout, menu/page/backend, source-degradation, and current-new-only sweeps; record evidence and resolved gaps in `completeness-sweep.json`.
- Run completeness critic until the final two consecutive rounds have no new gaps, missed dimensions, mid-state modules, or unverified completion claims.
- Run `codex-migration-audit contract --config migration.yaml` until referential integrity is green.
- Run `codex-migration-audit completeness --config migration.yaml` until the sweep hard gate is green.
- Run `codex-migration-audit fields --config migration.yaml`.
- Run `codex-migration-audit vote --config migration.yaml`.
- Run `codex-migration-audit lock --config migration.yaml`; do not start STEP1 until `baseline-lock.json` exists and is current.

## Phase 1 — STEP1 Baseline Migration

- Port legacy behavior to the new baseline.
- Keep old-to-new equivalence first; do not add STEP2 feature evolution here.
- Keep the locked contract matrix stable; update implementation evidence in `migration-progress.json`.

## Phase 2 — Verification

- Run build/test for touched repos.
- Run code review before commit.
- Run real UI E2E for cross frontend/backend paths.
- Mark every batch row `verified` in `migration-progress.json` with evidence.
- Run `codex-migration-audit verify --config migration.yaml`; only green local verification can be committed.

## Tasks

| ID | Task | Input | Output | Acceptance | Status |
|---|---|---|---|---|---|
| T0 | Lock migration config | `migration.yaml` | reviewed config | source/target paths valid | pending |
| T1 | Build source inventory | legacy source | `source-inventory.json` | all in-scope artifacts classified | pending |
| T2 | Build normalized contracts | inventory + source/target code | `contract-index.json` and contract files | page/API/field/service/menu relations are complete | pending |
| T3 | Build migration matrix | inventory + normalized contracts | `migration-matrix.json` | every artifact and contract has a locked target decision | pending |
| T4 | Lock baseline | spec + contract + completeness sweep + field diff/coverage + votes | `baseline-lock.json` | no draft/disputed/unreferenced item and two dry critic rounds | pending |
| T5 | Run implementation gates | config + progress | `audit-report.*` | no untriaged blocking finding | pending |
