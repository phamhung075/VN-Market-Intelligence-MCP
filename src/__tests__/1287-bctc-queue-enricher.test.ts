/**
 * Task 1287a — RED: Async BCTC Queue Enricher Tests
 *
 * Background scheduler job that enriches BCTC VPS queue items with missing
 * source_url values. Tests define expected behavior before implementation.
 *
 * Problem: /api/bctc-fetch-queue endpoint times out (504 after 60s) when
 * processing >100 BCTC PDFs due to sync SSC credibility lookups blocking
 * the queue response.
 *
 * Solution: Add skip_enrichment=true query parameter to skip sync enrichment,
 * defer to background job (this task) that runs every 15min.
 *
 * TDD: Tests written first (RED), then implementation.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";
import type { SscDocumentLookup } from "../application/usecases/bctcQueueEnricher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a test queue item directly into the database.
 */
function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null = null,
): void {
  const sourceUrlClause = sourceUrl ? `'${sourceUrl}'` : "NULL";
  db.exec(
    `INSERT INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES ('${code}', ${year}, '${quarter}', 'pending', ${sourceUrlClause})`
  );
}

/**
 * Query queue items to verify enrichment.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1287a — BCTC Queue Enricher (RED — failing tests)", () => {
  let testDb: Database;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    initDatabase(testDb);
  });

  afterEach(() => {
    // Clean up test database
    if (testDb) {
      try {
        testDb.close();
      } catch {
        // ignore close errors
      }
    }
    closeDb();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-1: Job execution baseline
  // ──────────────────────────────────────────────────────────────────────────

  it("returns empty result when no pending queue items", async () => {
    const result = await runBctcQueueEnricherJob({ db: testDb });

    expect(result.itemsProcessed).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(result.timeoutFailures).toBe(0);
    expect(result.partialFailures).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-2: URL population happy path
  // ──────────────────────────────────────────────────────────────────────────

  it("populates source_url for items where SSC lookup succeeds", async () => {

    // Insert 3 items, all with source_url = NULL
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);
    insertQueueItem(testDb, "HPG", 2025, "Q1", null);

    // Mock SSC fetcher: returns URL for VCB + FPT, fails for HPG
    const sscLookup: SscDocumentLookup = async (code, _q, _y) => {
      if (code === "VCB") return [{ url: "https://ssc.gov.vn/vcb.pdf" }];
      if (code === "FPT") return [{ url: "https://ssc.gov.vn/fpt.pdf" }];
      return [];
    };

    const result = await runBctcQueueEnricherJob({ db: testDb, sscLookup });

    expect(result.urlsPopulated).toBe(2);

    const items = getQueueItems(testDb);
    const vcbItem = items.find((i) => i.action_code === "VCB");
    const fptItem = items.find((i) => i.action_code === "FPT");
    const hpgItem = items.find((i) => i.action_code === "HPG");

    expect(vcbItem?.source_url).toBe("https://ssc.gov.vn/vcb.pdf");
    expect(fptItem?.source_url).toBe("https://ssc.gov.vn/fpt.pdf");
    expect(hpgItem?.source_url).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: Timeout handling
  // ──────────────────────────────────────────────────────────────────────────

  it("handles SSC fetcher timeout gracefully — does not throw", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    const sscLookup: SscDocumentLookup = async (_code, _q, _y) => {
      throw new Error("Timeout: SSC portal not responding within 5s");
    };

    const result = await runBctcQueueEnricherJob({ db: testDb, sscLookup });

    expect(result.timeoutFailures).toBe(1);

    const items = getQueueItems(testDb);
    const item = items[0];

    expect(item?.source_url).toBeNull();
    expect(item?.status).toBe("pending"); // Status unchanged
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: Skip already-enriched items
  // ──────────────────────────────────────────────────────────────────────────

  it("skips queue items that already have source_url — no redundant SSC call", async () => {

    let sscCallCount = 0;
    const sscLookup: SscDocumentLookup = async (_code: string, _q: string, _y: number) => {
      sscCallCount++;
      return [{ url: "https://ssc.gov.vn/new.pdf" }];
    };

    // One item already enriched, one not
    insertQueueItem(testDb, "VCB", 2025, "Q1", "https://ssc.gov.vn/vcb-existing.pdf");
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({ db: testDb, sscLookup });

    // Should only call SSC for FPT (the unenriched one)
    expect(sscCallCount).toBe(1);
    expect(result.urlsPopulated).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5: Partial failure with mixed results
  // ──────────────────────────────────────────────────────────────────────────

  it("reports partial failures — mixes successes, timeouts, and empty results", async () => {

    // Insert 10 items
    for (let i = 1; i <= 10; i++) {
      insertQueueItem(testDb, `CODE${i}`, 2025, "Q1", null);
    }

    const sscLookup: SscDocumentLookup = async (code: string, _q: string, _y: number) => {
      const num = parseInt(code.replace("CODE", ""), 10);
      if (num <= 6) return [{ url: `https://ssc.gov.vn/code${num}.pdf` }]; // Success: 6
      if (num <= 9) throw new Error("Timeout"); // Timeout: 3
      return []; // Empty: 1
    };

    const result = await runBctcQueueEnricherJob({ db: testDb, sscLookup });

    expect(result.itemsProcessed).toBe(10);
    expect(result.urlsPopulated).toBe(6);
    expect(result.timeoutFailures).toBe(3);
    expect(result.partialFailures).toBe(1);

    // All should remain in queue
    const items = getQueueItems(testDb);
    expect(items.length).toBe(10);
    expect(items.every((i) => i.status === "pending")).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Idempotency — re-run on same items
  // ──────────────────────────────────────────────────────────────────────────

  it("is idempotent — re-running does not duplicate enrichment", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    let sscCallCount = 0;
    const sscLookup: SscDocumentLookup = async (_code: string, _q: string, _y: number) => {
      sscCallCount++;
      return [{ url: "https://ssc.gov.vn/vcb.pdf" }];
    };

    // First run
    const result1 = await runBctcQueueEnricherJob({ db: testDb, sscLookup });
    expect(result1.urlsPopulated).toBe(1);
    expect(sscCallCount).toBe(1);

    // Second run on same data
    const result2 = await runBctcQueueEnricherJob({ db: testDb, sscLookup });
    expect(result2.urlsPopulated).toBe(0); // No more to enrich
    expect(sscCallCount).toBe(1); // No new SSC call
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-7: Batch dequeue limit
  // ──────────────────────────────────────────────────────────────────────────

  it("respects batch dequeue limit (20 items max per run)", async () => {
    // Insert 100 items
    for (let i = 1; i <= 100; i++) {
      insertQueueItem(testDb, `CODE${String(i).padStart(3, "0")}`, 2025, "Q1", null);
    }

    const sscLookup: SscDocumentLookup = async (_code: string, _q: string, _y: number) => [
      { url: "https://ssc.gov.vn/dummy.pdf" },
    ];

    const result = await runBctcQueueEnricherJob({ db: testDb, sscLookup });

    expect(result.itemsProcessed).toBe(20);
    expect(result.urlsPopulated).toBe(20);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-8: Empty SSC results counted as partial failure
  // ──────────────────────────────────────────────────────────────────────────

  it("counts empty SSC results as partial failures", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);

    const sscLookup: SscDocumentLookup = async (_code: string, _q: string, _y: number) => {
      return []; // Empty result
    };

    const result = await runBctcQueueEnricherJob({ db: testDb, sscLookup });

    expect(result.itemsProcessed).toBe(2);
    expect(result.urlsPopulated).toBe(0);
    expect(result.partialFailures).toBe(2);

    const items = getQueueItems(testDb);
    expect(items.every((i) => i.source_url === null)).toBe(true);
  });
});
