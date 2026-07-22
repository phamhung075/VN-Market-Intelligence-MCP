---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-3-dispatcher-flow
size: M
zone: docs/agents/cowork-team/flow/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-2]
blocks: [TASK-COWORK-CATCHUP-6, TASK-COWORK-CATCHUP-9]
---

## TLDR
Create new `docs/agents/cowork-team/flow/catchup-check.md` as Step 4.55 sub-flow in dispatcher (between pressure-cadence 4.4-4.5b and slot-claim 4.6-4.6b). Reads `catchup_raw` from prior Step 1-4b matcher call. Conditionally calls `task_list_held(kind:"cowork-slot")` only when catchup_raw non-empty (NFR-3). Tags eligible candidates with `is_catchup:true`, appends to MATCHES. Writes structured miss records for ineligible. Wire JUMP-TO table entry in main.md.

## [PM] Planning Context
- **Zone:** `docs/agents/cowork-team/flow/`
- **Acceptance Criteria:**
  - [ ] AC-3: Freshness-bound-exceeded routes to miss record, not catch-up fire
  - [ ] AC-4: Held `published:<slot_id>:<date>` marker suppresses catch-up (no re-fire)
  - [ ] AC-5: Truncated run (no marker claimed) leaves last_fired unchanged (no optimistic stamp)

- **Files to create:**
  - `docs/agents/cowork-team/flow/catchup-check.md` — new sub-flow:
    - Reads `catchup_raw` from upstream matcher
    - If empty, jump to next step (no LLM cost)
    - If non-empty: call `task_list_held(kind:"cowork-slot")`
    - For each `catchup_raw[]` entry:
      - If `expected_publish_task_id` held → drop (already delivered)
      - If `catchup_eligible=false` → write miss record (per-file JSON format, see brief §2.5)
      - If `catchup_eligible=true` → tag `is_catchup:true`, append to MATCHES
    - Emit one Telegram per unique miss (not per-tick spam)

- **Files to modify:**
  - `docs/agents/cowork-team/flow/main.md` — JUMP-TO table:
    - Add row: "4.55" → catchup-check.md (between pressure-cadence and slot-claim)

- **Knowledge needed:**
  - Architecture brief §2.3 (delivery-evidence check)
  - Architecture brief §2.5 (miss record format)
  - Existing main.md JUMP-TO pattern
  - Existing task_list_held usage pattern (already in codebase)

## RETURN (after completion)
- [ ] catchup-check.md created with conditional task_list_held call
- [ ] Miss record writing logic implemented (per-file JSON)
- [ ] main.md JUMP-TO table updated
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T3
