Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFranceSummary,
  formatFranceSummaryVI,
} from "../scheduler/briefings/franceSummaryJob.js";
import type { BctcDeadlineRow } from "../application/usecases/assembleBriefing.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup (reuses 1516 pattern + adds financial_reports)
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
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER,
      period_quarter INTEGER,
      period_type TEXT,
      parsed_at TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 — FranceSummaryResult has upcomingDeadlines field
// ─────────────────────────────────────────────────────────────────────────────

describe("1519 AC-1 — FranceSummaryResult has upcomingDeadlines field", () => {
  it("result.upcomingDeadlines key exists", async () => {
    const db = setupTestDb();
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => [],
    });
    // RED: upcomingDeadlines not in FranceSummaryResult yet
    expect("upcomingDeadlines" in result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 — getUpcomingDeadlinesFn injectable
// ─────────────────────────────────────────────────────────────────────────────

describe("1519 AC-2 — getUpcomingDeadlinesFn injectable", () => {
  it("calls getUpcomingDeadlinesFn with (db, now) and populates result", async () => {
    const db = setupTestDb();
    let calledWith: [unknown, unknown] | null = null;
    const now = new Date("2026-04-20T06:00:00Z");
    const MOCK: BctcDeadlineRow[] = [
      { code: "VCB", domain: "banking", quarter: 1, year: 2026,
        deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN" },
    ];
    await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => now,
      getUpcomingDeadlinesFn: (_db, _now) => { calledWith = [_db, _now]; return MOCK; },
    });
    // RED: fn not called yet
    expect(calledWith).not.toBeNull();
    expect(calledWith![1]).toBe(now);
  });

  it("result.upcomingDeadlines equals value returned by fn", async () => {
    const db = setupTestDb();
    const MOCK: BctcDeadlineRow[] = [
      { code: "VCB", domain: "banking", quarter: 1, year: 2026,
        deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN" },
    ];
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => MOCK,
    });
    // RED: not populated yet
    expect(result.upcomingDeadlines).toHaveLength(1);
    expect(result.upcomingDeadlines![0]!.code).toBe("VCB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 — formatFranceSummaryVI renders "BCTC sắp đến" section
// ─────────────────────────────────────────────────────────────────────────────

describe("1519 AC-3 — formatFranceSummaryVI renders BCTC sắp đến section", () => {
  const SAP_DEN_ROW: BctcDeadlineRow = {
    code: "VCB", domain: "banking", quarter: 1, year: 2026,
    deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN",
  };
  const QUA_HAN_ROW: BctcDeadlineRow = {
    code: "HPG", domain: "other", quarter: 4, year: 2025,
    deadline: "2026-03-31", daysUntilDeadline: -20, status: "QUA_HAN",
  };

  it("contains 'BCTC sắp đến' header", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [SAP_DEN_ROW],
    );
    // RED: Section 4.5 not implemented yet
    expect(msg).toContain("BCTC sắp đến");
  });

  it("SAP_DEN row renders code + quarter + year + days", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [SAP_DEN_ROW],
    );
    expect(msg).toContain("VCB");
    expect(msg).toContain("Q1/2026");
    expect(msg).toContain("25");
  });

  it("QUA_HAN row renders 'QUÁ HẠN' label + abs days", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [QUA_HAN_ROW],
    );
    expect(msg).toContain("HPG");
    expect(msg).toContain("QUÁ HẠN");
    expect(msg).toContain("20");
  });

  it("omits section when upcomingDeadlines is empty array", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [],
    );
    expect(msg).not.toContain("BCTC sắp đến");
  });

  it("omits section when upcomingDeadlines is undefined", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, undefined,
    );
    expect(msg).not.toContain("BCTC sắp đến");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 — upcomingDeadlines alone satisfies hasContent guard
// ─────────────────────────────────────────────────────────────────────────────

describe("1519 AC-4 — upcomingDeadlines alone satisfies hasContent guard", () => {
  it("sends digest when only upcomingDeadlines present (no movers/alerts/TA)", async () => {
    const db = setupTestDb();
    const MOCK: BctcDeadlineRow[] = [
      { code: "VCB", domain: "banking", quarter: 1, year: 2026,
        deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN" },
    ];
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => MOCK,
    });
    // RED: hasContent guard does not include upcomingDeadlines yet
    expect(result.sent).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 — default path: empty when all filed
// ─────────────────────────────────────────────────────────────────────────────

describe("1519 AC-5 — default path: empty when all filed", () => {
  it("upcomingDeadlines is empty array when fn returns [] (all filed)", async () => {
    const db = setupTestDb();
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => [],
    });
    expect(result.upcomingDeadlines).toBeDefined();
    expect(result.upcomingDeadlines).toHaveLength(0);
  });
});
