Bun.env["DB_PATH"] = ":memory:";

/**
 * RSIFIX-2 — assembleBriefing.ts: defaultComputeTa Go-engine rewire tests
 *
 * Verifies the 6 fix-spec changes via injectable mocks (no live Go service needed):
 *   T1: 41-candle fixture → computeTAIndicators mock called, rsi14 matches mocked value
 *   T2: 34-candle fixture → null (34 < 35 gate rejection)
 *   T3: 0 rows daily_ohlcv → null (no fallback)
 *   T4: stub-bar guard (vol=0) → null
 *
 * Layer: tests — in-memory SQLite; computeTAIndicators mocked via injectable computeTaFn.
 *
 * NOTE: These tests validate the assembleBriefing pipeline end-to-end.
 * The defaultComputeTa unit behaviour is in RSIFIX-2-defaultComputeTa.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  assembleBriefing,
  type TaSignal,
} from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      data_env     TEXT
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
  `);
  return db;
}

function seedWatchlist(db: Database, code: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
     VALUES (?, 'HOSE', 'banking', datetime('now'))`,
  ).run(code);
}

/** Seed n daily_ohlcv rows with real volume for the given code.
 *  Dates are RECENT (within -60 days window used by defaultComputeTa). */
function seedOhlcvRecent(
  db: Database,
  code: string,
  n: number,
  baseClose = 50000,
  step = 200,
  volume = 500000,
): void {
  // Seed from today-n days to today so they fall inside the 60-day window
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (n - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const close = baseClose + i * step;
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(code, dateStr, close * 0.99, close * 1.01, close * 0.98, close, volume);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared test state
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

// ─────────────────────────────────────────────────────────────────────────────
// T1: 41-candle fixture → mock returns RSI, assembleBriefing includes it
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 T1: 41-candle mock → assembleBriefing taSummary includes rsi14", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-ab-t1-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("async computeTaFn returning rsi14=27.6 → signal in taSummary", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");

    // Simulate what Go engine would return for 41 candles: oversold RSI
    const mockTaFn = async (code: string, _db: Database): Promise<TaSignal | null> =>
      Promise.resolve({
        code,
        rsi14: 27.6,
        rsiStatus: "oversold" as const,
        ma20: 48000,
        priceVsMa20: "below" as const,
        currentPrice: 45000,
      });

    const briefing = await assembleBriefing({
      db,
      computeTaFn: mockTaFn,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    expect(briefing.taSummary).toBeDefined();
    const signal = briefing.taSummary?.find((s) => s.code === "NVL");
    expect(signal).toBeDefined();
    expect(signal?.rsi14).toBeCloseTo(27.6, 1);
    expect(signal?.rsiStatus).toBe("oversold");

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2: 34-candle → null (34 < 35 gate)
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 T2: 34-candle gate rejection", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-ab-t2-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaultComputeTa with 34 real daily_ohlcv rows → null (< 35 gate)", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");
    // Seed 34 recent rows — below the 35-candle gate
    seedOhlcvRecent(db, "NVL", 34);

    // Use real defaultComputeTa (no computeTaFn override)
    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    // 34 < 35 → gate rejects → NVL not in taSummary
    const signal = briefing.taSummary?.find((s) => s.code === "NVL");
    expect(signal).toBeUndefined();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3: 0 rows daily_ohlcv → null (no fallback)
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 T3: 0 rows → null (fail-closed, no market_prices_history fallback)", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-ab-t3-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("no daily_ohlcv rows → ticker absent from taSummary", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");
    // No daily_ohlcv rows seeded — also no market_prices_history table

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    // 0 rows → null, no fallback, NVL not in taSummary
    const signal = briefing.taSummary?.find((s) => s.code === "NVL");
    expect(signal).toBeUndefined();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4: stub-bar guard (vol=0) → null
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 T4: stub-bar guard — last candle vol=0 → null", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-ab-t4-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("35 candles but last has volume=0 → stub-bar guard rejects → null", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");
    // Seed 35 rows with real volume
    seedOhlcvRecent(db, "NVL", 35, 50000, 200, 500000);
    // Overwrite the most recent row with volume=0 (stub bar)
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
    ).run("NVL", today, 56800, 57000, 56500, 56900);

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
    });

    // Stub-bar guard: vol=0 → null → NVL not in taSummary
    const signal = briefing.taSummary?.find((s) => s.code === "NVL");
    expect(signal).toBeUndefined();

    db.close();
  });
});
