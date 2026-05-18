/**
 * Task 1287a — BCTC Queue Enricher Tests (UPDATED for Task 1343c)
 *
 * Task 1343c re-enables active URL discovery via discoverHosePdfUrls().
 * The previous hotfix (Task 1288c) had disabled all discovery (no-op behavior).
 * This file reflects the NEW behavior: items with source_url=NULL are now
 * processed — discovery is attempted and source_url is written on success.
 *
 * All HTTP calls use injectable mock fetch functions (discoverOptions)
 * to avoid real network calls and geo-blocking.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

/** SSC mock that returns one PDF URL. */
function mockSscSuccess(ticker: string) {
  return async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify({
      data: [{ fileUrl: `https://iboard-query.ssc.vn/static/${ticker.toLowerCase()}-bctc.pdf` }],
    });
  };
}

/** Any-source mock that always fails (network error). */
async function mockFetchFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("Connection refused (geo-blocked)");
}

/** Any-source mock that returns no PDFs. */
async function mockFetchEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null = null,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(code, year, quarter, "pending", sourceUrl);
}

function getQueueItems(
  db: Database,
  status?: string,
): Array<{ action_code: string; status: string; source_url: string | null }> {
  const query = status
    ? `SELECT action_code, status, source_url FROM bctc_vps_queue WHERE status = ? ORDER BY action_code`
    : `SELECT action_code, status, source_url FROM bctc_vps_queue ORDER BY action_code`;
  return (status ? db.query(query).all(status) : db.query(query).all()) as any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1287a — BCTC Queue Enricher (Task 1343c: active discovery)", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    try {
      testDb.exec("DELETE FROM bctc_vps_queue");
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    if (testDb) {
      try {
        testDb.close();
      } catch {
        // ignore
      }
    }
    closeDb();
  });

  // TC-1: Empty queue — no-op
  it("returns empty result when no pending queue items", async () => {
    const result = await runBctcQueueEnricherJob({ db: testDb });
    expect(result.itemsProcessed).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(result.timeoutFailures).toBe(0);
    expect(result.partialFailures).toBe(0);
  });

  // TC-2: Items with NULL source_url get discovery attempted;
  //       on success, source_url is populated and items remain 'pending'
  //       TASK_1944b: SSC removed — use _fetchHsx to provide the PDF URL.
  it("populates source_url when hsx discovery succeeds (SSC removed TASK_1944b)", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);
    insertQueueItem(testDb, "HPG", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/bctc.pdf"],
        _fetchSsc: mockSscSuccess("VCB"),  // deprecated no-op
        _fetchCafef: mockFetchEmpty,        // deprecated no-op
        _fetchVietstock: mockFetchEmpty,    // deprecated no-op
      },
    });

    expect(result.itemsProcessed).toBe(3);
    expect(result.urlsPopulated).toBe(3);
    expect(result.partialFailures).toBe(0);

    // All items should now have a source_url
    const items = getQueueItems(testDb);
    for (const item of items) {
      expect(item.source_url).not.toBeNull();
      expect(item.source_url).toMatch(/\.pdf$/i);
    }
    // Items remain 'pending' — VPS will fetch the PDF
    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(3);
    // No items were skipped
    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);
  });

  // TC-3: Items that already have source_url are ignored (query filters them out)
  // TASK_1944b: SSC removed — use _fetchHsx to provide the PDF URL.
  it("ignores items that already have source_url", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", "https://hsx.example.com/vcb-existing.pdf");
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/fpt-bctc.pdf"],
        _fetchSsc: mockSscSuccess("FPT"),  // deprecated no-op
        _fetchCafef: mockFetchEmpty,        // deprecated no-op
        _fetchVietstock: mockFetchEmpty,    // deprecated no-op
      },
    });

    // Only FPT (null source_url) is processed
    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const vcb = getQueueItems(testDb).find(i => i.action_code === "VCB");
    expect(vcb?.source_url).toBe("https://hsx.example.com/vcb-existing.pdf");

    const fpt = getQueueItems(testDb).find(i => i.action_code === "FPT");
    expect(fpt?.source_url).toMatch(/\.pdf$/i);
  });

  // TC-4: Batch dequeue limit (max 20 per run) — uses default batchSize=20
  // TASK_1944b: SSC removed — use _fetchHsx to provide the PDF URL.
  it("respects batchSize — only processes up to batchSize items", async () => {
    for (let i = 1; i <= 30; i++) {
      insertQueueItem(testDb, `CODE${String(i).padStart(3, "0")}`, 2025, "Q1", null);
    }

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      batchSize: 20,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/bctc.pdf"],
        _fetchSsc: mockSscSuccess("CODE"),  // deprecated no-op
        _fetchCafef: mockFetchEmpty,         // deprecated no-op
        _fetchVietstock: mockFetchEmpty,     // deprecated no-op
      },
    });

    // Only 20 of 30 items should be processed in one pass
    expect(result.itemsProcessed).toBe(20);
  });

  // TC-5: All discovery fails — items remain pending, partialFailures incremented
  it("leaves items pending when all discovery sources fail", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchFail,
        _fetchCafef: mockFetchFail,
        _fetchVietstock: mockFetchFail,
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(0);
    expect(result.partialFailures).toBe(1);

    // Item stays pending — no source_url written
    const items = getQueueItems(testDb);
    expect(items.length).toBeGreaterThan(0);
    const item = items[0]!;
    expect(item.source_url).toBeNull();
    expect(item.status).toBe("pending");
    // No skipped items
    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);
  });

  // TC-6: Idempotency — re-running on already-populated items doesn't process them again
  // TASK_1944b: SSC removed — use _fetchHsx to provide the PDF URL.
  it("is idempotent — items with source_url are not re-processed", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    // First run — populates source_url
    const result1 = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/vcb-bctc.pdf"],
        _fetchSsc: mockSscSuccess("VCB"),  // deprecated no-op
        _fetchCafef: mockFetchEmpty,        // deprecated no-op
        _fetchVietstock: mockFetchEmpty,    // deprecated no-op
      },
    });
    expect(result1.itemsProcessed).toBe(1);
    expect(result1.urlsPopulated).toBe(1);

    // Second run — source_url already populated, item excluded by WHERE clause
    const result2 = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/vcb-bctc.pdf"],
        _fetchSsc: mockSscSuccess("VCB"),  // deprecated no-op
        _fetchCafef: mockFetchEmpty,        // deprecated no-op
        _fetchVietstock: mockFetchEmpty,    // deprecated no-op
      },
    });
    expect(result2.itemsProcessed).toBe(0);
    expect(result2.urlsPopulated).toBe(0);
  });

  // TC-7: Graceful handling of DB query errors
  it("returns empty result if query fails", async () => {
    const badDb = {
      query: () => {
        throw new Error("Simulated DB error");
      },
      prepare: () => ({ run: () => {} }),
    } as any;

    const result = await runBctcQueueEnricherJob({ db: badDb });

    expect(result.itemsProcessed).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(result.timeoutFailures).toBe(0);
    expect(result.partialFailures).toBe(0);
  });
});
