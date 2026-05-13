---
task_id: SPIKE_006-c61-T3
title: Gate intraday fallback + compute calendarDaysElapsed
ship_order: 2
status: todo
zone: apps/mcp-server/src/interface/
files:
  - apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts
  - apps/mcp-server/src/__tests__/183-alert-accuracy.test.ts
blocked_by:
  - SPIKE_006-c61-T1
acceptance_criteria:
  - AC-2 verified: same-calendar-day alert (triggered 14:00 GMT+7, queried same day) → intraday window NOT used
  - AC-2 verified: next-calendar-day alert → intraday window allowed
  - All 183 AC-2 test cases pass
  - Path 2 scoreAlert still calls domain scorer (wiring happens in T-2, not here)
---

## Summary

Remove the intraday fallback 1-12h window bias, and prepare the interface layer to compute `calendarDaysElapsed` for the domain scorer.

## Details

**File:** `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts`

In `formatAccuracyReport` Path 2 (NULL-outcome rows):
1. Compute `calendarDaysElapsed = Math.floor((now - triggeredAt) / 86_400_000)`
   - This converts timestamp diff in milliseconds to calendar days (floor division)
   - Example: alert fired 14:00 GMT+7 today, checked 09:00 GMT+7 today → calendarDaysElapsed = 0
   - Example: alert fired 14:00 GMT+7 yesterday, checked 09:00 GMT+7 today → calendarDaysElapsed = 0 or 1 (depends on exact hours)

2. Remove or gate the intraday 1-12h fallback window
   - Only use intraday window if `calendarDaysElapsed >= 1`
   - Current L206-217 always tries intraday; gate it behind the elapsed check

**Test File:** `apps/mcp-server/src/__tests__/183-alert-accuracy.test.ts`
- Add case: alert triggered 14:00 GMT+7, queried same day 14:30 → must NOT score using 12h window
- Add case: alert triggered 14:00 GMT+7 yesterday, queried next day 09:00 → MAY use intraday window
- Verify `calendarDaysElapsed` computation correctness

**Context:**
- Source brief: `docs/REQ_SPIKE_006_c61.md` § AC-2
- Architect design: `docs/architecture-briefs/2026-05-13-spike-006-c61-fix-design.md` § 2
- The domain scorer `scoreAlertOutcome` is already pure and accepts `calendarDaysElapsed` as input (no domain change)
- This task prepares the interface to supply that parameter correctly

## Next Task

After this task ships with green tests, developer picks up T-2 (delete scoreAlert, wire domain call).
