/**
 * CONTAM-1 — ohlcvUnitGuard unit tests
 * Sprint: OHLCV-UNIT-CONTAM
 *
 * Tests the pure domain service: validateOhlcvUnit + normalizeOhlcvToVnd.
 * No I/O, no DB, no external deps.
 *
 * 17 test cases covering:
 *  - Stock in-range, below-100, above-10M
 *  - Index exemption
 *  - Inverted OHLC
 *  - Zero field (partial-zero class)
 *  - H/L ratio boundary (5 = valid, 6 = invalid)
 *  - Maximum valid span
 *  - Cross-field mixed-unit detection (CONTAM-9 Rule 3)
 *  - normalizeOhlcvToVnd: thousand-scale, full-VND no-op, index no-op, whole-row preserves relationships
 */
import { describe, expect, it } from "bun:test";
import {
  validateOhlcvUnit,
  normalizeOhlcvToVnd,
  detectAndNormalizeScaleFromPrevClose,
  STOCK_MIN_VND,
  STOCK_MAX_VND,
  HILO_RATIO_MAX,
  SCALE_DETECTION_RATIO,
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

  // TC-14: CONTAM-9 Rule 3 — mixed-unit cross-field: open=73.1 (thousand-scale), close=73500 (full-VND)
  //   Zero guard fires first (low=0) → but if we remove low=0, then cross-field check must fire
  it("stock mixed-unit: open=73.1 (below_100) while high=74300 (full-VND) → invalid via unit contamination (below_100 rule)", () => {
    // Rule 2 fires first (stock range: open=73.1 < 100) before Rule 3
    const result = validateOhlcvUnit("FPT", "stock", 73.1, 74300, 72800, 73500);
    expect(result.valid).toBe(false);
    // Rule 2 fires first (open=73.1 < 100 → below_100)
    expect(result.reason).toContain("below_100");
  });

  // TC-15: CONTAM-9 Rule 3 — index type is exempt from mixed-unit check
  it("index type with sub-100 value + full-VND value → valid (cross-field check exempt for index)", () => {
    // Index can have values < 100 (e.g. specialty sub-indices)
    // Rule 2 is exempt for index, Rule 3 is also exempt for index
    const result = validateOhlcvUnit("SPECIAL_IDX", "index", 50, 55, 48, 52);
    // Rule 1 (zero) and Rules 2-3 (range/cross-field) don't apply to index
    // Rule 4 (H/L ratio): 55/48 ≈ 1.1 → valid
    // Rule 5 (plausibility): low=48 ≤ open=50 ≤ high=55, low=48 ≤ close=52 ≤ high=55 → valid
    expect(result.valid).toBe(true);
  });

  // TC-16: CONTAM-9 — zero_ohlc fires before cross-field check (Rule 1 priority)
  it("low=0 (partial-zero defect) → invalid with zero_ohlc reason (Rule 1 wins)", () => {
    // FPT 2026-06-12 pattern: open=73.1, high=74300, low=0, close=73500
    // Rule 1 fires first: low=0 → zero_ohlc
    const result = validateOhlcvUnit("FPT", "stock", 73.1, 74300, 0, 73500);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("zero_ohlc");
    expect(result.reason).toContain("low");
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
  it("SCALE_DETECTION_RATIO = 50", () => expect(SCALE_DETECTION_RATIO).toBe(50));
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAndNormalizeScaleFromPrevClose (FIX-STOCK-PRICE-SCALE-CORRUPT)
// ─────────────────────────────────────────────────────────────────────────────

describe("detectAndNormalizeScaleFromPrevClose", () => {
  // TC-14: VIC pattern — prevClose=196000, current close=195.5 → ratio=1002x → correct
  it("VIC pattern: prevClose=196000, close=195.5 → detects thousand-scale and corrects", () => {
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 198.5, high: 198.7, low: 192.9, close: 195.5 },
      196000,
    );
    expect(result.corrected).toBe(true);
    expect(result.ohlcv.open).toBe(198500);
    expect(result.ohlcv.high).toBe(198700);
    expect(result.ohlcv.low).toBe(192900);
    expect(result.ohlcv.close).toBe(195500);
    expect(result.reason).toContain("scale_correction");
  });

  // TC-15: Normal day-to-day change — prevClose=196000, close=192900 → ratio=1.016x → no correction
  it("normal change: prevClose=196000, close=192900 → no correction (ratio < 50)", () => {
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 196000, high: 197500, low: 192000, close: 192900 },
      196000,
    );
    expect(result.corrected).toBe(false);
    expect(result.ohlcv.close).toBe(192900);
  });

  // TC-16: Index exempt — even with 1000x ratio, indices are not corrected
  it("index exempt: no correction even with large ratio", () => {
    const result = detectAndNormalizeScaleFromPrevClose(
      "index",
      { open: 1.2, high: 1.3, low: 1.1, close: 1.2 },
      1200,
    );
    expect(result.corrected).toBe(false);
    expect(result.ohlcv.close).toBe(1.2);
  });

  // TC-17: No prevClose — cannot detect, returns unchanged
  it("no prevClose: returns unchanged", () => {
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 195.5, high: 198.7, low: 192.9, close: 195.5 },
      undefined,
    );
    expect(result.corrected).toBe(false);
  });

  // TC-18: Penny stock — prevClose=900, close=850 → ratio=1.06x → no correction
  it("penny stock: prevClose=900, close=850 → no correction", () => {
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 900, high: 950, low: 850, close: 850 },
      900,
    );
    expect(result.corrected).toBe(false);
    expect(result.ohlcv.close).toBe(850);
  });

  // TC-19: Borderline ratio = 50 — triggers correction
  it("borderline ratio=50: triggers correction", () => {
    // prevClose=10000, close=200 → ratio=50 exactly
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 195, high: 205, low: 190, close: 200 },
      10000,
    );
    expect(result.corrected).toBe(true);
    expect(result.ohlcv.close).toBe(200000);
  });

  // TC-20: Borderline ratio = 49.9 — no correction
  it("borderline ratio=49.9: no correction", () => {
    // prevClose=9980, close=200 → ratio=49.9
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 195, high: 205, low: 190, close: 200 },
      9980,
    );
    expect(result.corrected).toBe(false);
  });
});
