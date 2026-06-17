/**
 * FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH — terminalization regression tests
 *
 * Root cause: when discovery REACHES the source and returns 0 URLs the previous
 * code had a `else { /* attempts===0 — do nothing *\/ }` branch that left rows
 * permanently stuck at attempts=0. Genuinely-absent rows (e.g. filings not yet
 * published) would never reach MAX_ENRICH_ATTEMPTS(5), never be marked
 * url_not_found, and cycle forever — bctc SLA climbed unboundedly as an artifact.
 *
 * Fix: remove the attempts===0 special-case.  When discovery returns 0 URLs
 * (real network-level result, not a pre-network exception) ALWAYS increment
 * attempts.  The error/exception path still does NOT increment (preserved).
 *
 * Tests:
 *   TERM-1  first-pass (attempts=0) increments to 1 on a 0-URL result
 *   TERM-2  multi-pass accumulation: after N empty-discovery runs attempts == N
 *   TERM-3  terminalization: at MAX_ENRICH_ATTEMPTS (5) row → url_not_found
 *   TERM-4  exception / pre-network error does NOT increment attempts
 *   TERM-5  generic — works for any ticker (no per-ticker special-case)
 *   TERM-6  successful URL discovery at attempts=0 writes url and does not bump
 *   TERM-7  after terminalization, done rows are NOT re-processed (stays url_not_found)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (must mirror bctcQueueEnricherJob.ts)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ENRICH_ATTEMPTS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  opts: { attempts?: number; status?: string; sourceUrl?: string | null } = {},
): void {
  const { attempts = 0, status = "pending", sourceUrl = null } = opts;
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url, attempts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, year, quarter, status, sourceUrl, attempts);
}

interface QueueRow {
  id: number;
  action_code: string;
  status: string;
  source_url: string | null;
  attempts: number;
}

function getQueueRow(db: Database, code: string, year: number, quarter: string): QueueRow | undefined {
  return db
    .query<QueueRow, [string, number, string]>(
      `SELECT id, action_code, status, source_url, attempts
         FROM bctc_vps_queue
        WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
    )
    .get(code, year, quarter) ?? undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns an empty URL list — simulates a real network-level discovery that found nothing. */
const mockZeroUrls = async (_ticker: string, _year: number, _timeout: number): Promise<string[]> => [];

/** Returns one real URL — simulates successful discovery. */
const mockOneUrl = async (_ticker: string, _year: number, _timeout: number): Promise<string[]> =>
  ["https://hsx.vn/bctc/test-report.pdf"];

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let testDb: Database;

beforeEach(async () => {
  closeDb();
  testDb = new SqliteDatabase(":memory:");
  testDb.exec("PRAGMA foreign_keys = ON");
  testDb.exec("PRAGMA journal_mode = WAL");
  await initDatabase(testDb);
  testDb.exec("DELETE FROM bctc_vps_queue");
});

