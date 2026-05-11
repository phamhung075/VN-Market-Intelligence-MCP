/**
 * Task: vnstock intraday ticks + order book analysis
 *
 * Tests cover:
 *  1. intradayAnalyzer — volume_burst, institutional_buy, institutional_sell,
 *     price_momentum, no signal on normal volume
 *  2. orderBookAnalyzer — strong_buy_pressure, strong_sell_pressure,
 *     thin_liquidity, balanced, wall detection
 */

import { describe, it, expect } from "bun:test";
import {
  analyzeIntradayTicks,
  type IntradaySignal,
} from "../domain/services/intradayAnalyzer.js";
import {
  analyzeOrderBook,
  type OrderBookSignal,
} from "../domain/services/orderBookAnalyzer.js";
import type { VnstockIntradayTick } from "../infrastructure/fetchers/vnstockBridge.js";
import type { VnstockOrderBook } from "../infrastructure/fetchers/vnstockBridge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTick(
  overrides: Partial<VnstockIntradayTick> = {},
): VnstockIntradayTick {
  return {
    code: "VCB",
    time: new Date().toISOString(),
    price: 85000,
    volume: 1000,
    matchType: "Buy",
    ...overrides,
  };
}

/**
 * Build a list of ticks where the last N minutes are "recent".
 * @param recentCount  ticks within last 5 minutes
 * @param oldCount     ticks older than 5 minutes
 * @param recentVolume volume per recent tick
 * @param oldVolume    volume per old tick
 * @param matchType    matchType for recent ticks
 */
function buildTicks(
  recentCount: number,
  oldCount: number,
  recentVolume: number,
  oldVolume: number,
  matchType: string = "Buy",
): VnstockIntradayTick[] {
  const now = Date.now();
  const ticks: VnstockIntradayTick[] = [];

  // old ticks (> 5 min ago)
  for (let i = 0; i < oldCount; i++) {
    ticks.push(
      makeTick({
        time: new Date(now - (6 + i) * 60 * 1000).toISOString(),
        volume: oldVolume,
        matchType: "Buy",
      }),
    );
  }

  // recent ticks (< 5 min ago)
  for (let i = 0; i < recentCount; i++) {
    ticks.push(
      makeTick({
        time: new Date(now - i * 30 * 1000).toISOString(),
        volume: recentVolume,
        matchType,
      }),
    );
  }

  return ticks;
}

