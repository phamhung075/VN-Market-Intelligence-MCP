Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 1356 — TDD: TaDiag observability block in evening summary
 *
 * Tests cover all acceptance criteria from REQ-121 / TECH-121:
 *   AC-1: all tickers have 20 rows → tickersWithSignal=N, tickersBelowThreshold=0, ohlcvRowsMin=20, ohlcvRowsMax=20
 *   AC-2: all tickers have 3 rows (< 8 threshold) → tickersWithSignal=0, tickersBelowThreshold=N, ohlcvRowsMin=3, ohlcvRowsMax=3
 *   AC-3: mixed — half tickers 20 rows (signal), half 3 rows (sparse) → verify each counter field
 *   AC-4: getOhlcvRowCountFn throws → taDiag all zeros, no crash, taSummary: []
 *
 * RED PHASE (before task 1357):
 *   All 4 tests fail because:
 *   - AssembleEveningSummaryOptions has no getOhlcvRowCountFn field (task 1357 adds it)
 *   - EveningSummary has no taDiag field (task 1357 adds it)
 *   - Step 4 loop has no TaDiag collection logic (task 1357 implements it)
 *
 * @ts-expect-error lines mark intentional TDD red-state type gaps that task 1357 resolves.
 *
 * Pattern: uses getOhlcvRowCountFn injection (no mock.module).
 * Reference: src/__tests__/1354-prediction-signals-fallback.test.ts
 *
 * Layer: tests — uses in-memory SQLite; no real HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { TaSignal } from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory DB — mirrors 1354 test + daily_ohlcv table (TECH-121)
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
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
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

    CREATE TABLE IF NOT EXISTS prediction_signals (
      id              TEXT PRIMARY KEY,
      market_id       TEXT NOT NULL,
      signal_type     TEXT NOT NULL,
      severity        TEXT NOT NULL,
      yes_price_prev  REAL,
      yes_price_curr  REAL NOT NULL DEFAULT 0,
      volume_24h      REAL NOT NULL DEFAULT 0,
      unique_wallets  INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL DEFAULT 0,
      mapped_sectors  TEXT NOT NULL DEFAULT '[]',
      mapped_stocks   TEXT NOT NULL DEFAULT '[]',
      reasoning       TEXT NOT NULL DEFAULT '',
      detected_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL NOT NULL,
      volume     REAL,
      UNIQUE(code, date)
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub TaSignal factory
// ─────────────────────────────────────────────────────────────────────────────

function makeSignal(code: string): TaSignal {
  return {
    code,
    rsi14: 55,
    rsiStatus: "neutral",
    ma20: 10000,
    priceVsMa20: "above",
    currentPrice: 10000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared tmp dir
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: All tickers have 20 rows → tickersWithSignal=N, tickersBelowThreshold=0
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: all tickers have 20 OHLCV rows — all return signals", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `ta-diag-ac1-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tickersWithSignal=2, tickersBelowThreshold=0, ohlcvRowsMin=20, ohlcvRowsMax=20", async () => {
    const db = setupTestDb();

    db.exec(`
      INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE'), ('VHM', 'HOSE');
    `);

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: (code) => makeSignal(code),
      getOhlcvRowCountFn: (_code: string, _db: unknown) => 20,
      getPredictionSignalsFn: () => Promise.resolve([]),
    });

    const diag = summary.taDiag;

    expect(diag.tickersWithSignal).toBe(2);
    expect(diag.tickersBelowThreshold).toBe(0);
    expect(diag.ohlcvRowsMin).toBe(20);
    expect(diag.ohlcvRowsMax).toBe(20);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: All tickers have 3 rows (< 8 threshold) → tickersBelowThreshold=N
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: all tickers sparse (3 rows < 8 threshold) — no signals", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `ta-diag-ac2-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tickersWithSignal=0, tickersBelowThreshold=2, ohlcvRowsMin=3, ohlcvRowsMax=3", async () => {
    const db = setupTestDb();

    db.exec(`
      INSERT INTO watchlist (code, exchange) VALUES ('TCB', 'HOSE'), ('MBB', 'HOSE');
    `);

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: (_code) => null,
      getOhlcvRowCountFn: (_code: string, _db: unknown) => 3,
      getPredictionSignalsFn: () => Promise.resolve([]),
    });

    const diag = summary.taDiag;

    expect(diag.tickersWithSignal).toBe(0);
    expect(diag.tickersBelowThreshold).toBe(2);
    expect(diag.ohlcvRowsMin).toBe(3);
    expect(diag.ohlcvRowsMax).toBe(3);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Mixed — ticker A: 20 rows + signal, ticker B: 5 rows + null
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: mixed — one ticker with signal (20 rows), one sparse (5 rows)", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `ta-diag-ac3-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tickersWithSignal=1, tickersBelowThreshold=1, ohlcvRowsMin=5, ohlcvRowsMax=20", async () => {
    const db = setupTestDb();

    db.exec(`
      INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE'), ('FPT', 'HOSE');
    `);

    // VCB → 20 rows + signal; FPT → 5 rows + null
    const rowCountMap: Record<string, number> = { VCB: 20, FPT: 5 };
    const signalMap: Record<string, TaSignal | null> = {
      VCB: makeSignal("VCB"),
      FPT: null,
    };

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: (code) => signalMap[code] ?? null,
      getOhlcvRowCountFn: (code: string, _db: unknown) => rowCountMap[code] ?? 0,
      getPredictionSignalsFn: () => Promise.resolve([]),
    });

    const diag = summary.taDiag;

    expect(diag.tickersWithSignal).toBe(1);
    expect(diag.tickersBelowThreshold).toBe(1);
    expect(diag.ohlcvRowsMin).toBe(5);
    expect(diag.ohlcvRowsMax).toBe(20);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: getOhlcvRowCountFn throws → taDiag all zeros, no crash, taSummary: []
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: getOhlcvRowCountFn throws — taDiag defaults to zeros, no crash", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `ta-diag-ac4-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not throw, returns taDiag all zeros and taSummary: []", async () => {
    const db = setupTestDb();

    db.exec(`
      INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE');
    `);

    let threwError = false;
    let summary;
    try {
      summary = await assembleEveningSummary({
        db,
        reportsDir: tmpDir,
        computeTaFn: (_code) => {
          throw new Error("simulated TA computation failure");
        },
        getOhlcvRowCountFn: (_code: string, _db: unknown) => {
          throw new Error("simulated OHLCV row count failure");
        },
        getPredictionSignalsFn: () => Promise.resolve([]),
      });
    } catch {
      threwError = true;
    }

    expect(threwError).toBe(false);
    expect(summary).toBeDefined();
    expect(Array.isArray(summary!.taSummary)).toBe(true);
    expect(summary!.taSummary.length).toBe(0);

    const diag = summary!.taDiag;

    // When both rowCountFn and computeTaFn throw per-ticker, the inner catch handles them.
    // taDiag should reflect 0 across all fields (zero-default or all-zeros from push(0) path).
    expect(diag).toBeDefined();
    expect(diag!.tickersWithSignal).toBe(0);
    expect(diag!.tickersBelowThreshold).toBe(0);
    expect(diag!.ohlcvRowsMin).toBe(0);
    expect(diag!.ohlcvRowsMax).toBe(0);

    db.close();
  });
});
