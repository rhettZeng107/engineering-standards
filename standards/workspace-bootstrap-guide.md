# Workspace Bootstrap Guide

## Goal

Create the smallest Codex-first governance container for one project or a set of nested repositories. Do not manufacture architecture, credentials, personal memory, runtime configuration, project maps, or operations assets before evidence exists.

The executable entry is `templates/bootstrap-workspace.sh`; the repeated procedure is also packaged as the `workspace-bootstrap` Skill. This guide is the portable team standard, not a mirror of one user's home directory.

## Layer model

| Layer | Truth source | Content |
|---|---|---|
| Global/runtime | `~/.codex/AGENTS.md`, config, hooks, personal Skills | Cross-project hard boundaries, personal defaults, mechanical gates |
| Team | This repository | ADRs, provider-neutral standards, templates, portable Skills and tests |
| Workspace | Nearest project `AGENTS.md` and project docs | Repository topology, commands, contracts, environments and project-only rules |

Workspace instructions specialize the upper layers; they do not copy them wholesale.

## Bootstrap output

```text
<workspace>/
├── AGENTS.md
├── .gitignore
├── docs/decisions/
├── docs/runbooks/
└── docs/tasks/
```

For new workspaces from 2026-09-09, task files live together under `docs/tasks/<YYYY-MM-DD-topic>/` only when needed: `spec.md` describes scope/acceptance, `plan.md` holds steps and `progress.md` owns long-task state. Short work can use the session plan; do not create empty task files. Completed tasks stay in place with an explicit status. Do not generate `.planning/`, `docs/superpowers/`, a project map, or a second archive/backlog tree. Existing workspace layouts and links are unchanged; this revision does not authorize migration of their directories.

The default bootstrap does not create or modify:

- `CLAUDE.md`, `QWEN.md`, personal memory, sessions or history;
- `.mcp.json`, credentials, internal endpoints or environment values;
- global hooks, full Skill/plugin catalogs or user config;
- CI/CD scripts, deployment maps, architecture claims or project-map content;
- a separate tasks document; tasks stay inside the relevant `plan.md`.

## New workspace procedure

1. Use an absolute path whose parent already exists; confirm the target does not exist and contains no `.` or `..` path segment.
2. Verify the template repository's root, remote, branch and dirty ownership.
3. Run `templates/bootstrap-workspace.sh <target>`.
4. Fill `AGENTS.md` from current repository evidence: roles, remotes/branches, source of truth, reuse boundaries, prohibited actions and exact verification commands.
5. Clone nested repositories separately, verify each Git root, and add explicit container-repo ignores.
6. For standard, migration, cross-repo, DB/auth/production or long-running work, record repo preflight and one progress/run-record truth source.
7. Run shell syntax, bootstrap smoke, secret scan and `git diff --check`; review code/executable configuration once against the final staged diff.
8. Verify commit and push through independent read-only commands.

## Existing workspace adoption

Do not run the creation script over an existing directory. Inventory current instructions, repositories, docs, hooks, runtime files and user-owned dirty changes. Merge only missing governance surfaces and remove duplicated global prose from project instructions without weakening project-specific rules.

Legacy provider files remain optional compatibility adapters. A stale Claude/Qwen/GSD command is not retained unless its current runtime and business value are verified.

## Workflow defaults inherited by a new workspace

- Classify by business risk, contract impact and uncertainty, not file count. Simple reversible work loads only relevant boundaries and direct consumers; being inside a migration workspace does not make a text edit a migration batch.
- Inherit review, migration and model policy from the current instruction chain and [Harness standard](provider-neutral-ai-coding-harness-standard.md), rather than copying it into every generated workspace. Main-session final diff self-review is the default; independent Reviewer only on explicit user request or a higher-priority runtime requirement.
- Keep one authoritative task record; continuation files are thin pointers, not another plan. Machine-readable records are added only for an actual consumer.
- Record each project's delivery order explicitly: verification, any candidate deployment/UAT prerequisites, commit, sync/push, CI and final acceptance as applicable. Preserve approved project exceptions. A repo without remotes needs only a local commit; root and nested repos close independently.
- Observe acceptance and rework using the existing monthly template; do not treat historical review PASS counts as business acceptance.

See `provider-neutral-ai-coding-harness-standard.md` and `legacy-migration-playbook.md` for the full policy.

## Project maps

- Maps are optional, non-blocking navigation, not current-fact proof or a workflow gate.
- Do not require map reading, age checks, drift checks, stale-risk recording, or refresh before review, commit, packaging, deployment, or completion.
- Refresh only when explicitly requested, or when a low-frequency topology, ownership, or core-mechanism change has reusable navigation value; update affected domains only and preserve untouched content.
- Map generation is provider-neutral: Codex, a codebase mapper, explorer or structured `codex exec` may produce the delta. Do not bind a workspace rule to an absent `/gsd-*` runtime.

## Skill and plugin boundary

Bootstrap installs or references only the team's core portable Skills. It never copies a personal full catalog into a workspace. Skill metadata stays concise for discovery; full Skill instructions and references load when triggered. Existing personal plugins and Skills remain under the user's runtime configuration and are not silently disabled or removed by workspace initialization.

Archived Skills require a manifest, dependency scan, recovery path and a review period before permanent deletion.

## Acceptance

- The target is a new independent Git root and a second run refuses overwrite.
- No bootstrap output contains credentials, personal memory, internal deployment facts or dead runtime commands.
- `AGENTS.md` contains only project specialization and verified commands.
- The script writes only under the requested target.
- Tests, review and remote synchronization are independently verified.
