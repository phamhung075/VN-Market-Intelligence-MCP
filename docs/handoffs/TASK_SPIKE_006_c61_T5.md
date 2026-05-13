---
task_id: SPIKE_006-c61-T5
title: Add writeAlertOutcome call + fix OOS-5 flat-band bug
ship_order: 5
status: todo
zone: apps/mcp-server/src/scheduler/ + apps/mcp-server/src/domain/
files:
  - apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts
  - apps/mcp-server/src/domain/services/alertOutcomeScorer.ts
  - apps/mcp-server/src/__tests__/1863b-verdict-resolution-job.test.ts
blocked_by:
  - SPIKE_006-c61-T4
acceptance_criteria:
  - AC-5 verified: confirmed verdict → 'HIT' written to alerts.outcome
  - AC-5 verified: false_positive verdict → 'MISS' written to alerts.outcome
  - E-3 verified: missing alert ID does not throw (try/catch)
  - OOS-5 verified: bearish alert with +0.9% move → confirmed NOT returned
  - OOS-5 verified: direction-aware confirm logic in resolveDirection
  - All 1863b test cases pass (AC-5 + OOS-5 + E-3)
  - writeAlertOutcome is layer-compliant (infra import, per DDD comment at L17)
---

## Summary

Connect `verdictResolutionJob` to the database by writing resolved verdicts back to `alerts.outcome`. Also fix the OOS-5 flat-band bug that inflates HIT count.

## Details

### Part A: Write-back (AC-5)

**File:** `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts`

1. Import `writeAlertOutcome` from `alertStore.ts`:
   ```typescript
   import { writeAlertOutcome } from '../../infrastructure/db/alertStore.js';
   ```

2. After each verdict is resolved (likely in the main loop where `updateVerdict` is called):
   ```typescript
   const outcome = verdict.result === 'confirmed' ? 'HIT' : 'MISS';
   try {
     await writeAlertOutcome(verdict.alertId, outcome, {
       detail: verdict.justification,
     });
   } catch (err) {
     // Log error but do not throw (E-3: missing alert ID is not critical)
     logger.warn(`writeAlertOutcome failed for alert ${verdict.alertId}:`, err);
   }
   ```

3. Verify the signature of `writeAlertOutcome` in `alertStore.ts` (L274 per architect brief)
   - It performs UPDATE with last-writer-wins semantics (no idempotency guard needed per architect)

### Part B: Fix OOS-5 Flat-Band Bug

**File:** `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts`

Find the `resolveDirection` function (L71 per brief):
- Current logic: `if (abs(pct) < 1.0) return "confirmed"` regardless of direction
- Problem: a bearish alert with price_move = +0.9% incorrectly resolves as "confirmed" → maps to HIT

Fix: Remove the unconditional flat-band early-return. Replace with:
```typescript
// Only confirmed if direction and magnitude agree
if (direction === 'up' && pct > 1.0) return 'confirmed';
if (direction === 'down' && pct < -1.0) return 'confirmed';
return 'false_positive';  // direction mismatch or magnitude < 1.0
```

**Test File:** `apps/mcp-server/src/__tests__/1863b-verdict-resolution-job.test.ts`

Add test cases:
- AC-5 normal: inject `confirmed` verdict → verify `writeAlertOutcome` called with `'HIT'`
- AC-5 false_positive: inject `false_positive` → verify `writeAlertOutcome` called with `'MISS'`
- E-3: inject verdict with nonexistent alert ID → verify no throw, row stays resolved, error logged
- OOS-5: inject bearish alert with +0.9% move → verify `confirmed` is NOT returned after fix

**Context:**
- Source brief: `docs/REQ_SPIKE_006_c61.md` § AC-5, OOS-5
- Architect design: `docs/architecture-briefs/2026-05-13-spike-006-c61-fix-design.md` § 1 (OOS-5), § 2 (AC-5)
- DDD compliance: `verdictResolutionJob` is infrastructure (scheduler + DB store); `writeAlertOutcome` is infra layer, so import is layer-compliant (see L17 DDD comment)
- Idempotency: last-writer-wins is acceptable for this low-concurrency case (alertOutcomeJob daily, verdictResolutionJob hourly — race window narrow)

## Next Task

After this task ships with green tests, developer picks up T-6 (integration test).
