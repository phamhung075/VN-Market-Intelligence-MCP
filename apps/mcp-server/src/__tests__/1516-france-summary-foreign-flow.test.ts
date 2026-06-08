Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFranceSummary,
  formatFranceSummaryVI,
} from "../scheduler/briefings/franceSummaryJob.js";
import type { FranceSummaryOptions, FranceSummaryResult } from "../scheduler/briefings/franceSummaryJob.js";
import type { ForeignFlowMover } from "../application/usecases/assembleEveningSummary.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT NOT NULL,
      price REAL NOT NULL,
      volume REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT,
      affected_actions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      from_agent TEXT,
      message_type TEXT,
      sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source TEXT PRIMARY KEY,
      vix REAL NOT NULL DEFAULT 0,
      dxy REAL NOT NULL DEFAULT 0,
      sp500 REAL NOT NULL DEFAULT 0,
      hang_seng REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock movers
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_MOVERS: ForeignFlowMover[] = [
  { code: "VCB", foreignNetVol: 500000, foreignBuyVol: 800000, foreignSellVol: 300000 },
  { code: "HPG", foreignNetVol: -200000, foreignBuyVol: 100000, foreignSellVol: 300000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 — FranceSummaryResult has foreignFlowMovers field
// ─────────────────────────────────────────────────────────────────────────────

describe("1516 AC-1 — FranceSummaryResult has foreignFlowMovers field", () => {
  it("result.foreignFlowMovers key exists in returned object", async () => {
    const db = setupTestDb();
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getForeignFlowMoversFn: () => [],
    });
    // RED: foreignFlowMovers not in FranceSummaryResult yet
    expect("foreignFlowMovers" in result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 — getForeignFlowMoversFn injectable
// ─────────────────────────────────────────────────────────────────────────────

describe("1516 AC-2 — getForeignFlowMoversFn injectable", () => {
  it("calls getForeignFlowMoversFn and populates result.foreignFlowMovers", async () => {
    const db = setupTestDb();
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    let called = false;
    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getForeignFlowMoversFn: (_db) => { called = true; return MOCK_MOVERS; },
    };
    await runFranceSummary(opts);
    // RED: getForeignFlowMoversFn not in interface yet
    expect(called).toBe(true);
  });

  it("result.foreignFlowMovers equals value returned by getForeignFlowMoversFn", async () => {
    const db = setupTestDb();
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getForeignFlowMoversFn: () => MOCK_MOVERS,
    });
    // RED: foreignFlowMovers not populated yet
    expect(result.foreignFlowMovers).toHaveLength(2);
    expect(result.foreignFlowMovers![0]!.code).toBe("VCB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 — formatFranceSummaryVI renders Khối ngoại section
// ─────────────────────────────────────────────────────────────────────────────

describe("1516 AC-3 — formatFranceSummaryVI renders Khối ngoại section", () => {
  it("message contains 'Khối ngoại' when foreignFlowMovers provided", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026",
      [],
      [],
      [],
      null,
      null,
      null,
      MOCK_MOVERS,
    );
    expect(msg).toContain("Khối ngoại");
  });

  it("message contains VCB mua ròng", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026",
      [],
      [],
      [],
      null,
      null,
      null,
      MOCK_MOVERS,
    );
    expect(msg).toContain("VCB");
    expect(msg).toContain("mua ròng");
  });

  it("message contains HPG bán ròng", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026",
      [],
      [],
      [],
      null,
      null,
      null,
      MOCK_MOVERS,
    );
    expect(msg).toContain("HPG");
    expect(msg).toContain("bán ròng");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 — formatFranceSummaryVI omits section when empty/absent
// ─────────────────────────────────────────────────────────────────────────────

describe("1516 AC-4 — formatFranceSummaryVI omits section when empty", () => {
  it("omits 'Khối ngoại' when foreignFlowMovers is undefined", () => {
    const msg = formatFranceSummaryVI("20/04/2026", [], [], [], null, null, null);
    expect(msg).not.toContain("Khối ngoại");
  });

  it("omits 'Khối ngoại' when foreignFlowMovers is empty array", () => {
    const msg = formatFranceSummaryVI("20/04/2026", [], [], [], null, null, null, []);
    expect(msg).not.toContain("Khối ngoại");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 — default DB query reads daily_ohlcv
// ─────────────────────────────────────────────────────────────────────────────

describe("1516 AC-5 — default path reads daily_ohlcv foreign flow", () => {
  it("populates foreignFlowMovers from daily_ohlcv when fn not injected", async () => {
    const db = setupTestDb();
    // Seed daily_ohlcv with foreign flow data — latest date, 2 rows
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
      VALUES
        ('VCB', '2026-04-20', 85000, 86000, 84000, 85500, 1000000, 800000, 300000,  500000),
        ('HPG', '2026-04-20', 25000, 26000, 24000, 25500, 2000000, 100000, 300000, -200000),
        ('MSN', '2026-04-20', 60000, 61000, 59000, 60500, 500000,  NULL,   NULL,    NULL)
    `);
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
    });
    // RED: no daily_ohlcv query yet
    expect(result.foreignFlowMovers).toBeDefined();
    // MSN excluded (NULL foreign_net_vol); VCB and HPG included
    expect(result.foreignFlowMovers!.some((m) => m.code === "VCB")).toBe(true);
    expect(result.foreignFlowMovers!.some((m) => m.code === "HPG")).toBe(true);
    expect(result.foreignFlowMovers!.some((m) => m.code === "MSN")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 — foreignFlowMovers alone satisfies hasContent guard
// ─────────────────────────────────────────────────────────────────────────────

describe("1516 AC-6 — foreignFlowMovers alone satisfies hasContent guard", () => {
  it("sends digest when only foreignFlowMovers present (no movers/alerts/TA)", async () => {
    const db = setupTestDb();
    // No watchlist, no alerts, no TA — only foreign flow injected
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getForeignFlowMoversFn: () => MOCK_MOVERS,
    });
    // RED: hasContent guard does not include foreignFlowMovers yet
    expect(result.sent).toBe(true);
  });
});
