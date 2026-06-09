/**
 * FIX-BCTC-PIPELINE — Three BCTC pipeline bugs
 *
 * Bug 1 (server.ts): /api/bctc-fetch-queue uses INSERT OR IGNORE which leaves
 *   stale `skipped` rows permanently blocking re-discovery. Fix: UPDATE rows
 *   with status='skipped' AND source_url IS NULL back to 'pending' before insert.
 *
 * Bug 2 (bctcQueueEnricherJob.ts): Job marks items with source_url IS NULL as
 *   'skipped' permanently — killing them instead of leaving them for VPS discovery.
 *   Fix: Remove the block that sets status='skipped'; items must stay 'pending'.
 *
 * Note: Bug 3 is in the Python VPS script (discover-bctc-urls-browser.py) and
 *   cannot be tested here. It is fixed directly in the script.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

// ---------------------------------------------------------------------------
// Minimal in-memory DB fixture with the bctc_vps_queue table schema
// ---------------------------------------------------------------------------

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT    NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending',
      source_url     TEXT,
      attempts       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function insertRow(
  db: Database,
  code: string,
  status: string,
  source_url: string | null = null,
): number {
  const r = db
    .prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
       VALUES (?, 2024, 'Q4', ?, ?)`,
    )
    .run(code, status, source_url);
  return Number(r.lastInsertRowid);
}

function getStatus(db: Database, id: number): string {
  const row = db
    .prepare("SELECT status FROM bctc_vps_queue WHERE id = ?")
    .get(id) as { status: string } | undefined;
  return row?.status ?? "NOT_FOUND";
}

// ---------------------------------------------------------------------------
// Bug 1: The `/api/bctc-fetch-queue` endpoint revival logic
//
// We test the SQL UPDATE pattern that the endpoint must run BEFORE its INSERT OR IGNORE.
// The test directly exercises the SQL against the in-memory DB to verify semantics.
// ---------------------------------------------------------------------------

describe("Bug 1 — bctc_fetch_queue: revive skipped rows before insert", () => {
  it("UPDATE sets status=pending for skipped rows with source_url IS NULL", () => {
    const db = makeDb();
    const id = insertRow(db, "VNM", "skipped", null);

    // This is the new UPDATE statement that must run before INSERT OR IGNORE
    db.prepare(
      `UPDATE bctc_vps_queue SET status='pending' WHERE status='skipped' AND source_url IS NULL`,
    ).run();

    expect(getStatus(db, id)).toBe("pending");
  });

  it("does NOT revive skipped rows that already have a source_url", () => {
    const db = makeDb();
    const id = insertRow(db, "VNM", "skipped", "https://owa.hnx.vn/ftp/report.pdf");

    db.prepare(
      `UPDATE bctc_vps_queue SET status='pending' WHERE status='skipped' AND source_url IS NULL`,
    ).run();

    // Row has source_url — should remain skipped (it was intentionally skipped)
    expect(getStatus(db, id)).toBe("skipped");
  });

  it("does NOT affect rows with other statuses", () => {
    const db = makeDb();
    const pendingId = insertRow(db, "ACB", "pending", null);
    const doneId = insertRow(db, "BID", "done", null);
    const failedId = insertRow(db, "HPG", "failed", null);

    db.prepare(
      `UPDATE bctc_vps_queue SET status='pending' WHERE status='skipped' AND source_url IS NULL`,
    ).run();

    expect(getStatus(db, pendingId)).toBe("pending");
    expect(getStatus(db, doneId)).toBe("done");
    expect(getStatus(db, failedId)).toBe("failed");
  });

  it("allows INSERT OR IGNORE to add new rows after revival", () => {
    const db = makeDb();
    // Existing skipped row for VNM
    insertRow(db, "VNM", "skipped", null);

    // Revival step
    db.prepare(
      `UPDATE bctc_vps_queue SET status='pending' WHERE status='skipped' AND source_url IS NULL`,
    ).run();

    // INSERT OR IGNORE: VNM already exists (UNIQUE on action_code+period_year+period_quarter
    // is not in our minimal schema, but the logic would not insert a duplicate row)
    // New ticker should be inserted fine
    db.prepare(
      `INSERT OR IGNORE INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)`,
    ).run("FPT", 2024, "Q4");

    const count = (
      db.prepare("SELECT COUNT(*) as c FROM bctc_vps_queue").get() as { c: number }
    ).c;
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: bctcQueueEnricherJob must NOT mark items as skipped (Task 1343c)
//
// Task 1343c re-enables active discovery. Items are processed (discovery
// attempted) but must never be permanently 'skipped'. If discovery fails,
// they stay 'pending' for VPS retry. All tests use injectable mock fetchers
// to avoid real network calls from France (geo-blocked).
// ---------------------------------------------------------------------------

/** Failing fetch mock — simulates geo-block / network error */
async function mockFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("ECONNREFUSED (mock)");
}

