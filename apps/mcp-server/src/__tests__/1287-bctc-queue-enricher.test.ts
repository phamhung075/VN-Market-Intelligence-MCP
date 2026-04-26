/**
 * Task 1287a — BCTC Queue Enricher Tests (UPDATED for Bug-2 fix)
 *
 * Previous hotfix (Task 1288c) marked items with source_url=NULL as 'skipped',
 * which permanently blocked VPS re-discovery. That was wrong.
 *
 * Correct behavior: Items with source_url=NULL must remain 'pending' so the
 * VPS service can discover and push the PDF URL. The enricher job is a no-op
 * for these items — it neither skips nor processes them.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

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
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(code, year, quarter, "pending", sourceUrl);
}

/**
 * Query all queue items by status.
 */
function getQueueItems(
  db: Database,
  status?: string,
): Array<{
  action_code: string;
  status: string;
  source_url: string | null;
}> {
  const query = status
    ? `SELECT action_code, status, source_url FROM bctc_vps_queue WHERE status = ? ORDER BY action_code`
    : `SELECT action_code, status, source_url FROM bctc_vps_queue ORDER BY action_code`;

  return (
    status
      ? db.query(query).all(status)
      : db.query(query).all()
  ) as any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1287a — BCTC Queue Enricher (Hotfix 1288c)", () => {
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

  // ──────────────────────────────────────────────────────────────────────────
  // TC-1: Empty queue — no-op
  // ──────────────────────────────────────────────────────────────────────────

  it("returns empty result when no pending queue items", async () => {
    const result = await runBctcQueueEnricherJob({ db: testDb });

    expect(result.itemsProcessed).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(result.timeoutFailures).toBe(0);
    expect(result.partialFailures).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-2: Items with NULL source_url remain 'pending' (awaiting VPS discovery)
  // ──────────────────────────────────────────────────────────────────────────

  it("leaves items with source_url=NULL as 'pending' (awaiting VPS discovery)", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);
    insertQueueItem(testDb, "HPG", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({ db: testDb });

    // Job is a no-op for items without source_url
    expect(result.itemsProcessed).toBe(0);
    expect(result.partialFailures).toBe(0);

    // All items must remain pending — NOT skipped
    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(3);
    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: Items with existing source_url are ignored
  // ──────────────────────────────────────────────────────────────────────────

  it("ignores items that already have source_url (no-op for both paths)", async () => {
    // One with URL (should stay pending, waiting for something else to process it),
    // one without (should also stay pending, waiting for VPS discovery)
    insertQueueItem(
      testDb,
      "VCB",
      2025,
      "Q1",
      "https://ssc.gov.vn/vcb-existing.pdf"
    );
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({ db: testDb });

    // Job is a no-op: items with source_url await downstream processing,
    // items without source_url await VPS discovery
    expect(result.itemsProcessed).toBe(0);
    expect(result.partialFailures).toBe(0);

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);

    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: Batch dequeue limit (max 20 per run)
  // ──────────────────────────────────────────────────────────────────────────

  it("is a no-op regardless of queue size — all items stay pending", async () => {
    // Insert 100 items with NULL source_url
    for (let i = 1; i <= 100; i++) {
      insertQueueItem(testDb, `CODE${String(i).padStart(3, "0")}`, 2025, "Q1", null);
    }

    const result = await runBctcQueueEnricherJob({ db: testDb });

    // No items processed — job is a no-op for null source_url items
    expect(result.itemsProcessed).toBe(0);
    expect(result.partialFailures).toBe(0);

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);

    const stillPending = getQueueItems(testDb, "pending");
    expect(stillPending.length).toBe(100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5: Idempotency — re-run does not re-skip already-skipped items
  // ──────────────────────────────────────────────────────────────────────────

  it("is idempotent — re-running leaves items unchanged", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    // First run
    const result1 = await runBctcQueueEnricherJob({ db: testDb });
    expect(result1.itemsProcessed).toBe(0);

    // Second run on same data
    const result2 = await runBctcQueueEnricherJob({ db: testDb });
    expect(result2.itemsProcessed).toBe(0);

    // Item stays pending across multiple runs
    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(1);
    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Mixed queue state (some pending, some skipped, some with URLs)
  // ──────────────────────────────────────────────────────────────────────────

  it("handles mixed queue state correctly — all pending items remain pending", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null); // awaiting VPS discovery
    insertQueueItem(testDb, "FPT", 2025, "Q1", "https://ssc.gov.vn/fpt.pdf"); // has URL, still pending
    insertQueueItem(testDb, "HPG", 2025, "Q1", null); // awaiting VPS discovery
    insertQueueItem(testDb, "TCB", 2024, "Q4", null); // awaiting VPS discovery

    const result = await runBctcQueueEnricherJob({ db: testDb });

    // No-op: nothing is processed or skipped
    expect(result.itemsProcessed).toBe(0);
    expect(result.partialFailures).toBe(0);

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(0);

    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-7: Graceful handling of DB query errors
  // ──────────────────────────────────────────────────────────────────────────

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
