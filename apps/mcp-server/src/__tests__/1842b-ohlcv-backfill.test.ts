/**
 * 1842b-ohlcv-backfill.test.ts
 *
 * Tests for:
 *   - signalNormalizer (pure unit, no DB) — AC-1..8
 *   - backtestPriceRepo (integration, in-memory SQLite) — AC-9..12
 *   - backtestSignalRepo (integration, in-memory SQLite) — AC-13..14
 *   - backtestResultRepo (integration, in-memory SQLite) — AC-15..16
 *
 * DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { normalizeSignal } from "../domain/backtesting/signalNormalizer.js";
import { SqliteBacktestPriceRepository } from "../infrastructure/db/backtestPriceRepo.js";
import { SqliteBacktestSignalRepository } from "../infrastructure/db/backtestSignalRepo.js";
import { SqliteBacktestResultRepository } from "../infrastructure/db/backtestResultRepo.js";
import type { BacktestRunRecord } from "../domain/repositories/IBacktestResultRepository.js";

// ---------------------------------------------------------------------------
// Helpers — create minimal in-memory DB schemas for each test group
// ---------------------------------------------------------------------------

function makeOhlcvDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    )
  `);
  return db;
}

function makeKinhDichDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code       TEXT NOT NULL,
      timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
      hexagram_number  INTEGER NOT NULL DEFAULT 1,
      ho_que_number    INTEGER NOT NULL DEFAULT 1,
      bien_que_number  INTEGER NOT NULL DEFAULT 1,
      hao_states       TEXT NOT NULL DEFAULT '[]',
      raw_scores       TEXT NOT NULL DEFAULT '{}',
      ngu_hanh_dynamic TEXT,
      trading_signal   TEXT,
      confidence       REAL,
      action_note      TEXT,
      source           TEXT DEFAULT 'manual'
    )
  `);
  return db;
}

function makeBacktestRunsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id               TEXT PRIMARY KEY,
      strategy         TEXT NOT NULL,
      start_date       TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      run_at           TEXT NOT NULL,
      total_return     REAL NOT NULL,
      benchmark_return REAL,
      max_drawdown     REAL NOT NULL,
      sharpe_ratio     REAL,
      win_rate         REAL NOT NULL,
      trade_count      INTEGER NOT NULL,
      result_json      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy ON backtest_runs(strategy);
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_run_at ON backtest_runs(run_at DESC);
  `);
  return db;
}

// ---------------------------------------------------------------------------
// AC-1..8 — signalNormalizer (pure unit tests, no DB)
// ---------------------------------------------------------------------------

describe("Task 1842b — signalNormalizer", () => {
  it("AC-1: normalizeSignal('MUA (tich cuc)') returns 'BUY'", () => {
    expect(normalizeSignal("MUA (tich cuc)")).toBe("BUY");
  });

  it("AC-2: normalizeSignal('BAN (tich cuc)') returns 'SELL'", () => {
    expect(normalizeSignal("BAN (tich cuc)")).toBe("SELL");
  });

  it("AC-3: normalizeSignal('GIU (tich cuc)') returns 'HOLD'", () => {
    expect(normalizeSignal("GIU (tich cuc)")).toBe("HOLD");
  });

  it("AC-4: normalizeSignal('THAN TRONG (tich cuc)') returns 'WAIT'", () => {
    expect(normalizeSignal("THAN TRONG (tich cuc)")).toBe("WAIT");
  });

  it("AC-5: normalizeSignal('CHO (tich cuc)') returns 'WAIT'", () => {
    expect(normalizeSignal("CHO (tich cuc)")).toBe("WAIT");
  });

  it("AC-6: normalizeSignal('BUY') returns 'BUY' (pass-through)", () => {
    expect(normalizeSignal("BUY")).toBe("BUY");
  });

  it("AC-7: normalizeSignal('SELL') returns 'SELL' (pass-through)", () => {
    expect(normalizeSignal("SELL")).toBe("SELL");
  });

  it("AC-8: normalizeSignal('UNKNOWN_SIGNAL') returns 'WAIT' (fallback)", () => {
    expect(normalizeSignal("UNKNOWN_SIGNAL")).toBe("WAIT");
  });
});

// ---------------------------------------------------------------------------
// AC-9..12 — backtestPriceRepo (integration, in-memory SQLite)
// ---------------------------------------------------------------------------

describe("Task 1842b — SqliteBacktestPriceRepository", () => {
  let db: Database;
  let repo: SqliteBacktestPriceRepository;

  beforeEach(() => {
    db = makeOhlcvDb();
    repo = new SqliteBacktestPriceRepository(db);

    // Insert 5 candles for VCB
    const ins = db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    ins.run("VCB", "2024-01-15", 88000, 90000, 87000, 89000, 1000000);
    ins.run("VCB", "2024-03-10", 90000, 92000, 89000, 91000, 1200000);
    ins.run("VCB", "2024-06-20", 85000, 87000, 84000, 86000, 900000);
    ins.run("VCB", "2024-09-05", 92000, 94000, 91000, 93000, 1100000);
    ins.run("VCB", "2024-12-20", 95000, 97000, 94000, 96000, 1300000);
  });

  afterEach(() => {
    db.close();
  });

  it("AC-9: getCandles returns 5 rows sorted ASC for full date range", () => {
    const candles = repo.getCandles("VCB", "2024-01-01", "2024-12-31");
    expect(candles).toHaveLength(5);
    // Verify ascending order
    for (let i = 1; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      expect(curr!.date >= prev!.date).toBe(true);
    }
    // Verify field mapping
    const first = candles[0];
    expect(first!.close).toBe(89000);
    expect(first!.date).toBe("2024-01-15");
  });

  it("AC-10: getCandles returns [] when date range excludes all rows", () => {
    const candles = repo.getCandles("VCB", "2025-01-01", "2025-12-31");
    expect(candles).toEqual([]);
  });

  it("AC-11: getClosePriceOnOrAfter returns correct next available date", () => {
    const result = repo.getClosePriceOnOrAfter("VCB", "2024-06-15");
    // The next date on or after 2024-06-15 is 2024-06-20
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2024-06-20");
    expect(result!.close).toBe(86000);
  });

  it("AC-12: getClosePriceOnOrAfter returns null when no data exists at or after target", () => {
    const result = repo.getClosePriceOnOrAfter("VCB", "2099-01-01");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-13..14 — backtestSignalRepo (integration, in-memory SQLite)
// ---------------------------------------------------------------------------

describe("Task 1842b — SqliteBacktestSignalRepository", () => {
  let db: Database;
  let repo: SqliteBacktestSignalRepository;

  beforeEach(() => {
    db = makeKinhDichDb();
    repo = new SqliteBacktestSignalRepository(db);

    // Insert 3 kinhdich_readings rows with Vietnamese signals
    const ins = db.prepare(
      `INSERT INTO kinhdich_readings
         (stock_code, timestamp, hexagram_number, ho_que_number, bien_que_number,
          hao_states, raw_scores, trading_signal, confidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // BUY signal
    ins.run("VCB", "2026-04-10T10:00:00", 1, 2, 3, "[]", "{}", "MUA (tich cuc)", 0.85, "cycle");
    // SELL signal
    ins.run("HPG", "2026-04-11T10:00:00", 4, 5, 6, "[]", "{}", "BAN (manh)", 0.75, "cycle");
    // HOLD signal — should be filtered out
    ins.run("VCB", "2026-04-12T10:00:00", 7, 8, 9, "[]", "{}", "GIU (tich cuc)", 0.60, "cycle");
    // WAIT signal — should be filtered out
    ins.run("FPT", "2026-04-13T10:00:00", 2, 3, 4, "[]", "{}", "CHO (tich cuc)", 0.55, "cycle");
  });

  afterEach(() => {
    db.close();
  });

  it("AC-13: getSignals returns rows with English directions for Vietnamese signals", () => {
    const signals = repo.getSignals("kinh-dich-high-confidence", "2026-04-01", "2026-04-30");
    // Only BUY and SELL should be returned (HOLD and WAIT filtered out)
    expect(signals.length).toBeGreaterThanOrEqual(2);

    const buys = signals.filter((s) => s.direction === "BUY");
    const sells = signals.filter((s) => s.direction === "SELL");
    expect(buys.length).toBeGreaterThanOrEqual(1);
    expect(sells.length).toBeGreaterThanOrEqual(1);

    // Directions are English
    for (const s of signals) {
      expect(["BUY", "SELL"]).toContain(s.direction);
    }
  });

  it("AC-14: HOLD and WAIT signals are not returned by getSignals", () => {
    const signals = repo.getSignals("kinh-dich-high-confidence", "2026-04-01", "2026-04-30");
    const holds = signals.filter((s) => s.direction === "HOLD");
    const waits = signals.filter((s) => s.direction === "WAIT");
    expect(holds).toHaveLength(0);
    expect(waits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC-15..16 — backtestResultRepo (integration, in-memory SQLite)
// ---------------------------------------------------------------------------

describe("Task 1842b — SqliteBacktestResultRepository", () => {
  let db: Database;
  let repo: SqliteBacktestResultRepository;

  const makeRecord = (id: string, strategy: string, runAt: string): BacktestRunRecord => ({
    id,
    strategy,
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    runAt,
    totalReturn: 0.12,
    benchmarkReturn: 0.05,
    maxDrawdown: -0.08,
    sharpeRatio: 1.4,
    winRate: 0.65,
    tradeCount: 20,
    resultJson: JSON.stringify({ trades: [] }),
  });

  beforeEach(() => {
    db = makeBacktestRunsDb();
    repo = new SqliteBacktestResultRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("AC-15: saveRun + getRunById returns same record", () => {
    const record = makeRecord("run-001", "kinh-dich-high-confidence", "2026-05-03T10:00:00");
    repo.saveRun(record);

    const retrieved = repo.getRunById("run-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("run-001");
    expect(retrieved!.strategy).toBe("kinh-dich-high-confidence");
    expect(retrieved!.totalReturn).toBe(0.12);
    expect(retrieved!.winRate).toBe(0.65);
    expect(retrieved!.tradeCount).toBe(20);
    expect(retrieved!.resultJson).toBe(JSON.stringify({ trades: [] }));
  });

  it("AC-16: getRunsByStrategy returns most-recent-first", () => {
    // Insert 3 runs for same strategy, different times
    repo.saveRun(makeRecord("run-A", "kinh-dich-high-confidence", "2026-05-01T08:00:00"));
    repo.saveRun(makeRecord("run-B", "kinh-dich-high-confidence", "2026-05-02T08:00:00"));
    repo.saveRun(makeRecord("run-C", "kinh-dich-high-confidence", "2026-05-03T08:00:00"));

    const runs = repo.getRunsByStrategy("kinh-dich-high-confidence", 5);
    expect(runs.length).toBe(3);
    // Most recent first
    expect(runs[0]!.id).toBe("run-C");
    expect(runs[1]!.id).toBe("run-B");
    expect(runs[2]!.id).toBe("run-A");
  });
});
