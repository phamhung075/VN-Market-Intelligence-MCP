Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1450 — France Summary VN-Index snapshot (TDD RED phase)
 *
 * Tests:
 *   (a) vnIndex present → formatted output contains "VN-Index: XXXX" block as Section 0
 *   (b) silent-skip fires when only vnIndex is null + all other sources empty
 *   (c) vnIndex block omitted when fetchVnIndexFn returns null
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFranceSummary,
  formatFranceSummaryVI,
} from "../scheduler/briefings/franceSummaryJob.js";
import type { FranceSummaryOptions, FranceSummaryResult } from "../scheduler/briefings/franceSummaryJob.js";
import type { VnIndexSnapshot } from "../application/usecases/assembleEveningSummary.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── minimal in-memory DB ──────────────────────────────────────────────────────

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
      foreign_net_vol REAL,
      PRIMARY KEY (code, date)
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── fixture ───────────────────────────────────────────────────────────────────

const MOCK_VN_INDEX: VnIndexSnapshot = {
  close: 1285.43,
  change: 12,
  changePct: 0.94,
  fetchedAt: "2026-04-18T07:00:00Z",
};

// ── (a) vnIndex present → block appears as first content section ─────────────

describe("1450 (a) — vnIndex present → VN-Index block in output", () => {
  it("formatFranceSummaryVI renders VN-Index line when vnIndex provided", () => {
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      [],       // movers
      [],       // alerts
      [],       // taSignals
      null,     // portfolioPnl
      MOCK_VN_INDEX,
    );
    expect(msg).toContain("VN-Index");
    expect(msg).toContain("1.285");   // Vietnamese dot-thousands: 1285 → "1.285"
  });

  it("runFranceSummary with fetchVnIndexFn → sent message contains VN-Index", async () => {
    const db = setupTestDb();
    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      fetchVnIndexFn: async () => MOCK_VN_INDEX,
    };

    await runFranceSummary(opts);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("VN-Index");
  });

  it("VN-Index block appears before movers (Section 0)", () => {
    const movers = [{ code: "VCB", price: 85000, change_pct: 5.2 }];
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      movers,
      [],
      [],
      null,
      MOCK_VN_INDEX,
    );
    const vnIdxPos = msg.indexOf("VN-Index");
    const moverPos = msg.indexOf("biến động");
    expect(vnIdxPos).toBeGreaterThanOrEqual(0);
    expect(vnIdxPos).toBeLessThan(moverPos);
  });
});

// ── (b) silent-skip when vnIndex null + all sources empty ────────────────────

describe("1450 (b) — silent-skip when vnIndex null + all sources empty", () => {
  it("runFranceSummary returns sent=false when only fetchVnIndexFn returns null + no other data", async () => {
    const db = setupTestDb();
    // No watchlist, no alerts, no TA — only fetchVnIndexFn=null
    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      fetchVnIndexFn: async () => null,
    };

    const result: FranceSummaryResult = await runFranceSummary(opts);
    expect(result.sent).toBe(false);
  });
});

// ── (c) vnIndex block omitted when fetchFn returns null ──────────────────────

describe("1450 (c) — vnIndex block omitted when fetchVnIndexFn returns null", () => {
  it("formatFranceSummaryVI omits VN-Index line when vnIndex is null", () => {
    const movers = [{ code: "VCB", price: 85000, change_pct: 5.2 }];
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      movers,
      [],
      [],
      null,
      null,  // vnIndex = null
    );
    expect(msg).not.toContain("VN-Index");
  });

  it("runFranceSummary with fetchVnIndexFn returning null → no VN-Index in output", async () => {
    const db = setupTestDb();

    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
      VALUES ('VCB', '2026-04-18', 75000, 86000, 74000, 85000, 1000000)
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      fetchVnIndexFn: async () => null,
    };

    await runFranceSummary(opts);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).not.toContain("VN-Index");
  });
});
