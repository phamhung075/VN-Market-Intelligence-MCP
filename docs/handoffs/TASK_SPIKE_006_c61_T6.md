---
task_id: SPIKE_006-c61-T6
title: New integration test for scoring unification
ship_order: 6
status: todo
zone: apps/mcp-server/src/__tests__/
files:
  - apps/mcp-server/src/__tests__/SPIKE006-scoring-unification.test.ts
blocked_by:
  - SPIKE_006-c61-T5
acceptance_criteria:
  - Integration test file created and passes
  - End-to-end formatAccuracyReport uses domain scorer only (no scoreAlert path)
  - scoreAlert function confirmed absent from alertAccuracy module exports
  - Baseline test count 8804 preserved (no regressions)
  - All 6 test files (T-1..T-6) green
---

## Summary

Create a final integration test confirming that the scoring unification is complete and the local scoreAlert function has been deleted.

## Details

**File:** `apps/mcp-server/src/__tests__/SPIKE006-scoring-unification.test.ts`

1. Import and test `formatAccuracyReport` end-to-end:
   - Inject a mix of alert rows (some pre-scored, some NULL-outcome)
   - Inject a mock domain scorer
   - Verify that `formatAccuracyReport` produces consistent results through both paths
   - Use `:memory:` SQLite (auto-setup by test harness)

2. Module inspection:
   - Import the `alertAccuracy` module
   - Assert that `scoreAlert` is NOT present in module exports
   - Example:
     ```typescript
     import * as alertAccuracyModule from '../interface/mcp/tools/alerts/alertAccuracy.js';
     assert(!('scoreAlert' in alertAccuracyModule), 'scoreAlert should be deleted');
     ```

3. Test structure:
   - Arrange: set up test alerts, mock domain scorer
   - Act: call `formatAccuracyReport`
   - Assert: verify single-path behavior, no local scoring logic

**Context:**
- Source brief: `docs/REQ_SPIKE_006_c61.md` § 8, Test Plan
- Architect design: `docs/architecture-briefs/2026-05-13-spike-006-c61-fix-design.md` § 4
- This task gates completion of the full 6-task batch
- All 5 prior tasks (T-1..T-5) must be green before this integration test is written

**Test Baseline:**
- Current baseline: 8804 tests passing
- This test adds ~3-5 integration cases; expect final count around 8807-8809 (all passing)

## Ship Gate

When this task passes:
- SPIKE_006 fix is complete
- All 6 acceptance criteria (AC-1 through AC-5) verified
- OOS-5 flat-band bug fixed
- Alert accuracy metric ready for evaluation in next sprint
