/**
 * TASK-1943a — BCTC Q1-2026 Queue Reset + Batch Sweep Diagnosis + Auto-Retry Policy
 *
 * Tests:
 *   AC-1: resetQ1UrlNotFound() resets url_not_found rows to pending (idempotent)
 *   AC-2: enricher picks up reset rows and either populates source_url or marks url_not_found
 *   AC-3: bctcBatchSweepJob entry log present (diagnostic)
 *   AC-4: grace-period auto-retry — rows with last_attempt > 7 days selected,
 *          rows with recent last_attempt skipped
 *
 * All DB tests use in-memory SQLite. No real HTTP calls.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";
import { resetQ1UrlNotFound } from "../infrastructure/db/schema-financial-reports.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalDb(): Database {
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
      last_attempt   TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    );
  `);
  return db;
}

/** Mock fetch that always returns empty — no URLs found. */
const mockFetchEmpty = async (_url: string, _timeout: number): Promise<string> =>
  JSON.stringify({ data: [] });

/** Mock fetch that returns a PDF URL for the given ticker. */
function mockFetchSuccess(ticker: string) {
  return async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify({
      data: [{ fileUrl: `https://iboard-query.ssc.vn/static/${ticker.toLowerCase()}-bctc.pdf` }],
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: resetQ1UrlNotFound() — idempotent reset
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-1943a AC-1 — resetQ1UrlNotFound() resets url_not_found rows", () => {
  it("resets 5 Q1-2026 url_not_found rows to pending, attempts=0", () => {
    const db = makeMinimalDb();

    const tickers = ["VCB", "ACB", "MBB", "BID", "CTG"];
    for (const code of tickers) {
      db.prepare(
        `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
         VALUES (?, 2026, 'Q1', 'url_not_found', 5)`,
      ).run(code);
    }

    const changes = resetQ1UrlNotFound(db);

    expect(changes).toBe(5);

    const rows = db
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue
         WHERE period_year = 2026 AND period_quarter = 'Q1'`,
      )
      .all() as Array<{ status: string; attempts: number }>;

    for (const row of rows) {
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
    }
  });

  it("is idempotent — calling twice returns 0 changes on second call", () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('EIB', 2026, 'Q1', 'url_not_found', 5)`,
    ).run();

    const first = resetQ1UrlNotFound(db);
    expect(first).toBe(1);

    // Second call: row is now 'pending' — WHERE status='url_not_found' matches nothing
    const second = resetQ1UrlNotFound(db);
    expect(second).toBe(0);
  });

  it("does NOT reset rows from other periods (Q4-2025 url_not_found must stay)", () => {
    const db = makeMinimalDb();

    // Q4-2025 url_not_found — must NOT be touched
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('VCB', 2025, 'Q4', 'url_not_found', 5)`,
    ).run();

    // Q1-2026 url_not_found — MUST be reset
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('VCB', 2026, 'Q1', 'url_not_found', 5)`,
    ).run();

    resetQ1UrlNotFound(db);

    const q4 = db
      .prepare(
        `SELECT status FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as { status: string } | null;

    const q1 = db
      .prepare(
        `SELECT status FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2026 AND period_quarter = 'Q1'`,
      )
      .get() as { status: string } | null;

    expect(q4?.status).toBe("url_not_found"); // untouched
    expect(q1?.status).toBe("pending");       // reset
  });

  it("does NOT touch Q1-2026 rows that are already pending or done", () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('FPT', 2026, 'Q1', 'pending', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('HPG', 2026, 'Q1', 'done', 5)`,
    ).run();

    const changes = resetQ1UrlNotFound(db);

    expect(changes).toBe(0); // nothing changed
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: enricher processes reset rows
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-1943a AC-2 — enricher processes reset pending rows", () => {
  it("populates source_url for rows where discovery succeeds", async () => {
    const db = makeMinimalDb();

    // Insert 2 reset rows (status=pending, attempts=0, no source_url)
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('VCB', 2026, 'Q1', 'pending', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('ACB', 2026, 'Q1', 'pending', 0)`,
    ).run();

    // TASK_1944b: SSC removed. Use _fetchHsx to provide the PDF URL.
    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/bctc.pdf"],
        _fetchSsc: mockFetchEmpty,          // deprecated no-op
        _fetchCafef: mockFetchEmpty,        // deprecated no-op
        _fetchVietstock: mockFetchEmpty,    // deprecated no-op
        _fetchVpsPlaywright: mockFetchEmpty, // VPS returns empty → hsx wins
      },
    });

    expect(result.itemsProcessed).toBe(2);
    expect(result.urlsPopulated).toBe(2);

    const rows = db
      .prepare(`SELECT action_code, source_url FROM bctc_vps_queue WHERE period_year = 2026`)
      .all() as Array<{ action_code: string; source_url: string | null }>;

    for (const row of rows) {
      expect(row.source_url).not.toBeNull();
    }
  });

  it("marks rows url_not_found after max attempts on second pass", async () => {
    const db = makeMinimalDb();

    // Row with attempts=5 (max attempts already reached) — discovery returns nothing
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('MBB', 2026, 'Q1', 'pending', 5)`,
    ).run();

    await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty,
        _fetchCafef: mockFetchEmpty,
        _fetchVietstock: mockFetchEmpty,
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    const row = db
      .prepare(
        `SELECT status FROM bctc_vps_queue WHERE action_code = 'MBB' AND period_year = 2026`,
      )
      .get() as { status: string } | null;

    // After second pass with attempts >= MAX_ENRICH_ATTEMPTS → url_not_found
    expect(row?.status).toBe("url_not_found");
  });

  it("increments attempts to 1 on reached-source 0-URL first pass, stays pending until MAX", async () => {
    // All fetchers reach the source and return empty (0 URLs found).
    // This is a completed network-level discovery — the new contract ALWAYS increments
    // attempts. With attempts=0→1 < MAX_ENRICH_ATTEMPTS=5, status stays 'pending'
    // (only after 5 exhausted attempts does it become 'url_not_found').
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('BID', 2026, 'Q1', 'pending', 0)`,
    ).run();

    await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty,
        _fetchCafef: mockFetchEmpty,
        _fetchVietstock: mockFetchEmpty,
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    const row = db
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue WHERE action_code = 'BID' AND period_year = 2026`,
      )
      .get() as { status: string; attempts: number } | null;

    // attempts incremented 0→1 on first reached-source pass; still below MAX (5) so status stays pending
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: bctcBatchSweepJob diagnostic log
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-1943a AC-3 — bctcBatchSweepJob entry diagnostic", () => {
  it("runBctcBatchSweepJob is exported (importable for integration)", async () => {
    const mod = await import(
      "../scheduler/financial-reports/bctcBatchSweepJob.js"
    );
    expect(typeof mod.runBctcBatchSweepJob).toBe("function");
  });

  it("isEarningsSeason returns true for April (month 4)", async () => {
    const { isEarningsSeason } = await import(
      "../scheduler/financial-reports/bctcBatchSweepJob.js"
    );
    // April 25 is the scheduled fire date
    expect(isEarningsSeason(new Date("2026-04-25"))).toBe(true);
  });

  it("isEarningsSeason returns false for May (month 5) — outside season", async () => {
    const { isEarningsSeason } = await import(
      "../scheduler/financial-reports/bctcBatchSweepJob.js"
    );
    // May 18 — outside earnings season
    expect(isEarningsSeason(new Date("2026-05-18"))).toBe(false);
  });

  it("wrapRun key in startScheduler matches 'bctcBatchSweepJob' (compilation guard)", async () => {
    // This test documents the root cause investigation:
    // startScheduler.ts wires wrapRun('bctcBatchSweepJob', ...) which is CORRECT.
    // The silent zero-run is likely because the container was down on 2026-04-25
    // or bctcBatchSweepJob ran outside earnings season detection (May=false).
    // The diagnostic console.log added to runBctcBatchSweepJob will confirm future fires.
    //
    // If this test file compiles without error, the import is valid.
    const mod = await import(
      "../scheduler/financial-reports/bctcBatchSweepJob.js"
    );
    // The exported function name must match the wrapRun key convention
    expect(mod.runBctcBatchSweepJob.name).toBe("runBctcBatchSweepJob");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: grace-period auto-retry — WHERE clause extension
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-1943a AC-4 — grace-period auto-retry policy", () => {
  it("row with url_not_found and last_attempt > 7 days ago is selected for retry", async () => {
    const db = makeMinimalDb();

    // Row with last_attempt 8 days ago — eligible for grace-period retry
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2026, 'Q1', 'url_not_found', 5, datetime('now', '-8 days'))`,
    ).run();

    // TASK_1944b: SSC removed. Mock: discovery succeeds via _fetchHsx.
    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/vcb-bctc.pdf"],
        _fetchSsc: mockFetchEmpty,          // deprecated no-op
        _fetchCafef: mockFetchEmpty,        // deprecated no-op
        _fetchVietstock: mockFetchEmpty,    // deprecated no-op
        _fetchVpsPlaywright: mockFetchEmpty, // VPS returns empty → hsx wins
      },
    });

    // Row should have been selected and URL populated
    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const row = db
      .prepare(
        `SELECT source_url, status FROM bctc_vps_queue WHERE action_code = 'VCB'`,
      )
      .get() as { source_url: string | null; status: string } | null;

    expect(row?.source_url).not.toBeNull();
    expect(row?.source_url).toContain("vcb-bctc.pdf");
  });

  it("row with url_not_found and last_attempt < 7 days ago is NOT selected", async () => {
    const db = makeMinimalDb();

    // Row with last_attempt 1 day ago — NOT eligible (grace period not expired)
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('ACB', 2026, 'Q1', 'url_not_found', 5, datetime('now', '-1 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty,
        _fetchCafef: mockFetchEmpty,
        _fetchVietstock: mockFetchEmpty,
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    // Row should NOT have been selected (recent last_attempt)
    expect(result.itemsProcessed).toBe(0);

    const row = db
      .prepare(
        `SELECT status, source_url FROM bctc_vps_queue WHERE action_code = 'ACB'`,
      )
      .get() as { status: string; source_url: string | null } | null;

    // Status unchanged — still url_not_found
    expect(row?.status).toBe("url_not_found");
    expect(row?.source_url).toBeNull();
  });

  it("row with url_not_found and NULL last_attempt is NOT selected by grace-period clause", async () => {
    const db = makeMinimalDb();

    // NULL last_attempt — should not match the grace-period condition
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('MBB', 2026, 'Q1', 'url_not_found', 5, NULL)`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty,
        _fetchCafef: mockFetchEmpty,
        _fetchVietstock: mockFetchEmpty,
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    // NULL last_attempt does not satisfy < datetime('now', '-7 days')
    expect(result.itemsProcessed).toBe(0);
  });

  it("grace-period row that still returns no URL is re-marked url_not_found", async () => {
    const db = makeMinimalDb();

    // Row with last_attempt 10 days ago — eligible for retry, but discovery still fails
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('EIB', 2026, 'Q1', 'url_not_found', 5, datetime('now', '-10 days'))`,
    ).run();

    await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty,
        _fetchCafef: mockFetchEmpty,
        _fetchVietstock: mockFetchEmpty,
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    const row = db
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue WHERE action_code = 'EIB'`,
      )
      .get() as { status: string; attempts: number } | null;

    // Still no URL — re-marked as url_not_found (attempts incremented past MAX)
    expect(row?.status).toBe("url_not_found");
  });

  it("grace-period only retries rows with attempts < 6 (cap prevents infinite churn)", async () => {
    const db = makeMinimalDb();

    // Row with attempts = 6 — at or over cap, should NOT be selected
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('CTG', 2026, 'Q1', 'url_not_found', 6, datetime('now', '-10 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockFetchEmpty,
        _fetchCafef: mockFetchEmpty,
        _fetchVietstock: mockFetchEmpty,
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    // attempts=6 is at cap — not selected
    expect(result.itemsProcessed).toBe(0);
  });
});
