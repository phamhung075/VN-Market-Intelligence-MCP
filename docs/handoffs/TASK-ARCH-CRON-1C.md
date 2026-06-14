# Handoff — TASK-ARCH-CRON-1C

## Summary

Shift 8 high-collision job schedules in `cronConfig.ts` to reduce event-loop saturation bursts.

**Duration:** ~30min (8 keys in cronConfig.ts, env-overridable)  
**Zone:** `apps/mcp-server/`  
**Depends on:** TASK-ARCH-CRON-1A (guards) + TASK-ARCH-CRON-1B (recoverMissedExecutions)

---

## Context

Per `docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md` § 4.3 (Lever 3):

- Multiple jobs firing at the same minute cause event-loop saturation bursts, triggering missed-tick drops.
- **Deterministic, env-overridable** shifts (not random) prevent schedule drift while remaining configurable.
- All `CRONS.*` keys already use `Bun.env.CRON_*` pattern — no change to override mechanism needed.

---

## Acceptance Criteria

1. 8 confirmed-dead and high-risk jobs have shifted schedules in `cronConfig.ts`
2. All shifts are deterministic offsets (e.g., +3min, +5min, not random)
3. Env-override keys remain in place (e.g., `CRON_OHLCV_DAILY`)
4. No job logic changes
5. Cross-check: verify no timing-dependency conflicts (architect already validated in brief § 9, Risk R-3)
6. tsc 0 errors

---

## Schedule Shifts (8 keys in cronConfig.ts)

| Job | Current schedule | New schedule | Rationale |
|---|---|---|---|
| `ohlcvDaily` | `'0 15 * * 1-5'` | `'3 15 * * 1-5'` | +3min from hour pile-up |
| `vnstockFundamentals` | `'0 1 * * 1'` | `'5 1 * * 1'` | +5min from hour boundary |
| `reputationCompute` | `'30 8 * * *'` | `'33 8 * * *'` | +3min from `signalOutcomeJob@30 8` |
| `baseRateComputation` | `'0 19 * * 0'` | `'7 19 * * 0'` | +7min, joins minute=7 cluster |
| `predictionResolution` | `'30 16 * * *'` | `'35 16 * * *'` | +5min from existing collision |
| `calibrationReport` | `'0 13 * * 0'` | `'4 13 * * 0'` | +4min from hour pile-up |
| `cascadeBacktest` | `'30 20 * * *'` | `'37 20 * * *'` | +7min from `agmPlanRefresh@30 20` |
| `dailyDashboard` | `'30 23 * * *'` | `'38 23 * * *'` | +8min from `summaryDaily@30 22` |

---

## File to Modify

- `apps/mcp-server/src/scheduler/cronConfig.ts` (lines with above 8 keys)

**Pattern:**
```typescript
// Before
export const cronConfig = {
  ohlcvDaily: Bun.env.CRON_OHLCV_DAILY ?? '0 15 * * 1-5',
  // ...
  dailyDashboard: Bun.env.CRON_DAILY_DASHBOARD ?? '30 23 * * *',
}

// After
export const cronConfig = {
  ohlcvDaily: Bun.env.CRON_OHLCV_DAILY ?? '3 15 * * 1-5',
  // ...
  dailyDashboard: Bun.env.CRON_DAILY_DASHBOARD ?? '38 23 * * *',
}
```

---

## Timing-Dependency Verification

Per architect brief § 9 Risk R-3 (already validated):
- `ohlcvDailyAggregatorJob` at `3 15` → `eveningSummaryJob` at `30 22 VN` (= `15 15 UTC`) = 12min gap ✓
- `reputationComputeJob` at `33 8` → no consumers until much later ✓
- `predictionResolution` at `35 16` → `cascadeBacktest` at `37 20` = 4h gap ✓

No conflicts. No new cross-checks needed.

---

## Blockers / Dependencies

**Blocked by:** TASK-ARCH-CRON-1A (guards)

**Blocks:** None (parallel with TASK-ARCH-CRON-1B, or sequential; both are Phase 1)

---

## RETURN

```
DONE: 8 schedule shifts applied to cronConfig.ts; env overrides intact
GATE: Code review + tsc 0
NEXT: TASK-ARCH-CRON-2 (watchdog job)
HANDOFF: docs/handoffs/TASK-ARCH-CRON-1C.md
```
