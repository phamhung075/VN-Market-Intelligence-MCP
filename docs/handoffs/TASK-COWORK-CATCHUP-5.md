---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-5-firer-wiring
size: M
zone: scripts/agents-flow/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-2]
blocks: [TASK-COWORK-CATCHUP-7, TASK-COWORK-CATCHUP-8]
---

## TLDR
Add MCP access to `cowork-guaranteed-slot-firer.sh` (mirrors cowork-tick-preflight.sh pattern). After SLOT_MATCHER_CMD in `run_firer()`, read `.catchup_raw`. Conditional `mcp_call task_list_held`. Append eligible candidates to fire-list using `.guaranteed==true` filter on union of slots + catchup_raw. Write miss records for ineligible. Per-dish-type `fire_timeout_seconds` applied (values set in TASK-COWORK-CATCHUP-7). Extend tests.

## [PM] Planning Context
- **Zone:** `scripts/agents-flow/`
- **Acceptance Criteria:**
  - [ ] AC-4: Held marker suppresses catch-up
  - [ ] AC-7: Double-fire resolves to one winner
  - [ ] AC-10: cowork-guaranteed-slot-firer.test.sh passes

- **Files to modify:**
  - `scripts/agents-flow/cowork-guaranteed-slot-firer.sh`:
    - Add `source "$SCRIPT_DIR/mcp-call.sh"` at top (mirrors tick-preflight.sh)
    - In `run_firer()` after SLOT_MATCHER_CMD: read catchup_raw from JSON
    - Conditional `mcp_call task_list_held` (only when catchup_raw non-empty)
    - Merge eligible candidates into fire-list: `(.slots + .catchup_raw_eligible)[] | select(.guaranteed==true)`
    - Lookup `fire_timeout_seconds` from `_dish_type_catchup_config[slot.dish_type]` (set by TASK-7)
    - Apply timeout in `_bounded_exec` call (already present, just use variable instead of constant 1800)
    - Write miss records for ineligible
    - Update WARN logging pattern for catch-up cases
  - `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh`:
    - Add test verifying catch-up wiring and timeout application

- **Knowledge needed:**
  - Architecture brief §2.3 + §3 (firer integration + FR-8 timeout)
  - cowork-guaranteed-slot-firer.sh existing structure and mpc-call patterns
  - _bounded_exec timeout mechanism

## RETURN (after completion)
- [ ] cowork-guaranteed-slot-firer.sh has MCP access
- [ ] Catch-up wiring complete
- [ ] Per-dish-type timeout lookup logic implemented
- [ ] Tests pass
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T5
