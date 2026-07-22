---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-4-tick-preflight
size: M
zone: scripts/agents-flow/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-2]
blocks: [TASK-COWORK-CATCHUP-8]
---

## TLDR
Extend `cowork-tick-preflight.sh` Step 6 after SLOT_MATCHER_CMD call. New Step 6.5: read `.catchup_raw` from same JSON. Conditionally call `mcp_call task_list_held` (only when catchup_raw non-empty, NFR-3). Fold eligible candidates into `slots` array (same contract as Step 4.6 per-work-item slot). Write miss records. Extend Step 7 SILENT gate to account for miss ledger (already-recorded misses don't force WORK verdict). Extend tests.

## [PM] Planning Context
- **Zone:** `scripts/agents-flow/`
- **Acceptance Criteria:**
  - [ ] AC-4: Held marker suppresses catch-up
  - [ ] AC-7: Double-fire (dispatcher tick + firer tick both matching same slot) resolves to one winner
  - [ ] AC-10: cowork-tick-preflight.test.sh passes (extended with new cases)

- **Files to modify:**
  - `scripts/agents-flow/cowork-tick-preflight.sh`:
    - After Step 6 SLOT_MATCHER_CMD: read `.catchup_raw` into bash variable
    - Step 6.5: conditional `mcp_call "task_list_held" '{"kind":"cowork-slot"}'` (reuse existing idiom)
    - Filter catchup_raw: held → drop, eligible → append to slots array, ineligible → miss record
    - Step 7: extend SILENT gate to check miss-record existence before counting toward WORK verdict
    - Update comment about Step 6.5 purpose
  - `scripts/agents-flow/cowork-tick-preflight.test.sh`:
    - Add test for Step 6.5 with mocked task_list_held response
    - Verify eligible catch-up candidates appear in verdict JSON slots array

- **Knowledge needed:**
  - Architecture brief §2.3 (caller integration)
  - cowork-tick-preflight.sh existing mcp_call pattern
  - Existing test.sh harness

## RETURN (after completion)
- [ ] cowork-tick-preflight.sh Step 6.5 wired
- [ ] Miss records written
- [ ] SILENT gate extended
- [ ] Tests pass
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T4
