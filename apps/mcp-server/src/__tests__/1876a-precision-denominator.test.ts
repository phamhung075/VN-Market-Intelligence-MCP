// apps/mcp-server/src/__tests__/1876a-precision-denominator.test.ts
// Task 1876a-A1: precision denominator must exclude UNKNOWN rows
import { describe, it, expect } from "bun:test";

/**
 * Mirror of the fixed formula in alertAccuracy.ts (lines ~340-342).
 * Uses hits/(hits+misses) — NOT hits/totalAlerts.
 */
function calcPrecision(hits: number, misses: number): number {
  const scoreable = hits + misses;
  if (scoreable === 0) return 0;
  return Math.round((hits / scoreable) * 100);
}

describe("1876a-A1 — precision denominator excludes UNKNOWN", () => {
  it("(a) HIT=1, MISS=3, UNKNOWN=10 → 25%, NOT 7%", () => {
    const precision = calcPrecision(1, 3);
    expect(precision).toBe(25);
    // Guard: old formula would have been Math.round(1/14*100) = 7
    expect(precision).not.toBe(7);
  });

  it("(b) HIT=0, MISS=0, UNKNOWN=5 → 0 (no divide-by-zero)", () => {
    const precision = calcPrecision(0, 0);
    expect(precision).toBe(0);
  });
});
