/**
 * FIX-BCTC-ENRICHER-STUCK-BACKLOG (2026-07-02)
 *
 * Root-cause fix for the 23-row false-terminal HOSE backlog documented in
 * docs/vps-sources/bctc-discover-stale-15d/enricher-liveness.md:
 *
 *   1. incrementAttemptsStmt / markUrlNotFoundStmt previously never wrote
 *      last_attempt, so Arm 2's `last_attempt IS NOT NULL` predicate could
 *      NEVER be satisfied for rows they terminalize — a permanent
 *      false-terminal, independent of source availability.
 *   2. `status = 'enrich_failed'` rows were invisible to BOTH selection arms.
 *
 * This is the 2nd known occurrence of this bug class (1st: a one-row hand
 * patch in src/migrations/reset-ppc-q4-2025.ts). This test proves the root
 * fix, not another hand patch.
 *
 * All DB tests use in-memory SQLite. No real HTTP calls.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

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

const mockFetchEmpty = async (_url: string, _timeout: number): Promise<string> =>
  JSON.stringify({ data: [] });

// ─────────────────────────────────────────────────────────────────────────────
// (a) markUrlNotFoundStmt sets last_attempt (root-cause fix — was NULL before)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-ENRICHER-STUCK-BACKLOG (a) — terminalization always sets last_attempt", () => {
  it("row terminalized to url_not_found (attempts hits MAX_ENRICH_ATTEMPTS) gets last_attempt set, not NULL", async () => {
    const db = makeMinimalDb();

    // attempts=5 (MAX_ENRICH_ATTEMPTS) + 0-URL discovery this pass → markUrlNotFoundStmt fires
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('GAS', 2025, 'Q4', 'pending', 5, NULL)`,
    ).run();

    await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    const row = db
      .prepare(
        `SELECT status, attempts, last_attempt FROM bctc_vps_queue WHERE action_code = 'GAS'`,
      )
      .get() as { status: string; attempts: number; last_attempt: string | null } | null;

    expect(row?.status).toBe("url_not_found");
    // THE regression this task fixes: last_attempt must be populated, not NULL,
    // or Arm 2's grace-period retry can structurally never re-select this row.
    expect(row?.last_attempt).not.toBeNull();
  });

  it("row that only increments attempts (below MAX_ENRICH_ATTEMPTS) also gets last_attempt set", async () => {
    const db = makeMinimalDb();

    // attempts=0, still below MAX_ENRICH_ATTEMPTS=5 → incrementAttemptsStmt fires, stays pending
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('ACV', 2025, 'Q4', 'pending', 0, NULL)`,
    ).run();

    await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    const row = db
      .prepare(
        `SELECT status, attempts, last_attempt FROM bctc_vps_queue WHERE action_code = 'ACV'`,
      )
      .get() as { status: string; attempts: number; last_attempt: string | null } | null;

    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    expect(row?.last_attempt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) enrich_failed rows are now selectable under the same grace-period bound
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-ENRICHER-STUCK-BACKLOG (b) — enrich_failed grace-period retry", () => {
  it("enrich_failed row older than 7 days with attempts<6 IS selected and populated on success", async () => {
    const db = makeMinimalDb();

    // Shaped after the live VCB Q1-2025 stuck row: enrich_failed, attempts=0, last_attempt set weeks ago.
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2025, 'Q1', 'enrich_failed', 0, datetime('now', '-16 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/vcb-q1-2025.pdf"],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const row = db
      .prepare(`SELECT status, source_url FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2025`)
      .get() as { status: string; source_url: string | null } | null;

    expect(row?.status).toBe("pending");
    expect(row?.source_url).toContain("vcb-q1-2025.pdf");
  });

  // FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS: a recycled row must get a fresh
  // attempts budget, not carry its old (pre-terminalization) counter forward.
  it("enrich_failed row with non-zero attempts (recycled) has attempts reset to 0 on successful re-discovery", async () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2025, 'Q2', 'enrich_failed', 5, datetime('now', '-16 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/vcb-q2-2025.pdf"],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const row = db
      .prepare(`SELECT status, attempts, source_url FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q2'`)
      .get() as { status: string; attempts: number; source_url: string | null } | null;

    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
    expect(row?.source_url).toContain("vcb-q2-2025.pdf");
  });

  it("enrich_failed row with last_attempt < 7 days ago is NOT selected (grace period not expired)", async () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2026, 'Q1', 'enrich_failed', 1, datetime('now', '-2 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => ["https://hsx.example.com/should-not-be-called.pdf"],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    expect(result.itemsProcessed).toBe(0);

    const row = db
      .prepare(`SELECT status, source_url FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2026`)
      .get() as { status: string; source_url: string | null } | null;

    expect(row?.status).toBe("enrich_failed"); // untouched
    expect(row?.source_url).toBeNull();
  });

  // FIX-BCTC-DATA-GAP-FAMILY U1 (2026-08-29): Arm-2 bound widened from
  // `attempts < 6` to `attempts <= MAX_ENRICH_ATTEMPTS + 1` (i.e. < 7) — a row
  // at attempts=6 (the value markUrlNotFoundStmt itself terminalizes at) is now
  // re-eligible past the 7-day grace. The churn cap now excludes attempts >= 7.
  it("enrich_failed row with attempts >= 7 is NOT selected (cap prevents infinite churn)", async () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2024, 'Q4', 'enrich_failed', 7, datetime('now', '-30 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    expect(result.itemsProcessed).toBe(0);
  });

  it("enrich_failed row with NULL last_attempt is NOT selected (defensive — same guard as url_not_found)", async () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2023, 'Q4', 'enrich_failed', 0, NULL)`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    expect(result.itemsProcessed).toBe(0);
  });

  it("enrich_failed row that still finds no URL on retry is re-marked url_not_found with last_attempt refreshed", async () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('VCB', 2022, 'Q4', 'enrich_failed', 5, datetime('now', '-10 days'))`,
    ).run();

    await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    const row = db
      .prepare(`SELECT status, attempts, last_attempt FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2022`)
      .get() as { status: string; attempts: number; last_attempt: string | null } | null;

    // attempts=5 >= MAX_ENRICH_ATTEMPTS(5) → markUrlNotFoundStmt fires: status flips, last_attempt refreshed.
    expect(row?.status).toBe("url_not_found");
    expect(row?.attempts).toBe(6);
    expect(row?.last_attempt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) regression guard — url_not_found Arm 2 behaviour from TASK-1943a unchanged
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-ENRICHER-STUCK-BACKLOG (c) — url_not_found Arm 2 regression guard", () => {
  it("url_not_found row with last_attempt > 7 days ago is still selected (unchanged from TASK-1943a)", async () => {
    const db = makeMinimalDb();

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts, last_attempt)
       VALUES ('ACB', 2025, 'Q4', 'url_not_found', 5, datetime('now', '-8 days'))`,
    ).run();

    const result = await runBctcQueueEnricherJob({
      db,
      discoverOptions: {
        _fetchHsx: async (_ticker, _year, _timeout) => ["https://hsx.example.com/acb-q4-2025.pdf"],
        _fetchVpsPlaywright: mockFetchEmpty,
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);
  });
});
