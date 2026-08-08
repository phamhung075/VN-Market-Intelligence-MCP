---
sprint: BACKLOG
branch: task/runidle-3-staleness-guard
size: M
zone: cross-service/dev-flow-scripts/
depends_on: [TASK_RUNIDLE-1-AUDIT]
blocks: [TASK_RUNIDLE-4-TEST]
---

## TLDR
Implement a staleness and childlessness filter to exclude old, inactive sprints from the idle-check predicate. A sprint that has not been touched in 7+ days AND has no dispatchable children should not block the RUN-IDLE gate.

## [PM] Planning Context
- **Zone:** cross-service/dev-flow-scripts/
- **Acceptance Criteria:**
  - [ ] Define "stale" threshold: sprint with `.updated_at` > 7 days old (computed as `now - updated_at > 604800 seconds`)
  - [ ] Define "childless": sprint with `.tasks` array length == 0 OR all tasks have terminal status (DONE or DONE_VERIFIED)
  - [ ] Implement helper function: `skip_stale_childless_sprints()` that filters active_sprints and returns only those that are fresh OR have dispatchable work
  - [ ] Integrate filter into the idle-check so stale/childless sprints do not block the gate
  - [ ] Gracefully handle malformed or missing timestamps (e.g., '2026-07-17T04:53:14ZZ' double-Z, null updated_at)
  - [ ] Add to `scripts/agents-flow/dev-team-tick-preflight.sh` as a utility callable by predicate (d) check
  - [ ] Update test cases in `scripts/agents-flow/dev-team-tick-preflight.test.sh` to verify timestamp handling
  - [ ] Verify both freshness gate (age) and child-status gate (READY/IN_PROGRESS count) are applied
- **Files to read first:**
  - `scripts/agents-flow/dev-team-tick-preflight.sh` (lines 338-392, see how existing predicates read board state)
  - `docs/data/orch/orch-state.json` (look at `.task_board.active_sprints[]` for real stale entries and their updated_at values)
  - `scripts/agents-flow/dev-team-tick-preflight.test.sh` (understand how mock board is built and how timestamps are mocked)
- **Files to create:**
  - None (add to existing script)
- **Files to modify:**
  - `scripts/agents-flow/dev-team-tick-preflight.sh` — add `skip_stale_childless_sprints()` helper and call it from predicate (d)
  - `scripts/agents-flow/dev-team-tick-preflight.test.sh` — add test cases for staleness gate with real and malformed timestamps
- **Dependencies:**
  - Task 1 (TASK_RUNIDLE-1-AUDIT) must complete first — identifies which sprints are stale today
- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (bash style)
  - Date arithmetic in bash (GNU date vs BSD date, see standing memory notes on BSD/macOS issues)
  - Task schema to identify terminal statuses (DONE, DONE_VERIFIED)

## What This Task is Fixing
Even after redesigning predicate (d) to check for "dispatchable work", we need a secondary filter: old sprints that have been parked for weeks should eventually be swept out of the active set, or at least should not block idle. This task implements that sweep/filter so RUN-IDLE can fire even when some old sprints are still stuck in the active set.

## Background
Current state: active_sprints contains 8 entries, two of which are from 2026-07-17 (>3 weeks old). No automated producer closes or sweeps them. Consequence: even after redesigning the predicate, if those stale sprints have zero work, idle still fires — but if they're in a state that prevents the sweep, they'll still block indefinitely. This task proactively filters them out rather than waiting for a separate closeout mechanism.

## Design Note
There are two possible approaches (per po's decomposition hints):
1. **Filter approach** (recommended): sprints matching [stale AND childless] are excluded from the idle-check predicate, so idle can fire around them. The stale sprints stay in active_sprints[] but don't block idle. Separate cleanup row can handle eventual removal.
2. **Cleanup approach**: also implement an active_sprints[] sweeper that moves stale/childless to closed_sprints[]. This task focuses on approach 1; approach 2 is deferred to a future row if needed.

## Related Rows (for reference)
- FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR (parent, backlog)
- TASK_RUNIDLE-1-AUDIT (prerequisite, must run first)
- FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE (related dangling-sprint cleanup)
