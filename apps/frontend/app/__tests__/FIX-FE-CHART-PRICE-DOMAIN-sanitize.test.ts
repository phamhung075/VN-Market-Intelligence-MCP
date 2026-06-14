/**
 * FIX-FE-CHART-PRICE-DOMAIN-sanitize.test.ts
 *
 * Unit tests for sanitizePrices() — the defense-in-depth series cleaner
 * added to indicators.ts (task FIX-FE-CHART-PRICE-DOMAIN).
 *
 * Two guarantees tested generically (no per-ticker hardcode):
 *  1. Non-trading-day poison rows (close===0 && volume===0) are dropped.
 *  2. Obvious 1000x-scale outliers are clamped via forward-fill.
 *
 * Acceptance tickers from spec: SHB ~13.8k, VCB ~61.6k, FPT ~73.5k.
 */

import { describe, it, expect } from "vitest";
import { sanitizePrices } from "~/components/charts/indicators";
import type { PricePoint } from "~/domain/market";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(
  date: string,
  close: number,
  volume = 1_000_000,
  overrides: Partial<PricePoint> = {},
): PricePoint {
  return {
    date,
    code: "TEST",
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — Pass-through: clean series unchanged
// ---------------------------------------------------------------------------

describe("sanitizePrices — clean series", () => {
  it("returns same length for a fully clean series", () => {
    const prices = [
      makeRow("2026-05-01", 61_500),
      makeRow("2026-05-02", 61_700),
      makeRow("2026-05-05", 61_600),
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(3);
  });

  it("preserves close values exactly for a clean series", () => {
    const prices = [makeRow("2026-05-01", 13_800), makeRow("2026-05-02", 13_850)];
    const result = sanitizePrices(prices);
    expect(result[0]!.close).toBe(13_800);
    expect(result[1]!.close).toBe(13_850);
  });

  it("does not mutate the input array", () => {
    const prices = [makeRow("2026-05-01", 73_000), makeRow("2026-05-02", 73_100)];
    const copy = prices.map((p) => ({ ...p }));
    sanitizePrices(prices);
    expect(prices[0]!.close).toBe(copy[0]!.close);
    expect(prices[1]!.close).toBe(copy[1]!.close);
  });

  it("returns empty array for empty input", () => {
    expect(sanitizePrices([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Part 1: drop close===0 && volume===0 rows (non-trading-day)
// ---------------------------------------------------------------------------

describe("sanitizePrices — non-trading-day drop (close===0 && volume===0)", () => {
  it("drops a single poison row from the middle of the series", () => {
    const prices = [
      makeRow("2026-05-29", 61_600),
      makeRow("2026-05-30", 0, 0), // poison — weekend placeholder
      makeRow("2026-06-02", 61_800),
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.date)).toEqual(["2026-05-29", "2026-06-02"]);
  });

  it("drops poison row at the start", () => {
    const prices = [
      makeRow("2026-05-25", 0, 0),
      makeRow("2026-05-26", 13_800),
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe("2026-05-26");
  });

  it("drops multiple poison rows when several are present", () => {
    const prices = [
      makeRow("2026-05-29", 73_000),
      makeRow("2026-05-30", 0, 0), // Saturday
      makeRow("2026-05-31", 0, 0), // Sunday
      makeRow("2026-06-02", 73_100),
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe("2026-05-29");
    expect(result[1]!.date).toBe("2026-06-02");
  });

  it("does NOT drop a row that has close===0 but volume > 0 (genuine edge case)", () => {
    const prices = [
      makeRow("2026-05-01", 61_500),
      makeRow("2026-05-02", 0, 500_000), // volume present — keep it
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(2);
  });

  it("does NOT drop a row with volume===0 but close > 0 (thinly traded)", () => {
    const prices = [
      makeRow("2026-05-01", 13_800),
      makeRow("2026-05-02", 13_900, 0), // no volume but price is real
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(2);
  });

  it("verifies no close===0 row remains after sanitization when volume===0", () => {
    const prices = [
      makeRow("2026-05-29", 61_600),
      makeRow("2026-05-30", 0, 0),
      makeRow("2026-06-02", 61_800),
    ];
    const result = sanitizePrices(prices);
    expect(result.every((r) => !(r.close === 0 && (r.volume ?? 0) === 0))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Part 2: clamp 1000x-scale outliers (forward-fill)
// ---------------------------------------------------------------------------

describe("sanitizePrices — 1000x-scale outlier clamp", () => {
  it("clamps a 1000x outlier to the previous valid close (VCB pattern)", () => {
    // VCB median ~61 600; the outlier is close=62 (×1000 off)
    const prices = [
      makeRow("2026-05-29", 61_600),
      makeRow("2026-05-30", 61_700),
      makeRow("2026-06-01", 62),  // outlier — should be ~61 600, was stored as 0.062k
      makeRow("2026-06-02", 61_800),
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(4);
    // The outlier row should be forward-filled to the previous valid close
    expect(result[2]!.close).toBeCloseTo(61_700, 0);
  });

  it("clamps a 1000x upward outlier (close > 10× median)", () => {
    const prices = [
      makeRow("2026-05-29", 73_000),
      makeRow("2026-05-30", 73_000_000), // clearly 1000× over median — outlier
      makeRow("2026-06-02", 73_100),
    ];
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(3);
    // Outlier at index 1 should be replaced with the previous valid close
    expect(result[1]!.close).toBeCloseTo(73_000, 0);
  });

  it("leaves a non-outlier close intact even if it changed a lot", () => {
    // A 15% jump is real market movement — do NOT clamp
    const prices = [
      makeRow("2026-05-29", 13_800),
      makeRow("2026-05-30", 15_870), // ~15% jump — within 10× ratio, keep it
    ];
    const result = sanitizePrices(prices);
    expect(result[1]!.close).toBe(15_870);
  });

  it("SHB pattern (~13.8k) — no false-positive clamp", () => {
    const prices = Array.from({ length: 20 }, (_, i) =>
      makeRow(`2026-05-${String(i + 1).padStart(2, "0")}`, 13_800 + i * 10),
    );
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(20);
    expect(result[19]!.close).toBe(13_990);
  });

  it("VCB pattern (~61.6k) — no false-positive clamp", () => {
    const prices = Array.from({ length: 20 }, (_, i) =>
      makeRow(`2026-05-${String(i + 1).padStart(2, "0")}`, 61_600 + i * 50),
    );
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(20);
    result.forEach((r) => {
      expect(r.close).toBeGreaterThan(61_000);
      expect(r.close).toBeLessThan(63_000);
    });
  });

  it("FPT pattern (~73.5k) — no false-positive clamp", () => {
    const prices = Array.from({ length: 20 }, (_, i) =>
      makeRow(`2026-05-${String(i + 1).padStart(2, "0")}`, 73_500 + i * 30),
    );
    const result = sanitizePrices(prices);
    expect(result).toHaveLength(20);
    result.forEach((r) => {
      expect(r.close).toBeGreaterThan(73_000);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Combined: poison drop + outlier clamp together
// ---------------------------------------------------------------------------

describe("sanitizePrices — combined poison + outlier (real scenario)", () => {
  it("VCB scenario: drops 2026-05-30 poison AND clamps 2026-06-01 outlier", () => {
    const prices = [
      makeRow("2026-05-29", 61_600),
      makeRow("2026-05-30", 0, 0),    // poison — dropped
      makeRow("2026-06-01", 62),      // 1000x outlier — clamped
      makeRow("2026-06-02", 61_800),
    ];
    const result = sanitizePrices(prices);
    // 3 rows remain (poison dropped)
    expect(result).toHaveLength(3);
    // The outlier row (now at index 1 after drop) should be forward-filled
    expect(result[1]!.close).toBeCloseTo(61_600, 0);
    expect(result[1]!.date).toBe("2026-06-01");
    // Final row unchanged
    expect(result[2]!.close).toBe(61_800);
  });

  it("no close===0 && volume===0 remains after full sanitization", () => {
    const prices = [
      makeRow("2026-05-28", 61_500),
      makeRow("2026-05-30", 0, 0), // poison
      makeRow("2026-05-31", 0, 0), // poison
      makeRow("2026-06-02", 61_700),
    ];
    const result = sanitizePrices(prices);
    expect(result.every((r) => !(r.close === 0 && (r.volume ?? 0) === 0))).toBe(true);
    expect(result).toHaveLength(2);
  });
});
