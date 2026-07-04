---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT
size: S
zone: scripts/agents-flow/
depends_on: []
blocks: ["P1-IDLE-DEVTEAM-FLOW-BRANCH"]
---

## TL;DR
Add idle-detection (Step 5) to dev-team-tick-preflight.sh that checks if task_board.active_sprints, docs/signals/, and signal_queue are all empty, returning `RUN-IDLE` verdict to skip drain-signals entirely — matching the silent-release pattern cowork already uses.

## [PM] Planning Context

**Zone:** scripts/agents-flow/

**Target:** `scripts/agents-flow/dev-team-tick-preflight.sh`

**Mechanism:** Add Step 5 idle-check AFTER the existing fire-election win (RUN path only), reusing exact fields that `docs/agents/dev-team/flow/main.md` drain-signals.md's own MANDATORY PERSIST GUARD already reads:
- `ls docs/signals/*.json | wc -l` (signal file count)
- `signals.db` mtime (database freshness)
- `jq '[.signal_queue.rows[]\|select(.status=="NEW")]\|length'` on orch-state (NEW signal count)
- `task_board.active_sprints` emptiness

Evaluate them BEFORE Step 0a instead of only inside it. All-empty → new verdict `RUN-IDLE`.

**Files to read first:**
- `scripts/agents-flow/cowork-tick-preflight.sh` lines 74-113 (_step8_silent_release — the template to port)
- `docs/agents/dev-team/flow/main.md` lines 494-498 (current Step 0b/0c structure)
- `docs/agents/dev-team/flow/drain-signals.md` (understand what Step 0a does, what to skip)

**Files to modify:**
- `scripts/agents-flow/dev-team-tick-preflight.sh` — Add Step 5 idle-check logic before Step 0a's fire-election
- `scripts/agents-flow/dev-team-tick-preflight.test.sh` — Add test case for idle scenario

**Files to create:**
- None (extend existing test file)

**Dependencies:** None

**Knowledge needed:**
- `docs/agents/dev-team/flow/main.md` (Step 0 preflight structure)
- `docs/policies/dev-standards.md` (bash test pattern)
- `scripts/agents-flow/cowork-tick-preflight.sh` §_step8_silent_release (reference implementation)

**Acceptance Criteria (machine-checkable):**

1. New `dev-team-tick-preflight.test.sh` case: when `task_board.active_sprints=[]`, `docs/signals/` is empty, and `signal_queue` has zero NEW rows → script's mocked call trace contains ZERO calls to functions that would execute drain-signals.md, and verdict is `RUN-IDLE`
2. All existing test cases continue to pass (no regression)
3. Step 5 idle-check is evaluated BEFORE Step 0a fire-election, so idle verdict can suppress the entire drain flow

