/**
 * 1570a-market-earning-yield.test.ts
 *
 * Unit tests for the computeMarketEarningYield() pure domain function.
 * Covers all branches: happy path, coverage guard, median computation
 * (even/odd), zero-length input, all-zero input (caller must filter).
 *
 * Note: DB_PATH is set to :memory: by setup.ts preload (Bun.env).
 */

import { describe, it, expect } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  computeMarketEarningYield,
} from "../domain/services/macro/marketEarningYield.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTickers(count: number, peValue = 15): Array<{ code: string; pe: number }> {
  return Array.from({ length: count }, (_, i) => ({
    code: `T${String(i).padStart(3, "0")}`,
    pe: peValue,
  }));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Task 1426a — computeMarketEarningYield", () => {

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns a valid result when coverage >= 70%", () => {
    const tickers = makeTickers(28, 20); // 28 valid of 30 total = 93.3%
    const result = computeMarketEarningYield(tickers, 30, "2024-Q4");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.medianPE).toBeCloseTo(20, 5);
    expect(result.earningYield).toBeCloseTo((1 / 20) * 100, 5);
    expect(result.coverageRatio).toBeCloseTo(28 / 30, 5);
    expect(result.coverageCount).toBe(28);
    expect(result.totalWatchlist).toBe(30);
    expect(result.dataAsOf).toBe("2024-Q4");
    expect(typeof result.computedAt).toBe("string");
    // ISO timestamp format
    expect(new Date(result.computedAt).toISOString()).toBe(result.computedAt);
  });

  it("earningYield = (1 / medianPE) * 100 as a percentage", () => {
    const tickers = makeTickers(25, 13.65);
    const result = computeMarketEarningYield(tickers, 30, "2025-Q1");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    const expected = (1 / 13.65) * 100;
    expect(result.earningYield).toBeCloseTo(expected, 5);
  });

  // ── Median computation: odd count ──────────────────────────────────────────

  it("computes median correctly for odd ticker count (picks middle element)", () => {
    // PE values: 10, 12, 15, 18, 20 → sorted middle = 15
    const tickers = [
      { code: "A", pe: 20 },
      { code: "B", pe: 10 },
      { code: "C", pe: 15 },
      { code: "D", pe: 12 },
      { code: "E", pe: 18 },
    ];
    const result = computeMarketEarningYield(tickers, 6, "2025-Q1");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.medianPE).toBeCloseTo(15, 5);
    expect(result.earningYield).toBeCloseTo((1 / 15) * 100, 5);
  });

  // ── Median computation: even count ─────────────────────────────────────────

  it("computes median correctly for even ticker count (averages two middle values)", () => {
    // PE values: 10, 12, 15, 18 → sorted: 10, 12, 15, 18 → median = (12+15)/2 = 13.5
    const tickers = [
      { code: "A", pe: 18 },
      { code: "B", pe: 10 },
      { code: "C", pe: 15 },
      { code: "D", pe: 12 },
    ];
    const result = computeMarketEarningYield(tickers, 5, "2025-Q1");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.medianPE).toBeCloseTo(13.5, 5);
    expect(result.earningYield).toBeCloseTo((1 / 13.5) * 100, 5);
  });

  // ── Coverage guard: < 70% → refused ───────────────────────────────────────

  it("refuses when coverage < 70% (15 of 30 = 50%)", () => {
    const tickers = makeTickers(15, 15);
    const result = computeMarketEarningYield(tickers, 30, "2025-Q1");

    expect("refused" in result).toBe(true);
    if (!("refused" in result)) return;

    expect(result.refused).toBe(true);
    expect(result.coverageRatio).toBeCloseTo(15 / 30, 5);
    expect(result.coverageCount).toBe(15);
  });

  it("refuses when coverage is exactly at the boundary (20/30 = 66.7% < 70%)", () => {
    const tickers = makeTickers(20, 15);
    const result = computeMarketEarningYield(tickers, 30, "2025-Q1");

    expect("refused" in result).toBe(true);
  });

  it("accepts when coverage is exactly 70% (21/30)", () => {
    const tickers = makeTickers(21, 15);
    const result = computeMarketEarningYield(tickers, 30, "2025-Q1");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.coverageRatio).toBeCloseTo(21 / 30, 5);
  });

  // ── Zero-length input ──────────────────────────────────────────────────────

  it("refuses when tickers array is empty (0/30 = 0%)", () => {
    const result = computeMarketEarningYield([], 30, "2025-Q1");

    expect("refused" in result).toBe(true);
    if (!("refused" in result)) return;

    expect(result.refused).toBe(true);
    expect(result.coverageRatio).toBe(0);
    expect(result.coverageCount).toBe(0);
  });

  // ── totalWatchlist = 0 edge case ───────────────────────────────────────────

  it("refuses when totalWatchlist is 0 (division guard)", () => {
    const result = computeMarketEarningYield([], 0, "2025-Q1");

    expect("refused" in result).toBe(true);
  });

  // ── Single ticker happy path ───────────────────────────────────────────────

  it("handles single ticker when totalWatchlist = 1 (100% coverage)", () => {
    const tickers = [{ code: "VCB", pe: 18.5 }];
    const result = computeMarketEarningYield(tickers, 1, "2025-Q1");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.medianPE).toBeCloseTo(18.5, 5);
    expect(result.earningYield).toBeCloseTo((1 / 18.5) * 100, 5);
    expect(result.coverageRatio).toBeCloseTo(1.0, 5);
  });

  // ── dataAsOf propagation ───────────────────────────────────────────────────

  it("propagates dataAsOf from caller into result", () => {
    const tickers = makeTickers(25, 12);
    const result = computeMarketEarningYield(tickers, 30, "2024-Q3");

    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.dataAsOf).toBe("2024-Q3");
  });
});
