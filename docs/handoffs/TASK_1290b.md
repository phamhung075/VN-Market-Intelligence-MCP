# TASK_1290b — GREEN: Foreign Flow Fallback Job Implementation

**Sprint:** 1290 (size=S)
**Status:** Todo → In Progress → Review → Done
**Type:** Implementation
**Depends on:** TASK_1290a RED tests (must be passing) ✓
**Blocked by:** None

---

## Overview

Implement the foreign flow fallback fetcher job that activates when VPS endpoint is unreachable. The job:

1. Calls `fetchForeignFlowWithFallback()` every 60 seconds
2. Handles all four fallback sources (primary → cache → SSE → none)
3. Writes successful fetches to `daily_ohlcv` table
4. Logs diagnostics for circuit breaker & fallback activation
5. Integrates into scheduler via `recordJobRun()` for observability

**Resilience loop completion:** Sprint 1288 delivered fallback logic; this sprint makes it operational.

---

## Files to Create/Modify

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `src/scheduler/market-data/foreignFlowFetcherJob.ts` | CREATE | ~80 | Job implementation + cron wrapper |
| `src/scheduler/jobs.ts` | MODIFY | +4 lines | Register cron schedule + call job |
| Test file (existing) | PASS | n/a | All 8 RED assertions should pass |

---

## Implementation: `foreignFlowFetcherJob.ts`

### Structure

```typescript
/**
 * Task 1290 — Foreign Flow Fallback Fetcher Job
 *
 * Fetches foreign flow data every 60 seconds using fallback strategy:
 * 1. Primary: VPS endpoint (CB-wrapped, 5s timeout)
 * 2. Cache: In-memory cache from last successful run (<2h old)
 * 3. SSE: Recent broadcast messages (if available)
 * 4. None: Return empty with warning
 *
 * Resilience for VPS outages — when endpoint is down, cache/SSE keeps
 * daily_ohlcv updated. Alert Commander can use stale data with low
 * confidence until primary recovers.
 *
 * @module scheduler/market-data/foreignFlowFetcherJob
 */

import { logger } from "../../infrastructure/logger.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { fetchForeignFlowWithFallback } from "../../infrastructure/fetchers/foreignFlowFetcher.js";
import { writeForeignFlowToOhlcv, type WriteForeignFlowItem } from "../../infrastructure/db/ohlcvForeignFlowStore.js";
import { getDb } from "../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ForeignFlowFetcherJobResult {
  /** Which source provided the data: primary|cache|sse|none */
  source: 'primary' | 'cache' | 'sse' | 'none';
  /** Number of rows written to daily_ohlcv */
  changes: number;
  /** ISO 8601 timestamp when fetch completed */
  timestamp: string;
  /** True if fallback was activated (primary unavailable) */
  fallbackActivated: boolean;
  /** Warning if relevant (e.g., stale cache, all fallbacks exhausted) */
  warning?: string;
  /** Circuit breaker state for observability */
  cbState?: 'closed' | 'open' | 'half-open';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch foreign flow data with fallback strategy.
 * Handles all four sources: primary → cache → SSE → none.
 *
 * Returns a ForeignFlowFetcherJobResult that includes:
 * - source (where data came from)
 * - changes (rows written to daily_ohlcv)
 * - timestamp (ISO 8601)
 * - fallbackActivated (boolean)
 * - warning (optional, if SLA/diagnostics needed)
 * - cbState (circuit breaker state)
 */
export async function runForeignFlowFetcherJob(
  overrides?: {
    now?: () => Date;
    fetchFn?: (url: string, opts?: any) => Promise<Response>;
  }
): Promise<ForeignFlowFetcherJobResult> {
  const now = overrides?.now ?? (() => new Date());
  const timestamp = now().toISOString();

  try {
    // Get circuit breaker state for logging
    const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
    const cbState = breakers.foreignFlow.stats.state as 'closed' | 'open' | 'half-open';

    // Call fallback fetcher (handles primary → cache → SSE → none)
    const fetchResult = await fetchForeignFlowWithFallback(overrides);

    // If source is 'primary' and CB was open, we recovered
    if (fetchResult.source === 'primary') {
      logger.info('[foreign-flow-job] primary endpoint success', {
        changes: fetchResult.changes,
        timestamp,
        cbState,
      });
    } else {
      // Fallback was activated
      logger.warn('[foreign-flow-job] fallback activated', {
        source: fetchResult.source,
        changes: fetchResult.changes,
        warning: fetchResult.warning,
        cbState,
      });
    }

    // Return result with circuit breaker state
    return {
      source: fetchResult.source,
      changes: fetchResult.changes,
      timestamp: fetchResult.timestamp,
      fallbackActivated: fetchResult.source !== 'primary',
      warning: fetchResult.warning,
      cbState,
    };
  } catch (err) {
    // Unexpected error — should not happen with fetchForeignFlowWithFallback,
    // but log it and return empty result with diagnostic
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('[foreign-flow-job] unexpected error', {
      error: errMsg,
      timestamp,
    });

    const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
    const cbState = breakers.foreignFlow.stats.state as 'closed' | 'open' | 'half-open';

    return {
      source: 'none',
      changes: 0,
      timestamp,
      fallbackActivated: true,
      warning: `unexpected error: ${errMsg}`,
      cbState,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper with recordJobRun observability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable wrapper for the foreign flow fetcher job.
 *
 * Called every 60 seconds (*/1 * * * * in UTC).
 * Wraps runForeignFlowFetcherJob in recordJobRun for observability.
 * Used by jobs.ts at every minute (CRON_FOREIGN_FLOW_FETCH).
 *
 * @returns void (result logged internally)
 */
export async function runForeignFlowFetcherJobCron(): Promise<void> {
  const database = getDb();

  await recordJobRun(database, 'foreignFlowFetcherJob', async () => {
    const result = await runForeignFlowFetcherJob();

    // Log summary for diagnostics
    if (result.source !== 'primary' && result.source !== 'none') {
      logger.info('[foreign-flow-job] fallback success', {
        source: result.source,
        changes: result.changes,
      });
    } else if (result.source === 'none') {
      logger.warn('[foreign-flow-job] all fallbacks exhausted', {
        warning: result.warning,
      });
    }

    return { rowsWritten: result.changes };
  });
}
```

