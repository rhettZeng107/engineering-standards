# Monthly AI Coding Workflow Review

> Use once per calendar month. Aggregate mechanically first; use model or human judgment only for classification, causal interpretation, and recommendations.

## Metadata

- Month: `<YYYY-MM>`
- Review window: `<from> .. <to>`
- Business timezone: `<+HH:MM|-HH:MM>`
- Workspaces included: `<list>`
- Run-record sources: `<paths/count>`
- Eval sources: `<paths/count>`
- Incident/late-finding sources: `<paths/count>`
- Missing or incomparable data: `<list>`
- Deterministic aggregate: `<command/output path>`

## Data quality

| Check | Result | Evidence |
|---|---|---|
| Required run-record fields present | pass/fail | |
| `unknown/not_applicable/not_required/blocked/not_evaluable` preserved | pass/fail | |
| Duplicate/replayed runs removed | pass/fail | |
| Evidence paths resolvable | pass/fail | |
| HIGH escape observation boundaries present | pass/fail | |

Do not calculate a rate from a denominator dominated by unknown or not-applicable records. Report the coverage gap instead.

## Metrics by task class

Keep simple, standard, migration, DB/auth, and E2E-heavy rows separate.

Use outcome order `C/P/B/X/U = complete/partial/blocked/cancelled/unknown`. Calculate completion rate as `C / (C+P+B+X)`; exclude `U` from the denominator and show it explicitly.

| Task class | Runs | Outcome C/P/B/X/U | Completion rate | First-pass CR | Review rework | Verification rework | E2E product rework | E2E env failures | Rebaseline | HIGH escapes | Observation boundary |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| simple | | | | | | | | | | | |
| standard | | | | | | | | | | | |
| migration | | | | | | | | | | | |
| DB/auth | | | | | | | | | | | |
| E2E-heavy | | | | | | | | | | | |

Token, cost, and latency are optional. Include them only when the runtime captured them automatically; never estimate them with another model call.

## Evidence-backed findings

| Finding | Evidence | Impact | Confidence |
|---|---|---|---|
| | | | high/medium/low |

## Rule decisions

| Rule/surface | Action | Evidence | Residual risk | Delta eval |
|---|---|---|---|---|
| | retain/optimize/move_to_mechanism/demote/remove | | | |

Rules with zero incidents are not removed on that fact alone. Safety, destructive production, auth, irreversible DB, and audit boundaries require positive evidence that an equal or stronger mechanism replaces them.

## One-change experiment

- Rule group to change: `<one attributable group or none>`
- Baseline report: `<path>`
- Planned adjustment: `<summary>`
- Targeted delta eval: `<task/path>`
- Success threshold: `<metric and threshold>`
- Rollback condition: `<condition>`

## Decision summary

- Retain:
- Optimize:
- Move to deterministic mechanism:
- Demote/remove:
- Data gaps to fix next month:
- Owner and next review date:
