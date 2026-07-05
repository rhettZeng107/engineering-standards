# Provider-neutral AI Coding Harness Standard

## Purpose

This standard defines a provider-neutral enterprise AI coding harness for projects that use AI agents to plan, edit, review, verify, recover, and audit engineering work.

Provider-neutral means the harness core is not owned by one runtime. Claude Code, Codex, CI, MCP tools, and future agents are adapters over the same policy, evidence, and gate model.

## Scope

Use this standard when a project needs:

- Multi-agent or AI-assisted coding governance.
- Evidence-first engineering claims.
- Reusable review, DB, E2E, git, and recovery gates.
- Cross-runtime migration between Claude, Codex, CI, and MCP tools.
- Auditable AI coding records.

This standard does not define customer-specific business logic, database credentials, production access, or compliance deep-review content.

## Architecture

```mermaid
flowchart TD
  A["Work request"] --> B["Harness Core"]
  B --> C["Policy"]
  B --> D["Knowledge"]
  B --> E["Evidence"]
  B --> F["Recovery"]
  B --> G["Evaluation"]

  C --> H["Runtime adapters"]
  H --> I["Claude"]
  H --> J["Codex"]
  H --> K["CI"]
  H --> L["MCP / tools"]
```

## Core Concepts

| Concept | Requirement |
|---|---|
| Policy | Track, risk, gates, authorization, and reporting rules must be written outside provider-specific hooks where possible. |
| Knowledge | ADR, standards, templates, tools, project instructions, and memory must have explicit precedence. |
| Evidence | Key claims must include method and anchor: file line, API, DB, git, build, test, browser, E2E, LSP, or text search. |
| Gates | Code review, secret scan, build/test, E2E, DB, production, and git gates must be triggered by risk. |
| Recovery | Multi-turn work must have a progress or run record that allows safe continuation. |
| Evaluation | Golden tasks and graders must measure harness quality over time. |
| Adapter | Runtime-specific automation must be thin and traceable to policy. |

## Operating Baseline v1

This baseline is the cross-workspace default for enterprise AI coding work. Project-level `AGENTS.md` files may specialize commands, repositories, credentials, and validation surfaces, but should not redefine the core model.

| Layer | Default |
|---|---|
| Main session | Owns requirement framing, source-of-truth decisions, plan/spec approval, risk escalation, review synthesis, and final acceptance. |
| Child execution | Uses CLI, `codex exec`, CI jobs, or bounded agents for implementation, logs, builds, tests, and structured audits. |
| Project instructions | Keep repo layout, commands, verification, and do-not rules near the code in `AGENTS.md`; avoid long SOPs. |
| Standards | Keep cross-project principles, reusable gates, templates, and evaluation rules in `engineering-standards`. |
| Skills | Keep repeated procedural workflows, especially migration, onboarding, BP auth/menu, CI triage, and harness audits. |
| Hooks/rules/CI | Enforce mechanical checks: secret scan, destructive command guard, pull-before-push, production write guard, migration verify, and review gates. |
| Memory | Helps recall preferences and pitfalls; it is never the only source for required policy or current facts. |

## Multi-Repo Preflight

Standard, migration, cross-repo, DB, auth, production, deployment, and long-running tasks must start with a workspace preflight before edits:

| Check | Evidence |
|---|---|
| Workspace root | `pwd` and expected workspace path. |
| Active repo | `git rev-parse --show-toplevel` from the target directory. |
| Repository role | root workspace, nested application repo, docs/standards repo, or external reference repo. |
| Remote and branch | `git remote -v`, `git status -sb`, and target branch. |
| Dirty state | local changes classified as user/Codex/generated/unknown before edits. |
| Instruction chain | nearest `AGENTS.md` plus relevant global/project standards. |
| Verification plan | build/test/E2E/DB/API/browser/CI commands that match the risk track. |

Do not claim commit, push, sync, deployment, or CI closure from the action command itself. Use independent verification commands.

## Project Map / Codebase

Keep `.planning/codebase/` when a workspace already uses it. It is a navigation and mechanism map, not the final source of current truth.

| Rule | Requirement |
|---|---|
| Role | Use the project map to understand topology, major mechanisms, risks, and likely source-of-truth files before standard, migration, or spec/plan work. |
| Boundary | Do not use stale project-map text as final evidence for key claims; verify against code, DB, API, build, browser, E2E, git, or LSP. |
| Staleness | Session-start time staleness reminder threshold is 15 days. If the map is stale or drifted and the current task touches that scope, refresh the affected map sections or explicitly record the staleness and residual risk. |
| Refresh | After substantial plan/spec/migration work, update affected maps only, preserve unrelated domains, update `MECHANISMS.md` for new mechanism knowledge, and stamp per-repo mapped heads in multi-repo workspaces. Do not rewrite the whole codebase map just because a reminder fired. |

## Code Navigation

Symbol-level code claims must use a semantic navigation adapter when the task risk warrants it.

| Query type | Default |
|---|---|
| C# class/method/property references, definitions, implementations, call chains, rename impact | Use an LSP adapter such as `lsp-nav` against the specific solution. |
| Cross-repository contract or migration analysis | Use bounded child execution or subagents per repository, with LSP where available and main-session synthesis. |
| Text, config, route strings, docs, SQL, JSON, comments, file discovery | Use text search. |
| Compiler correctness | Use the language build/test command, not LSP alone. |

If LSP is unavailable, use text search plus line reads and mark the evidence as `text_search`, not `lsp`; high-risk work should continue to a build/test or another semantic proof before claiming completion.

## Track Model

| Track | Trigger | Required Output |
|---|---|---|
| Simple | Small reversible edit with no contract, DB, auth, production, or cross-project risk | Evidence anchor, minimal change, minimal verification |
| Standard | Contract, DB schema, auth, multi-file, or business feature work | Plan, evidence, review gate, verification, run record when useful |
| Migration | Legacy modernization or functional skeleton migration | Source inventory, equivalence review, staged plan, E1/E2 or equivalent verification |

## Gate Model

| Gate | Trigger |
|---|---|
| Preflight | Standard, migration, cross-repo, DB, auth, production, deployment, or long-running task |
| Code review | Code or executable config changes before commit |
| Secret scan | Any staged change before commit |
| DB review | Schema, migration, SQL, data correction, or DB contract |
| Production guard | Any production write; destructive production operations require explicit human approval |
| E2E | Cross-frontend/backend, auth, menu, deployment, or UI workflow |
| Git verify | After commit and after push |
| Recovery | Multi-turn work, interruption, or resume command |

Gate results should be evidence records, not prose assertions. If a gate is intentionally skipped, record the reason, owner, and residual risk.

## Runtime Adapter Requirements

| Adapter | Required Behavior |
|---|---|
| Claude | May enforce gates via hooks and agents, but hooks must map back to policy. |
| Codex | Must execute gates explicitly through checklists and tools when automatic hooks are unavailable. |
| CI | Must map policy to deterministic checks and artifacts; start with dry-run before hard gates. |
| MCP / tools | Must expose narrow, auditable actions and clear outputs. |

## Codex Surface Model

Codex baselines should follow the official surface split. Repeated workflow should move to the narrowest durable surface that matches its scope instead of accumulating in chat or a single global instruction file.

| Surface | Use for | Avoid |
|---|---|---|
| Prompt/thread | One-off constraints, current task goals, temporary assumptions | Long-lived team rules |
| `AGENTS.md` | Durable repo/team conventions, commands, verification, review expectations, local overrides | Long SOPs, historical debates, generated logs |
| `~/.codex/config.toml` / project `.codex/config.toml` | Personal or project defaults: model, sandbox, MCP, features, instruction fallback, trusted repo behavior | Business rules or task-specific process |
| Skill | Repeated multi-step workflows, procedural standards, reusable scripts/references | Rules that must always load before every task |
| MCP / connector | Live external data/actions, private workspace systems, DB/API access with auditable outputs | Static knowledge that belongs in docs |
| Hook | Mechanical lifecycle gates: secret scan, commit guard, force-push block, production write guard | Complex judgment, noisy reminders, broad policy prose |
| Automation | Scheduled audits, recurring checks, long polling, stale-state reminders | High-risk unattended writes without sandbox/rules |
| `codex exec` | CI/scripted runs, JSONL/schema output, log summarization, repeatable audit reports | Interactive product decisions needing user context |
| Review | Diff/PR/commit review and regression risk finding | Implementation work or unverified agent assertions |
| Memory | Stable preferences and local recall | Required team rules, current external facts, secrets |

**Baseline rule**:when the same instruction or workflow repeats twice, decide whether it belongs in `AGENTS`, config, skill, MCP, hook, automation, `codex exec`, review, or memory. Promote it there, then remove duplicated prose from chat-era rules.

## Codex Official-Practice Audit

Run an official-practice audit before changing global Codex workflow or at least monthly:

1. Refresh the Codex manual through the official OpenAI docs route.
2. Compare current `~/.codex/AGENTS.md`, `~/.codex/config.toml`, hooks, skills, plugins, memory bridges, and project `AGENTS.md` against the surface model above.
3. Report official evidence, current drift, recommended surface, changes made, and intentionally retained deviations.
4. Put long-lived decisions in ADR/standards; put executable recurring audit steps in a skill or automation.
5. Use `codex exec --json` or an output schema when the audit must feed CI, dashboards, or monthly trend reports.

## Run Record

Standard and migration work should produce a run record when the work spans multiple steps, agents, repositories, or gates.

Run record is mandatory for:

- Migration track.
- Cross-repository implementation or verification.
- DB schema, auth, production, deployment, or CI self-heal risk.
- Work expected to span multiple turns or require resume.
- Work involving multiple agents or `codex exec` child runs.

Minimum fields:

- Task id, track, risk flags, tier.
- Preflight facts for each touched repository.
- Sources read.
- Evidence list with method and anchor.
- Changes.
- Gate results.
- Decisions and approvals.
- Debt and recovery hint.
- Outcome summary.

Use `progress.md` for human-readable continuation and `run-record.template.json` when the task needs machine-readable audit or downstream reporting.

## Evaluation Loop

Projects should maintain golden tasks that cover:

1. Simple edit.
2. Standard contract change.
3. DB verification.
4. Auth/menu gate.
5. Real UI E2E smoke.
6. Migration equivalence.
7. LSP-required refactor.
8. CI E2E routing.
9. Recovery from progress.
10. ADR supersede or long-term rule change.

Recommended metrics:

- Completion rate.
- First-pass review rate.
- High-severity review escape rate.
- E2E pass rate.
- Retries per task.
- Evidence completeness.
- Cost per successful task.

## Adoption Path

1. Local project harness.
2. Run record pilot.
3. CI adapter dry-run.
4. Skill extraction for high-frequency flows.
5. Golden task evaluation set.
6. Cross-project promotion when the pattern is fully reusable.

## Non-goals

- Replacing existing provider-specific hooks immediately.
- Encoding project-specific customer, DB, or compliance details.
- Bypassing human approval for high-risk operations.
- Treating agent reports as facts without verification.
