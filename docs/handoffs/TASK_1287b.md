# TASK 1287b — GREEN: Implement Async BCTC Queue Enricher Background Job

**Sprint:** 1287 (Async BCTC Enrichment — Option A)
**Phase:** GREEN (Implementation)
**Status:** Todo
**Size:** S (~100-120 lines, follows existing scheduler pattern)
**Depends on:** Task 1287a (RED tests passing) ✓

---

## Objective

Implement background scheduler job `bctcQueueEnricherJob.ts` that periodically dequeues unenriched BCTC VPS queue items and populates their `source_url` field via SSC lookup with timeout protection.

---

## Architecture Decision

**Why background job vs. sync enrichment:**
- Sprint 1280 added `skip_enrichment=true` query param to unblock `/api/bctc-fetch-queue` timeouts
- Enrichment (SSC lookup) is expensive, blocks queue response for >100 items
- Solution: Decouple enrichment into background job (scheduler layer)
- Runs every 15min, processes 20 items at a time, timeout-safe, retryable

**Layer placement:**
- **File:** `src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (scheduler layer)
- **Imports:** Domain services (earningsCalendar if needed), infrastructure (DB, logger, SSC fetcher)
- **Pattern:** Follows existing `bctcOverdueCheckJob.ts` structure (query watchlist, batch results, update DB)

---

## Implementation Signature (from test expectations)

```typescript
import type { Database } from "bun:sqlite";
import type { SscDocumentLookup } from "../application/usecases/bctcQueueEnricher.js";

export interface BctcQueueEnricherRunResult {
  itemsProcessed: number;
  urlsPopulated: number;
  timeoutFailures: number;
  partialFailures: number; // Items where SSC returned empty (no docs found)
}

export async function runBctcQueueEnricherJob(opts: {
  db?: Database;
  sscLookup?: SscDocumentLookup;
  batchSize?: number; // default 20
  timeoutMs?: number; // default 5000
} = {}): Promise<BctcQueueEnricherRunResult>
```

---

## Detailed Implementation Plan

### Step 1: Import statements
```typescript
import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";

// SSC fetcher: use listSscDocuments from ssc.ts
import { listSscDocuments } from "../../infrastructure/fetchers/ssc.js";

// Type reuse from application layer
import type { SscDocumentLookup } from "../../application/usecases/bctcQueueEnricher.js";
```

### Step 2: Constants & defaults
```typescript
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 5000;
```

### Step 3: Helper function — fetch with timeout
```typescript
/**
 * Wrapper around SSC fetcher with timeout protection.
 * If fetch takes > timeoutMs, reject with timeout error.
 */
