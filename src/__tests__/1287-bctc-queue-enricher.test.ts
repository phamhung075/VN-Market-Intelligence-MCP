/**
 * Task 1287a — BCTC Queue Enricher Tests (UPDATED for Task 1288c hotfix)
 *
 * HOTFIX (Task 1288c, 2026-04-22):
 * Main server no longer enriches BCTC queue items from SSC.
 * Items with source_url = NULL are marked as 'skipped'.
 * VPS (Vietnam) is the ONLY source of BCTC queue data.
 *
 * Root cause: Main server in France cannot fetch from SSC (geo-blocked).
 * This caused recurring timeouts every 15 minutes.
 *
 * New behavior: Skip items without source_url, let VPS push complete items.
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
  // TC-2: Items with NULL source_url are marked as 'skipped'
  // ──────────────────────────────────────────────────────────────────────────

  it("marks items with source_url=NULL as 'skipped' (awaiting VPS push)", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);
    insertQueueItem(testDb, "HPG", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({ db: testDb });

    expect(result.itemsProcessed).toBe(3);
    expect(result.partialFailures).toBe(3); // All skipped

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(3);
    expect(skipped.every((i) => i.source_url === null)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: Items with existing source_url are ignored
  // ──────────────────────────────────────────────────────────────────────────

  it("ignores items that already have source_url", async () => {
    // One with URL (should be ignored), one without (should be skipped)
    insertQueueItem(
      testDb,
      "VCB",
      2025,
      "Q1",
      "https://ssc.gov.vn/vcb-existing.pdf"
    );
    insertQueueItem(testDb, "FPT", 2025, "Q1", null);

    const result = await runBctcQueueEnricherJob({ db: testDb });

    expect(result.itemsProcessed).toBe(1); // Only FPT processed
    expect(result.partialFailures).toBe(1); // FPT skipped

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(1);
    expect(skipped[0]?.action_code).toBe("FPT");

    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(1);
    expect(pending[0]?.action_code).toBe("VCB");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: Batch dequeue limit (max 20 per run)
  // ──────────────────────────────────────────────────────────────────────────

  it("respects batch dequeue limit (20 items max per run)", async () => {
    // Insert 100 items with NULL source_url
    for (let i = 1; i <= 100; i++) {
      insertQueueItem(testDb, `CODE${String(i).padStart(3, "0")}`, 2025, "Q1", null);
    }

    const result = await runBctcQueueEnricherJob({ db: testDb });

    expect(result.itemsProcessed).toBe(20);
    expect(result.partialFailures).toBe(20); // All skipped

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(20);

    const stillPending = getQueueItems(testDb, "pending");
    expect(stillPending.length).toBe(80); // Remaining items still pending
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5: Idempotency — re-run does not re-skip already-skipped items
  // ──────────────────────────────────────────────────────────────────────────

  it("is idempotent — re-running does not re-process skipped items", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    // First run
    const result1 = await runBctcQueueEnricherJob({ db: testDb });
    expect(result1.itemsProcessed).toBe(1);

    // Second run on same data
    const result2 = await runBctcQueueEnricherJob({ db: testDb });
    expect(result2.itemsProcessed).toBe(0); // No more items to process

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Mixed queue state (some pending, some skipped, some with URLs)
  // ──────────────────────────────────────────────────────────────────────────

  it("handles mixed queue state correctly", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null); // Will be skipped
    insertQueueItem(testDb, "FPT", 2025, "Q1", "https://ssc.gov.vn/fpt.pdf"); // Has URL, ignored
    insertQueueItem(testDb, "HPG", 2025, "Q1", null); // Will be skipped
    insertQueueItem(testDb, "TCB", 2024, "Q4", null); // Will be skipped

    const result = await runBctcQueueEnricherJob({ db: testDb });

    expect(result.itemsProcessed).toBe(3); // VCB, HPG, TCB
    expect(result.partialFailures).toBe(3); // All skipped

    const skipped = getQueueItems(testDb, "skipped");
    expect(skipped.length).toBe(3);
    expect(skipped.map((i) => i.action_code).sort()).toEqual(["HPG", "TCB", "VCB"]);

    const pending = getQueueItems(testDb, "pending");
    expect(pending.length).toBe(1);
    expect(pending[0]?.action_code).toBe("FPT");
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
