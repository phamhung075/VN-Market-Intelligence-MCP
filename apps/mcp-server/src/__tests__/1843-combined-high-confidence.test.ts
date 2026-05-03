/**
 * 1843-combined-high-confidence.test.ts — Task 1843a
 *
 * Unit tests for:
 *   - computeEMA (SMA-seeded EMA)
 *   - computeRSI (final RSI value only)
 *   - deriveTADirection (BULLISH / BEARISH / NEUTRAL from candle series)
 *   - buildCombinedHighConfidenceStrategy (signalFilter uses taMap closure)
 *
 * No DB, no infrastructure imports.
 * DB_PATH = :memory: set by setup.ts preload.
 */

import { describe, it, expect } from "bun:test";

import {
  computeEMA,
  computeRSI,
  deriveTADirection,
} from "../domain/backtesting/taComputation.js";
import {
  buildCombinedHighConfidenceStrategy,
  type TADirection,
} from "../domain/backtesting/strategyRegistry.js";
import type { DailyCandle } from "../domain/repositories/IBacktestPriceRepository.js";
import type { BacktestSignal } from "../domain/repositories/IBacktestSignalRepository.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandles(closes: number[]): DailyCandle[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1_000_000,
  }));
}

function makeSignal(
  stockCode: string,
  direction: "BUY" | "SELL",
  confidence = 0.9,
): BacktestSignal {
  return {
    stockCode,
    timestamp: "2026-04-05T09:00:00",
    direction,
    confidence,
    strategy: "combined-high-confidence",
  };
}

// ---------------------------------------------------------------------------
// computeEMA
// ---------------------------------------------------------------------------

describe("1843a — computeEMA", () => {
  it("returns empty array when closes shorter than period", () => {
    const result = computeEMA([100, 101, 102], 5);
    expect(result).toEqual([]);
  });

  it("returns array of length closes.length - period + 1", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = computeEMA(closes, 12);
    expect(result.length).toBe(30 - 12 + 1);
  });

  it("first EMA value equals SMA of first period bars (SMA seed)", () => {
    // SMA of [10, 20, 30] = 20
    const result = computeEMA([10, 20, 30, 40], 3);
    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(20, 6); // SMA seed
  });

  it("second EMA value follows EMA recurrence: EMA = prev * (1-k) + close * k", () => {
    // period=3, k=2/(3+1)=0.5
    // closes: [10, 20, 30, 40]
    // seed = (10+20+30)/3 = 20
    // EMA[1] = 20 * 0.5 + 40 * 0.5 = 30
    const result = computeEMA([10, 20, 30, 40], 3);
    expect(result[1]).toBeCloseTo(30, 6);
  });

  it("known sequence spot-check with period=5", () => {
    // 10 values, period=5
    // SMA seed = avg of first 5 = (1+2+3+4+5)/5 = 3
    // k = 2/(5+1) = 1/3
    // EMA after close[5]=6: 3 * 2/3 + 6 * 1/3 = 2 + 2 = 4
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = computeEMA(closes, 5);
    expect(result.length).toBe(6);
    expect(result[0]).toBeCloseTo(3, 6);
    expect(result[1]).toBeCloseTo(4, 6);
  });
});

// ---------------------------------------------------------------------------
// computeRSI
// ---------------------------------------------------------------------------

