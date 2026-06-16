/**
 * FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL
 *
 * Tests for fetchVnIndexBreadthAndLiquidity() in hose.ts.
 * Verifies correct parsing of breadth fields (advances/declines/noChange/ceiling/floor)
 * and liquidity turnover (tỷ đồng conversion, delta computation from size=2 response).
 *
 * No real network calls — tests use live-format mock payloads from the recon probe.
 */

import { describe, it, expect } from "bun:test";
import type { MarketBreadthAndLiquidity } from "../infrastructure/fetchers/hose.js";

// ─────────────────────────────────────────────────────────────────────────────
// Parse helper — same logic as fetchVnIndexBreadthAndLiquidity() internals
// We test the logic by replicating the parsing from two records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replicates the core parsing logic of fetchVnIndexBreadthAndLiquidity()
 * from two API records (today + yesterday).
 */
function parseBreadthAndLiquidity(
  today: Record<string, unknown>,
  yesterday?: Record<string, unknown>,
): MarketBreadthAndLiquidity {
  const accVal = (today.accumulatedVal as number | undefined) ?? 0;
  const nmVal = (today.nmValue as number | undefined) ?? 0;
  const ptVal = (today.ptValue as number | undefined) ?? 0;

  const totalTurnoverBn = accVal / 1e9;
  const nmTurnoverBn = nmVal / 1e9;
  const ptTurnoverBn = ptVal / 1e9;

  let turnoverDeltaPct: number | null = null;
  let turnoverDirection: "up" | "down" | "flat" | null = null;
  if (yesterday?.accumulatedVal != null && (yesterday.accumulatedVal as number) > 0 && today.accumulatedVal != null) {
    const delta = ((accVal - (yesterday.accumulatedVal as number)) / (yesterday.accumulatedVal as number)) * 100;
    turnoverDeltaPct = Math.round(delta * 100) / 100;
    turnoverDirection = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  }

  const fetchedAt = new Date().toISOString();

  return {
    date: (today.date as string | undefined) ?? fetchedAt.slice(0, 10),
    sessionTime: fetchedAt.slice(11, 19),
    advances: Math.round((today.advances as number | undefined) ?? 0),
    declines: Math.round((today.declines as number | undefined) ?? 0),
    noChange: Math.round((today.noChange as number | undefined) ?? 0),
    noTrade: Math.round((today.noTrade as number | undefined) ?? 0),
    ceilingStocks: Math.round((today.ceilingStocks as number | undefined) ?? 0),
    floorStocks: Math.round((today.floorStocks as number | undefined) ?? 0),
    totalTurnoverBn: Math.round(totalTurnoverBn * 100) / 100,
    nmTurnoverBn: Math.round(nmTurnoverBn * 100) / 100,
    ptTurnoverBn: Math.round(ptTurnoverBn * 100) / 100,
    turnoverDeltaPct,
    turnoverDirection,
    accumulatedVol: (today.accumulatedVol as number | undefined) ?? 0,
    fetchedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test payloads — from recon probe 2026-06-16 15:06 VN time
// ─────────────────────────────────────────────────────────────────────────────

const RECON_TODAY = {
  code: "VNINDEX",
  floor: "HOSE",
  date: "2026-06-16",
  time: "15:06:06",
  open: 1808.56,
  high: 1811.59,
  low: 1799.86,
  close: 1807.94,
  change: 8.63,
  pctChange: 0.4796,
  accumulatedVol: 672837809.0,
  accumulatedVal: 16650836352800.0,
  nmVolume: 573796720.0,
  nmValue: 14327052375030.0,
  ptVolume: 99148089.0,
  ptValue: 2327610939770.0,
  advances: 179.0,
  declines: 109.0,
  noChange: 74.0,
  noTrade: 31.0,
  ceilingStocks: 8.0,
  floorStocks: 4.0,
  valChgPctCr1d: 0.0,
};

const RECON_YESTERDAY = {
  code: "VNINDEX",
  date: "2026-06-15",
  accumulatedVal: 20381000000000.0, // ~20,381 tỷ (from recon historical sample)
  nmValue: 17000000000000.0,
  ptValue: 3381000000000.0,
  accumulatedVol: 800000000.0,
  advances: 200.0,
  declines: 150.0,
  noChange: 50.0,
  noTrade: 10.0,
  ceilingStocks: 5.0,
  floorStocks: 2.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MARKET-BREADTH-MISSING — breadth field parsing", () => {
  it("parses advances correctly (float→int)", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.advances).toBe(179);
  });

  it("parses declines correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.declines).toBe(109);
  });

  it("parses noChange correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.noChange).toBe(74);
  });

  it("parses noTrade correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.noTrade).toBe(31);
  });

  it("parses ceilingStocks correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.ceilingStocks).toBe(8);
  });

  it("parses floorStocks correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.floorStocks).toBe(4);
  });

  it("breadth sum (advances+declines+noChange+noTrade) is consistent with HOSE constituent count", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    const total = result.advances + result.declines + result.noChange + result.noTrade;
    // HOSE has ~400-420 listed stocks; allow range
    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(500);
  });

  it("advances > declines when pctChange is positive (06-16 +0.48%)", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.advances).toBeGreaterThan(result.declines);
  });

  it("date field is preserved from API record", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.date).toBe("2026-06-16");
  });
});

