Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 172 — Prediction Markets section in morning briefing and evening summary
 *
 * Tests for:
 *   - getRecentPredictionSignals returns signals from the last N hours
 *   - getRecentPredictionSignals filters to HIGH/CRITICAL severity only when requested
 *   - getRecentPredictionSignals returns empty array when no signals in range
 *   - assembleBriefing includes predictionSignals field with HIGH/CRITICAL signals
 *   - assembleBriefing skips prediction section gracefully when table missing
 *   - assembleBriefing includes only HIGH/CRITICAL signals (not low/medium)
 *   - assembleEveningSummary includes predictionSignals field
 *   - assembleEveningSummary skips prediction section gracefully when table missing
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getRecentPredictionSignals } from "../infrastructure/db/predictionStore.js";
import { assembleBriefing } from "../application/usecases/assembleBriefing.js";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = OFF"); // OFF so we can insert prediction_signals without FK

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
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT,
      data_env TEXT
);

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      resolved_at           TEXT,
      resolution_notes      TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_reports (
      id              TEXT PRIMARY KEY,
      action_code     TEXT NOT NULL,
      company_name    TEXT,
      exchange        TEXT,
      domain          TEXT,
      period_year     INTEGER,
      period_type     TEXT,
      period_start    TEXT,
      period_end      TEXT,
      sort_key        TEXT,
      ssc_url         TEXT,
      parsed_at       TEXT,
      balance_sheet_json  TEXT DEFAULT '{}',
      income_stmt_json    TEXT DEFAULT '{}',
      cash_flow_json      TEXT DEFAULT '{}',
      ratios_json         TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      yes_price        REAL NOT NULL,
      no_price         REAL NOT NULL,
      volume_24h       REAL NOT NULL DEFAULT 0,
      volume_total     REAL NOT NULL DEFAULT 0,
      liquidity        REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0,
      unique_wallets   INTEGER NOT NULL DEFAULT 0,
      tags             TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prediction_signals (
      id              TEXT PRIMARY KEY,
      market_id       TEXT NOT NULL,
      signal_type     TEXT NOT NULL,
      severity        TEXT NOT NULL,
      yes_price_prev  REAL,
      yes_price_curr  REAL NOT NULL,
      volume_24h      REAL NOT NULL DEFAULT 0,
      unique_wallets  INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL,
      mapped_sectors  TEXT NOT NULL DEFAULT '[]',
      mapped_stocks   TEXT NOT NULL DEFAULT '[]',
      reasoning       TEXT NOT NULL,
      detected_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    );
  `);

  return db;
}

function insertPredictionMarket(db: Database, id: string, question: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total, liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES
      (?, ?, '2026-12-31', 0.72, 0.28, 150000, 500000, 80000, 0.72, 50, '[]', datetime('now'), datetime('now'))
  `).run(id, question);
}

