/**
 * TASK 1422 — TDD RED: morning-briefing upcomingDeadlines assertions
 *
 * All tests must FAIL (RED) before TASK 1423 is implemented.
 * Tests cover AC-1 through AC-5 from REQ_1422.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleBriefing } from "../application/usecases/assembleBriefing.js";
import { formatBriefingMessage } from "../scheduler/briefings/morningBriefingJob.js";
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOOP_OPTS = {
  pollNewsFn: async () => {},
  fetchVnIndexFn: async () => null,
  briefingsDir: "/tmp/briefings-test-1422",
};

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'general',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS financial_reports (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter INTEGER,
      period_type    TEXT NOT NULL DEFAULT 'Q1',
      parsed_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL,
      source_title TEXT,
      sentiment    TEXT,
      impact_score REAL,
      data_env TEXT
);

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      message               TEXT,
      affected_actions_json TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT
    );

    CREATE TABLE IF NOT EXISTS insider_transactions (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL,
      type             TEXT NOT NULL,
      executed_volume  INTEGER NOT NULL DEFAULT 0,
      insider_name     TEXT NOT NULL DEFAULT '',
      from_date        TEXT NOT NULL DEFAULT '',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id              TEXT PRIMARY KEY,
      code            TEXT NOT NULL,
      date            TEXT NOT NULL,
      foreign_volume  INTEGER,
      fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             TEXT PRIMARY KEY,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0,
      bearish_score  REAL NOT NULL DEFAULT 0,
      fragment_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      closed_at  TEXT
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 — SAP_DEN row for VNM (consumer_goods), today = 2026-04-18
//   Q1 2026 deadline = Apr 30, days until = 12 → SAP_DEN
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: SAP_DEN row included when deadline within 14 days", () => {
  it("includes VNM with SAP_DEN status, 12 days, deadline 2026-04-30", async () => {
    const db = buildTestDb();
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('VNM', 'consumer_goods')`);
    // No financial_reports row → not filed

    const briefing = await assembleBriefing({
      ...NOOP_OPTS,
      db,
      nowFn: () => new Date("2026-04-18"),
    });

    expect(Array.isArray(briefing.upcomingDeadlines)).toBe(true);
    expect(briefing.upcomingDeadlines!.length).toBeGreaterThanOrEqual(1);

    const row = briefing.upcomingDeadlines!.find((r) => r.code === "VNM");
    expect(row).toBeDefined();
    expect(row!.status).toBe("SAP_DEN");
    expect(row!.daysUntilDeadline).toBe(12);
    expect(row!.deadline).toBe("2026-04-30");
    expect(row!.quarter).toBe(1);
    expect(row!.year).toBe(2026);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 — QUA_HAN row, today = 2026-05-05
//   Q1 2026 deadline = Apr 30, days until = -5 → QUA_HAN
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: QUA_HAN row included when deadline has passed", () => {
  it("includes HPG with QUA_HAN status, -5 days", async () => {
    const db = buildTestDb();
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('HPG', 'steel')`);
    // No filing for Q1 2026

    const briefing = await assembleBriefing({
      ...NOOP_OPTS,
      db,
      nowFn: () => new Date("2026-05-05"),
    });

    expect(Array.isArray(briefing.upcomingDeadlines)).toBe(true);

    const row = briefing.upcomingDeadlines!.find((r) => r.code === "HPG");
    expect(row).toBeDefined();
    expect(row!.status).toBe("QUA_HAN");
    expect(row!.daysUntilDeadline).toBe(-5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 — DA_NOP stock excluded (VNM filed Q1 2026)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: DA_NOP stock excluded from upcomingDeadlines", () => {
  it("does not include VNM when it has already filed Q1 2026", async () => {
    const db = buildTestDb();
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('VNM', 'consumer_goods')`);
    db.exec(`
      INSERT INTO financial_reports (action_code, period_year, period_quarter, period_type, parsed_at)
      VALUES ('VNM', 2026, 1, 'Q1', '2026-04-20T00:00:00.000Z')
    `);

    const briefing = await assembleBriefing({
      ...NOOP_OPTS,
      db,
      nowFn: () => new Date("2026-04-18"),
    });

    expect(Array.isArray(briefing.upcomingDeadlines)).toBe(true);
    const row = briefing.upcomingDeadlines!.find((r) => r.code === "VNM");
    expect(row).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 — formatBriefingMessage contains deadline section
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: formatBriefingMessage renders BCTC sắp đến section", () => {
  it("contains deadline section with correct ticker, days, and date", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-18",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      upcomingDeadlines: [
        {
          code: "VNM",
          status: "SAP_DEN" as const,
          daysUntilDeadline: 12,
          deadline: "2026-04-30",
          quarter: 1 as const,
          year: 2026,
          domain: "consumer_goods",
        },
      ],
    };

    const text = formatBriefingMessage(briefing);

    expect(text).toContain("BCTC sắp đến:");
    expect(text).toContain("VNM");
    expect(text).toContain("12 ngày");
    expect(text).toContain("2026-04-30");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 — Section omitted when upcomingDeadlines is empty
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-5: BCTC section omitted when upcomingDeadlines is empty", () => {
  it("does not render BCTC sắp đến: section when array is empty", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-18",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      upcomingDeadlines: [],
    };

    const text = formatBriefingMessage(briefing);
    expect(text).not.toContain("BCTC sắp đến:");
  });
});
