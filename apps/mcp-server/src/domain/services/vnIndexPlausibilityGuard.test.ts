/**
 * FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE — Unit Tests
 *
 * evaluateVnIndexPlausibility() — pure domain guard comparing the
 * macro-indicators service's reported vnIndex against apps/mcp-server's own
 * local reference (vn_index_cache / market_prices.VNINDEX), per the
 * architect's brownfield design (docs/handoffs/
 * FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE-BA-spec.md § [Architect]
 * Brownfield Findings §B).
 *
 * Cases (per architect's Test strategy §E):
 *   - within-band pass
 *   - >=5% fail both directions (macro above / macro below local)
 *   - boundary exactly 5.00% fails (inclusive)
 *   - local-unavailable + tier-1 -> fail-open
 *   - local-unavailable + tier-4 -> fail-closed
 *   - macroSourceTier defensive >=3 branch (documented as not live-reachable
 *     today — vnIndex tier is verified binary 1/4 in the Go source, but the
 *     guard must still handle 2/3 defensively for forward-compat)
 *
 * @module domain/services/vnIndexPlausibilityGuard.test
 */

import { describe, it, expect } from "bun:test";
import {
  evaluateVnIndexPlausibility,
  VNINDEX_CROSS_PLANE_DIVERGENCE_THRESHOLD_PCT,
  type VnIndexPlausibilityInput,
} from "./vnIndexPlausibilityGuard.js";

function baseInput(overrides: Partial<VnIndexPlausibilityInput> = {}): VnIndexPlausibilityInput {
  return {
    macroVnIndex: 1782.12,
    macroIsEstimate: false,
    macroSourceTier: 1,
    localVnIndex: 1782.12,
    localReferenceTrustworthy: true,
    ...overrides,
  };
}

describe("evaluateVnIndexPlausibility", () => {
  it("threshold constant is 5 (EC-3: level-vs-level, local-denominator)", () => {
    expect(VNINDEX_CROSS_PLANE_DIVERGENCE_THRESHOLD_PCT).toBe(5);
  });

  it("PASS-1: within-band divergence (well under 5%) is trustworthy", () => {
    const result = evaluateVnIndexPlausibility(
      baseInput({ macroVnIndex: 1785.0, localVnIndex: 1782.12 }),
    );
    expect(result.trustworthy).toBe(true);
    if (result.trustworthy) {
      expect(result.divergencePct).not.toBeNull();
      expect(result.divergencePct!).toBeLessThan(5);
    }
  });

  it("FAIL-1: macro ABOVE local by >5% -> cross_plane_divergence", () => {
    // 07-15 incident inverse direction sanity: macro higher than local
    const result = evaluateVnIndexPlausibility(
      baseInput({ macroVnIndex: 1900.0, localVnIndex: 1782.12 }),
    );
    expect(result.trustworthy).toBe(false);
    if (!result.trustworthy) {
      expect(result.reason).toBe("cross_plane_divergence");
    }
  });

  it("FAIL-2: macro BELOW local by >5% -> cross_plane_divergence (the actual 07-15 incident shape)", () => {
    // Reproduces the 07-15 incident inputs: macroVnIndex=1280.5 (tier4/estimate) vs local=1782.12
    const result = evaluateVnIndexPlausibility(
      baseInput({
        macroVnIndex: 1280.5,
        macroIsEstimate: true,
        macroSourceTier: 4,
        localVnIndex: 1782.12,
      }),
    );
    expect(result.trustworthy).toBe(false);
    if (!result.trustworthy && result.reason === "cross_plane_divergence") {
      expect(result.divergencePct).toBeCloseTo(((1782.12 - 1280.5) / 1782.12) * 100, 1);
    }
  });

  it("BOUNDARY: exactly 5.00% divergence fails (inclusive, matches macroOutlierGuard.ts convention)", () => {
    const local = 1000;
    const macro = local * 1.05; // exactly +5.00%
    const result = evaluateVnIndexPlausibility(
      baseInput({ macroVnIndex: macro, localVnIndex: local }),
    );
    expect(result.trustworthy).toBe(false);
    if (!result.trustworthy && result.reason === "cross_plane_divergence") {
      expect(result.divergencePct).toBeCloseTo(5, 6);
    }
  });

  it("BOUNDARY: just under 5% (4.99%) passes", () => {
    const local = 1000;
    const macro = local * 1.0499;
    const result = evaluateVnIndexPlausibility(
      baseInput({ macroVnIndex: macro, localVnIndex: local }),
    );
    expect(result.trustworthy).toBe(true);
  });

  it("EC-1 fail-OPEN: local reference untrustworthy but macro is tier-1 live -> serve as today (trustworthy, unevaluated)", () => {
    const result = evaluateVnIndexPlausibility(
      baseInput({
        macroIsEstimate: false,
        macroSourceTier: 1,
        localVnIndex: null,
        localReferenceTrustworthy: false,
      }),
    );
    expect(result.trustworthy).toBe(true);
    if (result.trustworthy) {
      expect(result.divergencePct).toBeNull();
    }
  });

  it("EC-1 fail-CLOSED: local reference untrustworthy AND macro is_estimate=true -> both_sides_untrustworthy", () => {
    const result = evaluateVnIndexPlausibility(
      baseInput({
        macroIsEstimate: true,
        macroSourceTier: 4,
        localVnIndex: null,
        localReferenceTrustworthy: false,
      }),
    );
    expect(result.trustworthy).toBe(false);
    if (!result.trustworthy) {
      expect(result.reason).toBe("both_sides_untrustworthy");
    }
  });

  it("EC-1 fail-CLOSED: local reference untrustworthy AND macroSourceTier>=3 (even if is_estimate=false) -> both_sides_untrustworthy", () => {
    // Defensive forward-compat branch — not live-reachable today (vnIndex tier is
    // verified binary 1/4 in usecases.go), but the guard must still honor it.
    const result = evaluateVnIndexPlausibility(
      baseInput({
        macroIsEstimate: false,
        macroSourceTier: 3,
        localVnIndex: null,
        localReferenceTrustworthy: false,
      }),
    );
    expect(result.trustworthy).toBe(false);
    if (!result.trustworthy) {
      expect(result.reason).toBe("both_sides_untrustworthy");
    }
  });

  it("FR-2 unconditional check: divergence fires even when macro reports tier-1/is_estimate=false (defense-in-depth against mislabeling)", () => {
    const result = evaluateVnIndexPlausibility(
      baseInput({
        macroVnIndex: 1280.5,
        macroIsEstimate: false, // mislabeled as tier-1 live, but value is still garbage
        macroSourceTier: 1,
        localVnIndex: 1782.12,
        localReferenceTrustworthy: true,
      }),
    );
    expect(result.trustworthy).toBe(false);
    if (!result.trustworthy) {
      expect(result.reason).toBe("cross_plane_divergence");
    }
  });
});
