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
├── .planning/codebase/
├── docs/decisions/
├── docs/ops/
└── docs/superpowers/{specs,backlog,_archive}/
```

`docs/superpowers` is a historical directory convention for spec/plan artifacts. It does not require a plugin with that name. `.planning/codebase/` starts empty and is populated only from real project evidence.

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

- Simple track: evidence anchor, small change and minimal verification; ordinary docs need no agent review, while code/executable configuration gets one staged-diff review before commit.
- Standard track: complete known scope, contract lock, plan, evidence, risk-appropriate primary review and real verification.
- Migration track: deterministic inventory/equivalence gates first; one initial independent critic, with reruns only after a gap, source/contract change or Tier 3 trigger; two evidence-lens votes only for high-impact non-deterministic claims.
- Long-lived ADRs/business contracts use one primary review. A second review is reserved for independent high-risk domains, unresolved HIGH findings, external/irreversible contracts, auth/compliance or destructive production/DB decisions.
- Monthly workflow review evaluates completion, rework, first-pass review, escaped HIGH, E2E, rebaseline, environment failures and cost trend before retaining or removing rules.

See `provider-neutral-ai-coding-harness-standard.md` and `legacy-migration-playbook.md` for the full policy.

## Project maps

- Maps are navigation, not current-fact proof.
- The default staleness reminder is 15 days.
- Refresh only affected domains, preserve untouched content and record the mapped HEAD for each nested repository.
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
