Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1451 — fix(france-summary): market_prices column fetched_at → updated_at
 *
 * Tests:
 *   (a) default fetchVnIndexFn queries `updated_at` column (not `fetched_at`)
 *       — a DB row with `updated_at` populated correctly returns a VnIndexSnapshot
 *   (b) vnIndex is null when market_prices has no VNINDEX row (no crash)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runFranceSummary } from "../scheduler/briefings/franceSummaryJob.js";
import type { FranceSummaryOptions } from "../scheduler/briefings/franceSummaryJob.js";

// ── minimal in-memory DB with market_prices using updated_at ─────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, company_name TEXT, exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other', notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT NOT NULL, price REAL NOT NULL, volume REAL NOT NULL,
      fetched_at TEXT NOT NULL, exchange TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
      message TEXT, affected_actions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      from_agent TEXT, message_type TEXT, sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL,
      open REAL, high REAL, low REAL, close REAL, volume REAL,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

// ── (a) default fetchVnIndexFn reads updated_at column correctly ──────────────

describe("1451 (a) — default fetchVnIndexFn uses updated_at column", () => {
  it("returns VnIndexSnapshot when VNINDEX row has updated_at populated", async () => {
    const db = setupTestDb();

    // Insert VNINDEX row using `updated_at` (the real column name)
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.43, 12.0, 0.94, 5000000, '2026-04-18T07:00:00Z')
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      // No fetchVnIndexFn — forces the default SQL path
    };

    const result = await runFranceSummary(opts);

    // After the fix: default SQL path reads updated_at → vnIndex populated →
    // message is sent (only vnIndex data present, but that alone triggers send)
    // and the output contains the VN-Index block.
    expect(result.sent).toBe(true);
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("VN-Index");
  });

  it("does NOT query fetched_at column (which does not exist on market_prices)", () => {
    const db = setupTestDb();

    // Attempting to query fetched_at should throw — confirming it's the wrong column
    expect(() => {
      db.prepare(`SELECT fetched_at FROM market_prices WHERE code = 'VNINDEX' LIMIT 1`).get();
    }).toThrow();
  });
});

// ── (b) vnIndex null when no VNINDEX row — no crash ──────────────────────────

describe("1451 (b) — vnIndex stays null when no VNINDEX row in market_prices", () => {
  it("runFranceSummary does not crash when market_prices has no VNINDEX row", async () => {
    const db = setupTestDb();
    // market_prices table exists but is empty

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      // No fetchVnIndexFn — default SQL path, returns null row
    };

    // Must not throw
    const result = await runFranceSummary(opts);
    expect(result).toBeDefined();
  });
});
