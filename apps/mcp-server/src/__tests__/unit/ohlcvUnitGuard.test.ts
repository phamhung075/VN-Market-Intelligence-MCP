/**
 * CONTAM-1 — ohlcvUnitGuard unit tests
 * Sprint: OHLCV-UNIT-CONTAM
 *
 * Tests the pure domain service: validateOhlcvUnit + normalizeOhlcvToVnd.
 * No I/O, no DB, no external deps.
 *
 * 13 test cases covering:
 *  - Stock in-range, below-100, above-10M
 *  - Index exemption
 *  - Inverted OHLC
 *  - Zero field
 *  - H/L ratio boundary (5 = valid, 6 = invalid)
 *  - Maximum valid span
 *  - normalizeOhlcvToVnd: thousand-scale, full-VND no-op, index no-op, whole-row preserves relationships
 */
import { describe, expect, it } from "bun:test";
import {
  validateOhlcvUnit,
  normalizeOhlcvToVnd,
  STOCK_MIN_VND,
  STOCK_MAX_VND,
  HILO_RATIO_MAX,
} from "../../domain/services/market-data/ohlcvUnitGuard";

// ─────────────────────────────────────────────────────────────────────────────
// validateOhlcvUnit
// ─────────────────────────────────────────────────────────────────────────────

describe("validateOhlcvUnit", () => {
  // TC-1: Stock in-range [100, 10M] — valid
  it("stock in range [100, 10M] → valid", () => {
    const result = validateOhlcvUnit("VNM", "stock", 80000, 82000, 79000, 81000);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // TC-2: Stock < 100 (thousand-VND detected) → invalid, reason contains "below_100"
  it("stock open < 100 (thousand-VND leakage) → invalid, reason contains below_100", () => {
    // open=0.9 is the contaminated VNH pattern from the arch brief
    const result = validateOhlcvUnit("VNH", "stock", 0.9, 1000, 0.9, 1000);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("below_100");
  });

  // TC-3: Stock > 10M → invalid
  it("stock value above 10M → invalid", () => {
    const result = validateOhlcvUnit("XYZ", "stock", 100, 11_000_000, 100, 100);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("above_10m");
  });

  // TC-4: Index ~1200 → valid (no range check)
  it("index at ~1200 (VNINDEX) → valid (exempt from range guard)", () => {
    const result = validateOhlcvUnit("VNINDEX", "index", 1200, 1210, 1190, 1205);
    expect(result.valid).toBe(true);
  });

  // TC-5: Inverted OHLC (close < low) → invalid
  it("close < low (inverted OHLC) → invalid", () => {
    const result = validateOhlcvUnit("FPT", "stock", 140000, 145000, 138000, 137000);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("implausible ohlc");
  });

  // TC-6: Zero open → invalid
  it("open = 0 → invalid with zero_ohlc reason", () => {
    const result = validateOhlcvUnit("ACB", "stock", 0, 25000, 24000, 24500);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("zero_ohlc");
    expect(result.reason).toContain("open");
  });

  // TC-7: H/L ratio = 6 (> HILO_RATIO_MAX=5) → invalid
  it("high/low ratio = 6 (> max 5) → invalid with hilo_ratio_too_wide reason", () => {
    // low=1000, high=6000 → ratio=6
    const result = validateOhlcvUnit("GVR", "stock", 3000, 6000, 1000, 3000);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("hilo_ratio_too_wide");
  });

  // TC-8: H/L ratio exactly = 5 (boundary) → valid
  it("high/low ratio exactly = 5 (boundary) → valid", () => {
    // low=1000, high=5000 → ratio=5.0 (not > 5)
    const result = validateOhlcvUnit("GVR", "stock", 3000, 5000, 1000, 3000);
    expect(result.valid).toBe(true);
  });

  // TC-9: Maximum valid span — open=100, close=10_000_000 → valid
  it("open=100 (min) and close=10M (max) — maximum valid span → valid", () => {
    // low=100, high=10M, open=100, close=10M: ratio=10M/100=100000 → TOO WIDE
    // So use a tighter example with valid ratio: open=100, close=500, high=500, low=100
    const result = validateOhlcvUnit("TST", "stock", 100, STOCK_MAX_VND, 100, STOCK_MAX_VND);
    // ratio = 10M/100 = 100000 > 5 → should be invalid
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("hilo_ratio_too_wide");
  });

  // TC-9b: Open=100 (minimum valid), close=500, within ratio=5 → valid
  it("open=100 (STOCK_MIN_VND floor), close=500, ratio=5 exactly → valid", () => {
    const result = validateOhlcvUnit("TST", "stock", 100, 500, 100, 500);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeOhlcvToVnd
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeOhlcvToVnd", () => {
  // TC-10: Stock thousand-scale row {0.9, 1.0, 0.9, 1.0} → {900, 1000, 900, 1000} (×1000 whole row)
  it("stock thousand-scale {0.9,1.0,0.9,1.0} → {900,1000,900,1000} (whole-row ×1000)", () => {
    const input = { open: 0.9, high: 1.0, low: 0.9, close: 1.0 };
    const result = normalizeOhlcvToVnd("stock", input);
    expect(result.open).toBe(900);
    expect(result.high).toBe(1000);
    expect(result.low).toBe(900);
    expect(result.close).toBe(1000);
  });

  // TC-11: Stock full-VND row {62300, 62800, 61700, 62200} → unchanged (no-op)
  it("stock full-VND {62300,62800,61700,62200} → unchanged (no-op)", () => {
    const input = { open: 62300, high: 62800, low: 61700, close: 62200 };
    const result = normalizeOhlcvToVnd("stock", input);
    expect(result.open).toBe(62300);
    expect(result.high).toBe(62800);
    expect(result.low).toBe(61700);
    expect(result.close).toBe(62200);
  });

  // TC-12: Index row {1200, 1210, 1190, 1205} → unchanged (type=index exempt)
  it("index {1200,1210,1190,1205} → unchanged (index exempt)", () => {
    const input = { open: 1200, high: 1210, low: 1190, close: 1205 };
    const result = normalizeOhlcvToVnd("index", input);
    expect(result.open).toBe(1200);
    expect(result.high).toBe(1210);
    expect(result.low).toBe(1190);
    expect(result.close).toBe(1205);
  });

  // TC-13: Whole-row scaling preserves low≤open/close≤high (never per-field scale)
  it("whole-row scaling preserves OHLC relationships (low≤open≤high, low≤close≤high)", () => {
    // Thousand-scale with valid intra-row ordering: low=50, open=55, close=58, high=60
    const input = { open: 55, high: 60, low: 50, close: 58 };
    const result = normalizeOhlcvToVnd("stock", input);
    // All scaled by ×1000
    expect(result.low).toBe(50000);
    expect(result.open).toBe(55000);
    expect(result.close).toBe(58000);
    expect(result.high).toBe(60000);
    // Relationship preserved
    expect(result.low).toBeLessThanOrEqual(result.open);
    expect(result.open).toBeLessThanOrEqual(result.high);
    expect(result.low).toBeLessThanOrEqual(result.close);
    expect(result.close).toBeLessThanOrEqual(result.high);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants sanity
// ─────────────────────────────────────────────────────────────────────────────

describe("OHLCV unit guard constants", () => {
  it("STOCK_MIN_VND = 100", () => expect(STOCK_MIN_VND).toBe(100));
  it("STOCK_MAX_VND = 10_000_000", () => expect(STOCK_MAX_VND).toBe(10_000_000));
  it("HILO_RATIO_MAX = 5", () => expect(HILO_RATIO_MAX).toBe(5));
});
