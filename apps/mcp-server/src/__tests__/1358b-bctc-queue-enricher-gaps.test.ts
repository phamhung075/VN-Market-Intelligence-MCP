/**
 * TASK_1358b — bctcQueueEnricherJob gap tests (ENR-1 through ENR-8)
 *
 * Covers paths NOT reached by 1287-bctc-queue-enricher.test.ts:
 *   ENR-1: source_url = 'MISSING' placeholder is picked up by WHERE clause
 *   ENR-2: source_url LIKE '/test-%' placeholder is picked up by WHERE clause
 *   ENR-3: timeout error → timeoutFailures++ (not partialFailures)
 *   ENR-4: non-timeout error → partialFailures++ (not timeoutFailures)
 *   ENR-5: urlsPopulated only increments on actual DB write (empty discovery → 0)
 *   ENR-6: batchSize override smaller than DEFAULT_BATCH_SIZE
 *   ENR-7: mixed queue — NULL + MISSING processed; real-URL items excluded
 *   ENR-8: empty discovery → partialFailures++ (else branch + firstUrl guard)
 *
 * DI strategy: real in-memory SQLite + injectable discoverOptions fetch functions.
 * No mock.module calls required.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";
import type { HttpFetchFn, DiscoverOptions } from "../domain/services/bctcDiscovery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns one PDF URL for any ticker. */
function mockFetchSuccess(): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({ data: [{ fileUrl: "https://ssc.gov.vn/test.pdf" }] });
}

/** Simulates timeout — throws AbortError-style message. */
function mockFetchTimeout(): HttpFetchFn {
  return async (_url, _timeout) => {
    throw new Error("The operation was aborted (timeout)");
  };
}

/** Simulates non-timeout network error. */
function mockFetchNetworkError(): HttpFetchFn {
  return async (_url, _timeout) => {
    throw new Error("Connection refused");
  };
}

