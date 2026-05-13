---
task_id: SPIKE_006-c61-T2
title: Delete scoreAlert, wire Path 2 to domain scorer
ship_order: 3
status: todo
zone: apps/mcp-server/src/interface/
files:
  - apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts
  - apps/mcp-server/src/__tests__/183-alert-accuracy.test.ts
blocked_by:
  - SPIKE_006-c61-T1
  - SPIKE_006-c61-T3
acceptance_criteria:
  - AC-1 verified: NULL-outcome alert row uses domain scorer path
  - AC-1 verified: result matches direct scoreAlertOutcome call
  - scoreAlert function deleted from alertAccuracy.ts
  - All 183 AC-1 test cases pass
  - dailyDashboardJob formatAccuracyReport call still works (AccuracyReport shape unchanged in this task)
---

## Summary

Unify scoring by deleting the local `scoreAlert` function and wiring Path 2 (NULL-outcome alerts) to call the domain scorer instead.

## Details

**File:** `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts`

1. Delete the `scoreAlert()` function (currently L164-237 or nearby)
   - Architect confirmed no other file calls it (L18 brownfield scan)
   - It is NOT exported; safe to remove

2. In `formatAccuracyReport` Path 2 logic (where NULL-outcome rows are scored):
   - Instead of calling local `scoreAlert(alertRow)`, call:
     ```typescript
     const type = alertOutcomeScorer.classifyAlertType(alertRow.affected_actions_json);
     const outcome = alertOutcomeScorer.scoreAlertOutcome({
       type,
       calendarDaysElapsed,  // computed in T-3
       // ... other params
     });
     ```
   - This becomes the single canonical path for all alerts

**Test File:** `apps/mcp-server/src/__tests__/183-alert-accuracy.test.ts`
- Add case: inject NULL-outcome `AlertRow` with mock scorer
- Verify `formatAccuracyReport` returns same result as calling `scoreAlertOutcome` directly
- No scoreAlert symbol should be reachable via module inspection

**Context:**
- Source brief: `docs/REQ_SPIKE_006_c61.md` § AC-1
- Architect design: `docs/architecture-briefs/2026-05-13-spike-006-c61-fix-design.md` § 2
- `alertOutcomeScorer` is already imported in this file (L36-37)
- `writeAlertOutcome` is also already imported (for mark_alert_outcome tool)

## Bisect Safeguard

This task is separate from T-3 (intraday gate) so that if the domain wiring breaks something, bisect can isolate which change caused it. Both T-1 and T-3 ship first as scaffolding.

## Next Task

After this task ships with green tests, developer picks up T-4 (sample-size guard).
