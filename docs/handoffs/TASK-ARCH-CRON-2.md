# Handoff — TASK-ARCH-CRON-2

## Summary

Implement the scheduler watchdog (Lever 4): detect missed ticks and either self-heal or send WORK alerts. Phase 2, builds on Phase 1.

**Duration:** ~2h (new file + watchdog runner + 3 test files)  
**Zone:** `apps/mcp-server/`  
**Depends on:** TASK-ARCH-CRON-1A, 1B, 1C complete

---

## Context

Per `docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md` § 4.4 (Lever 4):

- The watchdog is the systemic safety net — detects last_run age > 2× declared cadence.
- Fires every 10 min, reads `cron_job_runs`, sends WORK alert or calls the job's runner (self-heal).
- 16 jobs in WATCHDOG_MANIFEST (mix of `alert-only` and `self-heal` actions).

---

## Acceptance Criteria

1. `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts` created
2. Exports `runSchedulerWatchdog()` with signature matching brief § 7
3. `WATCHDOG_MANIFEST` defined (16 entries per brief § 4.4 table)
4. Per-job age check: `SELECT MAX(started_at) FROM cron_job_runs WHERE job_name=?`
5. Alert message format: `[scheduler-watchdog] <jobName>: last ran <age>h ago (cadence=<cadence>h, threshold=<mult>×). Auto-trigger fired.`
6. Self-heal calls job runner via `jobRunRepo.wrapRun()` (ensures dedup guard fires)
7. Rate limit: per-job cooldown 2h (in-process Map, not DB)
8. `cronConfig.ts` has `schedulerWatchdog: '*/10 * * * *'` key
9. `startScheduler.ts` registers watchdog: `cron.schedule(CRONS.schedulerWatchdog, async () => { await runSchedulerWatchdog() }, ...)`
10. tsc 0 errors
11. All watchdog tests pass

---

## Files to Create

### 1. `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts`

**Exports:**
- `WatchdogManifestEntry` interface
- `WatchdogManifest` type
- `runSchedulerWatchdog(deps?)` async function

**Structure:**
```typescript
export interface WatchdogManifestEntry {
  cadenceMs: number
  thresholdMultiplier: number
  action: 'alert-only' | 'self-heal'
  selfHealFn?: () => Promise<void>  // required when action='self-heal'
}

export type WatchdogManifest = Record<string, WatchdogManifestEntry>

export const WATCHDOG_MANIFEST: WatchdogManifest = {
  'ohlcv-daily-aggregator': {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'self-heal',
    selfHealFn: runOhlcvDailyAggregatorJob
  },
  // ... 15 more entries per brief § 4.4 table
}

export async function runSchedulerWatchdog(deps?: {
  db?: Database
  manifest?: WatchdogManifest
  sendFn?: (msg: string) => Promise<void>
  nowMs?: number
}): Promise<{ checked: number; alerted: number; healed: number }> {
  // 1. Read WATCHDOG_MANIFEST
  // 2. For each monitored job:
  //    a. Query MAX(started_at) from cron_job_runs
  //    b. Check age > cadence × threshold
  //    c. If yes: alert-only OR self-heal per manifest
  // 3. Rate-limit: per-job cooldown 2h
  // 4. Return counts
}
```

**Key implementation notes:**
- Use `jobRunRepo.getLastRuns()` (already exists) to fetch last run
- Check status IN ('success', 'error') to ignore pending/running
- Self-heal MUST call runner via `jobRunRepo.wrapRun()` so dedup guard fires
- Rate-limit Map: `Map<jobName, lastAlertMs>` — if `Date.now() - lastAlertMs < 7_200_000`, skip
- Telegram alerts → `send_telegram(channel='work', msg)`

---

### 2. `apps/mcp-server/src/__tests__/ARCH-CRON-watchdog.test.ts`

**Test cases (per brief § 11):**

1. **No alert within cadence window**
   - Last run 8h ago; cadence 24h, threshold 1.5 → age (8h) < threshold (36h) → no alert
   - Assert: `alerted === 0`

2. **WORK alert fires at 1.5× cadence**
   - Last run 38h ago; cadence 24h, threshold 1.5 (=36h) → age (38h) > 36h → alert fires
   - Assert: `alerted === 1`

3. **Self-heal calls wrapRun**
   - Manifest entry has `action='self-heal'`; age exceeds threshold
   - Assert: `selfHealFn` was called (mock it)

4. **Self-heal dedup guard prevents double execution**
   - Watchdog triggers self-heal; next scheduled tick also fires
   - Dedup guard on job should skip the second run
   - Assert: job body executes only once within cadence window

5. **2h rate-limit prevents spam**
   - First alert at T=0; second breach at T=1h → cooldown active → no alert
   - Third breach at T=3h → cooldown expired → alert fires
   - Assert: `alerted === 1` (only at T=3h)

---

### 3. `apps/mcp-server/src/__tests__/ARCH-CRON-idempotency.test.ts`

**Test cases (per brief § 11, verify T4 guards):**

1. **ohlcvDailyAggregatorJob skips replay when last run < 22h ago**
   - Last run 20h ago; cadence 24h (90% = 21.6h)
   - Assert: guard returns early, no job execution

2. **reputationComputeJob skips replay when last run < 22h ago**
   - Same pattern

3. **calibrationReportJob skips replay when last run < 6 days ago**
   - Last run 5 days ago; cadence 7d (90% = 6.3d)
   - Assert: guard returns early

*(Additional tests for other T4 jobs as needed, but these 3 cover the critical ones)*

---

### 4. `apps/mcp-server/src/__tests__/ARCH-CRON-recovery.test.ts` (optional, integration-level)

**Test case (per brief § 11):**
- Inject 5s sleep in `intelligenceCycleJob` callback
- Verify `ohlcvDailyAggregatorJob` fires within 2 cadence windows
- Assert: job fired (via cron_job_runs entry) despite event-loop saturation
- This is a full integration test; may run separately from unit tests

---

## Files to Modify

### 1. `apps/mcp-server/src/scheduler/cronConfig.ts`

Add watchdog key:
```typescript
export const cronConfig = {
  // ... existing keys ...
  schedulerWatchdog: Bun.env.CRON_SCHEDULER_WATCHDOG ?? '*/10 * * * *'
}
```

### 2. `apps/mcp-server/src/scheduler/startScheduler.ts`

Register the watchdog:
```typescript
// Near the end of startScheduler(), add:
cron.schedule(CRONS.schedulerWatchdog, async () => {
  await runSchedulerWatchdog()
}, { timezone: 'UTC', recoverMissedExecutions: true })
```

Import at top:
```typescript
import { runSchedulerWatchdog } from './system/schedulerWatchdogJob'
```

---

## Idempotency & DDD

- **Layer:** interface/scheduler (new file in `scheduler/system/`)
- **DB access:** Read-only via `SqliteJobRunRepository.getLastRuns()` (no writes from watchdog)
- **Golden rule:** No domain imports; inject `db` parameter, not direct `getDb()` call

---

## Blockers / Dependencies

**Blocked by:** TASK-ARCH-CRON-1A, 1B, 1C (all Phase 1 complete)

**Blocks:** None (final phase)

---

## RETURN

```
DONE: schedulerWatchdogJob.ts + 3 test files; cronConfig/startScheduler updated
GATE: Code review + bun test green + tsc 0
NEXT: Integration test (brief § 11) + live verification (brief § 12)
HANDOFF: docs/handoffs/TASK-ARCH-CRON-2.md
```
