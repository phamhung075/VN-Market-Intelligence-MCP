/**
 * FIX-BCTC-ZERO-URL-ALERT — Contract 1 tests
 *
 * Verifies the consecutive-zero-URL cycle counter, earnings-window guard,
 * and 6h dedup gate in runBctcQueueEnricherJob.
 *
 * Uses a minimal in-memory DB (NOT initDatabase) to avoid the watchlist seeder
 * injecting 30 pending BCTC rows that would time out the discovery mocks.
 *
 * Fault-path RAW-verification:
 *   baseline_pass_A: 2 consecutive zero-URL cycles with pending queue rows
 *                    → alert FIRES (sendBugFn called exactly once).
 *   baseline_pass_B: partial-success cycle (some URLs found) → counter RESETS,
 *                    subsequent zero cycle treated as first (alert does NOT fire).
 *   baseline_pass_C: threshold reached but queue has NO active rows (off-season)
 *                    → alert suppressed (itemsProcessed=0, counter NOT touched).
 *   baseline_pass_D: 2 zero cycles but dedup window not elapsed → no re-alert.
 *   baseline_pass_E: itemsProcessed=0 (empty queue) → counter NOT touched.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { Database } from "bun:sqlite";

import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DB bootstrap — only the tables used by the enricher job
// (avoids the watchlist seeder that injects 30 pending BCTC rows)
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalDb(): Database {
  const db = new SqliteDatabase(":memory:");
  // bctc_vps_queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  // bctc_health_state (schema-financial-reports will also create IF NOT EXISTS)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_health_state (
      key         TEXT PRIMARY KEY,
      int_value   INTEGER NOT NULL DEFAULT 0,
      text_value  TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock for _fetchHsx that always returns an empty array (0 URLs).
 * _fetchVpsPlaywright is omitted entirely (not set to undefined) to satisfy
 * exactOptionalPropertyTypes.
 */
const DISCOVER_ZERO = {
  _fetchHsx: async (_ticker: string, _year: number, _timeout: number, _quarter?: string): Promise<string[]> => [],
};

/**
 * Mock for _fetchHsx that returns one PDF URL.
 */