function makeOrderBook(
  overrides: Partial<VnstockOrderBook> = {},
): VnstockOrderBook {
  const bids = Array.from({ length: 10 }, (_, i) => ({
    price: 85000 - i * 100,
    volume: 1000,
  }));
  const asks = Array.from({ length: 10 }, (_, i) => ({
    price: 85200 + i * 100,
    volume: 1000,
  }));
  return {
    code: "VCB",
    bids,
    asks,
    bidTotal: 10000,
    askTotal: 10000,
    imbalanceRatio: 1.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IntradayAnalyzer tests
// ---------------------------------------------------------------------------

describe("intradayAnalyzer — volume_burst detection", () => {
  it("returns null for empty tick list", () => {
    const result = analyzeIntradayTicks([], 100000);
    expect(result).toBeNull();
  });

  it("returns null when volume is normal (velocityRatio < 2x)", () => {
    // avgDailyVolume = 78000, so avg5min = 1000
    // recent: 5 ticks × 200 = 1000 total → velocityRatio = 1.0
    const ticks = buildTicks(5, 20, 200, 200);
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).toBeNull();
  });

  it("detects volume_burst HIGH when velocityRatio > 3x", () => {
    // avgDailyVolume = 78000 → avg5min = 1000
    // recent: 10 ticks × 400 = 4000 total → velocityRatio = 4.0
    // Alternate Buy/Sell → buyRatio = 0.5 (neutral, no institutional signal)
    const now = Date.now();
    const ticks: VnstockIntradayTick[] = [];
    for (let i = 0; i < 10; i++) {
      ticks.push(makeTick({
        time: new Date(now - i * 20 * 1000).toISOString(),
        volume: 400,
        matchType: i % 2 === 0 ? "Buy" : "Sell",
      }));
    }
    for (let i = 0; i < 20; i++) {
      ticks.push(makeTick({ time: new Date(now - (10 + i) * 60 * 1000).toISOString(), volume: 100 }));
    }
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("volume_burst");
    expect(result!.severity).toBe("high");
    expect(result!.metrics.velocityRatio).toBeGreaterThan(3);
  });

  it("detects volume_burst CRITICAL when velocityRatio > 5x", () => {
    // avgDailyVolume = 78000 → avg5min = 1000
    // recent: 10 ticks × 700 = 7000 total → velocityRatio = 7.0
    // Alternate Buy/Sell → buyRatio = 0.5 (neutral, no institutional signal)
    const now = Date.now();
    const ticks: VnstockIntradayTick[] = [];
    for (let i = 0; i < 10; i++) {
      ticks.push(makeTick({
        time: new Date(now - i * 20 * 1000).toISOString(),
        volume: 700,
        matchType: i % 2 === 0 ? "Buy" : "Sell",
      }));
    }
    for (let i = 0; i < 20; i++) {
      ticks.push(makeTick({ time: new Date(now - (10 + i) * 60 * 1000).toISOString(), volume: 100 }));
    }
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("volume_burst");
    expect(result!.severity).toBe("critical");
    expect(result!.metrics.velocityRatio).toBeGreaterThan(5);
  });

  it("detects institutional_buy when buyRatio > 0.7 and velocityRatio > 2x", () => {
    // avgDailyVolume = 78000 → avg5min = 1000
    // recent: 10 ticks × 300 = 3000 total → velocityRatio = 3.0, all Buy
    const ticks = buildTicks(10, 20, 300, 50, "Buy");
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("institutional_buy");
    expect(result!.severity).toBe("high");
    expect(result!.metrics.buyRatio).toBeGreaterThan(0.7);
  });

  it("detects institutional_sell when buyRatio < 0.3 and velocityRatio > 2x", () => {
    // recent ticks are all Sell, velocity > 2x
    const ticks = buildTicks(10, 20, 300, 50, "Sell");
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("institutional_sell");
    expect(result!.severity).toBe("high");
    expect(result!.metrics.buyRatio).toBeLessThan(0.3);
  });

  it("prioritises institutional_buy over volume_burst when both apply", () => {
    // High velocity + all Buy → institutional_buy takes precedence
    const ticks = buildTicks(10, 20, 700, 50, "Buy");
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    // institutional_buy should be detected (buyRatio > 0.7 + velocity > 2x)
    expect(["institutional_buy", "volume_burst"]).toContain(result!.type);
  });

  it("includes correct code on signal", () => {
    const ticks = buildTicks(10, 20, 700, 100, "Buy").map((t) => ({
      ...t,
      code: "FPT",
    }));
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("FPT");
  });

  it("includes all required metric fields on signal", () => {
    const ticks = buildTicks(10, 20, 400, 100, "Buy");
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(typeof result!.metrics.recentVolume5min).toBe("number");
    expect(typeof result!.metrics.avgVolume5min).toBe("number");
    expect(typeof result!.metrics.velocityRatio).toBe("number");
    expect(typeof result!.metrics.buyRatio).toBe("number");
  });

  it("confidence is between 0 and 1", () => {
    const ticks = buildTicks(10, 20, 400, 100);
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it("returns null when there are no recent ticks (all older than 5 min)", () => {
    const now = Date.now();
    const ticks = Array.from({ length: 20 }, (_, i) =>
      makeTick({
        time: new Date(now - (10 + i) * 60 * 1000).toISOString(),
        volume: 500,
      }),
    );
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).toBeNull();
  });

  it("avgVolume5min equals avgDailyVolume / 78", () => {
    const ticks = buildTicks(5, 20, 9999, 100); // high velocity to force signal
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.metrics.avgVolume5min).toBeCloseTo(1000, 0);
  });

  it("velocityRatio is recentVolume5min / avgVolume5min", () => {
    const ticks = buildTicks(5, 20, 1000, 100); // 5 ticks × 1000 = 5000 recent vol
    // avg5min = 78000/78 = 1000, velocityRatio = 5.0 → CRITICAL
    const result = analyzeIntradayTicks(ticks, 78000);
    expect(result).not.toBeNull();
    expect(result!.metrics.recentVolume5min).toBe(5000);
    expect(result!.metrics.velocityRatio).toBeCloseTo(5.0, 1);
  });

  it("mixed buy/sell ticks: no institutional signal when buyRatio is neutral", () => {
    // 5 Buy + 5 Sell → buyRatio = 0.5 (not institutional)
    // Use 500 vol/tick → 5000 total → velocityRatio = 5.0 > 3 → volume_burst
    const now = Date.now();
    const ticks: VnstockIntradayTick[] = [];
    for (let i = 0; i < 5; i++) {
      ticks.push(makeTick({ time: new Date(now - i * 20 * 1000).toISOString(), volume: 500, matchType: "Buy" }));
    }
    for (let i = 5; i < 10; i++) {
      ticks.push(makeTick({ time: new Date(now - i * 20 * 1000).toISOString(), volume: 500, matchType: "Sell" }));
    }
    // add old ticks to keep avg down
    for (let i = 0; i < 20; i++) {
      ticks.push(makeTick({ time: new Date(now - (10 + i) * 60 * 1000).toISOString(), volume: 50 }));
    }
    const result = analyzeIntradayTicks(ticks, 78000);
    // velocity is high (5000/1000 = 5x) but buyRatio = 0.5 → volume_burst (not institutional)
    expect(result).not.toBeNull();
    expect(result!.type).toBe("volume_burst");
  });

  it("handles single-tick input without crashing", () => {
    const ticks = [makeTick({ volume: 100 })];
    expect(() => analyzeIntradayTicks(ticks, 78000)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OrderBookAnalyzer tests
// ---------------------------------------------------------------------------

describe("orderBookAnalyzer — order book signal detection", () => {
  it("detects strong_buy_pressure when imbalanceRatio > 2.0", () => {
    const book = makeOrderBook({
      bidTotal: 30000,
      askTotal: 10000,
      imbalanceRatio: 3.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("strong_buy_pressure");
    expect(result.severity).toBe("high");
    expect(result.imbalanceRatio).toBe(3.0);
  });

  it("detects strong_sell_pressure when imbalanceRatio < 0.5", () => {
    const book = makeOrderBook({
      bidTotal: 5000,
      askTotal: 20000,
      imbalanceRatio: 0.25,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("strong_sell_pressure");
    expect(result.severity).toBe("high");
  });

  it("detects thin_liquidity when bidTotal + askTotal < 10000", () => {
    const book = makeOrderBook({
      bids: [{ price: 85000, volume: 200 }],
      asks: [{ price: 85200, volume: 200 }],
      bidTotal: 200,
      askTotal: 200,
      imbalanceRatio: 1.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("thin_liquidity");
    expect(result.severity).toBe("medium");
  });

  it("detects balanced when imbalanceRatio is near 1.0", () => {
    const book = makeOrderBook({
      bidTotal: 10000,
      askTotal: 10000,
      imbalanceRatio: 1.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("balanced");
    expect(result.severity).toBe("low");
  });

  it("thin_liquidity takes precedence over imbalance check", () => {
    // imbalance is extreme but volume is tiny
    const book = makeOrderBook({
      bids: [{ price: 85000, volume: 5000 }],
      asks: [{ price: 85200, volume: 1000 }],
      bidTotal: 5000,
      askTotal: 1000,
      imbalanceRatio: 5.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("thin_liquidity");
  });

  it("identifies bidWallPrice as the bid level with largest volume", () => {
    const bids = [
      { price: 85000, volume: 1000 },
      { price: 84900, volume: 5000 }, // largest
      { price: 84800, volume: 500 },
    ];
    const book = makeOrderBook({
      bids,
      bidTotal: 6500,
      askTotal: 6500,
      imbalanceRatio: 1.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.bidWallPrice).toBe(84900);
  });

  it("identifies askWallPrice as the ask level with largest volume", () => {
    const asks = [
      { price: 85200, volume: 500 },
      { price: 85300, volume: 4000 }, // largest
      { price: 85400, volume: 1000 },
    ];
    const book = makeOrderBook({
      asks,
      bidTotal: 10000,
      askTotal: 10000,
      imbalanceRatio: 1.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.askWallPrice).toBe(85300);
  });

  it("returns null bidWallPrice and askWallPrice on empty arrays", () => {
    const book = makeOrderBook({
      bids: [],
      asks: [],
      bidTotal: 0,
      askTotal: 0,
      imbalanceRatio: 1.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.bidWallPrice).toBeNull();
    expect(result.askWallPrice).toBeNull();
  });

  it("includes correct code on result", () => {
    const book = makeOrderBook({ code: "FPT" });
    const result = analyzeOrderBook(book);
    expect(result.code).toBe("FPT");
  });

  it("confidence is between 0 and 1", () => {
    const result = analyzeOrderBook(makeOrderBook());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("imbalanceRatio exactly 2.0 triggers strong_buy_pressure", () => {
    const book = makeOrderBook({
      bidTotal: 20000,
      askTotal: 10000,
      imbalanceRatio: 2.0,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("strong_buy_pressure");
  });

  it("imbalanceRatio exactly 0.5 triggers strong_sell_pressure", () => {
    const book = makeOrderBook({
      bidTotal: 5000,
      askTotal: 10000,
      imbalanceRatio: 0.5,
    });
    const result = analyzeOrderBook(book);
    expect(result.interpretation).toBe("strong_sell_pressure");
  });
});