/** SSC mock returning one PDF URL */
function mockSscPdf(pdfUrl: string) {
  return async (_url: string, _timeout: number): Promise<string> =>
    JSON.stringify({ data: [{ fileUrl: pdfUrl }] });
}

describe("Bug 2 — bctcQueueEnricherJob: items with source_url=NULL must stay pending", () => {
  it("leaves pending items with source_url=NULL as pending after job run (discovery fails)", async () => {
    const db = makeDb();
    const id1 = insertRow(db, "VNM", "pending", null);
    const id2 = insertRow(db, "ACB", "pending", null);

    await runBctcQueueEnricherJob({
      db,
      batchSize: 10,
      discoverOptions: { _fetchHsx: async () => [], _fetchSsc: mockFail, _fetchCafef: mockFail, _fetchVietstock: mockFail },
    });

    // Items must NOT be set to 'skipped' — they must remain 'pending'
    expect(getStatus(db, id1)).toBe("pending");
    expect(getStatus(db, id2)).toBe("pending");
  });

  it("does not increment attempts field", async () => {
    const db = makeDb();
    insertRow(db, "VNM", "pending", null);

    await runBctcQueueEnricherJob({
      db,
      batchSize: 10,
      discoverOptions: { _fetchHsx: async () => [], _fetchSsc: mockFail, _fetchCafef: mockFail, _fetchVietstock: mockFail },
    });

    const row = db
      .prepare("SELECT attempts FROM bctc_vps_queue WHERE action_code = 'VNM'")
      .get() as { attempts: number };
    expect(row.attempts).toBe(0);
  });

  it("processes items and populates source_url on discovery success", async () => {
    // TASK_1944b: SSC removed. Use _fetchHsx to provide the PDF URL.
    const db = makeDb();
    insertRow(db, "VNM", "pending", null);
    insertRow(db, "ACB", "pending", null);

    const result = await runBctcQueueEnricherJob({
      db,
      batchSize: 10,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/bctc.pdf"],
        _fetchSsc: mockSscPdf("https://iboard-query.ssc.vn/static/test.pdf"), // deprecated no-op
        _fetchCafef: mockFail,     // deprecated no-op
        _fetchVietstock: mockFail, // deprecated no-op
      },
    });

    // Both items processed and URLs populated
    expect(result.itemsProcessed).toBe(2);
    expect(result.urlsPopulated).toBe(2);

    // No items permanently skipped — they remain pending
    const pendingRows = db
      .query("SELECT COUNT(*) as c FROM bctc_vps_queue WHERE status = 'pending'")
      .get() as { c: number };
    expect(pendingRows.c).toBe(2);
    // source_url now set
    const vnm = db
      .prepare("SELECT source_url FROM bctc_vps_queue WHERE action_code = 'VNM'")
      .get() as { source_url: string };
    expect(vnm.source_url).toMatch(/\.pdf$/i);
  });

  it("does not touch rows with status != pending", async () => {
    const db = makeDb();
    const doneId = insertRow(db, "BID", "done", null);
    const failedId = insertRow(db, "HPG", "failed", null);

    await runBctcQueueEnricherJob({
      db,
      batchSize: 10,
      discoverOptions: { _fetchHsx: async () => [], _fetchSsc: mockFail, _fetchCafef: mockFail, _fetchVietstock: mockFail },
    });

    expect(getStatus(db, doneId)).toBe("done");
    expect(getStatus(db, failedId)).toBe("failed");
  });
});
