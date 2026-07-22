---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-6-last-fired-reconciliation
size: M
zone: docs/agents/cowork-team/flow/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-3]
blocks: [TASK-COWORK-CATCHUP-8, TASK-COWORK-CATCHUP-9]
---

## TLDR
Rewrite `docs/agents/cowork-team/flow/last-fired.md` Step 5b as reconciliation logic (FR-7 Option b). Remove unconditional post-spawn timestamp. Replace with: after all spawns in a tick, read `task_list_held` response already fetched for FR-3 catch-up check. For each `guaranteed:true` slot with a held `published:<slot_id>:<key>` marker, backfill `last_fired = ISO(claimed_at)` if newer than stored value. If no marker held yet, leave `last_fired` unchanged (AC-5: truncated runs don't stamp). Reuses same `task_list_held` call (zero extra gateway calls).

## [PM] Planning Context
- **Zone:** `docs/agents/cowork-team/flow/`
- **Acceptance Criteria:**
  - [ ] AC-5: Truncated run (marker never claimed) leaves last_fired unchanged
  - [ ] AC-6: Explicit architect ruling on FR-8 (already satisfied via brief §3)

- **Files to modify:**
  - `docs/agents/cowork-team/flow/last-fired.md`:
    - Rewrite Step 5b: change from "stamp last_fired immediately after spawn" to "reconciliation pass after all spawns"
    - Logic:
      ```
      For each guaranteed:true slot:
        search task_list_held response for published:<slot_id>:<basis_key> entry
        if found AND claimed_at > slot.last_fired:
          update slot.last_fired = ISO(claimed_at)
        else if not found:
          leave last_fired unchanged
      ```
    - Preserve atomic tmp+rename pattern (already used elsewhere)
    - Update comments/AC to match reconciliation intent, not dispatch-time stamp

- **Knowledge needed:**
  - Architecture brief §2.6 (FR-7 reconciler design)
  - Existing last-fired.md structure and atomic-write pattern
  - task_list_held response structure (includes claimed_at for each lock)

## RETURN (after completion)
- [ ] Step 5b rewritten as reconciliation (no-op if task_list_held unavailable, fail conservative)
- [ ] Accepts already-fetched task_list_held response (zero extra gateway calls)
- [ ] AC-5 behavior verified (truncated runs don't stamp)
- [ ] Tests added to coverage (see TASK-COWORK-CATCHUP-8)
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T6
