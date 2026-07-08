Bun.env["DB_PATH"] = ":memory:";

/**
 * FACTORY-INFRA-split-telegramCommands
 *
 * Tests for the pieces extracted out of telegramCommands.ts (1071L → thin
 * router + telegram/{format,commandHandlers,newsHandler,recapRenderer}.ts +
 * infrastructure/db/{watchlistReadStore,systemHealthStore,agentFeedbackStore}.ts
 * + application/usecases/orchestrateRecapCommand.ts):
 *
 *   1. watchlistReadStore — listWatchlistWithPrices / getPriceQuote
 *   2. systemHealthStore  — getSystemHealthCounts
 *   3. agentFeedbackStore — insertAgentFeedback
 *   4. recapRenderer      — renderEveningRecap / renderPeriodicRecap / recapErrorMessage
 *      built from HAND-WRITTEN minimal objects (not imported from
 *      application/usecases/) — proves the layering fix: recapRenderer.ts
 *      has zero coupling to EveningSummary/PeriodicSummary's producer types.
 *   5. telegramCommands.ts RecapResolvers DI — /recap* with an injected
 *      resolver renders real content; without one, degrades gracefully
 *      (never throws) — this is the new default-safety behavior now that
 *      the router no longer has a built-in application-layer fallback.
 *   6. orchestrateRecapCommand — orchestrateEveningRecap/Weekly/Monthly
 *      correctly forward to assembleEveningSummary/generatePeriodicSummary.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import {
  listWatchlistWithPrices,
  getPriceQuote,
} from "../infrastructure/db/watchlistReadStore.js";
import { getSystemHealthCounts } from "../infrastructure/db/systemHealthStore.js";
import { insertAgentFeedback } from "../infrastructure/db/agentFeedbackStore.js";
import {
  renderEveningRecap,
  renderPeriodicRecap,
  recapErrorMessage,
  type EveningRecapData,
  type PeriodicRecapData,
} from "../infrastructure/notifiers/telegram/recapRenderer.js";
import {
  handleTelegramCommand,
  handleRecap,
  handleRecapWeek,
  handleRecapMonth,
  type TelegramUpdate,
} from "../infrastructure/notifiers/telegramCommands.js";
import {
  orchestrateEveningRecap,
  orchestrateWeeklyRecap,
  orchestrateMonthlyRecap,
} from "../application/usecases/orchestrateRecapCommand.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared schema helper (mirrors 214-telegram-commands.test.ts's makeRecapDb —
// duplicated per this repo's test-isolation convention, no cross-test imports)
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, company_name TEXT, exchange TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'other', notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL,
      volume REAL, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL,
      low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
      signals_json TEXT, affected_actions_json TEXT, analysis_ids_json TEXT,
      message TEXT, read INTEGER NOT NULL DEFAULT 0, user_note TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, category TEXT NOT NULL,
      title TEXT NOT NULL, detail TEXT, priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT, source_title TEXT, source_url TEXT,
      source_type TEXT, published_at TEXT, sentiment TEXT, impact_score REAL, impact_direction TEXT,
      confidence REAL, time_horizon TEXT, summary TEXT, reasoning TEXT, affected_countries TEXT,
      affected_domains TEXT, affected_actions TEXT, parent_ids TEXT, tags TEXT, embedding_text TEXT,
      data_env TEXT
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, shares REAL NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0, opened_at TEXT NOT NULL, closed_at TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS commodity_prices (
      vix REAL, dxy REAL, sp500 REAL, hang_seng REAL, fetched_at TEXT
    );
    CREATE TABLE IF NOT EXISTS macro_indicators (
      country TEXT, cpi REAL, gdp_growth REAL, interest_rate REAL
    );
    CREATE TABLE IF NOT EXISTS market_summaries (
      id TEXT PRIMARY KEY, period_type TEXT, period_start TEXT, period_end TEXT,
      created_at TEXT, updated_at TEXT, summary_text TEXT, key_events_json TEXT,
      stock_performance_json TEXT, alerts_summary_json TEXT, macro_context_json TEXT,
      recommendation_json TEXT, news_count INTEGER, alert_count INTEGER, report_count INTEGER,
      UNIQUE(period_type, period_start)
    );
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, parsed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id TEXT PRIMARY KEY, created_at TEXT, severity TEXT, ticker TEXT,
      signal_type TEXT, description TEXT
    );
  `);
  return db;
}

function makeUpdate(text: string, chatId = 1): TelegramUpdate {
  return { message: { chat: { id: chatId }, text, from: { first_name: "T" } } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. watchlistReadStore
// ─────────────────────────────────────────────────────────────────────────────

describe("watchlistReadStore", () => {
  it("listWatchlistWithPrices — joins watchlist with market_prices, ordered by code", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO watchlist (code, company_name, exchange, domain, added_at) VALUES ('VCB','Vietcombank','HOSE','banking',datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct) VALUES ('VCB', 88000, -1.5)`,
    ).run();

    const rows = listWatchlistWithPrices(db);
    expect(rows.length).toBe(1);
    expect(rows[0]!.code).toBe("VCB");
    expect(rows[0]!.price).toBe(88000);
    expect(rows[0]!.change_pct).toBe(-1.5);
    db.close();
  });

  it("listWatchlistWithPrices — falls back to daily_ohlcv when no market_prices row", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO watchlist (code, company_name, exchange, domain, added_at) VALUES ('FPT','FPT Corp','HOSE','tech',datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, updated_at) VALUES ('FPT','2026-07-01',100,105,99,102,'2026-07-01')`,
    ).run();

    const rows = listWatchlistWithPrices(db);
    expect(rows[0]!.price).toBe(102);
    db.close();
  });

  it("getPriceQuote — returns market_prices row when price > 0", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at) VALUES ('VCB', 88000, -1200, -1.35, 950000, '2026-07-01 09:00:00')`,
    ).run();

    const row = getPriceQuote(db, "VCB");
    expect(row?.price).toBe(88000);
    expect(row?.volume).toBe(950000);
    db.close();
  });

  it("getPriceQuote — falls back to daily_ohlcv when no market_prices row", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES ('VNM','2026-07-01',75000,76000,74500,75500,500000,'2026-07-01')`,
    ).run();

    const row = getPriceQuote(db, "VNM");
    expect(row?.price).toBe(75500);
    expect(row?.change_pct).toBeNull();
    db.close();
  });

  it("getPriceQuote — returns null when no data at all", () => {
    const db = makeDb();
    expect(getPriceQuote(db, "XYZ999")).toBeNull();
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. systemHealthStore
// ─────────────────────────────────────────────────────────────────────────────

describe("systemHealthStore", () => {
  it("getSystemHealthCounts — counts watchlist/alerts/market_prices rows", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('VCB','HOSE','banking',datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, message) VALUES ('a1', datetime('now'), 'warning', 'x')`,
    ).run();
    db.prepare(`INSERT INTO market_prices (code, price) VALUES ('VCB', 88000)`).run();

    const counts = getSystemHealthCounts(db);
    expect(counts).toEqual({ watchlistCount: 1, alertCount: 1, priceCount: 1 });
    db.close();
  });

  it("getSystemHealthCounts — returns zeros defensively when tables are missing", () => {
    const brokenDb = new Database(":memory:");
    const counts = getSystemHealthCounts(brokenDb);
    expect(counts).toEqual({ watchlistCount: 0, alertCount: 0, priceCount: 0 });
    brokenDb.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. agentFeedbackStore
// ─────────────────────────────────────────────────────────────────────────────

describe("agentFeedbackStore", () => {
  it("insertAgentFeedback — writes a new row with status='new'", () => {
    const db = makeDb();
    insertAgentFeedback(db, {
      agent: "user-telegram",
      category: "user_report",
      title: "lỗi giá",
      detail: "giá VCB sai",
      priority: "high",
    });

    const row = db
      .prepare<{ agent: string; title: string; priority: string; status: string }, []>(
        "SELECT agent, title, priority, status FROM agent_feedback",
      )
      .get();
    expect(row).toEqual({ agent: "user-telegram", title: "lỗi giá", priority: "high", status: "new" });
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. recapRenderer — pure, hand-built objects (proves zero application-layer coupling)
// ─────────────────────────────────────────────────────────────────────────────

describe("recapRenderer — pure rendering with hand-built (non-application-typed) data", () => {
  it("renderEveningRecap — a plain object literal (not an imported EveningSummary) renders correctly", () => {
    const summary: EveningRecapData = {
      date: "2026-07-08",
      vnIndex: { close: 1300, change: 10, changePct: 0.8 },
      watchlistMovers: [{ code: "VCB", changePct: 2.1, price: 88000 }],
      topStories: [{ title: "Tin quan trọng" }],
      topAlerts: [{ severity: "warning", message: "Cảnh báo test" }],
      portfolioPnl: null,
      foreignFlowMovers: [],
    };

    const result = renderEveningRecap(summary);
    const output = result.texts.join("\n");
    expect(output).toContain("Tổng kết ngày 2026-07-08");
    expect(output).toContain("VCB");
    expect(output).toContain("Tin quan trọng");
    expect(output).toContain("Cảnh báo");
  });

  it("renderEveningRecap — malformed input never throws, returns the day error text", () => {
    // @ts-expect-error — deliberately malformed to exercise the defensive catch
    const result = renderEveningRecap({ date: "x", watchlistMovers: null });
    expect(result.texts[0]).toBe(recapErrorMessage("day"));
  });

  it("renderPeriodicRecap — week — a plain object literal renders correctly", () => {
    const summary: PeriodicRecapData = {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-07",
      newsCount: 10,
      alertCount: 2,
      reportCount: 1,
      keyEvents: [{ date: "2026-07-02", title: "Sự kiện", direction: "up" }],
      stockPerformance: { VCB: { changePct: 3.5 } },
      alertsSummary: { bySeverity: { warning: 2 }, topAlerts: ["Cảnh báo A"] },
    };

    const result = renderPeriodicRecap(summary, "week");
    const output = result.texts.join("\n");
    expect(output).toContain("Tổng kết tuần");
    expect(output).toContain("Tin tức: 10 bài");
    expect(output).toContain("VCB");
  });

  it("renderPeriodicRecap — month — header + error message use the month label", () => {
    const summary: PeriodicRecapData = {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      newsCount: 0,
      alertCount: 0,
      reportCount: 0,
      keyEvents: [],
      stockPerformance: {},
      alertsSummary: { bySeverity: {}, topAlerts: [] },
    };
    const result = renderPeriodicRecap(summary, "month");
    expect(result.texts.join("\n")).toContain("Tổng kết tháng");
    expect(recapErrorMessage("month")).toContain("tháng");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. telegramCommands.ts RecapResolvers DI contract
// ─────────────────────────────────────────────────────────────────────────────

describe("telegramCommands.ts — RecapResolvers DI (layering fix)", () => {
  const fakeEvening: EveningRecapData = {
    date: "2026-07-08",
    watchlistMovers: [],
    topStories: [],
    topAlerts: [],
  };
  const fakePeriodic: PeriodicRecapData = {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-07",
    newsCount: 5,
    alertCount: 0,
    reportCount: 0,
    keyEvents: [],
    stockPerformance: {},
    alertsSummary: { bySeverity: {}, topAlerts: [] },
  };

  it("handleRecap — with an injected resolver, renders real content (no db import needed by the resolver)", async () => {
    const result = await handleRecap(makeDb(), async () => fakeEvening);
    expect(result.texts.join("\n")).toContain("Tổng kết ngày 2026-07-08");
  });

  it("handleTelegramCommand — /recap with recapResolvers injected renders real content end-to-end", async () => {
    const db = makeDb();
    const result = await handleTelegramCommand(makeUpdate("/recap"), db, {
      evening: async () => fakeEvening,
    });
    expect(result!.texts!.join("\n")).toContain("Tổng kết ngày 2026-07-08");
    db.close();
  });

  it("handleTelegramCommand — /recapw with recapResolvers injected renders real content end-to-end", async () => {
    const db = makeDb();
    const result = await handleTelegramCommand(makeUpdate("/recapw"), db, {
      weekly: async () => fakePeriodic,
    });
    expect(result!.texts!.join("\n")).toContain("Tổng kết tuần");
    db.close();
  });

  it("handleTelegramCommand — /recapm without any recapResolvers degrades gracefully (never throws)", async () => {
    const db = makeDb();
    const result = await handleTelegramCommand(makeUpdate("/recapm"), db);
    expect(result).not.toBeNull();
    expect(result!.texts).toEqual([recapErrorMessage("month")]);
    db.close();
  });

  it("handleRecapWeek / handleRecapMonth — omitted resolver returns friendly error, no throw", async () => {
    const week = await handleRecapWeek(makeDb());
    const month = await handleRecapMonth(makeDb());
    expect(week.texts).toEqual([recapErrorMessage("week")]);
    expect(month.texts).toEqual([recapErrorMessage("month")]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. orchestrateRecapCommand — application usecase forwards correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("orchestrateRecapCommand — application usecase (interface layer's fetch step)", () => {
  it("orchestrateEveningRecap — forwards db to assembleEveningSummary, returns a well-shaped EveningSummary", async () => {
    const db = makeDb();
    const summary = await orchestrateEveningRecap(db);
    expect(typeof summary.date).toBe("string");
    expect(Array.isArray(summary.watchlistMovers)).toBe(true);
    db.close();
  });

  it("orchestrateWeeklyRecap — forwards db to generatePeriodicSummary('weekly', ...)", async () => {
    const db = makeDb();
    const summary = await orchestrateWeeklyRecap(db);
    expect(summary.periodType).toBe("weekly");
    db.close();
  });

  it("orchestrateMonthlyRecap — forwards db to generatePeriodicSummary('monthly', ...)", async () => {
    const db = makeDb();
    const summary = await orchestrateMonthlyRecap(db);
    expect(summary.periodType).toBe("monthly");
    db.close();
  });
});