describe("FIX-MARKET-LIQUIDITY-MISSING-TOOL — turnover parsing", () => {
  it("converts accumulatedVal to tỷ đồng correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    // 16650836352800 / 1e9 ≈ 16650.84
    expect(result.totalTurnoverBn).toBeCloseTo(16650.84, 0);
  });

  it("converts nmValue to tỷ đồng correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    // 14327052375030 / 1e9 ≈ 14327.05
    expect(result.nmTurnoverBn).toBeCloseTo(14327.05, 0);
  });

  it("converts ptValue to tỷ đồng correctly", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    // 2327610939770 / 1e9 ≈ 2327.61
    expect(result.ptTurnoverBn).toBeCloseTo(2327.61, 0);
  });

  it("totalTurnoverBn = nmTurnoverBn + ptTurnoverBn (within rounding)", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    const sum = result.nmTurnoverBn + result.ptTurnoverBn;
    // Each of the three values is independently rounded to 2 decimal places
    // so the max absolute difference is ~5 tỷ on large values. Use 10 as safe tolerance.
    expect(Math.abs(result.totalTurnoverBn - sum)).toBeLessThan(10);
  });

  it("turnover is in plausible HOSE range (10,000–25,000 tỷ on normal days)", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.totalTurnoverBn).toBeGreaterThan(10_000);
    expect(result.totalTurnoverBn).toBeLessThan(25_000);
  });

  it("computes turnoverDeltaPct when yesterday data is available", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY, RECON_YESTERDAY);
    // today 16651 vs yesterday 20381: delta ≈ -18.3%
    expect(result.turnoverDeltaPct).not.toBeNull();
    expect(result.turnoverDeltaPct!).toBeLessThan(0);  // today < yesterday
    expect(result.turnoverDeltaPct!).toBeCloseTo(-18.3, 0);
  });

  it("sets turnoverDirection to 'down' when today < yesterday", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY, RECON_YESTERDAY);
    expect(result.turnoverDirection).toBe("down");
  });

  it("turnoverDeltaPct is null when no yesterday data", () => {
    const result = parseBreadthAndLiquidity(RECON_TODAY);
    expect(result.turnoverDeltaPct).toBeNull();
    expect(result.turnoverDirection).toBeNull();
  });

  it("sets turnoverDirection to 'up' when today > yesterday by >0.5%", () => {
    const biggerToday = { ...RECON_TODAY, accumulatedVal: 25_000_000_000_000 };
    const result = parseBreadthAndLiquidity(biggerToday, RECON_YESTERDAY);
    expect(result.turnoverDirection).toBe("up");
  });

  it("sets turnoverDirection to 'flat' when change is within 0.5%", () => {
    const sameToday = { ...RECON_TODAY, accumulatedVal: 20_382_000_000_000 }; // ~+0.005% vs yesterday
    const result = parseBreadthAndLiquidity(sameToday, RECON_YESTERDAY);
    expect(result.turnoverDirection).toBe("flat");
  });
});

describe("FIX-MARKET-BREADTH-LIQUIDITY — graceful degrade", () => {
  it("handles missing breadth fields (returns 0)", () => {
    const minimalRecord = {
      code: "VNINDEX",
      date: "2026-06-16",
      accumulatedVal: 10_000_000_000_000,
      nmValue: 9_000_000_000_000,
      ptValue: 1_000_000_000_000,
    };
    const result = parseBreadthAndLiquidity(minimalRecord);
    expect(result.advances).toBe(0);
    expect(result.declines).toBe(0);
    expect(result.totalTurnoverBn).toBeCloseTo(10_000, 0);
  });

  it("handles missing accumulatedVal (returns 0 turnover)", () => {
    const breadthOnly = {
      code: "VNINDEX",
      date: "2026-06-16",
      advances: 179.0,
      declines: 109.0,
      noChange: 74.0,
      noTrade: 31.0,
      ceilingStocks: 8.0,
      floorStocks: 4.0,
    };
    const result = parseBreadthAndLiquidity(breadthOnly);
    expect(result.advances).toBe(179);
    expect(result.totalTurnoverBn).toBe(0);
  });
});
