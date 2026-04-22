# TASK 1290a — RED: Foreign Flow Fallback Job Integration Test Spec

**Sprint:** 1290 (size=S)
**Status:** Todo → In Progress → Review → Done
**Type:** Test Spec (RED—failing tests first)
**Depends on:** Sprint 1288 (fallback fetcher complete) ✓
**Blocked by:** None

---

## Goal

Define the test contract for integrating `fetchForeignFlowWithFallback()` (from Sprint 1288) into the scheduler job that currently fetches foreign flow data directly from VPS.

**Context:** VPS endpoint has been down since 2026-04-22 07:36:55 (2+ weeks). Sprint 1288 delivered graceful fallback logic (primary → cache → SSE → none), but it's not yet called by any scheduler job. This sprint integrates the fallback into the push job so outages are mitigated automatically.

---

## Current State (Brownfield)

| Component | File | Status | Constraint |
|-----------|------|--------|-----------|
| Fallback fetcher (NEW) | `src/infrastructure/fetchers/foreignFlowFetcher.ts` | COMPLETE | Exports `fetchForeignFlowWithFallback()`, `resetFallbackCache()`, `resetCircuitBreaker()` |
| MCP push endpoint | `src/interface/mcp/server.ts:683–932` | EXISTING | Handles POST `/api/push-foreign-flow` from VPS; writes to `daily_ohlcv` via `writeForeignFlowToOhlcv()` |
| Scheduler job | (MISSING) | NONE | No scheduler job currently fetches & pushes foreign flow; only alert job exists (`foreignFlowAlertJob.ts` — reads data, doesn't fetch) |
| Circuit breaker | `src/infrastructure/circuitBreakerRegistry.ts` | EXISTING | `breakers.foreignFlow` tracks VPS endpoint health (open after 5 failures, 30s reset) |

**Problem:** The fallback fetcher is never called. Foreign flow data enters via VPS webhook push only. If VPS is down, no data is written; cache is never populated; fallback never activates.

**Solution:** Create a scheduler job that:
1. Calls `fetchForeignFlowWithFallback()` every 60 seconds (matching VPS service frequency)
2. Writes results to `daily_ohlcv` via the same path as the webhook
3. Logs fallback activation (cache/SSE/none) for observability
4. Integrates circuit breaker state into diagnostics

---

## Test Contract (RED)

Create test file: **`src/__tests__/1290a-foreign-flow-fallback-job.test.ts`**

### Test Matrix: 8 assertions across 4 test cases

#### Test Case 1: Primary VPS Endpoint Success
**Assertion 1a:** When `fetchForeignFlowWithFallback()` returns `source: 'primary'`, job writes results to `daily_ohlcv` and returns `{ source: 'primary', changes, timestamp }`

**Input:**
```typescript
overrides: {
  fetchFn: mockFetch({ data: [{ code: 'VNM', date: '2026-04-22', foreignBuyVol: 1000, ... }] })
  now: () => new Date('2026-04-22T10:00:00Z')
}
```

**Expected:**
```typescript
{
  source: 'primary',
  changes: 1,
  timestamp: '2026-04-22T10:00:00Z',
  fallbackActivated: false
}
```

**Log assertion:** `[foreign-flow-job] primary endpoint OK`

---

#### Test Case 2: Primary Timeout → Cache Fallback
**Assertion 2a:** When primary VPS endpoint times out (>5s), fallback uses in-memory cache if available

**Input:**
```typescript
overrides: {
  fetchFn: mockFetch({ delay: 6000 }) // timeout after 5s
  cacheStore: { get: () => ({ data: [...], timestamp, changes: 5 }) }
  now: () => new Date('2026-04-22T10:05:00Z')
}
```

**Expected:**
```typescript
{
  source: 'cache',
  changes: 5,
  timestamp: '2026-04-22T10:00:00Z', // original fetch timestamp
  fallbackActivated: true,
  warning: undefined // cache <2h old
}
```

**Log assertion:** `[foreign-flow-job] fallback: cache (5 items, 0min old)`

---

#### Test Case 3: Circuit Breaker Open → Cache
**Assertion 3a:** When circuit breaker is OPEN (5 consecutive failures), primary fetch is skipped and cache is used

**Input:**
```typescript
resetCircuitBreaker() // start fresh
breakers.foreignFlow.simulate(5) // fail 5 times to open CB
overrides: {
  cacheStore: { get: () => ({ data: [...], timestamp, changes: 3 }) }
  now: () => new Date('2026-04-22T10:10:00Z')
}
```

**Expected:**
```typescript
{
  source: 'cache',
  changes: 3,
  fallbackActivated: true
}
```

**Log assertion:** `[foreign-flow-job] circuit breaker open, using cache`

---

#### Test Case 4: All Fallbacks Exhausted
**Assertion 4a:** When primary fails and all fallbacks are unavailable, job returns empty result with warning

**Input:**
```typescript
overrides: {
  fetchFn: mockFetch({ delay: 6000 })
  cacheStore: { get: () => null } // no cache
  sseMessageBus: undefined // no SSE bus
}
```

**Expected:**
```typescript
{
  source: 'none',
  changes: 0,
  warning: 'all fallbacks unavailable: check VPS endpoint + cache + SSE',
  fallbackActivated: true
}
```

**Log assertion:** `[foreign-flow-job] fallback exhausted, returning empty`

---

#### Test Case 5: Stale Cache Warning
**Assertion 5a:** When cache is >2h old, warning is returned but data is still written

**Input:**
```typescript
overrides: {
  cacheStore: { get: () => ({
    data: [...],
    timestamp: '2026-04-22T06:00:00Z', // 4h old
    cachedAt: '2026-04-22T06:00:00Z',
    changes: 2
  }) }
  now: () => new Date('2026-04-22T10:00:00Z') // 4h later
}
```

**Expected:**
```typescript
{
  source: 'cache',
  changes: 2,
  warning: 'cache stale: 240min old'
}
```

**Log assertion:** `[foreign-flow-job] cache stale (240min old) — proceeding`

---

#### Test Case 6: Circuit Breaker Recovery Detection
**Assertion 6a:** When primary succeeds after CB was open, job logs recovery timestamp

**Input:**
```typescript
// Fail 5 times to open CB
breakers.foreignFlow.simulate(5)
resetCircuitBreaker() // close it
overrides: {
  fetchFn: mockFetch({ data: [{ code: 'VNM', ... }] })
  now: () => new Date('2026-04-22T10:15:00Z')
}
```

**Expected:**
```typescript
{
  source: 'primary',
  changes: 1
}
```

**Log assertion:** `[foreign-flow-job] primary recovered at 2026-04-22T10:15:00Z`

---

#### Test Case 7: Job Result Contract with Timestamp
**Assertion 7a:** Job always returns `{ source, changes, timestamp, fallbackActivated, warning? }`

**Type check:**
```typescript
type JobResult = {
  source: 'primary' | 'cache' | 'sse' | 'none',
  changes: number,
  timestamp: string, // ISO 8601
  fallbackActivated: boolean,
  warning?: string
}
```

---

#### Test Case 8: Error Logging Contract
**Assertion 8a:** All errors log with context: error message, timestamp, source that failed, circuit breaker state

**Pattern:**
```typescript
logger.warn('[foreign-flow-job] error: <summary>', {
  error: '<message>',
  source: '<primary|cache|sse>',
  cbState: '<closed|open|half-open>',
  timestamp: '<ISO>'
})
```

---

## Integration Points (Brownfield Impact)

| File | Method | Called By | Passing Result To | Notes |
|------|--------|-----------|-------------------|-------|
| `foreignFlowFetcher.ts` | `fetchForeignFlowWithFallback()` | NEW job | DB write | Returns `{ source, changes, timestamp, warning? }` |
| `ohlcvForeignFlowStore.ts` | `writeForeignFlowToOhlcv()` | Job | daily_ohlcv table | Already handles dedup by (code, date) |
| `logger.js` | `logger.info/warn/error()` | Job | stderr/log-file | Standard logging pattern |
| `circuitBreakerRegistry.ts` | `breakers.foreignFlow.stats` | Job | observable state | CB open after 5 failures, 30s reset |

---

## Error Handling Contract

**Error scenarios:**
1. **Primary timeout (>5s):** Log WARN, proceed to cache
2. **Primary validation error:** Log WARN with validation details, proceed to cache
3. **Circuit breaker open:** Log WARN, skip primary, use cache
4. **Cache unavailable:** Log INFO, try SSE
5. **SSE unavailable:** Log WARN, return empty
6. **Unexpected exception:** Log ERROR, return `{ source: 'none', changes: 0, warning }`

**No silent failures:** Every error path logs diagnostics for troubleshooting.

---

## Cron Schedule (Implementation Constraint)

- **Frequency:** Every 60 seconds (matching `vn-foreign-flow.service` on VPS)
- **Hours:** 24/7 (foreign flow happens weekends too)
- **Environment variable:** `CRON_FOREIGN_FLOW_FETCH` (default: `'*/1 * * * *'` — every minute)
- **Job name:** `'foreignFlowFetcherJob'` (for `cron_job_runs` observability)

---

## Success Criteria

- [x] 8 assertions in RED test file, all failing
- [x] Tests exercise primary → cache → SSE → none fallback path
- [x] Circuit breaker state is observable in test results
- [x] Stale cache detection works (>2h warnings)
- [x] Recovery logging (when primary comes back online)
- [x] Error paths logged with full context (no silent failures)
- [x] Timestamps always ISO 8601 format
- [x] No code written yet—RED phase only

---

## Notes for Developer

- Use `resetFallbackCache()` and `resetCircuitBreaker()` before each test to ensure clean state
- Mock `fetch` to simulate timeouts, errors, validation failures
- Mock `cacheStore` and `sseMessageBus` for isolation
- Check `logger` calls with spy/mock to verify diagnostics logged
- The job should NOT crash on any fallback error—must always return a result
- Dedup is handled by `writeForeignFlowToOhlcv()`, job doesn't need to check for duplicates

---

## Handoff to Developer (GREEN phase next)

When moving to TASK_1290b, developer will:
1. Create scheduler job file (`src/scheduler/market-data/foreignFlowFetcherJob.ts`)
2. Implement `runForeignFlowFetcherJob()` function
3. Export cron-callable wrapper `runForeignFlowFetcherJobCron()`
4. Register cron in `jobs.ts` at `CRONS.foreignFlowFetch` schedule
5. Wire into `recordJobRun()` for observability
6. All 8 RED assertions should PASS without modification