afterEach(() => {
  try { testDb.close(); } catch { /* ignore */ }
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH — terminalization regression", () => {

  // ---------------------------------------------------------------------------
  // TERM-1: first-pass (attempts=0) increments to 1 on a 0-URL result
  //
  // This is the exact scenario that was broken: a brand-new row with attempts=0
  // was previously left unchanged by the `else { /* do nothing */ }` branch.
  // After the fix, attempts must become 1 after one 0-URL discovery run.
  // ---------------------------------------------------------------------------
  it("TERM-1: first-pass row (attempts=0) increments to 1 on 0-URL result", async () => {
    insertQueueItem(testDb, "BDI", 2026, "Q1", { attempts: 0 });

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: { _fetchHsx: mockZeroUrls },
    });

    const row = getQueueRow(testDb, "BDI", 2026, "Q1");
    expect(row).toBeDefined();
    expect(row!.attempts).toBe(1);
    expect(row!.status).toBe("pending");
    expect(row!.source_url).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // TERM-2: multi-pass accumulation — after N empty-discovery runs attempts == N
  //
  // Simulate running the enricher cron 3 times for the same absent ticker.
  // Each run should increment attempts by 1, regardless of starting value.
  // ---------------------------------------------------------------------------
  it("TERM-2: attempts accumulates across multiple 0-URL runs (1→2→3)", async () => {
    insertQueueItem(testDb, "DAG", 2026, "Q1", { attempts: 0 });

    const discoverOptions = { _fetchHsx: mockZeroUrls };

    // Run 1: 0→1
    await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
    expect(getQueueRow(testDb, "DAG", 2026, "Q1")!.attempts).toBe(1);

    // Run 2: 1→2
    await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
    expect(getQueueRow(testDb, "DAG", 2026, "Q1")!.attempts).toBe(2);

    // Run 3: 2→3
    await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
    expect(getQueueRow(testDb, "DAG", 2026, "Q1")!.attempts).toBe(3);

    // Status remains pending while below max
    expect(getQueueRow(testDb, "DAG", 2026, "Q1")!.status).toBe("pending");
  });

  // ---------------------------------------------------------------------------
  // TERM-3: terminalization — at MAX_ENRICH_ATTEMPTS (5) the row is marked
  // url_not_found (honest terminal) and drops out of the pending cycle.
  //
  // Seed the row at attempts=MAX_ENRICH_ATTEMPTS so the markUrlNotFound branch
  // fires on the NEXT run.  A row with attempts=5 that returns 0 URLs must end
  // up as url_not_found (not incremented further).
  // ---------------------------------------------------------------------------
  it("TERM-3: row at MAX_ENRICH_ATTEMPTS terminates → url_not_found on next 0-URL run", async () => {
    insertQueueItem(testDb, "DLC", 2026, "Q1", { attempts: MAX_ENRICH_ATTEMPTS });

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: { _fetchHsx: mockZeroUrls },
    });

    const row = getQueueRow(testDb, "DLC", 2026, "Q1");
    expect(row).toBeDefined();
    expect(row!.status).toBe("url_not_found");
    expect(row!.source_url).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // TERM-3b: full cycle from attempts=0 to url_not_found across 6 runs
  //
  // Simulate the COMPLETE life cycle: a genuinely-absent ticker starts at 0 and
  // should reach url_not_found after MAX_ENRICH_ATTEMPTS+1 runs total
  // (runs 1..5 increment; run 6 fires the markUrlNotFound branch because
  // attempts is already at MAX_ENRICH_ATTEMPTS when it enters the else block).
  // ---------------------------------------------------------------------------
  it("TERM-3b: full cycle from 0 to url_not_found across MAX+1 runs", async () => {
    insertQueueItem(testDb, "JSH", 2026, "Q1", { attempts: 0 });

    const discoverOptions = { _fetchHsx: mockZeroUrls };

    // Runs 1..MAX_ENRICH_ATTEMPTS: each increments attempts
    for (let run = 1; run <= MAX_ENRICH_ATTEMPTS; run++) {
      await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
      const row = getQueueRow(testDb, "JSH", 2026, "Q1")!;
      // After run N: attempts = N (still pending until MAX is reached and the
      // NEXT run fires the markUrlNotFound branch)
      expect(row.attempts).toBe(run);
      expect(row.status).toBe("pending");
    }

    // Final run (run MAX+1): attempts already == MAX_ENRICH_ATTEMPTS → url_not_found
    await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
    const final = getQueueRow(testDb, "JSH", 2026, "Q1")!;
    expect(final.status).toBe("url_not_found");
  });

  // ---------------------------------------------------------------------------
  // TERM-4: exception / pre-network error does NOT increment attempts
  //
  // The error path (catch block) must NOT increment — this preserves the
  // design invariant: only a REAL network-level 0-URL result penalises the row.
  // A transient network failure / VPS down event must not burn through retries.
  // ---------------------------------------------------------------------------
  it("TERM-4: pre-network exception does NOT increment attempts", async () => {
    insertQueueItem(testDb, "SIS", 2026, "Q1", { attempts: 0 });

    // Inject a discoverOptions whose spread throws a network error BEFORE
    // discoverHosePdfUrls returns (simulates a pre-network failure).
    const throwingDiscoverOptions = Object.defineProperty({} as Record<string, unknown>, "_fetchHsx", {
      get() {
        throw new Error("ECONNREFUSED — VPS unreachable");
      },
      enumerable: true,
    });

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: throwingDiscoverOptions as any,
    });

    const row = getQueueRow(testDb, "SIS", 2026, "Q1");
    expect(row).toBeDefined();
    // Attempts MUST NOT be incremented on a pre-network error
    expect(row!.attempts).toBe(0);
    expect(row!.status).toBe("pending");
  });

  // ---------------------------------------------------------------------------
  // TERM-5: generic — any ticker terminates (not just the known 9 stuck tickers)
  //
  // Confirm the fix is ticker-agnostic and date-agnostic: a fictitious ticker
  // "ZZTEST" for a future quarter also terminates correctly.
  // ---------------------------------------------------------------------------
  it("TERM-5: terminalization is ticker-agnostic and date-agnostic", async () => {
    // Seed at MAX so it terminates on the very next run
    insertQueueItem(testDb, "ZZTEST", 2027, "Q3", { attempts: MAX_ENRICH_ATTEMPTS });

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: { _fetchHsx: mockZeroUrls },
    });

    const row = getQueueRow(testDb, "ZZTEST", 2027, "Q3");
    expect(row).toBeDefined();
    expect(row!.status).toBe("url_not_found");
  });

  // ---------------------------------------------------------------------------
  // TERM-6: successful URL discovery at attempts=0 writes URL (not url_not_found)
  //         and does NOT bump attempts (the success path is unchanged)
  // ---------------------------------------------------------------------------
  it("TERM-6: successful discovery writes source_url and does not bump attempts", async () => {
    insertQueueItem(testDb, "VCB", 2026, "Q1", { attempts: 0 });

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: { _fetchHsx: mockOneUrl },
    });

    const row = getQueueRow(testDb, "VCB", 2026, "Q1");
    expect(row).toBeDefined();
    expect(row!.source_url).toBe("https://hsx.vn/bctc/test-report.pdf");
    expect(row!.status).toBe("pending");
    // attempts column is not modified on success
    expect(row!.attempts).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TERM-7: once url_not_found, the row is NOT re-processed by the enricher
  //         (WHERE clause in the job excludes url_not_found rows)
  // ---------------------------------------------------------------------------
  it("TERM-7: url_not_found row is not re-processed by the enricher", async () => {
    insertQueueItem(testDb, "VEA", 2026, "Q1", { status: "url_not_found", attempts: MAX_ENRICH_ATTEMPTS + 1 });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: { _fetchHsx: mockZeroUrls },
    });

    expect(result.itemsProcessed).toBe(0);
    // Row must remain exactly as inserted
    const row = getQueueRow(testDb, "VEA", 2026, "Q1");
    expect(row!.status).toBe("url_not_found");
    expect(row!.attempts).toBe(MAX_ENRICH_ATTEMPTS + 1);
  });

  // ---------------------------------------------------------------------------
  // TERM-8: initFinancialReportsTables does NOT reset url_not_found rows
  //
  // Regression guard for FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH:
  // resetQ1UrlNotFound() must NOT be called from initFinancialReportsTables().
  // Previously this function was called on every init (including from MCP tool
  // handlers during cowork cycles), perpetually undoing terminalization.
  //
  // This test seeds a url_not_found row BEFORE calling initDatabase (which
  // calls initFinancialReportsTables) and asserts the row remains terminal.
  // ---------------------------------------------------------------------------
  it("TERM-8: initFinancialReportsTables does NOT reset url_not_found rows (startup-reset conflict closed)", async () => {
    // Insert terminal rows BEFORE re-running initDatabase (simulates the conflict scenario)
    const tickers = ["BDI", "DAG", "DLC", "JSH"];
    for (const code of tickers) {
      testDb.prepare(
        `INSERT OR REPLACE INTO bctc_vps_queue
           (action_code, period_year, period_quarter, status, attempts)
         VALUES (?, 2026, 'Q1', 'url_not_found', 6)`,
      ).run(code);
    }

    // Re-run initDatabase (mirrors what happens when an MCP tool calls initDatabase()
    // mid-cycle — the root cause of the tug-of-war).
    await initDatabase(testDb);

    // All 4 rows must remain url_not_found / attempts=6 (NOT reset to pending/0)
    for (const code of tickers) {
      const row = getQueueRow(testDb, code, 2026, "Q1");
      expect(row).toBeDefined();
      expect(row!.status).toBe("url_not_found");
      expect(row!.attempts).toBe(6);
    }
  });
});