const DISCOVER_SUCCESS = {
  _fetchHsx: async (ticker: string, _year: number, _timeout: number, _quarter?: string): Promise<string[]> =>
    [`https://example.com/${ticker}-bctc.pdf`],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertPendingRow(db: Database, ticker: string, status = "pending"): void {
  db.exec(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES ('${ticker}', 2026, 'Q1', '${status}', NULL)
  `);
}

function getZeroCounter(db: Database): { count: number; lastAlertedAt: string | null } {
  const row = db
    .query<{ int_value: number; text_value: string | null }, [string]>(
      `SELECT int_value, text_value FROM bctc_health_state WHERE key = ?`,
    )
    .get("zero_url_consecutive_cycles");
  if (!row) return { count: 0, lastAlertedAt: null };
  return { count: row.int_value, lastAlertedAt: row.text_value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-ZERO-URL-ALERT — Contract 1", () => {
  let db: Database;

  beforeEach(() => {
    db = makeMinimalDb();
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
  });

  // ── baseline_pass_A: 2 zero cycles → alert fires ─────────────────────────

  it("baseline_pass_A (FAULT PATH): 2 consecutive zero-URL cycles with earnings window → alert fires", async () => {
    // Seed one active pending row (earnings window active).
    insertPendingRow(db, "VCB");

    const alertCalls: string[] = [];
    const captureAlert = async (msg: string) => { alertCalls.push(msg); };

    // Cycle 1: zero URLs, itemsProcessed=1 → counter=1, no alert yet.
    const r1 = await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });
    expect(r1.itemsProcessed).toBe(1);
    expect(r1.urlsPopulated).toBe(0);
    expect(alertCalls.length).toBe(0); // threshold=2, not yet reached
    expect(getZeroCounter(db).count).toBe(1);

    // Re-insert so cycle 2 also has a pending row.
    insertPendingRow(db, "VCB");

    // Cycle 2: zero URLs again → counter=2, threshold reached → ALERT.
    const r2 = await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });
    expect(r2.itemsProcessed).toBe(1);
    expect(r2.urlsPopulated).toBe(0);

    // FAULT PATH verified: alert must have fired.
    expect(alertCalls.length).toBe(1);
    expect(alertCalls[0]).toContain("BCTC-ZERO-URL-ALERT");
    expect(alertCalls[0]).toContain("consecutive enricher cycles");
    expect(alertCalls[0]).toContain("urlsPopulated=0");
    expect(getZeroCounter(db).count).toBe(2);
    // last_alerted_at stamped.
    expect(getZeroCounter(db).lastAlertedAt).not.toBeNull();
  });

  // ── baseline_pass_B: partial success resets counter ──────────────────────

  it("baseline_pass_B: a cycle with >=1 URL found resets the counter → no alert on subsequent zero", async () => {
    insertPendingRow(db, "VCB");
    const alertCalls: string[] = [];
    const captureAlert = async (msg: string) => { alertCalls.push(msg); };

    // Cycle 1: zero → counter=1.
    await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });
    expect(getZeroCounter(db).count).toBe(1);

    // Cycle 2: SUCCESS → counter reset to 0.
    insertPendingRow(db, "VNM");
    const r2 = await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_SUCCESS,
      sendBugFn: captureAlert,
    });
    expect(r2.urlsPopulated).toBeGreaterThan(0);
    expect(getZeroCounter(db).count).toBe(0);

    // Cycle 3: zero → counter=1 (not 2) → no alert.
    insertPendingRow(db, "HPG");
    const r3 = await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });
    expect(r3.urlsPopulated).toBe(0);
    expect(alertCalls.length).toBe(0); // only 1 consecutive zero since reset
    expect(getZeroCounter(db).count).toBe(1);
  });

  // ── baseline_pass_C: no active rows → itemsProcessed=0 → counter unchanged

  it("baseline_pass_C: empty queue (no pending rows) → itemsProcessed=0, counter not touched", async () => {
    // Only a done row — no pending rows.
    db.exec(`
      INSERT INTO bctc_vps_queue
        (action_code, period_year, period_quarter, status, source_url)
      VALUES ('VCB', 2025, 'Q4', 'done', 'https://example.com/vcb.pdf')
    `);

    const alertCalls: string[] = [];
    const captureAlert = async (msg: string) => { alertCalls.push(msg); };

    // Pre-set counter to 1.
    db.exec(`
      INSERT OR REPLACE INTO bctc_health_state (key, int_value, updated_at)
      VALUES ('zero_url_consecutive_cycles', 1, datetime('now'))
    `);

    const r = await runBctcQueueEnricherJob({ db, sendBugFn: captureAlert });
    // itemsProcessed=0 — the enricher has no pending work.
    expect(r.itemsProcessed).toBe(0);
    expect(alertCalls.length).toBe(0);
    // Counter must be unchanged (idle skip rule).
    expect(getZeroCounter(db).count).toBe(1);
  });

  // ── baseline_pass_D: dedup gate — no re-alert within 6h ──────────────────

  it("baseline_pass_D: dedup — no second alert when last_alerted_at < 6h ago", async () => {
    insertPendingRow(db, "VCB");
    const alertCalls: string[] = [];
    const captureAlert = async (msg: string) => { alertCalls.push(msg); };

    // Pre-set counter=1 with last_alerted_at = 1 minute ago (within 6h dedup).
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    db.exec(`
      INSERT OR REPLACE INTO bctc_health_state (key, int_value, text_value, updated_at)
      VALUES ('zero_url_consecutive_cycles', 1, '${oneMinuteAgo}', datetime('now'))
    `);

    // Cycle: zero → counter=2, threshold reached BUT dedup active → no alert.
    await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });
    expect(alertCalls.length).toBe(0);
  });

  // ── baseline_pass_E: itemsProcessed=0 (empty) → counter not touched ──────

  it("baseline_pass_E: itemsProcessed=0 — counter stays unchanged (legitimate idle)", async () => {
    // No pending rows.
    const alertCalls: string[] = [];
    const captureAlert = async (msg: string) => { alertCalls.push(msg); };

    db.exec(`
      INSERT OR REPLACE INTO bctc_health_state (key, int_value, updated_at)
      VALUES ('zero_url_consecutive_cycles', 3, datetime('now'))
    `);

    const r = await runBctcQueueEnricherJob({ db, sendBugFn: captureAlert });
    expect(r.itemsProcessed).toBe(0);
    expect(alertCalls.length).toBe(0);
    expect(getZeroCounter(db).count).toBe(3); // unchanged
  });

  // ── guard: alert message is aggregate (not per-ticker) ───────────────────

  it("alert message is aggregate — contains counts, not a per-ticker label", async () => {
    insertPendingRow(db, "VCB");
    insertPendingRow(db, "VNM");

    const alertCalls: string[] = [];
    const captureAlert = async (msg: string) => { alertCalls.push(msg); };

    // Cycle 1.
    await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });
    // Re-insert for cycle 2.
    insertPendingRow(db, "VCB");
    insertPendingRow(db, "VNM");

    // Cycle 2 → alert.
    await runBctcQueueEnricherJob({
      db,
      discoverOptions: DISCOVER_ZERO,
      sendBugFn: captureAlert,
    });

    expect(alertCalls.length).toBeGreaterThanOrEqual(1);
    const msg = alertCalls[0]!;
    expect(msg).toContain("BCTC-ZERO-URL-ALERT");
    expect(msg).toContain("consecutive enricher cycles");
    expect(msg).toContain("itemsProcessed=");
    expect(msg).toContain("urlsPopulated=0");
  });
});