async function fetchWithTimeout(
  code: string,
  quarter: string,
  year: number,
  sscLookup: SscDocumentLookup,
  timeoutMs: number,
): Promise<{ url: string }[] | null> {
  return Promise.race([
    sscLookup(code, quarter, year),
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error(`SSC lookup timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}
```

### Step 4: Main function — runBctcQueueEnricherJob
**Pseudocode:**
```typescript
export async function runBctcQueueEnricherJob(opts: {...} = {}): Promise<BctcQueueEnricherRunResult> {
  const db = opts.db ?? getDb();
  const sscLookup = opts.sscLookup ?? listSscDocuments;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const result = {
    itemsProcessed: 0,
    urlsPopulated: 0,
    timeoutFailures: 0,
    partialFailures: 0,
  };

  // ── Query unenriched items (source_url IS NULL), ordered by created_at ASC ──
  let queueItems = [];
  try {
    queueItems = db
      .query<{
        id: number;
        action_code: string;
        period_year: number;
        period_quarter: string;
      }, [number]>(
        `SELECT id, action_code, period_year, period_quarter
         FROM bctc_vps_queue
         WHERE source_url IS NULL AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(batchSize);
  } catch (err) {
    logger.warn("[bctcQueueEnricher] Query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  if (queueItems.length === 0) {
    return result;
  }

  // ── Prepare batch update statement ──
  const updateUrl = db.prepare(
    `UPDATE bctc_vps_queue SET source_url = ? WHERE id = ?`,
  );

  // ── Process each item ──
  for (const item of queueItems) {
    result.itemsProcessed++;

    try {
      const docs = await fetchWithTimeout(
        item.action_code,
        item.period_quarter,
        item.period_year,
        sscLookup,
        timeoutMs,
      );

      if (docs && docs.length > 0 && docs[0]?.url) {
        // Success: update source_url
        updateUrl.run(docs[0].url, item.id);
        result.urlsPopulated++;

        logger.debug("[bctcQueueEnricher] populated URL", {
          code: item.action_code,
          quarter: item.period_quarter,
          year: item.period_year,
          url: docs[0].url,
        });
      } else {
        // No docs found: SSC returned empty
        result.partialFailures++;
        logger.debug("[bctcQueueEnricher] no documents found from SSC", {
          code: item.action_code,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("timeout")) {
        result.timeoutFailures++;
        logger.warn("[bctcQueueEnricher] SSC lookup timeout", {
          code: item.action_code,
          timeoutMs,
        });
      } else {
        // Generic error: treat as failure
        result.timeoutFailures++;
        logger.warn("[bctcQueueEnricher] SSC lookup error", {
          code: item.action_code,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Log summary ──
  if (result.itemsProcessed > 0) {
    logger.info("[bctcQueueEnricher] batch enrichment complete", {
      itemsProcessed: result.itemsProcessed,
      urlsPopulated: result.urlsPopulated,
      timeoutFailures: result.timeoutFailures,
      partialFailures: result.partialFailures,
    });
  }

  // ── Record job run ──
  await recordJobRun("bctcQueueEnricher", {
    status: "success",
    itemsProcessed: result.itemsProcessed,
    urlsPopulated: result.urlsPopulated,
    failureCount: result.timeoutFailures + result.partialFailures,
  });

  return result;
}
```

---

## Step 5: Register in scheduler jobs.ts

**Add to `src/scheduler/jobs.ts`:**

1. **Import statement** (near line 30):
```typescript
import { runBctcQueueEnricherJob } from './financial-reports/bctcQueueEnricherJob.js'
```

2. **Add CRON definition** (in CRONS object, after line 90):
```typescript
bctcQueueEnricher:      Bun.env.CRON_BCTC_QUEUE_ENRICHER      ?? '*/15 * * * *',
```

3. **Register cron job** (in setupScheduler(), after bctcReparseJob registration):
```typescript
const bctcQueueEnricherHandle = cron.schedule(CRONS.bctcQueueEnricher, async () => {
  try {
    await runBctcQueueEnricherJob();
  } catch (err) {
    logger.error('[scheduler] bctcQueueEnricher failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
jobHandles.push(bctcQueueEnricherHandle);
```

4. **Update comment block at top of jobs.ts** (line 5-26, add after bctcReparseJob):
```
*   bctcQueueEnricher     every 15 min         (task 1287) ✓
```

---

## Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Empty queue | Return `{ itemsProcessed: 0, ... }` immediately |
| SSC timeout (>5s) | Catch, log, increment `timeoutFailures`, continue to next item |
| SSC returns `[]` (empty) | Log debug, increment `partialFailures`, `source_url` stays NULL |
| DB query fails | Log warning, return early with result state |
| Item already enriched (`source_url NOT NULL`) | Skip in WHERE clause — idempotent |
| Batch size respected | Query with `LIMIT batchSize` — max 20 items per run |

---

## DDD Compliance

- **Domain layer:** No new domain logic required (reuses `listSscDocuments` contract from ssc.ts)
- **Application layer:** Reuses `bctcQueueEnricher.ts` types (`SscDocumentLookup`)
- **Scheduler layer:** This file — orchestrates DB + fetcher
- **No cross-layer violations:** Scheduler imports infrastructure + application only

---

## Test Expectations (GREEN Phase)

After implementing, all RED tests from 1287a must **PASS**:
```
✓ returns empty result when no pending queue items
✓ populates source_url for items where SSC lookup succeeds
✓ handles SSC fetcher timeout gracefully
✓ skips queue items that already have source_url
✓ reports partial failures
✓ is idempotent
✓ respects batch dequeue limit

Expected: 7-8 passed, 0 failed
Test baseline: 6248 + 8 = 6256 assertions
```

---

## Performance Notes

- **Batch size:** 20 items = ~20 SSC HTTP requests per 15-min window = ~1.3 requests/min (safe)
- **Timeout per item:** 5s × 20 items = 100s max per job run (well under next 15-min cycle)
- **DB updates:** Single prepared statement, reused for all 20 items (efficient)
- **Idempotency:** WHERE clause filters only NULL source_url — re-runs don't duplicate

---

## Acceptance Criteria

- [x] File created: `src/scheduler/financial-reports/bctcQueueEnricherJob.ts`
- [x] Implements `runBctcQueueEnricherJob()` with correct signature
- [x] Handles timeout via `Promise.race()` wrapper
- [x] Queries only unenriched items (`source_url IS NULL`)
- [x] Batch processes max 20 items per run
- [x] Updates DB with discovered URLs via prepared statement
- [x] Logs summary + per-item debug messages
- [x] Registered in `src/scheduler/jobs.ts` cron with `*/15 * * * *`
- [x] All 7-8 RED tests pass
- [x] TypeScript strict mode: 0 errors
- [x] Test baseline: 6248 → 6256 (+8 assertions)
- [x] No DDD violations (scheduler imports domain + infrastructure only)

---

## Success Definition (Task Complete)

1. File `bctcQueueEnricherJob.ts` created in scheduler layer (~100 lines)
2. Job runs every 15min, dequeues 10–20 items, enriches with source_url
3. All 7–8 assertions from 1287a RED phase pass
4. TypeScript compiles without errors
5. Ready to merge to main branch

---

## [Developer] Implementation Record

**Status:** COMPLETE

### Files Modified
1. `/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (NEW, 200 lines)
   - Implemented `runBctcQueueEnricherJob()` with full logic
   - Helper: `fetchWithTimeout()` with Promise.race timeout protection
   - Lazy-loads SSC fetcher with signature adapter (quarter → reportType conversion)
   - Query: `SELECT ... WHERE source_url IS NULL AND status = 'pending' LIMIT ?`
   - Batch processing: default 20 items per run
   - Error handling: timeout (5s), partial failures, generic errors
   - Logging: per-item debug + summary info messages

2. `/src/scheduler/jobs.ts` (MODIFIED)
   - Added import: `runBctcQueueEnricherJob`
   - Added CRON def: `bctcQueueEnricher: '*/15 * * * *'` (env override: CRON_BCTC_QUEUE_ENRICHER)
   - Registered cron job in `startScheduler()` with recordJobRun wrapper
   - Updated top comment to document job

3. `/src/__tests__/1287-bctc-queue-enricher.test.ts` (FIXED TEST SETUP)
   - Changed `beforeEach()` to `async beforeEach()`
   - Added `await initDatabase(testDb)` (was fire-and-forget, now properly awaited)
   - Added `testDb.exec("DELETE FROM bctc_vps_queue")` to clear between tests (fixes database isolation)

### Tests: 8 PASS
- ✓ returns empty result when no pending queue items
- ✓ populates source_url for items where SSC lookup succeeds
- ✓ handles SSC fetcher timeout gracefully — does not throw
- ✓ skips queue items that already have source_url — no redundant SSC call
- ✓ reports partial failures — mixes successes, timeouts, and empty results
- ✓ is idempotent — re-running does not duplicate enrichment
- ✓ respects batch dequeue limit (20 items max per run)
- ✓ counts empty SSC results as partial failures

**Full Suite:** 6256 pass (baseline 6248 + 8 new tests), 21 skip, 1 fail (unrelated)

### Type Safety
- `bun tsc --noEmit`: 0 errors
- BctcQueueEnricherRunResult interface: { itemsProcessed, urlsPopulated, timeoutFailures, partialFailures }
- SscDocumentLookup type: (code, quarter, year) => Promise<SscDoc[]> ✓

### DDD Compliance
- Imports: domain (earningsCalendar, not used), infrastructure (db, logger, ssc fetcher), application (types)
- No domain → domain violations
- No cross-layer leakage
- Scheduler layer (correct placement)
