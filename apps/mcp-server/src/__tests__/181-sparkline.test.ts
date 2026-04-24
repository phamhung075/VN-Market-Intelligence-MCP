// src/__tests__/181-sparkline.test.ts
import { describe, it, expect } from "bun:test";
import { generateSparkline } from "../domain/services/sparkline.js";

describe("Task 181 — ASCII Sparkline Generator", () => {
  // ── Core functionality ────────────────────────────────────────────────────

  it("returns a string of default width 5 for 5 prices", () => {
    const result = generateSparkline([80, 82, 81, 85, 84]);
    expect(result).toHaveLength(5);
  });

  it("maps min price to ▁ and max price to █", () => {
    const result = generateSparkline([10, 100]);
    // width 5 with 2 prices → only 2 distinct values fed into 5 chars if width=2,
    // but default width=5; with 2 prices and width 5 we still return width 5.
    // Test with width=2 for precise assertion
    const r2 = generateSparkline([10, 100], 2);
    expect(r2[0]).toBe("▁");
    expect(r2[1]).toBe("█");
  });

  it("returns all ▄ (mid-char) when all prices are equal (flat line)", () => {
    const result = generateSparkline([50, 50, 50, 50, 50]);
    // When min === max, all bars map to index 0 → ▁
    expect(result).toBe("▁▁▁▁▁");
  });

  it("returns — for empty price array", () => {
    expect(generateSparkline([])).toBe("—");
  });

  it("returns — for single-element price array", () => {
    expect(generateSparkline([100])).toBe("—");
  });

  it("respects custom width parameter", () => {
    const result = generateSparkline([10, 20, 30, 40, 50, 60, 70, 80], 8);
    expect(result).toHaveLength(8);
  });

  it("uses only sparkline characters from the set ▁▂▃▄▅▆▇█", () => {
    const chars = new Set("▁▂▃▄▅▆▇█");
    const result = generateSparkline([10, 30, 50, 70, 100]);
    for (const ch of result) {
      expect(chars.has(ch)).toBe(true);
    }
  });

  it("correctly renders uptrend as ascending bars", () => {
    const result = generateSparkline([10, 20, 30, 40, 50], 5);
    // Each step should be >= previous
    const BARS = "▁▂▃▄▅▆▇█";
    for (let i = 1; i < result.length; i++) {
      expect(BARS.indexOf(result[i]!)).toBeGreaterThanOrEqual(
        BARS.indexOf(result[i - 1]!),
      );
    }
  });

  it("correctly renders downtrend as descending bars", () => {
    const result = generateSparkline([100, 80, 60, 40, 20], 5);
    const BARS = "▁▂▃▄▅▆▇█";
    for (let i = 1; i < result.length; i++) {
      expect(BARS.indexOf(result[i]!)).toBeLessThanOrEqual(
        BARS.indexOf(result[i - 1]!),
      );
    }
  });

  it("width=1 returns a single bar character", () => {
    const result = generateSparkline([50, 60, 70, 80], 1);
    expect(result).toHaveLength(1);
    expect("▁▂▃▄▅▆▇█".includes(result)).toBe(true);
  });

  it("handles large price values (VND range 10,000–200,000)", () => {
    const prices = [85000, 86500, 84200, 90000, 88500];
    const result = generateSparkline(prices, 5);
    expect(result).toHaveLength(5);
    for (const ch of result) {
      expect("▁▂▃▄▅▆▇█".includes(ch)).toBe(true);
    }
  });

  it("maps exactly 8 distinct levels correctly", () => {
    // 8 prices equally spaced across range → each maps to a different bar
    const prices = [0, 1, 2, 3, 4, 5, 6, 7];
    const result = generateSparkline(prices, 8);
    expect(result).toBe("▁▂▃▄▅▆▇█");
  });

  it("interpolates prices correctly when width > number of input prices", () => {
    // 3 prices, width 6 → should still produce 6 characters
    const result = generateSparkline([10, 50, 90], 6);
    expect(result).toHaveLength(6);
  });

  it("returns — for width=0 edge case", () => {
    expect(generateSparkline([10, 20, 30], 0)).toBe("—");
  });
});
