Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1331 — TDD tests for fix(ta): defaultComputeTa reads daily_ohlcv
 *
 * TC-1: returns null when daily_ohlcv has 0 rows for ticker
 * TC-2: 14 rows → null (FIX-RSI-REPORT-FAILCLOSED: minimum is 15 for RSI(14))
 * TC-3: returns TaSignal with rsi + maFast + maSlow when daily_ohlcv has 20+ rows
 *        (FAILS before fix because function reads market_prices_history which is empty)
 * TC-4: returns correct priceVsMa20 direction based on close prices
 *        (FAILS before fix — same reason)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// Test defaultComputeTa indirectly: call assembleBriefing with computeTaFn=undefined
// (uses real defaultComputeTa) and an in-memory db seeded with daily_ohlcv rows.
// Assert taSummary contains/excludes VCB depending on row count.

import { join } from "node:path";
import { assembleBriefing } from "../application/usecases/assembleBriefing.js";

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
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT,
      price      REAL,
      fetched_at TEXT
    );
  `);
  return db;
}

/**
 * Seed N rows into daily_ohlcv for the given code.
 * close prices: startClose, startClose + step, startClose + 2*step, ...
 * dates: 2024-01-01, 2024-01-02, ...
 */
function seedOhlcv(db: Database, code: string, n: number, startClose = 80000, step = 500): void {
  for (let i = 0; i < n; i++) {
    const date = `2024-01-${String(i + 1).padStart(2, "0")}`;
    const close = startClose + i * step;
    db.query(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, date, close * 0.99, close * 1.01, close * 0.98, close, 1000000, "2024-01-01T00:00:00Z");
  }
}

function addWatchlistEntry(db: Database, code: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at) VALUES (?, 'HOSE', 'banking', datetime('now'))`,
  ).run(code);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1330 — defaultComputeTa reads daily_ohlcv", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = buildDb();
    tmpDir = join("/tmp", `briefing-test-1330-${Date.now()}`);
  });

  it("TC-1: returns null when daily_ohlcv has 0 rows for ticker", async () => {
    addWatchlistEntry(db, "VCB");
    // No rows seeded in daily_ohlcv

    const result = await assembleBriefing({
      db,
      // computeTaFn omitted → uses real defaultComputeTa
      pollNewsFn: async () => [],
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    // taSummary only contains non-neutral signals, but we also check total
    // The key assertion: no crash, and VCB not in taSummary (null → skipped)
    const vcbSignal = result.taSummary?.find((s) => s.code === "VCB");
    expect(vcbSignal).toBeUndefined();
  });

  it("TC-2: 14 rows → null (FIX-RSI-REPORT-FAILCLOSED: need 15 candles for RSI(14))", async () => {
    addWatchlistEntry(db, "VCB");
    seedOhlcv(db, "VCB", 14); // 14 rows — one below RSI(14)+1 minimum

    const result = await assembleBriefing({
      db,
      // computeTaFn omitted → uses real defaultComputeTa
      pollNewsFn: async () => [],
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    // FIX-RSI-REPORT-FAILCLOSED: 14 < 15 → defaultComputeTa returns null → not in taSummary
    const vcbSignal = result.taSummary?.find((s) => s.code === "VCB");
    expect(vcbSignal).toBeUndefined();
  });

  it("TC-3: returns TaSignal with rsi + maFast + maSlow when daily_ohlcv has 20+ rows (FAILS before fix)", async () => {
    addWatchlistEntry(db, "VCB");
    seedOhlcv(db, "VCB", 20, 80000, 500); // 20 rows, close 80000..89500
    db.query(`INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at) VALUES ('VCB', 89500, 0.5, '2024-01-20T00:00:00Z')`).run();

    const result = await assembleBriefing({
      db,
      // computeTaFn omitted → uses real defaultComputeTa
      pollNewsFn: async () => [],
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    // After fix: defaultComputeTa reads daily_ohlcv → 20 rows → returns TaSignal
    // The signal may be neutral (filtered out of taSummary), so we use a
    // special wrapper to capture all signals including neutral.
    // However assembleBriefing only exposes taSummary (non-neutral).
    // With strictly increasing prices, RSI will be high (overbought) → non-neutral.
    // So the signal WILL appear in taSummary after fix.
    expect(result.taSummary).toBeDefined();

    // Pre-fix: returns null because market_prices_history is empty → taSummary is []
    // Post-fix: RSI > 70 for strictly increasing series → signal appears
    const vcbSignal = result.taSummary?.find((s) => s.code === "VCB");
    expect(vcbSignal).toBeDefined();
    expect(vcbSignal?.rsi14).not.toBeNull();
    expect(vcbSignal?.ma20).not.toBeNull();
  });

  it("TC-4: returns correct direction (bullish) based on close prices (FAILS before fix)", async () => {
    addWatchlistEntry(db, "VCB");
    // 20 strictly increasing close prices → current price > MA20 → priceVsMa20 = "above"
    seedOhlcv(db, "VCB", 20, 80000, 500);
    db.query(`INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at) VALUES ('VCB', 89500, 1.2, '2024-01-20T00:00:00Z')`).run();

    const result = await assembleBriefing({
      db,
      // computeTaFn omitted → uses real defaultComputeTa
      pollNewsFn: async () => [],
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    const vcbSignal = result.taSummary?.find((s) => s.code === "VCB");
    expect(vcbSignal).toBeDefined();
    // Strictly increasing → last close is highest → above MA20
    expect(vcbSignal?.priceVsMa20).toBe("above");
    // Strictly increasing → RSI near 100 → overbought
    expect(vcbSignal?.rsiStatus).toBe("overbought");
  });
});