function insertPredictionSignal(
  db: Database,
  opts: {
    id: string;
    marketId: string;
    signalType?: string;
    severity: string;
    yesPriceCurr?: number;
    yesPricePrev?: number | null;
    confidence?: number;
    reasoning?: string;
    detectedAt?: string;
  },
): void {
  db.prepare(`
    INSERT INTO prediction_signals
      (id, market_id, signal_type, severity, yes_price_prev, yes_price_curr,
       volume_24h, unique_wallets, confidence, mapped_sectors, mapped_stocks, reasoning, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, 150000, 50, ?, '[]', '[]', ?, ?)
  `).run(
    opts.id,
    opts.marketId,
    opts.signalType ?? "probability_shift",
    opts.severity,
    opts.yesPricePrev ?? null,
    opts.yesPriceCurr ?? 0.72,
    opts.confidence ?? 0.75,
    opts.reasoning ?? `Test reasoning for ${opts.marketId}`,
    opts.detectedAt ?? new Date().toISOString(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getRecentPredictionSignals tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 172 — getRecentPredictionSignals", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    insertPredictionMarket(db, "mkt-fed", "Will Fed cut rates in 2026?");
    insertPredictionMarket(db, "mkt-china", "China tariff escalation?");
    insertPredictionMarket(db, "mkt-vn", "VN GDP > 6%?");
  });

  it("returns signals from the last 24 hours", () => {
    const recent = new Date(Date.now() - 1 * 3600_000).toISOString();
    insertPredictionSignal(db, { id: "sig-1", marketId: "mkt-fed", severity: "high", detectedAt: recent });

    const results = getRecentPredictionSignals(db, 24);
    expect(results.length).toBe(1);
    expect(results[0]!.question).toBe("Will Fed cut rates in 2026?");
  });

  it("excludes signals older than hoursBack", () => {
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    insertPredictionSignal(db, { id: "sig-old", marketId: "mkt-fed", severity: "high", detectedAt: old });

    const results = getRecentPredictionSignals(db, 24);
    expect(results.length).toBe(0);
  });

  it("returns empty array when prediction_signals table is empty", () => {
    const results = getRecentPredictionSignals(db, 24);
    expect(results).toEqual([]);
  });

  it("returns all severities when no filter is applied", () => {
    const t = new Date().toISOString();
    insertPredictionSignal(db, { id: "sig-low", marketId: "mkt-vn", severity: "low", detectedAt: t });
    insertPredictionSignal(db, { id: "sig-high", marketId: "mkt-fed", severity: "high", detectedAt: t });
    insertPredictionSignal(db, { id: "sig-crit", marketId: "mkt-china", severity: "critical", detectedAt: t });

    const results = getRecentPredictionSignals(db, 24);
    expect(results.length).toBe(3);
  });

  it("populates all required fields", () => {
    const t = new Date().toISOString();
    insertPredictionSignal(db, {
      id: "sig-full",
      marketId: "mkt-fed",
      severity: "high",
      signalType: "probability_shift",
      yesPriceCurr: 0.72,
      yesPricePrev: 0.64,
      confidence: 0.80,
      reasoning: "Big shift",
      detectedAt: t,
    });

    const [result] = getRecentPredictionSignals(db, 24);
    expect(result).toBeDefined();
    expect(result!.question).toBe("Will Fed cut rates in 2026?");
    expect(result!.signalType).toBe("probability_shift");
    expect(result!.severity).toBe("high");
    expect(result!.yesPriceCurr).toBe(0.72);
    expect(result!.confidence).toBe(0.80);
    expect(result!.reasoning).toBe("Big shift");
    expect(result!.detectedAt).toBe(t);
  });

  it("sorts results by detected_at DESC (newest first)", () => {
    const t1 = new Date(Date.now() - 2 * 3600_000).toISOString();
    const t2 = new Date(Date.now() - 1 * 3600_000).toISOString();
    insertPredictionSignal(db, { id: "sig-old2", marketId: "mkt-vn", severity: "high", detectedAt: t1 });
    insertPredictionSignal(db, { id: "sig-new2", marketId: "mkt-fed", severity: "high", detectedAt: t2 });

    const results = getRecentPredictionSignals(db, 24);
    expect(results[0]!.detectedAt).toBe(t2);
    expect(results[1]!.detectedAt).toBe(t1);
  });

  it("handles missing prediction_signals table gracefully (returns [])", () => {
    const emptyDb = new Database(":memory:");
    emptyDb.exec("CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY, exchange TEXT NOT NULL DEFAULT 'HOSE')");
    // No prediction_signals table

    const results = getRecentPredictionSignals(emptyDb, 24);
    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assembleBriefing — predictionSignals section
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 172 — assembleBriefing prediction signals section", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  it("includes predictionSignals field in DailyBriefing", async () => {
    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/__test-briefing-172__",
    });
    expect(briefing).toHaveProperty("predictionSignals");
    expect(Array.isArray(briefing.predictionSignals)).toBe(true);
  });

  it("returns empty predictionSignals when no signals exist", async () => {
    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/__test-briefing-172__",
    });
    expect(briefing.predictionSignals).toEqual([]);
  });

  it("includes HIGH severity signals in predictionSignals", async () => {
    insertPredictionMarket(db, "mkt-fed", "Will Fed cut rates in 2026?");
    insertPredictionSignal(db, {
      id: "sig-high",
      marketId: "mkt-fed",
      severity: "high",
      yesPriceCurr: 0.72,
      detectedAt: new Date().toISOString(),
    });

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/__test-briefing-172__",
    });

    expect(briefing.predictionSignals.length).toBe(1);
    expect(briefing.predictionSignals[0]!.severity).toBe("high");
    expect(briefing.predictionSignals[0]!.question).toBe("Will Fed cut rates in 2026?");
  });

  it("includes CRITICAL severity signals in predictionSignals", async () => {
    insertPredictionMarket(db, "mkt-china", "China tariff escalation?");
    insertPredictionSignal(db, {
      id: "sig-crit",
      marketId: "mkt-china",
      severity: "critical",
      yesPriceCurr: 0.85,
      detectedAt: new Date().toISOString(),
    });

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/__test-briefing-172__",
    });

    expect(briefing.predictionSignals.length).toBe(1);
    expect(briefing.predictionSignals[0]!.severity).toBe("critical");
  });

  it("excludes LOW and MEDIUM severity signals from predictionSignals", async () => {
    insertPredictionMarket(db, "mkt-vn", "VN GDP > 6%?");
    insertPredictionSignal(db, {
      id: "sig-low",
      marketId: "mkt-vn",
      severity: "low",
      detectedAt: new Date().toISOString(),
    });
    insertPredictionSignal(db, {
      id: "sig-med",
      marketId: "mkt-vn",
      severity: "medium",
      detectedAt: new Date().toISOString(),
    });

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/__test-briefing-172__",
    });

    expect(briefing.predictionSignals.length).toBe(0);
  });

  it("gracefully handles missing prediction_signals table", async () => {
    const dbNoPrediction = new Database(":memory:");
    dbNoPrediction.exec("PRAGMA foreign_keys = OFF");
    dbNoPrediction.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code TEXT PRIMARY KEY, exchange TEXT NOT NULL DEFAULT 'HOSE',
        domain TEXT NOT NULL DEFAULT 'other', added_at TEXT NOT NULL DEFAULT (datetime('now')),
        alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
        alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS market_prices (code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS rag_analyses (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT NOT NULL, source_url TEXT, source_title TEXT, source_type TEXT, published_at TEXT, sentiment TEXT, impact_score REAL, impact_direction TEXT, confidence REAL, time_horizon TEXT, summary TEXT, reasoning TEXT, affected_countries TEXT, affected_domains TEXT, affected_actions TEXT, parent_ids TEXT, tags TEXT, embedding_text TEXT,
data_env TEXT
);
      CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL, signals_json TEXT, affected_actions_json TEXT, analysis_ids_json TEXT, message TEXT, read INTEGER NOT NULL DEFAULT 0, user_note TEXT, resolved_at TEXT, resolution_notes TEXT);
      CREATE TABLE IF NOT EXISTS financial_reports (id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT, exchange TEXT, domain TEXT, period_year INTEGER, period_type TEXT, period_start TEXT, period_end TEXT, sort_key TEXT, ssc_url TEXT, parsed_at TEXT, balance_sheet_json TEXT DEFAULT '{}', income_stmt_json TEXT DEFAULT '{}', cash_flow_json TEXT DEFAULT '{}', ratios_json TEXT DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS daily_ohlcv (code TEXT NOT NULL, date TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (code, date));
    `);

    const briefing = await assembleBriefing({
      db: dbNoPrediction,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/__test-briefing-172-nopred__",
    });

    expect(briefing.predictionSignals).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assembleEveningSummary — predictionSignals section
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 172 — assembleEveningSummary prediction signals section", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  it("includes predictionSignals field in EveningSummary", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/__test-evening-172__",
    });
    expect(summary).toHaveProperty("predictionSignals");
    expect(Array.isArray(summary.predictionSignals)).toBe(true);
  });

  it("returns empty predictionSignals when no signals exist", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/__test-evening-172__",
    });
    expect(summary.predictionSignals).toEqual([]);
  });

  it("includes HIGH signals in evening predictionSignals", async () => {
    insertPredictionMarket(db, "mkt-fed", "Will Fed cut rates in 2026?");
    insertPredictionSignal(db, {
      id: "sig-eve-high",
      marketId: "mkt-fed",
      severity: "high",
      yesPriceCurr: 0.72,
      detectedAt: new Date().toISOString(),
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/__test-evening-172__",
    });

    expect(summary.predictionSignals.length).toBe(1);
    expect(summary.predictionSignals[0]!.severity).toBe("high");
  });

  it("excludes LOW/MEDIUM signals from evening predictionSignals", async () => {
    insertPredictionMarket(db, "mkt-vn", "VN GDP > 6%?");
    insertPredictionSignal(db, {
      id: "sig-eve-low",
      marketId: "mkt-vn",
      severity: "low",
      detectedAt: new Date().toISOString(),
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/__test-evening-172__",
    });

    expect(summary.predictionSignals.length).toBe(0);
  });

  it("gracefully handles missing prediction_signals table in evening summary", async () => {
    const dbNoPrediction = new Database(":memory:");
    dbNoPrediction.exec("PRAGMA foreign_keys = OFF");
    dbNoPrediction.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code TEXT PRIMARY KEY, exchange TEXT NOT NULL DEFAULT 'HOSE',
        domain TEXT NOT NULL DEFAULT 'other', added_at TEXT NOT NULL DEFAULT (datetime('now')),
        alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
        alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS market_prices (code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS rag_analyses (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT NOT NULL, source_url TEXT, source_title TEXT, source_type TEXT, published_at TEXT, sentiment TEXT, impact_score REAL, impact_direction TEXT, confidence REAL, time_horizon TEXT, summary TEXT, reasoning TEXT, affected_countries TEXT, affected_domains TEXT, affected_actions TEXT, parent_ids TEXT, tags TEXT, embedding_text TEXT,
data_env TEXT
);
      CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL, signals_json TEXT, affected_actions_json TEXT, analysis_ids_json TEXT, message TEXT, read INTEGER NOT NULL DEFAULT 0, user_note TEXT, resolved_at TEXT, resolution_notes TEXT);
      CREATE TABLE IF NOT EXISTS financial_reports (id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT, exchange TEXT, domain TEXT, period_year INTEGER, period_type TEXT, period_start TEXT, period_end TEXT, sort_key TEXT, ssc_url TEXT, parsed_at TEXT, balance_sheet_json TEXT DEFAULT '{}', income_stmt_json TEXT DEFAULT '{}', cash_flow_json TEXT DEFAULT '{}', ratios_json TEXT DEFAULT '{}');
    `);

    const summary = await assembleEveningSummary({
      db: dbNoPrediction,
      reportsDir: "/tmp/__test-evening-172-nopred__",
    });

    expect(summary.predictionSignals).toEqual([]);
  });
});