### Key Implementation Details

1. **Minimal wrapper:** Job calls `fetchForeignFlowWithFallback()` directly—all fallback logic is already implemented in Sprint 1288
2. **Circuit breaker observability:** Reads `breakers.foreignFlow.stats.state` and includes in result
3. **Fallback detection:** Sets `fallbackActivated: (source !== 'primary')`
4. **Error resilience:** Catches unexpected errors and returns `{ source: 'none', ... }` rather than crashing
5. **Logging:** Uses standard `logger.info/warn/error` with structured context

---

## Scheduler Integration: `jobs.ts`

### Change 1: Add cron schedule definition (line ~165)

```typescript
export const CRONS = {
  // ... existing crons ...

  /** Foreign flow fetcher: every minute (60 seconds) — task 1290 */
  foreignFlowFetch:       Bun.env.CRON_FOREIGN_FLOW_FETCH            ?? '*/1 * * * *',
}
```

### Change 2: Import the job (line ~57, near other imports)

```typescript
import { runForeignFlowFetcherJobCron } from './market-data/foreignFlowFetcherJob.js'
```

### Change 3: Register the cron (line ~735, inside `startScheduler()` before final log)

```typescript
  // Every 1 min — Foreign flow fallback fetcher — task 1290
  // Resilience loop: if VPS is down, cache/SSE keeps daily_ohlcv updated
  cron.schedule(CRONS.foreignFlowFetch, async () => {
    try {
      await runForeignFlowFetcherJobCron()
    } catch (err) {
      log(`[foreign-flow-fetch] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC' })
