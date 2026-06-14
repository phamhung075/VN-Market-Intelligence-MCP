# Handoff — TASK-ARCH-CRON-1B

## Summary

Add `recoverMissedExecutions: true` to all `cron.schedule()` calls in `startScheduler.ts` that lack it.

**Duration:** ~1h (50+ call sites, mechanical change)  
**Zone:** `apps/mcp-server/`  
**Depends on:** TASK-ARCH-CRON-1A (T4 guards must ship first)

---

## Context

Per `docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md` § 4.1 (Lever 1):

- node-cron v3.0.3's `recoverMissedExecutions: true` replays missed ticks on server restart.
- Currently only 3 jobs have it: `alertDigestJob`, `evidenceAccumulatorJob`, `reputationComputeJob`.
- Apply it universally to all 50+ `cron.schedule()` calls.
- **Exception:** `foreignFlowFetch` (`*/1 * * * *`) fires every 60s by design; recovery would double-fetch. Skip it — it has a no-op guard anyway.

---

## Acceptance Criteria

1. Every `cron.schedule()` call in `startScheduler.ts` has `{ timezone: 'UTC', recoverMissedExecutions: true }` (except `foreignFlowFetch`)
2. Code pattern: `cron.schedule(CRONS.<key>, async () => { await jobRunRepo.wrapRun(...) }, { timezone: 'UTC', recoverMissedExecutions: true })`
3. `foreignFlowFetch` intentionally skips `recoverMissedExecutions` (documented inline)
4. No job logic changes
5. tsc 0 errors
6. Spot-check: grep confirms ~50 occurrences of `recoverMissedExecutions: true` in file

---

## File to Modify

- `apps/mcp-server/src/scheduler/startScheduler.ts` (1072 lines, ~50 `cron.schedule()` calls)

---

## Pattern

**Before:**
```typescript
cron.schedule(CRONS.ohlcvDaily, async () => {
  await jobRunRepo.wrapRun('ohlcv-daily-aggregator', async () => {
    // job logic
  })
}, { timezone: 'UTC' })
```

**After:**
```typescript
cron.schedule(CRONS.ohlcvDaily, async () => {
  await jobRunRepo.wrapRun('ohlcv-daily-aggregator', async () => {
    // job logic
  })
}, { timezone: 'UTC', recoverMissedExecutions: true })
```

**Exception — foreignFlowFetch (keep as-is with comment):**
```typescript
cron.schedule(CRONS.foreignFlowFetch, async () => {
  // Note: recoverMissedExecutions: false by design (fires every 60s; recovery would double-fetch)
  // The underlying runForeignFlowFetcherJobCron() is a no-op if data is fresh.
  await jobRunRepo.wrapRun('foreign-flow', async () => {
    // job logic
  })
}, { timezone: 'UTC' })
```

---

## Blockers / Dependencies

**Blocked by:** TASK-ARCH-CRON-1A (T4 guards)

**Blocks:** TASK-ARCH-CRON-1C (schedule jitter), TASK-ARCH-CRON-2 (watchdog)

---

## RETURN

```
DONE: 50+ cron.schedule() calls have recoverMissedExecutions: true
GATE: Code review + tsc 0 + grep spot-check
NEXT: TASK-ARCH-CRON-1C (parallel if PR is split) or TASK-ARCH-CRON-2 (watchdog)
HANDOFF: docs/handoffs/TASK-ARCH-CRON-1B.md
```