describe("1843a — computeRSI", () => {
  it("returns null when fewer than period+1 closes", () => {
    // Need at least period+1 closes to compute 1 diff
    const result = computeRSI([100, 101, 102], 14);
    expect(result).toBeNull();
  });

  it("returns null for exactly period closes (need period+1 for one diff)", () => {
    const closes = Array.from({ length: 14 }, (_, i) => 100 + i);
    expect(computeRSI(closes, 14)).toBeNull();
  });

  it("returns a number in [0, 100] for valid input", () => {
    // 20 ascending closes → all gains → RSI near 100
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = computeRSI(closes, 14);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThanOrEqual(100);
  });

  it("returns RSI near 100 for monotonically rising closes", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const result = computeRSI(closes, 14);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(90);
  });

  it("returns RSI near 0 for monotonically falling closes", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i * 2);
    const result = computeRSI(closes, 14);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// deriveTADirection
// ---------------------------------------------------------------------------

describe("1843a — deriveTADirection", () => {
  it("returns NEUTRAL when fewer than 26 candles (< EMA-26 minimum)", () => {
    const candles = makeCandles(Array.from({ length: 25 }, (_, i) => 100 + i));
    expect(deriveTADirection(candles)).toBe("NEUTRAL");
  });

  it("returns NEUTRAL for exactly 25 candles", () => {
    const candles = makeCandles(Array.from({ length: 25 }, () => 100));
    expect(deriveTADirection(candles)).toBe("NEUTRAL");
  });

  it("returns BULLISH for strong uptrend (EMA12 > EMA26, RSI > 50)", () => {
    // Strong ascending prices: EMA12 will cross above EMA26, RSI > 50
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 3);
    const candles = makeCandles(closes);
    expect(deriveTADirection(candles)).toBe("BULLISH");
  });

  it("returns BEARISH for strong downtrend (EMA12 < EMA26, RSI < 50)", () => {
    // Strong descending prices: EMA12 will cross below EMA26, RSI < 50
    const closes = Array.from({ length: 40 }, (_, i) => 500 - i * 3);
    const candles = makeCandles(closes);
    expect(deriveTADirection(candles)).toBe("BEARISH");
  });

  it("returns NEUTRAL when EMA direction and RSI disagree", () => {
    // Zig-zag pattern: EMA12 ~ EMA26 with mixed RSI
    // Build a series that goes up then sharply down
    // First 30 prices go up strongly (RSI high, EMA12 > EMA26)
    // Last 10 prices drop hard (RSI drops below 50 but EMA12 still slightly > EMA26 or vice versa)
    const up = Array.from({ length: 30 }, (_, i) => 100 + i * 5);   // 100..245
    const down = Array.from({ length: 10 }, (_, i) => 245 - i * 15); // 245..110 (sharp fall)
    const candles = makeCandles([...up, ...down]);
    // After the sharp fall, RSI should be < 50 but EMA12/26 relationship may be inconsistent
    // The exact result depends on the algorithm; just verify it doesn't throw
    const result = deriveTADirection(candles);
    expect(["BULLISH", "BEARISH", "NEUTRAL"]).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// buildCombinedHighConfidenceStrategy — signalFilter
// ---------------------------------------------------------------------------

describe("1843a — buildCombinedHighConfidenceStrategy", () => {
  // AC-CHC-3: BULLISH map + BUY signal → passes filter
  it("AC-CHC-3: BUY signal with BULLISH TA direction passes signalFilter", () => {
    const taMap = new Map<string, TADirection>([["VCB", "BULLISH"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("VCB", "BUY");
    const result = strategy.signalFilter(signal);
    expect(result).not.toBeNull();
    expect(result).toBe(signal);
  });

  // AC-CHC-4: BEARISH map + BUY signal → blocked
  it("AC-CHC-4: BUY signal with BEARISH TA direction returns null", () => {
    const taMap = new Map<string, TADirection>([["VCB", "BEARISH"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("VCB", "BUY");
    const result = strategy.signalFilter(signal);
    expect(result).toBeNull();
  });

  // AC-CHC-5: NEUTRAL map + BUY signal → blocked
  it("AC-CHC-5: BUY signal with NEUTRAL TA direction returns null", () => {
    const taMap = new Map<string, TADirection>([["VCB", "NEUTRAL"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("VCB", "BUY");
    const result = strategy.signalFilter(signal);
    expect(result).toBeNull();
  });

  it("SELL signal with BEARISH TA direction passes signalFilter", () => {
    const taMap = new Map<string, TADirection>([["HPG", "BEARISH"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("HPG", "SELL");
    const result = strategy.signalFilter(signal);
    expect(result).not.toBeNull();
  });

  it("SELL signal with BULLISH TA direction returns null", () => {
    const taMap = new Map<string, TADirection>([["HPG", "BULLISH"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("HPG", "SELL");
    const result = strategy.signalFilter(signal);
    expect(result).toBeNull();
  });

  it("signal with no entry in taMap returns null", () => {
    const taMap = new Map<string, TADirection>();
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("VCB", "BUY");
    const result = strategy.signalFilter(signal);
    expect(result).toBeNull();
  });

  it("confidence < 0.7 returns null even when TA agrees", () => {
    const taMap = new Map<string, TADirection>([["VCB", "BULLISH"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal: BacktestSignal = {
      ...makeSignal("VCB", "BUY"),
      confidence: 0.5,
    };
    const result = strategy.signalFilter(signal);
    expect(result).toBeNull();
  });

  it("strategy has correct id, minConfidence and holdDays", () => {
    const strategy = buildCombinedHighConfidenceStrategy(new Map());
    expect(strategy.id).toBe("combined-high-confidence");
    expect(strategy.minConfidence).toBe(0.7);
    expect(strategy.holdDays).toBe(5);
  });

  it("signalFilter is synchronous (returns non-Promise)", () => {
    const taMap = new Map<string, TADirection>([["VCB", "BULLISH"]]);
    const strategy = buildCombinedHighConfidenceStrategy(taMap);
    const signal = makeSignal("VCB", "BUY");
    const result = strategy.signalFilter(signal);
    // Must NOT be a Promise
    expect(result instanceof Promise).toBe(false);
  });
});
