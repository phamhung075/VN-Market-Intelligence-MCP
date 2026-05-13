---
task_id: SPIKE_006-c61-T4
title: Add insufficientSample guard to formatAccuracyReport
ship_order: 4
status: todo
zone: apps/mcp-server/src/interface/
files:
  - apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts
  - apps/mcp-server/src/__tests__/183-alert-accuracy.test.ts
blocked_by:
  - SPIKE_006-c61-T2
  - SPIKE_006-c61-T3
acceptance_criteria:
  - AC-4 verified: n=9 alerts trigger insufficient_sample flag
  - AC-4 verified: accuracy percentage NOT displayed when n<20
  - AC-4 verified: Vietnamese warning text prepended to report
  - AccuracyReport type includes insufficientSample boolean
  - All 183 AC-4 test cases pass
  - dailyDashboardJob still works (Pick type does not include insufficientSample, so no breaking change)
---

## Summary

Add a sample-size guard to the accuracy report. When fewer than 20 alerts are scoreable, flag it and suppress the percentage line.

## Details

**File:** `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts`

1. Update `AccuracyReport` type:
   - Add field: `insufficientSample: boolean`

2. In `formatAccuracyReport` function:
   - Compute `scoreable = hits + misses`
   - If `scoreable < 20`:
     - Set `insufficientSample = true`
     - Prepend to text output: `"Chua du du lieu danh gia (N=X, can ≥20)\n"`
     - Skip the accuracy percentage line (e.g., "22% HIT rate")
   - Otherwise:
     - Set `insufficientSample = false`
     - Include accuracy percentage as usual

**Test File:** `apps/mcp-server/src/__tests__/183-alert-accuracy.test.ts`
- Add case: inject 9 alerts (e.g., 2 HIT, 7 MISS)
- Verify `insufficientSample = true`
- Verify accuracy % not in text output
- Verify Vietnamese warning message is present

**Context:**
- Source brief: `docs/REQ_SPIKE_006_c61.md` § AC-4
- Architect design: `docs/architecture-briefs/2026-05-13-spike-006-c61-fix-design.md` § 2
- This is an additive change to `AccuracyReport`; the downstream `dailyDashboardJob` uses `Pick<AccuracyReport, ...>` which does not include `insufficientSample`, so no breaking change
- Zero division case (scoreable = 0) already guarded in current L340; preserve this guard

## Next Task

After this task ships with green tests, developer picks up T-5 (write-back + flat-band fix).