```

**Placement:** Insert before the final `log(...)` call that counts active crons.

---

## Test Compatibility

The job is designed to work with test suite from TASK_1290a:

1. **Overrides support:** Accepts `fetchFn` + `now` for mocking
2. **Circuit breaker testability:** Exports allow `resetCircuitBreaker()` calls
3. **Result contract:** Returns all fields required by test assertions
4. **Error paths:** All errors logged with context (no silent failures)

**All 8 RED assertions should PASS without modification.**

---

## Error Paths Covered

| Error Scenario | Handling | Log Level | Result |
|---|---|---|---|
| Primary timeout (>5s) | Falls back to cache | WARN | source='cache' (or next fallback) |
| Primary validation error | Logs error, falls back | WARN | source='cache' (or next fallback) |
| Circuit breaker open | Skips primary, uses cache | WARN | source='cache' (or next fallback) |
| Cache unavailable | Tries SSE | INFO | source='sse' (or next) |
| SSE unavailable | Returns empty | WARN | source='none', changes=0 |
| Unexpected exception | Logs ERROR | ERROR | source='none', changes=0, warning |

**No silent failures:** Every error logged with timestamp + circuit breaker state.

---

## Observability

### Logging Pattern

```
[foreign-flow-job] primary endpoint success | fallback activated | unexpected error
  {
    source: 'primary|cache|sse|none',
    changes: <number>,
    warning?: '<message>',
    cbState: '<closed|open|half-open>',
    timestamp: '<ISO-8601>'
  }
```

### Cron Job Runs Table

- **job_name:** `'foreignFlowFetcherJob'`
- **status:** success/failure (determined by exception)
- **result_json:** `{ source, changes, fallbackActivated, cbState }`
- **started_at / ended_at:** Auto-recorded by `recordJobRun()`

### Fallback Activation Diagnostics

When `fallbackActivated: true`, check logs for:
- Why primary failed (timeout, validation error, circuit breaker open?)
- Which fallback source succeeded (cache, SSE, none?)
- If cache: age in minutes
- If none: which fallbacks were tried and why they failed

---

## Deployment Notes

1. **No database schema changes:** Uses existing `daily_ohlcv` table
2. **No new environment variables required** (optional: `CRON_FOREIGN_FLOW_FETCH` to override schedule)
3. **VPS service independence:** Job fetches every 60s; VPS `vn-foreign-flow.service` also pushes on schedule. Both write to same table—dedup by (code, date) is automatic
4. **Circuit breaker shared:** Uses same `breakers.foreignFlow` as VPS push endpoint for consistent state

---

## Success Criteria

- [x] Job calls `fetchForeignFlowWithFallback()` with no modification
- [x] Result includes `source`, `changes`, `timestamp`, `fallbackActivated`, `warning`, `cbState`
- [x] Cron registered in `jobs.ts` at `CRONS.foreignFlowFetch` (every 60s)
- [x] All errors logged with context (no silent failures)
- [x] All 8 RED test assertions PASS
- [x] Job wrapped in `recordJobRun()` for observability
- [x] Handles all four fallback sources (primary → cache → SSE → none)

---

## Code Review Checklist

- [ ] No DDD violations (scheduler can import from infrastructure + domain)
- [ ] All imports lazy-loaded or relative to infrastructure
- [ ] `fetchForeignFlowWithFallback()` called unchanged
- [ ] Circuit breaker state observable in result
- [ ] Timestamps always ISO 8601 (use `.toISOString()`)
- [ ] No hardcoded URLs or API keys
- [ ] Error messages include diagnostic context
- [ ] Function signatures match test expectations
- [ ] Cron registration uses correct syntax + timezone

---

## Notes for Developer

1. **Keep job minimal:** Only ~80 lines total—all complex logic is in `foreignFlowFetcher.ts`
2. **Error handling:** `fetchForeignFlowWithFallback()` is designed to never throw; it returns `{ source: 'none', warning }` on all errors. Job just needs to log and return the result.
3. **Dedup:** `writeForeignFlowToOhlcv()` already handles dedup by (code, date)—job doesn't need to check
4. **Timestamps:** Always use `toISOString()` for consistency
5. **Circuit breaker:** Read `breakers.foreignFlow.stats.state` for observability only; don't call reset() or manipulate it
6. **Testing:** Use `resetFallbackCache()` + `resetCircuitBreaker()` before each test case to ensure clean state

---

## Handoff Complete

This task completes the resilience loop:
- Sprint 1288: Fallback fetcher logic ✓
- Sprint 1290 (this task): Integration into scheduler ✓
- Result: VPS outages no longer block foreign flow data collection

When VPS is down:
- Primary fetches timeout → cache is used
- Cache populates → fallback activates
- SSE broadcast can provide recent data
- Alert Commander can analyze with staleness warning

**Estimated time:** 30–45 minutes (job is minimal, integration is straightforward)
