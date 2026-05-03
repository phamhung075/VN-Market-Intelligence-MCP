/**
 * 1842e-backtest-phase3.test.ts — Task 1842e
 *
 * 10 acceptance-criteria tests for:
 *   - Sharpe ratio from equity curve (population stddev, annualised sqrt(252))
 *   - VNI benchmark comparison (benchmarkReturnPct)
 *   - Confidence-weighted position sizing (positionWeight per TradeRecord)
 *   - Result persistence via IBacktestResultRepository.saveRun()
 *   - combined-high-confidence strategy registration
 *
 * Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// Domain layer
import { runBacktestEngine } from "../domain/backtesting/backtestEngine.js";
import { strategyRegistry } from "../domain/backtesting/strategyRegistry.js";
import type { BacktestParams } from "../domain/backtesting/models.js";
import type { BacktestSignal } from "../domain/repositories/IBacktestSignalRepository.js";
import type { DailyCandle } from "../domain/repositories/IBacktestPriceRepository.js";

// Infrastructure
import { SqliteBacktestSignalRepository } from "../infrastructure/db/backtestSignalRepo.js";
import { SqliteBacktestPriceRepository } from "../infrastructure/db/backtestPriceRepo.js";
import { SqliteBacktestResultRepository } from "../infrastructure/db/backtestResultRepo.js";
import { initBacktestingTables } from "../infrastructure/db/schema-backtesting.js";

// Application use case
import { runBacktest, resetMutex } from "../application/usecases/runBacktest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low  REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      trading_signal TEXT,
      confidence REAL
    );
  `);
  initBacktestingTables(db);
  return db;
}

function insertCandles(db: Database, candles: DailyCandle[], code: string): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const c of candles) {
    stmt.run(code, c.date, c.open, c.high, c.low, c.close, c.volume);
  }
}

/** Build 20 ascending candles starting at startDate with price rising 2% per day. */
function makeTrendCandles(startDay: number, priceBase: number): DailyCandle[] {
  return Array.from({ length: 20 }, (_, i) => {
    const day = startDay + i;
    const padded = day < 10 ? `0${day}` : `${day}`;
    const price = priceBase * (1 + i * 0.02);
    return {
      date: `2026-04-${padded}`,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1_000_000,
    };
  });
}

/** Build 20 flat candles (constant price) — Sharpe = null because stddev=0. */
function makeFlatCandles(startDay: number, price: number): DailyCandle[] {
  return Array.from({ length: 20 }, (_, i) => {
    const day = startDay + i;
    const padded = day < 10 ? `0${day}` : `${day}`;
    return {
      date: `2026-04-${padded}`,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 1_000_000,
    };
  });
}

/** Minimal priceRepo stub over a candle array. */
function priceRepoFrom(candles: DailyCandle[]) {
  return {
    getCandles: (_code: string, start: string, end: string) =>
      candles.filter((c) => c.date >= start && c.date <= end),
    getClosePriceOnOrAfter: (_code: string, targetDate: string) => {
      const found = candles.find((c) => c.date >= targetDate);
      return found ? { date: found.date, close: found.close } : null;
    },
  };
}