/** Returns empty data array (no PDFs found). */
function mockFetchEmpty(): HttpFetchFn {
  return async (_url, _timeout) => JSON.stringify({ data: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null = null,
  status = "pending",
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(code, year, quarter, status, sourceUrl);
}

function getQueueItem(
  db: Database,
  code: string,
): { action_code: string; status: string; source_url: string | null } | undefined {
  return db
    .query<{ action_code: string; status: string; source_url: string | null }, [string]>(
      `SELECT action_code, status, source_url FROM bctc_vps_queue WHERE action_code = ?`,
    )
    .get(code) ?? undefined;
}

function countNullSourceUrl(db: Database): number {
  const row = db
    .query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM bctc_vps_queue WHERE source_url IS NULL`)
    .get();
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB lifecycle
// ─────────────────────────────────────────────────────────────────────────────

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
  try {
    testDb.close();
  } catch {
    // ignore
  }
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1358b — bctcQueueEnricherJob gap tests (ENR-1 through ENR-8)", () => {

  // ---------------------------------------------------------------------------
  // ENR-1: source_url = 'MISSING' placeholder is included by WHERE clause
  // ---------------------------------------------------------------------------
  it("ENR-1: 'MISSING' source_url is treated as needing enrichment", async () => {
    // TASK_1944b: SSC removed. Use _fetchHsx to provide the PDF URL.
    insertQueueItem(testDb, "FPT", 2025, "Q4", "MISSING");

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/fpt-bctc.pdf"],
        _fetchSsc: mockFetchSuccess(),   // deprecated no-op
        _fetchCafef: mockFetchEmpty(),   // deprecated no-op
        _fetchVietstock: mockFetchEmpty(), // deprecated no-op
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const item = getQueueItem(testDb, "FPT");
    expect(item?.source_url).toBe("https://hsx.example.com/fpt-bctc.pdf");
  });

  // ---------------------------------------------------------------------------
  // ENR-2: source_url LIKE '/test-%' placeholder is included by WHERE clause
  // ---------------------------------------------------------------------------
  it("ENR-2: '/test-...' source_url placeholder is treated as needing enrichment", async () => {
    // TASK_1944b: SSC removed. Use _fetchHsx to provide the PDF URL.
    insertQueueItem(testDb, "FPT", 2025, "Q4", "/test-fpt-q4-2025");

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/fpt-bctc.pdf"],
        _fetchSsc: mockFetchSuccess(),   // deprecated no-op
        _fetchCafef: mockFetchEmpty(),   // deprecated no-op
        _fetchVietstock: mockFetchEmpty(), // deprecated no-op
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const item = getQueueItem(testDb, "FPT");
    // Placeholder must be replaced with the discovered URL
    expect(item?.source_url).not.toBe("/test-fpt-q4-2025");
    expect(item?.source_url).toBe("https://hsx.example.com/fpt-bctc.pdf");
  });

  // ---------------------------------------------------------------------------
  // ENR-3: timeout error increments timeoutFailures, not partialFailures
  //
  // Strategy: inject a discoverOptions object whose spread during
  //   `{ timeout: DISCOVERY_TIMEOUT_MS, ...opts.discoverOptions }`
  // throws an abort-style error. This causes the outer catch in the job
  // to fire with the timeout message before discoverHosePdfUrls is awaited.
  // ---------------------------------------------------------------------------
  it("ENR-3: timeout error → timeoutFailures++, partialFailures unchanged", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q4", null);

    // Construct a discoverOptions whose spread throws a timeout error.
    const timeoutDiscoverOptions = Object.defineProperty({} as Record<string, unknown>, "_fetchSsc", {
      get() {
        throw new Error("The operation was aborted (timeout)");
      },
      enumerable: true,
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: timeoutDiscoverOptions as DiscoverOptions,
    });

    expect(result.timeoutFailures).toBe(1);
    expect(result.partialFailures).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(result.itemsProcessed).toBe(1);

    // source_url must remain NULL — no write happened
    const item = getQueueItem(testDb, "VCB");
    expect(item?.source_url).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // ENR-4: non-timeout error increments partialFailures, not timeoutFailures
  // ---------------------------------------------------------------------------
  it("ENR-4: non-timeout error → partialFailures++, timeoutFailures unchanged", async () => {
    insertQueueItem(testDb, "HPG", 2025, "Q4", null);

    // Inject a discoverOptions whose spread throws a non-timeout error.
    const networkDiscoverOptions = Object.defineProperty({} as Record<string, unknown>, "_fetchSsc", {
      get() {
        throw new Error("Connection refused");
      },
      enumerable: true,
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: networkDiscoverOptions as DiscoverOptions,
    });

    expect(result.partialFailures).toBe(1);
    expect(result.timeoutFailures).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(result.itemsProcessed).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // ENR-5: urlsPopulated is only incremented when DB write succeeds
  //        (empty discovery → urlsPopulated stays 0, partialFailures increments)
  // ---------------------------------------------------------------------------
  it("ENR-5: empty discovery leaves urlsPopulated=0 and increments partialFailures", async () => {
    insertQueueItem(testDb, "MWG", 2025, "Q4", null);
    insertQueueItem(testDb, "TCB", 2025, "Q4", null);

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty(),
        _fetchCafef: mockFetchEmpty(),
        _fetchVietstock: mockFetchEmpty(),
      },
    });

    expect(result.itemsProcessed).toBe(2);
    expect(result.urlsPopulated).toBe(0);
    expect(result.partialFailures).toBe(2);

    // Both items remain with NULL source_url — no DB write occurred
    expect(countNullSourceUrl(testDb)).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // ENR-6: batchSize override smaller than DEFAULT_BATCH_SIZE (20)
  // ---------------------------------------------------------------------------
  it("ENR-6: batchSize:3 processes only 3 of 10 pending items", async () => {
    // TASK_1944b: SSC removed. Use _fetchHsx to provide the PDF URL.
    for (let i = 1; i <= 10; i++) {
      insertQueueItem(testDb, `CODE${String(i).padStart(2, "0")}`, 2025, "Q4", null);
    }

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      batchSize: 3,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/bctc.pdf"],
        _fetchSsc: mockFetchSuccess(),   // deprecated no-op
        _fetchCafef: mockFetchEmpty(),   // deprecated no-op
        _fetchVietstock: mockFetchEmpty(), // deprecated no-op
      },
    });

    expect(result.itemsProcessed).toBe(3);
    expect(result.urlsPopulated).toBe(3);

    // Exactly 7 items remain with NULL source_url
    expect(countNullSourceUrl(testDb)).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // ENR-7: mixed queue — NULL + MISSING processed; real-URL items excluded
  // ---------------------------------------------------------------------------
  it("ENR-7: WHERE clause excludes real-URL items, processes NULL and MISSING", async () => {
    // TASK_1944b: SSC removed. Use _fetchHsx to provide the PDF URL.
    insertQueueItem(testDb, "FPT", 2025, "Q4", null);                             // needs enrichment
    insertQueueItem(testDb, "VCB", 2025, "Q4", "MISSING");                        // needs enrichment
    insertQueueItem(testDb, "HPG", 2025, "Q4", "https://real-existing.pdf");      // already populated

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/bctc.pdf"],
        _fetchSsc: mockFetchSuccess(),   // deprecated no-op
        _fetchCafef: mockFetchEmpty(),   // deprecated no-op
        _fetchVietstock: mockFetchEmpty(), // deprecated no-op
      },
    });

    expect(result.itemsProcessed).toBe(2);   // FPT + VCB only
    expect(result.urlsPopulated).toBe(2);

    // HPG source_url must be unchanged
    const hpg = getQueueItem(testDb, "HPG");
    expect(hpg?.source_url).toBe("https://real-existing.pdf");

    // FPT and VCB must now have real URLs (from hsx mock)
    const fpt = getQueueItem(testDb, "FPT");
    expect(fpt?.source_url).toBe("https://hsx.example.com/bctc.pdf");

    const vcb = getQueueItem(testDb, "VCB");
    expect(vcb?.source_url).toBe("https://hsx.example.com/bctc.pdf");
  });

  // ---------------------------------------------------------------------------
  // ENR-8: defensive guard — empty discovery → partialFailures++ (else branch)
  //
  // When all fetchers return { data: [] }, discoverHosePdfUrls returns
  // { urls: [], source: null }. The job hits the `else` branch at line 155:
  //   result.partialFailures++;
  // This subsumes the `firstUrl === undefined` guard (defensive TypeScript path).
  // ---------------------------------------------------------------------------
  it("ENR-8: all-empty discovery → partialFailures++, urlsPopulated stays 0, source_url stays NULL", async () => {
    insertQueueItem(testDb, "SSI", 2025, "Q4", null);

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty(),
        _fetchCafef: mockFetchEmpty(),
        _fetchVietstock: mockFetchEmpty(),
      },
    });

    expect(result.partialFailures).toBe(1);
    expect(result.urlsPopulated).toBe(0);
    expect(result.itemsProcessed).toBe(1);

    const item = getQueueItem(testDb, "SSI");
    expect(item?.source_url).toBeNull();
  });
});
