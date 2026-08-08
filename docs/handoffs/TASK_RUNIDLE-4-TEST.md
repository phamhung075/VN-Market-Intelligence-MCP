---
sprint: BACKLOG
branch: task/runidle-4-test-stale-childless
size: S
zone: cross-service/dev-flow-tests/
depends_on: [TASK_RUNIDLE-2-REDESIGN, TASK_RUNIDLE-3-STALENESS]
blocks: []
---

## TLDR
Write a regression test case for the scenario: active_sprints array is non-empty (8 sprints) but every member is stale and childless. Verify that `_step5_idle_check()` returns RUN-IDLE and that `consecutive_run_idle` counter increments.

## [PM] Planning Context
- **Zone:** cross-service/dev-flow-tests/
- **Acceptance Criteria:**
  - [ ] Add new test case to `scripts/agents-flow/dev-team-tick-preflight.test.sh` named "predicate-d: stale-childless sprints do not block idle"
  - [ ] Test scaffold builds mock board with:
    - 8 active_sprints, all stale (updated_at >= 7 days ago)
    - All sprints childless (zero tasks OR all tasks terminal)
    - Predicates (a), (b), (c) all TRUE (no drainable signals, signals.db fresh, signal_queue NEW empty)
    - Only predicate (d) is being tested
  - [ ] Assert: `_step5_idle_check()` returns verdict string containing "RUN-IDLE"
  - [ ] Assert: `consecutive_run_idle` counter in mock state increments from 0 to 1
  - [ ] Test is discoverable: `npm test -- --grep "stale.*childless"` or similar
  - [ ] Test output is readable and explains what scenario it covers
  - [ ] Test passes after Task 2 and Task 3 are implemented
- **Files to read first:**
  - `scripts/agents-flow/dev-team-tick-preflight.test.sh` (understand test harness, mock board structure, existing _step5_idle_check tests)
  - `scripts/agents-flow/dev-team-tick-preflight.sh` (lines 360-392, the _step5_idle_check() function and how it reads predicates)
  - `docs/data/dev-team-idle-widen-state.json` (structure of consecutive_run_idle counter and idle tracking)
- **Files to create:**
  - None (add to existing test file)
- **Files to modify:**
  - `scripts/agents-flow/dev-team-tick-preflight.test.sh` — add new test case with full setup, execution, and assertions
- **Dependencies:**
  - Task 2 (TASK_RUNIDLE-2-REDESIGN) must land first — the redesigned predicate is what we're testing
  - Task 3 (TASK_RUNIDLE-3-STALENESS) must land first — the staleness guard is part of the logic being tested
- **Knowledge needed:**
  - Understanding of the mock board structure used in dev-team-tick-preflight.test.sh
  - How to construct a mock task_board with active_sprints, tasks, and their statuses
  - How consecutive_run_idle counter works and how to assert it increments

## What This Task is Fixing
The original acceptance criterion AC-2 from RC-IDLE-LOOPS (shipped 2026-07-04) was "a new dev-team-tick-preflight.test.sh case covers 'active_sprints non-empty but every member stale/childless -> still RUN-IDLE'". That test case was never written. This task fulfills that AC and ensures the redesigned predicate (d) actually works in the presence of stale/childless sprints.

## Background
The RC-IDLE-LOOPS acceptance criteria were:
- A1: On a tick with no drainable signals and no NEW signal_queue rows, dev-team-tick-preflight.sh emits verdict RUN-IDLE and consecutive_run_idle increments
- A2: **A new dev-team-tick-preflight.test.sh case covers 'active_sprints non-empty but every member stale/childless -> still RUN-IDLE'** ← THIS ONE WAS NEVER WRITTEN
- A3: 7 days after landing, git log daily count is strictly below the 25-65/day band

This task specifically delivers A2.

## Test Scaffold Example
```bash
# Mock board state
board_state=(
  "active_sprints": [
    {"id": "SPRINT-OLD-1", "status": "ACTIVE", "updated_at": "2026-07-31T00:00:00Z", "tasks": []},
    {"id": "SPRINT-OLD-2", "status": "ACTIVE", "updated_at": "2026-08-01T00:00:00Z", "tasks": []},
    ... (8 total, all with zero or terminal-only tasks)
  ],
  "ready": [],
  "in_progress": [],
  "signal_queue": {
    "new": 0,
    ...
  }
)
# Call _step5_idle_check() and assert it returns RUN-IDLE verdict
```

## Related Rows (for reference)
- FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR (parent, backlog)
- TASK_RUNIDLE-2-REDESIGN (prerequisite)
- TASK_RUNIDLE-3-STALENESS (prerequisite)
