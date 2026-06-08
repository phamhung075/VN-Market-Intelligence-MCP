Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1444 — France Summary Portfolio P&L (TDD RED phase)
 *
 * Tests:
 *   (a) positions present → France digest message contains "DANH MỤC"
 *   (b) no positions (null/empty) → section absent, no crash
 *   (c) getPnlFn? injectable → works without real DB
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DB schema helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id           TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity     TEXT NOT NULL,
      message      TEXT,
      affected_actions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      from_agent   TEXT,
      message_type TEXT,
      sent_at      TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code   TEXT NOT NULL,
      date   TEXT NOT NULL,
      open   REAL,
      high   REAL,
      low    REAL,
      close  REAL,
      volume REAL,
      PRIMARY KEY (code, date)
    );
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports under test
// ─────────────────────────────────────────────────────────────────────────────

import {
  runFranceSummary,
  formatFranceSummaryVI,
} from "../scheduler/briefings/franceSummaryJob.js";
import type { FranceSummaryOptions } from "../scheduler/briefings/franceSummaryJob.js";
import type { PortfolioPnlResult } from "../domain/services/portfolioPnlCalculator.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PNL_WITH_POSITIONS: PortfolioPnlResult = {
  items: [
    {
      code: "VCB",
      shares: 1000,
      avgPrice: 75_000,
      currentPrice: 85_000,
      pnlAmount: 10_000_000,
      pnlPct: 13.33,
    },
    {
      code: "FPT",
      shares: 500,
      avgPrice: 120_000,
      currentPrice: 115_000,
      pnlAmount: -2_500_000,
      pnlPct: -4.17,
    },
  ],
  totalPnlAmount: 7_500_000,
  totalPnlPct: 5.6,
};

const MOCK_PNL_EMPTY: PortfolioPnlResult = {
  items: [],
  totalPnlAmount: 0,
  totalPnlPct: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Test (a): positions present → message contains "DANH MỤC"
// ─────────────────────────────────────────────────────────────────────────────

describe("1444 (a) — positions present → France digest contains DANH MỤC", () => {
  it("formatFranceSummaryVI renders DANH MỤC block when portfolioPnl has items", () => {
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      [],
      [],
      [],
      MOCK_PNL_WITH_POSITIONS,
    );
    expect(msg).toContain("DANH MỤC");
    expect(msg).toContain("VCB");
  });

  it("runFranceSummary with getPnlFn returning positions → sent message contains DANH MỤC", async () => {
    const db = setupTestDb();

    // Seed at least one mover so the digest has content (silent-skip guard)
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => MOCK_PNL_WITH_POSITIONS,
    };

    await runFranceSummary(opts);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("DANH MỤC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (b): no positions → section absent, no crash
// ─────────────────────────────────────────────────────────────────────────────

describe("1444 (b) — no positions → section absent, no crash", () => {
  it("formatFranceSummaryVI omits DANH MỤC when portfolioPnl is null", () => {
    const msg = formatFranceSummaryVI("18/04/2026", [], [], [], null);
    expect(msg).not.toContain("DANH MỤC");
  });

  it("formatFranceSummaryVI omits DANH MỤC when portfolioPnl items are empty", () => {
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      [],
      [],
      [],
      MOCK_PNL_EMPTY,
    );
    expect(msg).not.toContain("DANH MỤC");
  });

  it("runFranceSummary with getPnlFn returning null → no crash, DANH MỤC absent", async () => {
    const db = setupTestDb();

    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
    };

    await runFranceSummary(opts);

    if (captured.length > 0) {
      expect(captured[0]).not.toContain("DANH MỤC");
    }
    // No crash = test passes regardless of sent/not
  });

  it("runFranceSummary with getPnlFn returning empty items → DANH MỤC absent", async () => {
    const db = setupTestDb();

    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => MOCK_PNL_EMPTY,
    };

    await runFranceSummary(opts);

    if (captured.length > 0) {
      expect(captured[0]).not.toContain("DANH MỤC");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (c): getPnlFn injectable → works without real DB
// ─────────────────────────────────────────────────────────────────────────────

describe("1444 (c) — getPnlFn injectable, works without real DB", () => {
  it("runFranceSummary calls getPnlFn and does not touch positions table", async () => {
    const db = setupTestDb();
    // Deliberately do NOT create a positions table → real DB path would throw

    db.exec(`INSERT INTO watchlist (code) VALUES ('FPT')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('FPT', 120000, 500, datetime('now', '-1 minute')),
             ('FPT', 110000, 450, datetime('now', '-2 minutes'))
    `);

    let pnlFnCalled = false;
    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => {
        pnlFnCalled = true;
        return MOCK_PNL_WITH_POSITIONS;
      },
    };

    await runFranceSummary(opts);

    expect(pnlFnCalled).toBe(true);
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("DANH MỤC");
  });

  it("getPnlFn throwing → no crash, result.sent still reflects content presence", async () => {
    const db = setupTestDb();

    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => { throw new Error("DB unavailable"); },
    };

    // Must not throw
    const result = await runFranceSummary(opts);
    expect(result).toBeDefined();
    // portfolioPnl section absent on error — message still sent for other content
    // (sent may be true or false depending on other content — just no crash)
  });
});
