Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1342 — TDD tests for fix(ta-fallback): defaultComputeTa fallback to
 * market_prices_history when daily_ohlcv has fewer than 15 rows.
 *
 * RSIFIX-2 update: market_prices_history fallback REMOVED. defaultComputeTa is
 * now async (delegates to Go TA engine). Min-candle gate raised to 35.
 *
 * TC-1: daily_ohlcv has 20 rows for VCB → null (20 < 35 gate)
 * TC-2: daily_ohlcv has 0 rows, market_prices_history has 20 days → null (no fallback)
 * TC-3: daily_ohlcv has 0 rows, market_prices_history has only 5 days → null
 * TC-4: daily_ohlcv has 10 rows, market_prices_history has 20 days → null (no fallback)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { defaultComputeTa } from "../application/usecases/assembleBriefing.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDb(): Database {
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
      source_url   TEXT,
      source_title TEXT,
      source_type  TEXT,
      published_at TEXT,
      sentiment    TEXT,
      impact_score REAL,
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
      user_note             TEXT
    );
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                  TEXT PRIMARY KEY,
      action_code         TEXT NOT NULL,
      company_name        TEXT,
      exchange            TEXT,
      domain              TEXT,
      period_year         INTEGER,
      period_type         TEXT,
      period_start        TEXT,
      period_end          TEXT,
      sort_key            TEXT,
      ssc_url             TEXT,
      parsed_at           TEXT,
      balance_sheet_json  TEXT DEFAULT '{}',
      income_stmt_json    TEXT DEFAULT '{}',
      cash_flow_json      TEXT DEFAULT '{}',
      ratios_json         TEXT DEFAULT '{}'
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
      id             TEXT PRIMARY KEY,
      code           TEXT NOT NULL,
      date           TEXT NOT NULL,
      foreign_volume INTEGER,
      fetched_at     TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );
  `);
  return db;
}

/**
 * Seed N rows into daily_ohlcv for the given code.
 * close prices: startClose, startClose + step, ...
 * dates: 2024-01-01, 2024-01-02, ...
 */
function seedOhlcv(
  db: Database,
  code: string,
  n: number,
  startClose = 80000,
  step = 500,
): void {
  for (let i = 0; i < n; i++) {
    const date = `2024-01-${String(i + 1).padStart(2, "0")}`;
    const close = startClose + i * step;
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      code,
      date,
      close * 0.99,
      close * 1.01,
      close * 0.98,
      close,
      1000000,
      "2024-01-01T00:00:00Z",
    );
  }
}

/**
 * Seed intraday ticks into market_prices_history.
 * Creates `days` distinct calendar dates, each with `ticksPerDay` ticks.
 * Prices are strictly increasing across all ticks (to force RSI > 70 / overbought).
 */
function seedIntradayTicks(
  db: Database,
  code: string,
  days: number,
  ticksPerDay = 3,
): void {
  let priceCounter = 80000;
  for (let d = 0; d < days; d++) {
    // Use months to avoid day-overflow for > 31 days
    const month = String(Math.floor(d / 28) + 1).padStart(2, "0");
    const dayOfMonth = String((d % 28) + 1).padStart(2, "0");
    const dateStr = `2024-${month}-${dayOfMonth}`;
    for (let t = 0; t < ticksPerDay; t++) {
      priceCounter += 100;
      const hour = String(9 + t).padStart(2, "0");
      const fetchedAt = `${dateStr}T${hour}:00:00Z`;
      db.prepare(
        `INSERT OR REPLACE INTO market_prices_history (code, price, fetched_at)
         VALUES (?, ?, ?)`,
      ).run(code, priceCounter, fetchedAt);
    }
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1342 — defaultComputeTa (RSIFIX-2: no market_prices_history fallback)", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
  });

  it("TC-1: daily_ohlcv has 20 rows → null (RSIFIX-2: 20 < 35 gate)", async () => {
    seedOhlcv(db, "VCB", 20, 80000, 500);

    const result = await defaultComputeTa("VCB", db);

    // RSIFIX-2: min-candle gate is 35; 20 < 35 → null
    expect(result).toBeNull();
  });

  it("TC-2: daily_ohlcv 0 rows + market_prices_history 20 days → null (fallback removed)", async () => {
    // No daily_ohlcv rows seeded
    seedIntradayTicks(db, "VCB", 20, 3);

    const result = await defaultComputeTa("VCB", db);

    // RSIFIX-2: market_prices_history fallback removed; 0 daily_ohlcv rows < 35 → null
    expect(result).toBeNull();
  });

  it("TC-3: daily_ohlcv 0 rows + market_prices_history 5 days → null", async () => {
    // Only 5 distinct days — irrelevant now that fallback is removed
    seedIntradayTicks(db, "VCB", 5, 3);

    const result = await defaultComputeTa("VCB", db);

    // 0 daily_ohlcv rows < 35 → null
    expect(result).toBeNull();
  });

  it("TC-4: daily_ohlcv 10 rows + market_prices_history 20 days → null (no fallback)", async () => {
    seedOhlcv(db, "VCB", 10, 80000, 500);
    seedIntradayTicks(db, "VCB", 20, 3);

    const result = await defaultComputeTa("VCB", db);

    // RSIFIX-2: fallback removed; 10 daily_ohlcv rows < 35 → null
    expect(result).toBeNull();
  });
});
