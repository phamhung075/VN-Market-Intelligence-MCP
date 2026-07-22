---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-2-matcher-wire
size: S
zone: scripts/agents-flow/
depends_on: [TASK-COWORK-CATCHUP-1]
blocks: [TASK-COWORK-CATCHUP-3, TASK-COWORK-CATCHUP-4, TASK-COWORK-CATCHUP-5]
---

## TLDR
Wire `cowork-catchup-predicate.js` into `cowork-match-slots.js` CLI entrypoint (lines 270-300). Additive `require()` of new module (mirrors existing `cadence-policy.js` pattern). Emit new top-level `catchup_raw` field in JSON contract (list of catch-up candidates pre-delivery-check). This is the ONE shared output consumed by all 3 callers. Exported `matchSlots()` function unchanged (NFR-2).

## [PM] Planning Context
- **Zone:** `scripts/agents-flow/`
- **Acceptance Criteria:**
  - [ ] cowork-match-slots.js CLI entrypoint conditionally requires new catchup-predicate module (same pattern as existing cadence-policy require)
  - [ ] JSON stdout contract gains new top-level `catchup_raw` field (array, can be empty)
  - [ ] Exported `matchSlots()` function signature unchanged; test coverage for new field purely in CLI contract
  - [ ] All existing tests stay green (AC-10, NFR-2)

- **Files to modify:**
  - `scripts/agents-flow/cowork-match-slots.js` — CLI entrypoint only (`:270-300`):
    - Add `const catchupPredicate = require('./cowork-catchup-predicate');`
    - After matchSlots() call, compute catchup_raw = catchupPredicate.computeCatchupCandidates(...)
    - Add to JSON output: `"catchup_raw": catchup_raw`
  - `scripts/agents-flow/cowork-match-slots.test.js` — verify new field appears in CLI output

- **Knowledge needed:**
  - Architecture brief §2.1 (CLI entrypoint change)
  - Existing cowork-match-slots.js lines 270-300 pattern
  - cadence-policy.js require pattern (already used successfully)

## RETURN (after completion)
- [ ] cowork-match-slots.js CLI emits `catchup_raw` field
- [ ] Test verifies field present in JSON output
- [ ] All existing tests green
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T2
