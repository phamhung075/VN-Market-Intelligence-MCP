---
sprint: BACKLOG
branch: task/runidle-2-redesign-predicate-d
size: M
zone: cross-service/dev-flow-scripts/
depends_on: [TASK_RUNIDLE-1-AUDIT]
blocks: [TASK_RUNIDLE-4-TEST]
---

## TLDR
Redesign predicate (d) in the dev-team idle-check from "active_sprints array is empty" to "active_sprints array contains no work dispatchable this tick". Allows stale/childless sprints to not block idle gate.

## [PM] Planning Context
- **Zone:** cross-service/dev-flow-scripts/
- **Acceptance Criteria:**
  - [ ] Modify `_step5_idle_check()` function in `scripts/agents-flow/dev-team-tick-preflight.sh` (lines 338-392)
  - [ ] Implement helper: function that identifies "dispatchable work" = tasks with status READY or IN_PROGRESS in a given sprint
  - [ ] Predicate (d) logic: return true (allow idle) if ALL active_sprints have zero READY/IN_PROGRESS tasks
  - [ ] Test: on a board where all active_sprints are stale/empty, predicate (d) must return true (gate opens)
  - [ ] Test: on a board with at least one sprint having READY tasks, predicate (d) must return false (gate closes)
  - [ ] Verify script still handles malformed timestamps gracefully (e.g., '2026-07-17T04:53:14ZZ' does not crash)
  - [ ] Update corresponding test cases in `scripts/agents-flow/dev-team-tick-preflight.test.sh`
  - [ ] Post-landing: measure git log --grep 'chore(signals): drain' daily count — should show no regressions vs pre-fix baseline
- **Files to read first:**
  - `scripts/agents-flow/dev-team-tick-preflight.sh` (lines 338-392, current `_step5_idle_check()`)
  - `scripts/agents-flow/dev-team-tick-preflight.test.sh` (understand test scaffold and mock board structure)
  - `docs/data/orch/orch-state.json` (look at `.task_board.active_sprints[].tasks[]` structure for sprint tasks)
  - `docs/agents/dev-team/flow/main.md` (lines 100-120, the RUN-IDLE verdict branch and its current use)
- **Files to create:**
  - None (refactor existing)
- **Files to modify:**
  - `scripts/agents-flow/dev-team-tick-preflight.sh` — rewrite predicate (d) check and add helper
  - `scripts/agents-flow/dev-team-tick-preflight.test.sh` — update existing test assertions and add new cases
- **Dependencies:**
  - Task 1 (TASK_RUNIDLE-1-AUDIT) must complete first — its findings inform the design decision
- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (bash style, error handling)
  - `docs/standards/task-schema.md` (active_sprints and task structures)
  - Understanding of jq for reading task_board state (see scripts/agents-flow/dev-team-tick-preflight.sh for examples)

## What This Task is Fixing
Predicate (d) currently checks if active_sprints array is empty (literally). That is structurally unreachable because sprints are never closed. The redesigned predicate checks if there is any ACTUAL WORK (READY or IN_PROGRESS tasks) across all active sprints — that is reachable and meaningful. A sprint with no dispatchable work should not prevent idle gate from firing.

## Background
The dev-team RUN-IDLE gate requires 4 predicates:
- (a) drainable signals = 0
- (b) signals.db is fresh (age < 60min)
- (c) signal_queue with status NEW = 0
- (d) active_sprints array is empty ← THIS ONE NEVER FIRES

Root cause: predicate (d) is unreachable. Active sprints are added but never closed, so the array always has entries. The predicate should instead ask "is there work actually dispatchable right now?" — a stale sprint with zero READY/IN_PROGRESS children should not block idle.

## Related Rows (for reference)
- FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR (parent, backlog)
- TASK_RUNIDLE-1-AUDIT (prerequisite, must run first)
- SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (related: count-threshold gate with permanent floor)
