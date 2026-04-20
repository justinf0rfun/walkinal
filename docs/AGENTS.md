# Agent Guide — Docs Scope

This file applies only to `docs/` and its child paths.

Repository-wide engineering and stability rules live in the repo-root [`AGENTS.md`](../AGENTS.md).

## Purpose

Files in `docs/` should describe the project clearly and reflect the current Walkinal direction.

Use `docs/` for:

- current product and architecture documentation
- progress tracking
- test strategy
- troubleshooting
- historical planning material that is explicitly labeled as historical

## Docs Rules

1. Prefer Walkinal terminology over legacy `Clui CC` naming unless the document is explicitly historical.
2. If a document is historical, mark that clearly near the top.
3. Keep current-state docs aligned with the actual codebase.
4. Do not describe planned architecture as if it is already implemented.
5. When documenting unstable or future work, label it as planned, proposed, or pending.

## Scope-Specific Expectations

### Current-state docs

Examples:

- `feature-progress.md`
- `ARCHITECTURE.md`
- `TROUBLESHOOTING.md`
- release or smoke-test docs

These should:

- reflect what the code does today
- avoid stale references to removed Claude conversation architecture
- be updated when behavior changes materially

### Historical docs

Examples:

- early PRD material
- migration plans
- experiment writeups

These may keep old assumptions, but they must:

- say they are historical
- avoid being mistaken for current implementation truth

## Progress Tracking

When editing `feature-progress.md`:

- keep completed work and backlog status aligned
- if an item appears in both a section list and `P0/P1/P2`, update both
- distinguish between:
  - shipped behavior
  - designed but not connected behavior
  - planned future work
