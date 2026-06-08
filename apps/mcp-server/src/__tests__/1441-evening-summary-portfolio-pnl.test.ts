Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1441 — Evening Summary Portfolio P&L (TDD RED phase)
 *
 * Tests:
 *   (a) EveningSummary.portfolioPnl populated with positions → message contains "DANH MỤC"
 *   (b) no positions (null/empty) → section absent, no crash
 *   (c) formatPnlSection returns empty string → section absent
 *   (d) portfolioPnl injected via getPnlFn option → works without real DB
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
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL,
      source_url   TEXT,
      source_title TEXT,
      summary      TEXT,
      sentiment    TEXT,
      impact_score REAL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      message               TEXT,
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
// Imports under test (loaded after DB_PATH env is set)
// ─────────────────────────────────────────────────────────────────────────────

import {
  assembleEveningSummary,
} from "../application/usecases/assembleEveningSummary.js";
import type { AssembleEveningSummaryOptions } from "../application/usecases/assembleEveningSummary.js";
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/briefings/eveningSummaryJob.js";
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
// Test (a): portfolioPnl populated → message contains "DANH MỤC"
// ─────────────────────────────────────────────────────────────────────────────

describe("1441 (a) — EveningSummary.portfolioPnl populated → Telegram message contains DANH MỤC", () => {
  it("assembleEveningSummary honours getPnlFn injection and populates portfolioPnl", async () => {
    const db = setupTestDb();
    const opts: AssembleEveningSummaryOptions = {
      db,
      reportsDir: "/tmp/test-1441-reports",
      fetchVnIndexFn: async () => null,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPnlFn: async () => MOCK_PNL_WITH_POSITIONS,
    };

    const summary = await assembleEveningSummary(opts);

    // Field must exist on the returned summary
    expect(summary.portfolioPnl).toBeDefined();
    expect(summary.portfolioPnl).not.toBeNull();
    const pnl = summary.portfolioPnl!;
    expect(pnl.items.length).toBe(2);
    expect(pnl.items[0]!.code).toBe("VCB");
  });

  it("formatBriefingMessage renders DANH MỤC block when portfolioPnl has items", async () => {
    const db = setupTestDb();
    resetEveningSummaryGuard();

    const captured: string[] = [];

    await runEveningSummary(
      async () => {
        const s = await assembleEveningSummary({
          db,
          reportsDir: "/tmp/test-1441-reports",
          fetchVnIndexFn: async () => null,
          getPredictionSignalsFn: async () => [],
          computeTaFn: () => null,
          getOhlcvRowCountFn: () => 0,
          getPnlFn: async () => MOCK_PNL_WITH_POSITIONS,
        });
        // Force topStories/topAlerts empty so hasContent relies on portfolioPnl
        // Actually portfolioPnl alone should trigger hasContent
        return s;
      },
      async (msg) => { captured.push(msg); },
      db,
    );

    expect(captured.length).toBeGreaterThan(0);
    const msg = captured[0];
    expect(msg).toContain("DANH MỤC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (b): no positions (null/empty) → section absent, no crash
// ─────────────────────────────────────────────────────────────────────────────

describe("1441 (b) — no positions → section absent, no crash", () => {
  it("assembleEveningSummary with getPnlFn returning null → portfolioPnl is null", async () => {
    const db = setupTestDb();
    const opts: AssembleEveningSummaryOptions = {
      db,
      reportsDir: "/tmp/test-1441-reports",
      fetchVnIndexFn: async () => null,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPnlFn: async () => null,
    };

    const summary = await assembleEveningSummary(opts);
    // portfolioPnl should be null (not a crash)
    expect(summary.portfolioPnl).toBeNull();
  });

  it("assembleEveningSummary with getPnlFn returning empty result → portfolioPnl items empty", async () => {
    const db = setupTestDb();
    const opts: AssembleEveningSummaryOptions = {
      db,
      reportsDir: "/tmp/test-1441-reports",
      fetchVnIndexFn: async () => null,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPnlFn: async () => MOCK_PNL_EMPTY,
    };

    const summary = await assembleEveningSummary(opts);
    // Items empty — section must not render in Telegram
    expect(summary.portfolioPnl?.items.length).toBe(0);
  });

  it("runEveningSummary with no portfolioPnl → Telegram message does NOT contain DANH MỤC", async () => {
    const db = setupTestDb();
    resetEveningSummaryGuard();

    const captured: string[] = [];

    // Give at least one piece of content so hasContent fires
    db.exec(`INSERT INTO rag_analyses (id, created_at, level, source_title, impact_score)
             VALUES ('ra1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'country', 'Test Story', 8.0)`);

    await runEveningSummary(
      async () =>
        assembleEveningSummary({
          db,
          reportsDir: "/tmp/test-1441-reports",
          fetchVnIndexFn: async () => null,
          getPredictionSignalsFn: async () => [],
          computeTaFn: () => null,
          getOhlcvRowCountFn: () => 0,
          getPnlFn: async () => null,
        }),
      async (msg) => { captured.push(msg); },
      db,
    );

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).not.toContain("DANH MỤC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (c): formatPnlSection returns "" → section absent from message
// ─────────────────────────────────────────────────────────────────────────────

describe("1441 (c) — formatPnlSection returns empty string → section absent", () => {
  it("runEveningSummary omits P&L block when getPnlFn returns empty-items result", async () => {
    const db = setupTestDb();
    resetEveningSummaryGuard();

    const captured: string[] = [];

    db.exec(`INSERT INTO rag_analyses (id, created_at, level, source_title, impact_score)
             VALUES ('ra2', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'country', 'Test Story 2', 7.5)`);

    await runEveningSummary(
      async () =>
        assembleEveningSummary({
          db,
          reportsDir: "/tmp/test-1441-reports",
          fetchVnIndexFn: async () => null,
          getPredictionSignalsFn: async () => [],
          computeTaFn: () => null,
          getOhlcvRowCountFn: () => 0,
          getPnlFn: async () => MOCK_PNL_EMPTY,
        }),
      async (msg) => { captured.push(msg); },
      db,
    );

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).not.toContain("DANH MỤC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (d): getPnlFn injection works without real DB
// ─────────────────────────────────────────────────────────────────────────────

describe("1441 (d) — getPnlFn injection works without real DB", () => {
  it("assembleEveningSummary calls getPnlFn and does not touch positions table", async () => {
    const db = setupTestDb();
    // Deliberately do NOT create a positions table → real DB path would throw
    let pnlFnCalled = false;

    const opts: AssembleEveningSummaryOptions = {
      db,
      reportsDir: "/tmp/test-1441-reports",
      fetchVnIndexFn: async () => null,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPnlFn: async () => {
        pnlFnCalled = true;
        return MOCK_PNL_WITH_POSITIONS;
      },
    };

    const summary = await assembleEveningSummary(opts);

    expect(pnlFnCalled).toBe(true);
    expect(summary.portfolioPnl).not.toBeNull();
    expect(summary.portfolioPnl!.totalPnlAmount).toBe(7_500_000);
  });

  it("getPnlFn throwing → portfolioPnl is null, no crash", async () => {
    const db = setupTestDb();
    resetEveningSummaryGuard();

    const opts: AssembleEveningSummaryOptions = {
      db,
      reportsDir: "/tmp/test-1441-reports",
      fetchVnIndexFn: async () => null,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPnlFn: async () => { throw new Error("DB unavailable"); },
    };

    const summary = await assembleEveningSummary(opts);

    // Must not crash, portfolioPnl should be null on error
    expect(summary.portfolioPnl).toBeNull();
  });
});
