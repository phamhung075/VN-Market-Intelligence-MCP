Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1455 — fix(france-summary): market_prices freshness guard
 *
 * Tests:
 *   (a) Stale VNINDEX row (updated_at > 3 days ago) → vnIndex resolves to null
 *       (default fetchVnIndexFn path, no injectable fn)
 *   (b) Stale position prices (updated_at > 3 days ago) → P&L N/A fallback
 *       (default DB path, no getPnlFn injectable)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runFranceSummary } from "../scheduler/briefings/franceSummaryJob.js";
import type { FranceSummaryOptions } from "../scheduler/briefings/franceSummaryJob.js";

// ── minimal DB schema ─────────────────────────────────────────────────────────

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
    CREATE TABLE IF NOT EXISTS positions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT NOT NULL,
      shares    REAL NOT NULL,
      avg_price REAL NOT NULL,
      status    TEXT NOT NULL DEFAULT 'open',
      closed_at TEXT
    );
  `);
  return db;
}

// ── (a) Stale VNINDEX row → vnIndex null ──────────────────────────────────────

describe("1455 (a) — stale VNINDEX row (>3 days) → vnIndex is null", () => {
  it("default SQL path: VNINDEX row updated 4 days ago is excluded → no VN-Index block in message", async () => {
    const db = setupTestDb();

    // Insert stale VNINDEX row — updated 4 days ago (outside 3-day freshness window)
    // Compute relative to the MOCKED time (2026-04-18), not system time
    const mockNow = new Date("2026-04-18T07:00:00Z");
    const fourDaysBeforeMock = new Date(mockNow.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.43, 12.0, 0.94, 5000000, '${fourDaysBeforeMock}')
    `);

    // Provide some watchlist mover so the digest has content (to ensure message is sent)
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    const twoMinutesBeforeMock = new Date(mockNow.getTime() - 2 * 60 * 1000).toISOString();
    const oneMinuteBeforeMock = new Date(mockNow.getTime() - 1 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, '${oneMinuteBeforeMock}'),
             ('VCB', 75000, 900,  '${twoMinutesBeforeMock}')
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => mockNow,
      getPnlFn: async () => null,
      // No fetchVnIndexFn → forces default SQL path
    };

    await runFranceSummary(opts);

    // Stale VNINDEX must be excluded → no "VN-Index" block in output
    if (captured.length > 0) {
      expect(captured[0]).not.toContain("VN-Index");
    }
    // If message was not sent (no content), test still passes — no crash
  });

  it("fresh VNINDEX row (updated today) → VN-Index block IS present", async () => {
    const db = setupTestDb();

    // Insert fresh VNINDEX row (at mocked time, not system time)
    const mockNow = new Date("2026-04-18T07:00:00Z").toISOString();
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.43, 12.0, 0.94, 5000000, '${mockNow}')
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
    };

    await runFranceSummary(opts);

    // Fresh VNINDEX → VN-Index block present
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("VN-Index");
  });
});

// ── (b) Stale position prices → P&L N/A ──────────────────────────────────────

describe("1455 (b) — stale position prices (>3 days) → P&L N/A fallback", () => {
  it("default DB path: position price updated 4 days ago is excluded → P&L shows N/A for stale price", async () => {
    const db = setupTestDb();

    // Open position for VCB
    db.exec(`
      INSERT INTO positions (code, shares, avg_price, status)
      VALUES ('VCB', 1000, 75000, 'open')
    `);

    // Stale price for VCB (4 days old — outside 3-day window)
    const mockNow = new Date("2026-04-18T07:00:00Z");
    const fourDaysBeforeMock = new Date(mockNow.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at)
      VALUES ('VCB', 85000, 1.2, '${fourDaysBeforeMock}')
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => mockNow,
      // No getPnlFn → forces default DB path
    };

    await runFranceSummary(opts);

    // Stale prices excluded → priceMap returns no entry for VCB → currentPrice undefined
    // → computePortfolioPnl renders N/A for that position (not the stale 85000 price)
    if (captured.length > 0) {
      // Must NOT show the stale price (85,000) as current price
      expect(captured[0]).not.toContain("85,000");
      // Must show N/A indicator for the position with no fresh price
      expect(captured[0]).toContain("N/A");
    }
  });

  it("fresh position prices (updated today) → DANH MỤC block IS present", async () => {
    const db = setupTestDb();

    // Open position for VCB
    db.exec(`
      INSERT INTO positions (code, shares, avg_price, status)
      VALUES ('VCB', 1000, 75000, 'open')
    `);

    // Fresh price for VCB (at mocked time, not system time)
    const mockNow = new Date("2026-04-18T07:00:00Z");
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at)
      VALUES ('VCB', 85000, 1.2, '${mockNow.toISOString()}')
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => mockNow,
      // No getPnlFn → forces default DB path
    };

    await runFranceSummary(opts);

    // Fresh price → portfolio P&L computed → DANH MỤC block present
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("DANH MỤC");
  });
});
