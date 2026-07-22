---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-8-test-suite
size: M
zone: scripts/agents-flow/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-4, TASK-COWORK-CATCHUP-5, TASK-COWORK-CATCHUP-6]
blocks: [TASK-COWORK-CATCHUP-9]
---

## TLDR
Extend test suites for catch-up predicate, caller integration, and reconciliation. Covers AC-1..AC-7 and AC-10 scenarios. All existing tests must stay green (NFR-2). tsc clean.

## [PM] Planning Context
- **Zone:** `scripts/agents-flow/`
- **Acceptance Criteria:**
  - [ ] AC-1: cowork-catchup-predicate.test.js proves due=true for 07-22 scenario (missed windows, within bound, same VN-date)
  - [ ] AC-2: Predicate returns due=false + miss-reason="rolled_past_vn_date" when VN-date rolled past
  - [ ] AC-3: Freshness-bound-exceeded rejects catch-up (same VN-date)
  - [ ] AC-4: cowork-tick-preflight.test.sh — held marker suppresses catch-up
  - [ ] AC-5: Truncated run (no marker claimed) leaves last_fired unchanged
  - [ ] AC-7: cowork-guaranteed-slot-firer.test.sh — double-fire resolves to one task_claim winner
  - [ ] AC-10: All existing tests green, tsc passes

- **Files to modify:**
  - `scripts/agents-flow/cowork-catchup-predicate.test.js`:
    - AC-1 scenario: chef-eod 08:45Z + fb-daily 09:15Z missed, nowUnix injected to 17:34Z same VN-date, no held marker → returns due=true, catchup_eligible=true
    - AC-2 scenario: nowUnix injected to next VN-date (24h later) → returns due=false, reason="rolled_past_vn_date"
    - AC-3 scenario: nowUnix injected to 09:15Z + 360min = 15:15Z (beyond 6h bound for fb_daily_post ≤120min) → returns due=false, reason="freshness_window_exceeded"
  - `scripts/agents-flow/cowork-tick-preflight.test.sh`:
    - AC-4: Mock task_list_held response with held `published:<slot_id>:<date>` marker, verify catch-up does not fire
  - `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh`:
    - AC-7: Simulate dispatcher-tick + firer-tick both matching same slot, mock coordination store, verify one task_claim winner
  - Verify all existing test cases still pass (no regression, NFR-2)

- **Knowledge needed:**
  - Architecture brief §8 (test strategy mapping AC-1..AC-12)
  - Existing test harness patterns in all three test files

## RETURN (after completion)
- [ ] cowork-catchup-predicate.test.js has AC-1/AC-2/AC-3 scenarios
- [ ] cowork-tick-preflight.test.sh has AC-4 scenario
- [ ] cowork-guaranteed-slot-firer.test.sh has AC-7 scenario
- [ ] All existing tests pass (AC-10)
- [ ] tsc clean
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T8
