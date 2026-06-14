# Handoff — TASK-ARCH-CRON-1A-TEST

## Summary

Unit tests for T4 dedup guards — verify each guard skips replay when last run is within cadence window. Non-vacuous (actually injects breach conditions and verifies behavior).

**Duration:** ~1h (test file + 14 test cases)  
**Zone:** `apps/mcp-server/`  
**Depends on:** TASK-ARCH-CRON-1A (guards implemented)

---

## Context

Per `feedback_fence_false_green`: lint may check NOTHING; inject violation to verify. This test file must:
1. Actually call each T4 job's guard logic
2. Mock `jobRunRepo.getLastRuns()` to return stale/fresh results
3. Verify the guard returns early on fresh runs
4. Verify the guard allows execution on stale runs
5. Verify logging output includes 'recovery dedup' message

---

## Acceptance Criteria

1. Test file: `apps/mcp-server/src/__tests__/ARCH-CRON-idempotency.test.ts`
2. 14 test cases (one per T4 job) — each has two variants:
   - **Fresh scenario:** Last run 8h ago (within 24h cadence 90%=21.6h) → guard returns early → no execution
   - **Stale scenario:** Last run 25h ago (outside cadence window) → guard allows execution
3. Each test:
   - Mocks `jobRunRepo.getLastRuns()` with a controlled `cron_job_runs` row
   - Calls the job's runner function in test context
   - Asserts guard behavior via log capture or return value
4. Non-vacuous: If guard is removed, tests fail (verify by commenting out guard code)
5. bun test green (all 28 cases pass)
6. Coverage: all 14 T4 jobs from TASK-ARCH-CRON-1A list

---

## Test Structure

```typescript
import { describe, it, expect, mock } from 'bun:test'
import { runOhlcvDailyAggregatorJob } from '@/scheduler/market-data/ohlcvDailyAggregatorJob'
// ... import all 14 T4 job runners

describe('ARCH-CRON-idempotency: T4 dedup guards', () => {
  describe('ohlcvDailyAggregatorJob', () => {
    it('skips execution when last run < 22h ago (cadence 24h, 90% = 21.6h)', async () => {
      const freshRun = { runAt: new Date(Date.now() - 8 * 3600 * 1000), status: 'ok' }
      jobRunRepo.getLastRuns = mock(() => [freshRun])
      
      const logs: string[] = []
      const mockLog = { info: (msg: string) => logs.push(msg) }
      
      // Call job runner with mocked deps
      const result = await runOhlcvDailyAggregatorJob(db, { log: mockLog })
      
      // Guard should have returned early
      expect(logs.some(l => l.includes('recovery dedup'))).toBe(true)
      expect(result).toBeUndefined() // or expect job body was skipped
    })
    
    it('executes normally when last run > 24h ago (breach scenario)', async () => {
      const staleRun = { runAt: new Date(Date.now() - 25 * 3600 * 1000), status: 'ok' }
      jobRunRepo.getLastRuns = mock(() => [staleRun])
      
      const logs: string[] = []
      const mockLog = { info: (msg: string) => logs.push(msg) }
      
      // Call job runner
      const result = await runOhlcvDailyAggregatorJob(db, { log: mockLog })
      
      // Guard should have allowed execution
      expect(logs.some(l => l.includes('recovery dedup'))).toBe(false)
      expect(result).toBeDefined() // job body executed
    })
  })
  
  describe('reputationComputeJob', () => {
    // Same pattern, 2 scenarios
  })
  
  // ... 12 more job describe blocks
})
```

---

## Test Coverage (14 jobs, 2 scenarios each = 28 cases)

| Job | Cadence | 90% window | Fresh (<) | Stale (>) |
|---|---|---|---|---|
| ohlcvDailyAggregatorJob | 24h | 21.6h | 8h | 25h |
| calibrationReportJob | 7d | 6.3d | 3d | 8d |
| baseRateComputationJob | 7d | 6.3d | 3d | 8d |
| predictionResolutionJob | 24h | 21.6h | 8h | 25h |
| reputationComputeJob | 24h | 21.6h | 8h | 25h |
| verdictResolutionJob | 24h | 21.6h | 8h | 25h |
| signalOutcomeJob | 24h | 21.6h | 8h | 25h |
| alertOutcomeJob | 24h | 21.6h | 8h | 25h |
| weeklyPortfolioReportJob | 7d | 6.3d | 3d | 8d |
| devTeamHeartbeatJob | 24h | 21.6h | 8h | 25h |
| dataAuditJob (daily) | 24h | 21.6h | 8h | 25h |
| dataAuditJob (weekly) | 7d | 6.3d | 3d | 8d |
| accuracyDigestJob | 24h | 21.6h | 8h | 25h |
| (reserved for future) | | | | |

---

## Test Patterns

**Mocking `jobRunRepo.getLastRuns()`:**
```typescript
const mock = (fn: () => any) => fn  // Bun's mock utility
jobRunRepo.getLastRuns = mock((jobName: string, limit: number) => {
  if (fresh) return [{ runAt: new Date(Date.now() - 8 * 3600 * 1000), status: 'ok' }]
  else return [{ runAt: new Date(Date.now() - 25 * 3600 * 1000), status: 'ok' }]
})
```

**Capturing logs:**
```typescript
const logs: string[] = []
const mockLogger = {
  info: (msg: string) => logs.push(msg),
  error: (msg: string) => logs.push(msg)
}
// Pass to job runner or override global log during test
```

**Assertion patterns:**
```typescript
expect(logs.some(l => l.includes('recovery dedup'))).toBe(true)  // Guard fired
expect(logs.some(l => l.includes('recovery dedup'))).toBe(false) // Guard did not fire
```

---

## Blockers / Dependencies

**Blocked by:** TASK-ARCH-CRON-1A (guards must exist)

**Blocks:** Nothing (runs parallel with 1B/1C; completes before Phase 2)

---

## RETURN

```
DONE: 28 test cases in ARCH-CRON-idempotency.test.ts; all pass bun test
GATE: Code review + bun test green + coverage (all 14 jobs)
NEXT: TASK-ARCH-CRON-2 (watchdog)
HANDOFF: docs/handoffs/TASK-ARCH-CRON-1A-TEST.md
```
