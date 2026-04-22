# TASK 1287a — RED: Async BCTC Queue Enricher Tests

**Sprint:** 1287 (Async BCTC Enrichment — Option A)
**Phase:** RED (Test-Driven Development)
**Status:** Todo
**Size:** S (~40-50 lines test code, 5-8 assertions)
**Depends on:** Sprint 1280 (skip_enrichment flag merged) ✓

---

## Objective

Write failing test assertions for the background scheduler job `bctcQueueEnricherJob.ts` that enriches BCTC VPS queue items with missing `source_url` values. Tests define expected behavior before implementation.

---

## Context

**Problem (Sprint 1280 background):**
- `/api/bctc-fetch-queue` endpoint times out (504 after 60s) when processing >100 BCTC PDFs
- Root cause: SSC credibility lookups (sync `listSscDocuments`) block queue response
- Solution: Added `skip_enrichment=true` query parameter to skip sync enrichment, defer to background job

**This Task (1287a):**
- Define expected behavior for background job that runs every 15min
- Job dequeues 10–20 items with `source_url = NULL`
- Calls SSC fetcher with timeout wrapper
- Populates `source_url` column in-place
- Handles timeouts, partial failures, idempotency

---

## Test File Structure

**File:** `src/__tests__/1287-bctc-queue-enricher.test.ts`

**Setup:**
```typescript
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";
import { getDb } from "../infrastructure/db/schema.js";
```

**Helper function** (write in test file, NOT in main code):
```typescript
// Insert test queue items directly
function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null = null,
): void {
  db.exec(
    `INSERT INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES ('${code}', ${year}, '${quarter}', 'pending', ${
      sourceUrl ? `'${sourceUrl}'` : 'NULL'
    })`
  );
}

// Query queue items to verify enrichment
function getQueueItems(db: Database): Array<{
  action_code: string;
  period_year: number;
  period_quarter: string;
  source_url: string | null;
  status: string;
}> {
  return db
    .query(
      `SELECT action_code, period_year, period_quarter, source_url, status
       FROM bctc_vps_queue
       WHERE status = 'pending'
       ORDER BY action_code`
    )
    .all() as any[];
}
```

---

## Test Cases (5-8 Assertions)

### TC-1: Job execution baseline (1 assertion)
**Scenario:** Run job on empty queue
**Expected:** Returns `{ itemsProcessed: 0, urlsPopulated: 0, timeoutFailures: 0, partialFailures: 0 }`

**Code outline:**
```typescript
it("returns empty result when no pending queue items", async () => {
  const db = getDb();
  const result = await runBctcQueueEnricherJob({ db });
  expect(result.itemsProcessed).toBe(0);
});
```

---

### TC-2: URL population happy path (1 assertion)
**Scenario:** 3 items with NULL source_url, SSC fetcher returns URL for 2 of them
**Expected:** `urlsPopulated = 2`, both items have source_url set, 1 remains NULL

**Code outline:**
```typescript
it("populates source_url for items where SSC lookup succeeds", async () => {
  const db = getDb();

  // Insert 3 items, all with source_url = NULL
  insertQueueItem(db, "VCB", 2025, "Q1", null);
  insertQueueItem(db, "FPT", 2025, "Q1", null);
  insertQueueItem(db, "HPG", 2025, "Q1", null);

  // Mock SSC fetcher: returns URL for VCB + FPT, fails for HPG
  // (implementation provides this via dependency injection)

  const result = await runBctcQueueEnricherJob({
    db,
    sscLookup: async (code, _q, _y) => {
      if (code === "VCB") return [{ url: "https://ssc.gov.vn/vcb.pdf" }];
      if (code === "FPT") return [{ url: "https://ssc.gov.vn/fpt.pdf" }];
      return [];
    }
  });

  expect(result.urlsPopulated).toBe(2);
  const items = getQueueItems(db);
  expect(items.find(i => i.action_code === "VCB")!.source_url).toBe("https://ssc.gov.vn/vcb.pdf");
  expect(items.find(i => i.action_code === "FPT")!.source_url).toBe("https://ssc.gov.vn/fpt.pdf");
  expect(items.find(i => i.action_code === "HPG")!.source_url).toBeNull();
});
```

---

### TC-3: Timeout handling (1 assertion)
**Scenario:** SSC fetcher times out (throws timeout error)
**Expected:** Job catches timeout, logs warning, leaves source_url NULL, counts in `timeoutFailures`

**Code outline:**
```typescript
it("handles SSC fetcher timeout gracefully — does not throw", async () => {
  const db = getDb();
  insertQueueItem(db, "VCB", 2025, "Q1", null);

  const result = await runBctcQueueEnricherJob({
    db,
    sscLookup: async (_code, _q, _y) => {
      throw new Error("Timeout: SSC portal not responding within 5s");
    }
  });

  expect(result.timeoutFailures).toBe(1);
  const item = getQueueItems(db)[0];
  expect(item.source_url).toBeNull();
  expect(item.status).toBe("pending"); // Status unchanged
});
```

---

### TC-4: Skip already-enriched items (1 assertion)
**Scenario:** Queue has mix of enriched (source_url set) and unenriched items
**Expected:** Job only processes unenriched, does not call SSC for items with source_url already set

