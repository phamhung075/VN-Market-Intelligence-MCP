---
sprint: BACKLOG
branch: task/runidle-1-audit-active-sprints
size: S
zone: cross-service/dev-flow/
depends_on: []
blocks: [TASK_RUNIDLE-2-REDESIGN, TASK_RUNIDLE-3-STALENESS]
---

## TLDR
Audit the codebase to understand how active_sprints[] accumulates entries and identify what structure is missing to close sprints when their work completes. Document findings to unblock redesign of the idle-check predicate.

## [PM] Planning Context
- **Zone:** cross-service/dev-flow/ (analysis/architecture)
- **Acceptance Criteria:**
  - [ ] Grep or search for every location that writes to `.task_board.active_sprints[]` (adds new sprint, appends task)
  - [ ] Document the production writer(s) and their contracts
  - [ ] Map where sprints SHOULD transition to DONE or closed (look at po/sprint-signoff.md flow)
  - [ ] Audit current state: list all 8 active sprints with id, status, updated_at, task count, and age calculation
  - [ ] Identify specifically which sprints are stale (updated_at > 7 days) and which are childless (zero dispatchable tasks)
  - [ ] Determine what is missing: sprint closeout logic, a scheduled pruner, or a gating rule in signoff
  - [ ] Write comprehensive findings in `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md` with recommendations
- **Files to read first:**
  - `docs/agents/po/flow/sprint-signoff.md` (line ~200-250, sprint status transitions)
  - `docs/policies/dev-standards.md` (sprint lifecycle section if present)
  - `docs/agents/dev-team/flow/main.md` (sprint initialization and closeout)
  - `docs/data/orch/orch-state.json` (current board state, look at `.task_board.active_sprints[]`)
- **Files to create:**
  - `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md` — audit findings and recommendations
- **Files to modify:**
  - None (audit only, no code changes)
- **Dependencies:**
  - None — this is the prerequisite for tasks 2 and 3
- **Knowledge needed:**
  - `docs/ARCHITECTURE.md` (overall sprint/task lifecycle)
  - `docs/standards/task-schema.md` (active_sprints structure and required fields)
  - Standing rule on sprint lifecycle per memory/previous sprints (check docs/agent-memory/ for notes)

## What This Task is Fixing
RC-IDLE-LOOPS shipped 2026-07-04 with a check that active_sprints be empty before allowing the idle gate to fire. That predicate has never been true, so the guard is dead. Root cause: sprints are added but never closed, creating a permanent floor. This audit identifies what is missing so we can fix it properly.

## Background
The dev-team idle-tick guard requires 4 predicates to be true to emit RUN-IDLE. Predicate (d) is "active_sprints == 0", which has never been true live. All 8 sprints are status=ACTIVE, two are stale (2026-07-17, >3 weeks), and none have been closed. There is no automatic producer that closes sprints when work finishes.

## Related Rows (for reference)
- FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR (parent task, backlog)
- SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (instance 9 — related dead-gate class)
- FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE (related dangling-sprint issue)
