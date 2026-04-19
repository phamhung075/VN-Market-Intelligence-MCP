/**
 * Task 283 — Markov Transition Store + Backtest Engine
 *
 * Tests:
 *   - initHexagramTables creates both tables
 *   - storeReading + getLatestReading roundtrip
 *   - recordTransition creates entry with count=1 then increments to 2
 *   - getTransitionProb returns correct probability
 *   - getTopTransitions returns sorted by count desc
 *   - updateTransitionOutcome updates avgPriceChange and win_count
 *   - getReadingsForBacktest returns readings within date range
 *   - computeBacktest: 3 BUY readings, 2 went up → 66.7% accuracy
 *   - computeBacktest: empty readings → 0 accuracy
 *   - computeBacktest: HOLD/WAIT readings not counted
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Force in-memory SQLite before any module that calls getDb() is loaded.
Bun.env["DB_PATH"] = ":memory:";

import { closeDb, initDatabase } from "../infrastructure/db/schema.js";
import {
  storeReading,
  getLatestReading,
  recordTransition,
  getTransitionProb,
  getTopTransitions,
  updateTransitionOutcome,
  getReadingsForBacktest,
} from "../infrastructure/db/hexagramStore.js";

import {
  computeBacktest,
  type BacktestRow,
  type PriceRow,
} from "../domain/services/kinhDich/hexagramBacktester.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Fresh in-memory DB for every test
  closeDb();
  Bun.env["DB_PATH"] = ":memory:";
  initDatabase();
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Store tests
// ---------------------------------------------------------------------------

describe("Task 283 — initDatabase creates hexagram tables", () => {
  it("creates kinhdich_readings table", () => {
    // If the table were missing, storeReading would throw.
    expect(() =>
      storeReading({
        stockCode: "VCB",
        hexagramNumber: 1,
        hoQueNumber: 2,
        bienQueNumber: 3,
        haoStates: "[]",
        rawScores: "[]",
      }),
    ).not.toThrow();
  });

  it("creates hexagram_transitions table", () => {
    // recordTransition would throw if table missing
    expect(() => recordTransition(1, 2, "VCB")).not.toThrow();
  });

  it("initDatabase is idempotent — calling twice does not throw", () => {
    expect(() => initDatabase()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("Task 283 — storeReading + getLatestReading roundtrip", () => {
  it("stores and retrieves a reading", () => {
    storeReading({
      stockCode: "VNM",
      hexagramNumber: 11,
      hoQueNumber: 54,
      bienQueNumber: 26,
      haoStates: '["THIEU_DUONG","THIEU_AM","LAO_DUONG","THIEU_DUONG","THIEU_AM","THIEU_AM"]',
      rawScores: "[0.5,-0.2,0.8,0.1,-0.3,-0.1]",
      nguHanhDynamic: "TUONG_SINH",
      tradingSignal: "BUY",
      confidence: 0.72,
      actionNote: "Thai que — thuan loi",
    });

    const latest = getLatestReading("VNM");
    expect(latest).not.toBeNull();
    expect(latest!.hexagramNumber).toBe(11);
    expect(latest!.hoQueNumber).toBe(54);
    expect(latest!.bienQueNumber).toBe(26);
    expect(latest!.haoStates).toContain("THIEU_DUONG");
  });

  it("returns the most recent reading when multiple exist", () => {
    storeReading({
      stockCode: "FPT",
      hexagramNumber: 1,
      hoQueNumber: 1,
      bienQueNumber: 1,
      haoStates: "[]",
      rawScores: "[]",
      tradingSignal: "BUY",
    });
    storeReading({
      stockCode: "FPT",
      hexagramNumber: 42,
      hoQueNumber: 3,
      bienQueNumber: 4,
      haoStates: "[]",
      rawScores: "[]",
      tradingSignal: "SELL",
    });

    const latest = getLatestReading("FPT");
    expect(latest!.hexagramNumber).toBe(42);
  });

  it("returns null for unknown stock", () => {
    expect(getLatestReading("UNKNOWN")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("Task 283 — recordTransition", () => {
  it("creates a new entry with count=1 on first call", () => {
    recordTransition(11, 34, "VCB");
    const prob = getTransitionProb(11, 34, "VCB");
    // Only one transition recorded so P(34|11) = 1/1 = 1.0
    expect(prob).toBe(1);
  });

  it("increments count to 2 on second call", () => {
    recordTransition(11, 34, "VCB");
    recordTransition(11, 34, "VCB");
    // count=2, total=2 → still 1.0
    const prob = getTransitionProb(11, 34, "VCB");
    expect(prob).toBe(1);

    const tops = getTopTransitions(11, "VCB", 5);
    expect(tops[0]!.count).toBe(2);
  });

  it("records priceChange5d when provided", () => {
    recordTransition(1, 2, "VNM", 0.05);
    const tops = getTopTransitions(1, "VNM", 5);
    expect(tops[0]!.avgPriceChange).toBeCloseTo(0.05, 5);
    expect(tops[0]!.winRate).toBe(1); // priceChange > 0 → win
  });

  it("records priceChange5d < 0 as a loss", () => {
    recordTransition(1, 2, "VNM", -0.03);
    const tops = getTopTransitions(1, "VNM", 5);
    expect(tops[0]!.winRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("Task 283 — getTransitionProb", () => {
  it("returns 0 for an unseen hexagram", () => {
    expect(getTransitionProb(63, 64, "VCB")).toBe(0);
  });

  it("returns 0.4 when 2 out of 5 transitions go to `to`", () => {
    // 2 transitions to hexagram 5
    recordTransition(3, 5, "VCB");
    recordTransition(3, 5, "VCB");
    // 3 transitions to hexagram 7
    recordTransition(3, 7, "VCB");
    recordTransition(3, 7, "VCB");
    recordTransition(3, 7, "VCB");

    const prob = getTransitionProb(3, 5, "VCB");
    expect(prob).toBeCloseTo(2 / 5, 5);
  });

  it("returns 0.6 for the dominant transition", () => {
    recordTransition(3, 5, "VCB");
    recordTransition(3, 5, "VCB");
    recordTransition(3, 7, "VCB");
    recordTransition(3, 7, "VCB");
    recordTransition(3, 7, "VCB");

    const prob = getTransitionProb(3, 7, "VCB");
    expect(prob).toBeCloseTo(3 / 5, 5);
  });

  it("is stock-specific — different stocks have independent matrices", () => {
    recordTransition(10, 20, "VCB");
    recordTransition(10, 20, "VCB");
    recordTransition(10, 30, "FPT");

    expect(getTransitionProb(10, 20, "VCB")).toBeCloseTo(1, 5);
    expect(getTransitionProb(10, 30, "FPT")).toBeCloseTo(1, 5);
    // VCB has no transition to 30
    expect(getTransitionProb(10, 30, "VCB")).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("Task 283 — getTopTransitions", () => {
  it("returns empty array when no transitions exist", () => {
    expect(getTopTransitions(1, "VNM", 5)).toEqual([]);
  });

  it("returns transitions sorted by count descending", () => {
    recordTransition(5, 11, "VNM"); // count 1
    recordTransition(5, 22, "VNM"); // count 1
    recordTransition(5, 22, "VNM"); // count 2
    recordTransition(5, 33, "VNM"); // count 1
    recordTransition(5, 33, "VNM"); // count 2
    recordTransition(5, 33, "VNM"); // count 3

    const tops = getTopTransitions(5, "VNM", 5);
    expect(tops[0]!.toHexagram).toBe(33);
    expect(tops[0]!.count).toBe(3);
    expect(tops[1]!.toHexagram).toBe(22);
    expect(tops[1]!.count).toBe(2);
    expect(tops[2]!.toHexagram).toBe(11);
    expect(tops[2]!.count).toBe(1);
  });

  it("respects topN limit", () => {
    for (let to = 1; to <= 10; to++) {
      recordTransition(6, to, "FPT");
    }
    const tops = getTopTransitions(6, "FPT", 3);
    expect(tops).toHaveLength(3);
  });

  it("probabilities sum to 1 for all returned rows", () => {
    recordTransition(7, 8, "VCB");
    recordTransition(7, 8, "VCB");
    recordTransition(7, 9, "VCB");

    // Note: getTopTransitions computes probability relative to the returned
    // subset only (sum of counts in topN rows), not the global row total.
    const tops = getTopTransitions(7, "VCB", 5);
    const total = tops.reduce((s, r) => s + r.probability, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------

describe("Task 283 — updateTransitionOutcome", () => {
  it("updates avgPriceChange correctly after two calls", () => {
    recordTransition(20, 30, "VNM");
    recordTransition(20, 30, "VNM");

    updateTransitionOutcome(20, 30, "VNM", 0.10); // +10%
    updateTransitionOutcome(20, 30, "VNM", 0.06); // +6%

    const tops = getTopTransitions(20, "VNM", 1);
    // total_price_change_5d = 0.16, count = 2 → avg = 0.08
    expect(tops[0]!.avgPriceChange).toBeCloseTo(0.08, 5);
  });

  it("counts wins correctly", () => {
    recordTransition(20, 30, "VNM");
    recordTransition(20, 30, "VNM");
    recordTransition(20, 30, "VNM");

    updateTransitionOutcome(20, 30, "VNM", 0.05);   // win
    updateTransitionOutcome(20, 30, "VNM", -0.02);  // loss
    updateTransitionOutcome(20, 30, "VNM", 0.01);   // win

    const tops = getTopTransitions(20, "VNM", 1);
    // win_count = 2, count = 3 → winRate = 2/3
    expect(tops[0]!.winRate).toBeCloseTo(2 / 3, 5);
  });
});

// ---------------------------------------------------------------------------

describe("Task 283 — getReadingsForBacktest", () => {
  it("returns empty array when no readings exist", () => {
    expect(getReadingsForBacktest("VCB", 30)).toEqual([]);
  });

  it("returns readings stored within the requested window", () => {
    // Store one reading (current timestamp = within any window)
    storeReading({
      stockCode: "VCB",
      hexagramNumber: 11,
      hoQueNumber: 2,
      bienQueNumber: 3,
      haoStates: "[]",
      rawScores: "[]",
      tradingSignal: "BUY",
      confidence: 0.8,
    });

    const results = getReadingsForBacktest("VCB", 30);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.stockCode).toBe("VCB");
    expect(results[0]!.hexagramNumber).toBe(11);
    expect(results[0]!.tradingSignal).toBe("BUY");
    expect(results[0]!.confidence).toBeCloseTo(0.8, 5);
  });

  it("defaults to WAIT when tradingSignal is null", () => {
    storeReading({
      stockCode: "FPT",
      hexagramNumber: 2,
      hoQueNumber: 2,
      bienQueNumber: 2,
      haoStates: "[]",
      rawScores: "[]",
      // no tradingSignal
    });

    const results = getReadingsForBacktest("FPT", 30);
    expect(results[0]!.tradingSignal).toBe("WAIT");
  });
});

// ---------------------------------------------------------------------------
// Domain backtest tests (pure, no DB)
// ---------------------------------------------------------------------------

describe("Task 283 — computeBacktest (pure domain)", () => {
  /** Build a timestamp N days ago as ISO string */
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  it("returns zero accuracy for empty readings", () => {
    const result = computeBacktest([], []);
    expect(result.totalReadings).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.avgReturn5d).toBe(0);
    expect(result.bestHexagram).toBeNull();
    expect(result.worstHexagram).toBeNull();
  });

  it("returns 0 accuracy when no price data available", () => {
    const readings: BacktestRow[] = [
      { timestamp: daysAgo(20), hexagramNumber: 1, tradingSignal: "BUY", confidence: 0.8 },
    ];
    const result = computeBacktest(readings, []);
    expect(result.accuracy).toBe(0);
  });

  it("BUY + price went up = WIN (100% accuracy with 1 reading)", () => {
    const t0 = daysAgo(20); // reading timestamp

    const readings: BacktestRow[] = [
      { timestamp: t0, hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.8 },
    ];

    // Entry price at t0, exit price ~7 calendar days later (higher)
    const entryDate = new Date(t0);
    const exitDate = new Date(t0);
    exitDate.setDate(exitDate.getDate() + 7);

    const prices: PriceRow[] = [
      { timestamp: entryDate.toISOString(), price: 100 },
      { timestamp: exitDate.toISOString(), price: 110 },
    ];

    const result = computeBacktest(readings, prices);
    expect(result.accuracy).toBe(1);
  });

  it("SELL + price went down = WIN", () => {
    const t0 = daysAgo(20);
    const readings: BacktestRow[] = [
      { timestamp: t0, hexagramNumber: 12, tradingSignal: "SELL", confidence: 0.7 },
    ];

    const entryDate = new Date(t0);
    const exitDate = new Date(t0);
    exitDate.setDate(exitDate.getDate() + 7);

    const prices: PriceRow[] = [
      { timestamp: entryDate.toISOString(), price: 100 },
      { timestamp: exitDate.toISOString(), price: 90 },
    ];

    const result = computeBacktest(readings, prices);
    expect(result.accuracy).toBe(1);
  });

  it("BUY + price went down = LOSS (0% accuracy)", () => {
    const t0 = daysAgo(20);
    const readings: BacktestRow[] = [
      { timestamp: t0, hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.8 },
    ];

    const entryDate = new Date(t0);
    const exitDate = new Date(t0);
    exitDate.setDate(exitDate.getDate() + 7);

    const prices: PriceRow[] = [
      { timestamp: entryDate.toISOString(), price: 100 },
      { timestamp: exitDate.toISOString(), price: 90 },
    ];

    const result = computeBacktest(readings, prices);
    expect(result.accuracy).toBe(0);
  });

  it("3 BUY readings, 2 went up → ~66.7% accuracy", () => {
    // Readings at t=-30, -25, -20 days
    const readings: BacktestRow[] = [
      { timestamp: daysAgo(30), hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.9 },
      { timestamp: daysAgo(25), hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.8 },
      { timestamp: daysAgo(20), hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.7 },
    ];

    // Build prices: entry at each reading + exit 7 days later
    const prices: PriceRow[] = [];
    const basePrice = 100;

    for (const r of readings) {
      const entry = new Date(r.timestamp);
      const exit = new Date(r.timestamp);
      exit.setDate(exit.getDate() + 7);
      prices.push({ timestamp: entry.toISOString(), price: basePrice });
    }

    // reading 0 (t=-30): exit at t=-23 → price up (+5%)
    const exit0 = new Date(daysAgo(30)); exit0.setDate(exit0.getDate() + 7);
    // reading 1 (t=-25): exit at t=-18 → price up (+3%)
    const exit1 = new Date(daysAgo(25)); exit1.setDate(exit1.getDate() + 7);
    // reading 2 (t=-20): exit at t=-13 → price down (-2%)
    const exit2 = new Date(daysAgo(20)); exit2.setDate(exit2.getDate() + 7);

    prices.push({ timestamp: exit0.toISOString(), price: 105 });
    prices.push({ timestamp: exit1.toISOString(), price: 103 });
    prices.push({ timestamp: exit2.toISOString(), price: 98 });

    const result = computeBacktest(readings, prices);
    expect(result.totalReadings).toBe(3);
    expect(result.accuracy).toBeCloseTo(2 / 3, 2);
  });

  it("HOLD and WAIT readings are neutral — not counted as wins or losses", () => {
    const t0 = daysAgo(20);

    const readings: BacktestRow[] = [
      { timestamp: t0, hexagramNumber: 2, tradingSignal: "HOLD", confidence: 0.5 },
      { timestamp: t0, hexagramNumber: 3, tradingSignal: "WAIT", confidence: 0.5 },
    ];

    const entry = new Date(t0);
    const exit = new Date(t0);
    exit.setDate(exit.getDate() + 7);

    const prices: PriceRow[] = [
      { timestamp: entry.toISOString(), price: 100 },
      { timestamp: exit.toISOString(), price: 110 },
    ];

    const result = computeBacktest(readings, prices);
    // No directional signals → accuracy stays 0
    expect(result.accuracy).toBe(0);
    expect(result.totalReadings).toBe(2);
    // bestHexagram is null because no hexagram had directional signals
    expect(result.bestHexagram).toBeNull();
  });

  it("identifies bestHexagram correctly", () => {
    // Hexagram 11: 2 BUY both correct → winRate 1.0
    // Hexagram 12: 1 BUY wrong → winRate 0.0
    const readings: BacktestRow[] = [
      { timestamp: daysAgo(30), hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.9 },
      { timestamp: daysAgo(25), hexagramNumber: 11, tradingSignal: "BUY", confidence: 0.8 },
      { timestamp: daysAgo(20), hexagramNumber: 12, tradingSignal: "BUY", confidence: 0.6 },
    ];

    const prices: PriceRow[] = [];
    for (const r of readings) {
      const entry = new Date(r.timestamp);
      const exit = new Date(r.timestamp);
      exit.setDate(exit.getDate() + 7);
      prices.push({ timestamp: entry.toISOString(), price: 100 });
      // hex 11 → price up; hex 12 → price down
      prices.push({
        timestamp: exit.toISOString(),
        price: r.hexagramNumber === 11 ? 110 : 90,
      });
    }

    const result = computeBacktest(readings, prices);
    expect(result.bestHexagram?.number).toBe(11);
    expect(result.bestHexagram?.winRate).toBe(1);
    expect(result.worstHexagram?.number).toBe(12);
    expect(result.worstHexagram?.winRate).toBe(0);
  });

  it("computes avgReturn5d correctly", () => {
    const t0 = daysAgo(30);
    const t1 = daysAgo(20);

    const readings: BacktestRow[] = [
      { timestamp: t0, hexagramNumber: 1, tradingSignal: "BUY", confidence: 0.8 },
      { timestamp: t1, hexagramNumber: 2, tradingSignal: "SELL", confidence: 0.7 },
    ];

    // t0: entry 100, exit 110 → return +10%
    // t1: entry 100, exit  95 → return  -5%
    // avg = (0.10 + (-0.05)) / 2 = 0.025
    const prices: PriceRow[] = [
      { timestamp: new Date(t0).toISOString(), price: 100 },
      { timestamp: (() => { const d = new Date(t0); d.setDate(d.getDate() + 7); return d.toISOString(); })(), price: 110 },
      { timestamp: new Date(t1).toISOString(), price: 100 },
      { timestamp: (() => { const d = new Date(t1); d.setDate(d.getDate() + 7); return d.toISOString(); })(), price: 95 },
    ];

    const result = computeBacktest(readings, prices);
    expect(result.avgReturn5d).toBeCloseTo(0.025, 4);
  });
});