**Code outline:**
```typescript
it("skips queue items that already have source_url — no redundant SSC call", async () => {
  const db = getDb();

  let sscCallCount = 0;
  const sscLookup = async (_code: string, _q: string, _y: number) => {
    sscCallCount++;
    return [{ url: "https://ssc.gov.vn/new.pdf" }];
  };

  // One item already enriched, one not
  insertQueueItem(db, "VCB", 2025, "Q1", "https://ssc.gov.vn/vcb-existing.pdf");
  insertQueueItem(db, "FPT", 2025, "Q1", null);

  const result = await runBctcQueueEnricherJob({ db, sscLookup });

  // Should only call SSC for FPT (the unenriched one)
  expect(sscCallCount).toBe(1);
  expect(result.urlsPopulated).toBe(1);
});
```

---

### TC-5: Partial failure with mixed results (1 assertion)
**Scenario:** 10 items enqueued, 6 succeed, 3 timeout, 1 returns empty (no docs found)
**Expected:** `urlsPopulated = 6, timeoutFailures = 3, partialFailures = 1`, all 10 remain in queue (status="pending")

**Code outline:**
```typescript
it("reports partial failures — mixes successes, timeouts, and empty results", async () => {
  const db = getDb();

  // Insert 10 items
  for (let i = 1; i <= 10; i++) {
    insertQueueItem(db, `CODE${i}`, 2025, "Q1", null);
  }

  const sscLookup = async (code: string, _q: string, _y: number) => {
    const num = parseInt(code.replace("CODE", ""), 10);
    if (num <= 6) return [{ url: `https://ssc.gov.vn/code${num}.pdf` }]; // Success: 6
    if (num <= 9) throw new Error("Timeout"); // Timeout: 3
    return []; // Empty: 1
  };

  const result = await runBctcQueueEnricherJob({ db, sscLookup });

  expect(result.itemsProcessed).toBe(10);
  expect(result.urlsPopulated).toBe(6);
  expect(result.timeoutFailures).toBe(3);
  expect(result.partialFailures).toBe(1);

  // All should remain in queue
  const items = getQueueItems(db);
  expect(items.length).toBe(10);
  expect(items.every(i => i.status === "pending")).toBe(true);
});
```

---

### TC-6: Idempotency — re-run on same items (1 assertion)
**Scenario:** Run job twice on same unenriched queue items
**Expected:** First run populates URLs, second run skips already-enriched items (no duplicate inserts, no duplicate SSC calls)

**Code outline:**
```typescript
it("is idempotent — re-running does not duplicate enrichment", async () => {
  const db = getDb();
  insertQueueItem(db, "VCB", 2025, "Q1", null);

  let sscCallCount = 0;
  const sscLookup = async (_code: string, _q: string, _y: number) => {
    sscCallCount++;
    return [{ url: "https://ssc.gov.vn/vcb.pdf" }];
  };

  // First run
  const result1 = await runBctcQueueEnricherJob({ db, sscLookup });
  expect(result1.urlsPopulated).toBe(1);
  expect(sscCallCount).toBe(1);

  // Second run on same data
  const result2 = await runBctcQueueEnricherJob({ db, sscLookup });
  expect(result2.urlsPopulated).toBe(0); // No more to enrich
  expect(sscCallCount).toBe(1); // No new SSC call
});
```

---

### TC-7 (optional): Batch dequeue limit (1 assertion)
**Scenario:** 100 unenriched items in queue, job batch limit = 20
**Expected:** Job processes exactly 20 items per run, returns `itemsProcessed = 20`, remaining 80 untouched

**Code outline:**
```typescript
it("respects batch dequeue limit (20 items max per run)", async () => {
  const db = getDb();

  // Insert 100 items
  for (let i = 1; i <= 100; i++) {
    insertQueueItem(db, `CODE${String(i).padStart(3, "0")}`, 2025, "Q1", null);
  }

  const sscLookup = async (_code: string, _q: string, _y: number) => [
    { url: "https://ssc.gov.vn/dummy.pdf" }
  ];

  const result = await runBctcQueueEnricherJob({ db, sscLookup });

  expect(result.itemsProcessed).toBe(20);
  expect(result.urlsPopulated).toBe(20);
});
```

---

## Expected Test Output (RED Phase)

All 7-8 test cases **FAIL** at end of 1287a:
```
✗ returns empty result when no pending queue items
✗ populates source_url for items where SSC lookup succeeds
✗ handles SSC fetcher timeout gracefully
✗ skips queue items that already have source_url
✗ reports partial failures
✗ is idempotent
✗ respects batch dequeue limit

Expected: 0 passed, 7-8 failed
```

---

## Acceptance Criteria

- [x] File created: `src/__tests__/1287-bctc-queue-enricher.test.ts`
- [x] 5–8 test cases written, all RED (failing)
- [x] Tests use dependency injection for `sscLookup` function (injectable, no hardcoding)
- [x] Tests verify: job execution, URL population, timeout handling, idempotency, batch limits
- [x] No implementation code written (RED phase only)
- [x] Tests run without crashing: `bun test src/__tests__/1287-bctc-queue-enricher.test.ts`
- [x] Test baseline increases from 6248 → 6255 (7-8 new assertions)

---

## Notes for Developer (1287b)

When implementing 1287b (GREEN phase), follow this signature:

```typescript
// src/scheduler/financial-reports/bctcQueueEnricherJob.ts

export interface BctcQueueEnricherRunResult {
  itemsProcessed: number;
  urlsPopulated: number;
  timeoutFailures: number;
  partialFailures: number;
}

export async function runBctcQueueEnricherJob(opts: {
  db?: Database;
  sscLookup?: SscDocumentLookup;
  batchSize?: number; // default 20
  timeoutMs?: number; // default 5000
} = {}): Promise<BctcQueueEnricherRunResult>
```

The job will be registered in `src/scheduler/jobs.ts` with cron: `*/15 * * * *` (every 15 min).