/** priceRepo that returns different candle sets per ticker code. */
function multiTickerPriceRepo(candleMap: Map<string, DailyCandle[]>) {
  return {
    getCandles: (code: string, start: string, end: string) => {
      const candles = candleMap.get(code.toUpperCase()) ?? [];
      return candles.filter((c) => c.date >= start && c.date <= end);
    },
    getClosePriceOnOrAfter: (code: string, targetDate: string) => {
      const candles = candleMap.get(code.toUpperCase()) ?? [];
      const found = candles.find((c) => c.date >= targetDate);
      return found ? { date: found.date, close: found.close } : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_PARAMS: BacktestParams = {
  strategy: "kinh-dich-high-confidence",
  startDate: "2026-04-05",
  endDate: "2026-04-30",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("1842e — Backtest Phase 3: Full Metrics + Benchmark", () => {
  beforeEach(() => {
    resetMutex();
  });

  // ── AC-1: Sharpe is non-null when equity curve has variance ─────────────────

  it("AC-1: sharpeRatio is non-null when equity curve has variance", () => {
    // Trend candles: price rises 2% per day → returns are non-zero, stddev > 0
    const candles = makeTrendCandles(5, 100_000);

    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.9, strategy: "kinh-dich-high-confidence" },
      { stockCode: "VCB", timestamp: "2026-04-08T09:00:00", direction: "BUY", confidence: 0.9, strategy: "kinh-dich-high-confidence" },
    ];

    const report = runBacktestEngine({
      params: BASE_PARAMS,
      signals,
      priceRepo: priceRepoFrom(candles),
      benchmarkCandles: [],
      minConfidence: 0,
    });

    // At least one trade must complete to build an equity curve with 2+ points
    expect(report.tradeCount).toBeGreaterThan(0);
    expect(report.sharpeRatio).not.toBeNull();
    expect(typeof report.sharpeRatio).toBe("number");
    expect(Number.isFinite(report.sharpeRatio!)).toBe(true);
  });

  // ── AC-2: Sharpe is null when equity curve is flat ──────────────────────────

  it("AC-2: sharpeRatio is null when equity curve is flat (stddev=0)", () => {
    // Flat candles: all open/close = 100,000 → returnPct = 0 → equity curve flat
    const candles = makeFlatCandles(5, 100_000);

    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.9, strategy: "kinh-dich-high-confidence" },
    ];

    const report = runBacktestEngine({
      params: BASE_PARAMS,
      signals,
      priceRepo: priceRepoFrom(candles),
      benchmarkCandles: [],
      minConfidence: 0,
    });

    // Flat prices → returnPct = 0 → all equity curve points identical → stddev = 0 → Sharpe = null
    expect(report.sharpeRatio).toBeNull();
  });

  // ── AC-3: benchmarkReturnPct populated when VNINDEX candles exist ───────────

  it("AC-3: benchmarkReturnPct is populated when VNINDEX candles exist", () => {
    const tradeCandles = makeTrendCandles(5, 100_000);

    const vniCandles: DailyCandle[] = [
      { date: "2026-04-05", open: 1200, high: 1210, low: 1190, close: 1200, volume: 1e8 },
      { date: "2026-04-06", open: 1210, high: 1220, low: 1200, close: 1215, volume: 1e8 },
      { date: "2026-04-28", open: 1250, high: 1260, low: 1240, close: 1260, volume: 1e8 },
    ];
    // benchmarkReturnPct = (1260 - 1200) / 1200 = 0.05

    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.9, strategy: "kinh-dich-high-confidence" },
    ];

    const report = runBacktestEngine({
      params: BASE_PARAMS,
      signals,
      priceRepo: priceRepoFrom(tradeCandles),
      benchmarkCandles: vniCandles,
      minConfidence: 0,
    });

    expect(report.benchmarkReturnPct).not.toBeNull();
    expect(typeof report.benchmarkReturnPct).toBe("number");
    // 60 / 1200 = 0.05
    expect(report.benchmarkReturnPct).toBeCloseTo(0.05, 4);
  });

  // ── AC-4: benchmarkReturnPct is null when VNINDEX data absent ───────────────

  it("AC-4: benchmarkReturnPct is null when VNINDEX data absent", () => {
    const candles = makeTrendCandles(5, 100_000);

    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.9, strategy: "kinh-dich-high-confidence" },
    ];

    const report = runBacktestEngine({
      params: BASE_PARAMS,
      signals,
      priceRepo: priceRepoFrom(candles),
      benchmarkCandles: [], // no VNINDEX data
      minConfidence: 0,
    });

    // Must not throw; benchmarkReturnPct must be null
    expect(report.benchmarkReturnPct).toBeNull();
  });

  // ── AC-5: confidence-weighted sizing 80%/20% ────────────────────────────────

  it("AC-5: confidence-weighted sizing allocates 80%/20% for confidences 0.8/0.2", () => {
    // Two tickers, both with BUY signal on 2026-04-05
    // confidence 0.8 (VCB) and 0.2 (HPG) → entry 2026-04-06
    // weight_VCB = 0.8 / (0.8 + 0.2) = 0.8
    // weight_HPG = 0.2 / (0.8 + 0.2) = 0.2

    const vcbCandles = makeTrendCandles(5, 100_000);
    const hpgCandles = makeTrendCandles(5, 50_000);

    const candleMap = new Map([
      ["VCB", vcbCandles],
      ["HPG", hpgCandles],
    ]);

    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.8, strategy: "kinh-dich-high-confidence" },
      { stockCode: "HPG", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.2, strategy: "kinh-dich-high-confidence" },
    ];

    const report = runBacktestEngine({
      params: BASE_PARAMS,
      signals,
      priceRepo: multiTickerPriceRepo(candleMap),
      benchmarkCandles: [],
      minConfidence: 0,
    });

    // Both trades must have completed
    expect(report.trades.length).toBeGreaterThanOrEqual(2);

    const vcbTrade = report.trades.find((t) => t.ticker === "VCB");
    const hpgTrade = report.trades.find((t) => t.ticker === "HPG");

    expect(vcbTrade).toBeDefined();
    expect(hpgTrade).toBeDefined();

    expect(vcbTrade!.positionWeight).toBeCloseTo(0.8, 6);
    expect(hpgTrade!.positionWeight).toBeCloseTo(0.2, 6);
  });

  // ── AC-6: equal-weight when all confidences equal ────────────────────────────

  it("AC-6: kinh-dich-all produces equal-weight allocation when all confidences equal", () => {
    // 3 tickers, all BUY on 2026-04-05, all confidence = 0.5
    // weight = 0.5 / (0.5 + 0.5 + 0.5) = 0.5 / 1.5 = 1/3

    const vcbCandles = makeTrendCandles(5, 100_000);
    const hpgCandles = makeTrendCandles(5, 50_000);
    const fptCandles = makeTrendCandles(5, 80_000);

    const candleMap = new Map([
      ["VCB", vcbCandles],
      ["HPG", hpgCandles],
      ["FPT", fptCandles],
    ]);

    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.5, strategy: "kinh-dich-all" },
      { stockCode: "HPG", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.5, strategy: "kinh-dich-all" },
      { stockCode: "FPT", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.5, strategy: "kinh-dich-all" },
    ];

    const params: BacktestParams = {
      strategy: "kinh-dich-all",
      startDate: "2026-04-05",
      endDate: "2026-04-30",
    };

    const report = runBacktestEngine({
      params,
      signals,
      priceRepo: multiTickerPriceRepo(candleMap),
      benchmarkCandles: [],
      minConfidence: 0,
    });

    // All 3 trades must have completed
    expect(report.trades.length).toBeGreaterThanOrEqual(3);

    for (const trade of report.trades) {
      expect(trade.positionWeight).toBeCloseTo(1 / 3, 6);
    }
  });

  // ── AC-7: completed run is persisted via saveRun() ──────────────────────────

  it("AC-7: completed run is persisted via IBacktestResultRepository.saveRun()", async () => {
    const db = makeDb();

    // Insert fixture signal and candles
    db.prepare(
      "INSERT INTO kinhdich_readings (stock_code, timestamp, trading_signal, confidence) VALUES (?, ?, ?, ?)",
    ).run("VCB", "2026-04-05T09:00:00", "MUA (tich cuc)", 0.8);

    insertCandles(db, makeTrendCandles(5, 100_000), "VCB");

    const signalRepo = new SqliteBacktestSignalRepository(db);
    const priceRepo = new SqliteBacktestPriceRepository(db);
    const resultRepo = new SqliteBacktestResultRepository(db);

    const params: BacktestParams = {
      strategy: "kinh-dich-high-confidence",
      startDate: "2026-04-05",
      endDate: "2026-04-30",
    };

    const result = await runBacktest(params, { signalRepo, priceRepo, resultRepo });

    expect(typeof result).not.toBe("string");
    if (typeof result === "string") throw new Error("Unexpected mutex string");

    // Query the DB directly to confirm persistence
    const rows = db
      .prepare("SELECT strategy FROM backtest_runs WHERE strategy = ?")
      .all("kinh-dich-high-confidence") as Array<{ strategy: string }>;

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.strategy).toBe("kinh-dich-high-confidence");

    db.close();
  });

  // ── AC-8: getRunsByStrategy returns the saved run ───────────────────────────

  it("AC-8: getRunsByStrategy returns the saved run from AC-7", async () => {
    const db = makeDb();

    db.prepare(
      "INSERT INTO kinhdich_readings (stock_code, timestamp, trading_signal, confidence) VALUES (?, ?, ?, ?)",
    ).run("VCB", "2026-04-05T09:00:00", "MUA (tich cuc)", 0.8);

    insertCandles(db, makeTrendCandles(5, 100_000), "VCB");

    const signalRepo = new SqliteBacktestSignalRepository(db);
    const priceRepo = new SqliteBacktestPriceRepository(db);
    const resultRepo = new SqliteBacktestResultRepository(db);

    const params: BacktestParams = {
      strategy: "kinh-dich-high-confidence",
      startDate: "2026-04-05",
      endDate: "2026-04-30",
    };

    await runBacktest(params, { signalRepo, priceRepo, resultRepo });

    const runs = resultRepo.getRunsByStrategy("kinh-dich-high-confidence", 5);

    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0]!.strategy).toBe("kinh-dich-high-confidence");

    db.close();
  });

  // ── AC-9: combined-high-confidence exists in strategyRegistry ───────────────

  it("AC-9: combined-high-confidence exists in strategyRegistry and returns a valid BacktestReport", () => {
    expect(Object.keys(strategyRegistry)).toContain("combined-high-confidence");

    const strategy = strategyRegistry["combined-high-confidence"];
    expect(strategy).toBeDefined();
    expect(strategy!.id).toBe("combined-high-confidence");
    expect(strategy!.minConfidence).toBe(0.7);
    expect(strategy!.holdDays).toBe(5);
    expect(typeof strategy!.signalFilter).toBe("function");
    // Description must document it is a stub
    expect(strategy!.description).toContain("stub");

    // Verify it produces a valid report via runBacktestEngine
    const candles = makeTrendCandles(5, 100_000);
    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.9, strategy: "combined-high-confidence" },
    ];

    const params: BacktestParams = {
      strategy: "combined-high-confidence",
      startDate: "2026-04-05",
      endDate: "2026-04-30",
    };

    const report = runBacktestEngine({
      params,
      signals,
      priceRepo: priceRepoFrom(candles),
      benchmarkCandles: [],
      minConfidence: strategy!.minConfidence,
    });

    expect(report).toBeDefined();
    expect(report.strategy).toBe("combined-high-confidence");
    expect(typeof report.totalReturnPct).toBe("number");
    expect(Array.isArray(report.trades)).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  // ── AC-10: type shape — positionWeight exists on each TradeRecord ────────────

  it("AC-10: positionWeight field exists on every completed TradeRecord", () => {
    const candles = makeTrendCandles(5, 100_000);
    const signals: BacktestSignal[] = [
      { stockCode: "VCB", timestamp: "2026-04-05T09:00:00", direction: "BUY", confidence: 0.9, strategy: "kinh-dich-high-confidence" },
    ];

    const report = runBacktestEngine({
      params: BASE_PARAMS,
      signals,
      priceRepo: priceRepoFrom(candles),
      benchmarkCandles: [],
      minConfidence: 0,
    });

    // Single position → positionWeight = 1.0
    for (const trade of report.trades) {
      expect(typeof trade.positionWeight).toBe("number");
      expect(Number.isFinite(trade.positionWeight)).toBe(true);
      expect(trade.positionWeight).toBeGreaterThan(0);
    }

    // combined-high-confidence shape check
    const strategy = strategyRegistry["combined-high-confidence"]!;
    expect(strategy.id).toBe("combined-high-confidence");
    expect(strategy.description.toLowerCase()).toContain("stub");
  });
});
