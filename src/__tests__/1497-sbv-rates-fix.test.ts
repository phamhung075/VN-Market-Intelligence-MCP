/**
 * 1497-sbv-rates-fix — RED phase
 *
 * Bug: `Bun.env["SBV_*"] ?? "3.0"` passes empty string through to parseFloat.
 * parseFloat("") === NaN. The NaN guard in fetchSbvRates() then returns 0
 * instead of the expected defaults (3.0 / 4.5).
 *
 * Fix needed: replace `??` with `||` so empty string falls through to the
 * numeric-string literal.
 *
 * RED: assertions 1 and 2 FAIL against current production code.
 * Assertion 3 passes today and must remain passing after fix.
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Replicate the production constant expression so tests are not import-order
// dependent (module-level constants are evaluated once at load time).
// Tests exercise the SAME expression that sbv.ts uses at lines 53-58.
// ---------------------------------------------------------------------------

/**
 * Returns what DEFAULT_OVERNIGHT_RATE / DEFAULT_REFINANCING_RATE evaluates to
 * under the CURRENT production pattern (using ??).
 */
function currentSbvDefault(envValue: string | undefined, fallback: string): number {
  // Exact current code: parseFloat(Bun.env["SBV_*"] ?? "3.0")
  return parseFloat(envValue ?? fallback);
}

describe("1497 SBV rates — empty env var must yield numeric default, not NaN", () => {
  /**
   * RED test 1: empty SBV_OVERNIGHT_RATE must produce 3.0
   *
   * Current code: parseFloat("" ?? "3.0") = parseFloat("") = NaN
   * Expected: 3.0
   * Result: FAIL (NaN !== 3.0)
   */
  it("empty SBV_OVERNIGHT_RATE string → DEFAULT_OVERNIGHT_RATE must be 3.0", () => {
    const envValue = ""; // SBV_OVERNIGHT_RATE=""
    const actual = currentSbvDefault(envValue, "3.0");
    // This assertion FAILS in RED — NaN is not 3.0
    expect(actual).toBe(3.0);
  });

  /**
   * RED test 2: empty SBV_REFINANCING_RATE must produce 4.5
   *
   * Current code: parseFloat("" ?? "4.5") = parseFloat("") = NaN
   * Expected: 4.5
   * Result: FAIL (NaN !== 4.5)
   */
  it("empty SBV_REFINANCING_RATE string → DEFAULT_REFINANCING_RATE must be 4.5", () => {
    const envValue = ""; // SBV_REFINANCING_RATE=""
    const actual = currentSbvDefault(envValue, "4.5");
    // This assertion FAILS in RED — NaN is not 4.5
    expect(actual).toBe(4.5);
  });

  /**
   * Regression test: explicit "4.0" value must be respected.
   * Both current code and fix handle this correctly — must stay green.
   */
  it("explicit SBV_OVERNIGHT_RATE='4.0' → value 4.0 respected", () => {
    const envValue = "4.0";
    const actual = currentSbvDefault(envValue, "3.0");
    expect(actual).toBe(4.0);
  });
});
