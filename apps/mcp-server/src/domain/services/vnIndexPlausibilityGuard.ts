/**
 * VN-Index Cross-Plane Plausibility Guard — FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE
 *
 * Root incident: a tier-4 `is_estimate` macro_snapshot.vnIndex (1280.5,
 * prevFetchedAt:null) produced a bogus -526.13 "delta" that reached MARKET as
 * fact (dish 933, false ~29% crash) with no same-cycle cross-plane check
 * against apps/mcp-server's own local VN-Index reference.
 *
 * Pure function — no I/O, no side effects, no async. Layer: domain/services
 * (sibling of macroOutlierGuard.ts — same "value-plausibility gate for a
 * macro field" family).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STRUCTURAL LIMIT (write this into every call site's awareness — do not
 * overclaim what this guard catches):
 *
 * macro-indicators' own tier-1 ("live") PRIMARY query
 * (repositories_market_index.go) reads `market_prices.VNINDEX` DIRECTLY off
 * the SAME physical SQLite file apps/mcp-server writes. On the tier-1 happy
 * path, comparing macro-indicators' `vnIndex` against this guard's local
 * reference is the SAME ROW READ TWICE through two DB connections — not a
 * genuine second plane.
 *
 * CAUGHT by this guard: the fixture-fallback branch (the actual 07-15
 * incident — macro-indicators falls back to a hardcoded tier-4 fixture value
 * when its live query fails/returns <=0, at which point it is genuinely NOT
 * reading market_prices at all, so the two planes actually diverge) — this is
 * detected REGARDLESS of what the is_estimate/source_tier flags themselves
 * claim (defends against a mislabeling bug too, e.g. flags say tier-1 but the
 * value is still the fixture).
 *
 * NOT CAUGHT (structural, not a defect to fix here): `market_prices.VNINDEX`
 * itself holding a corrupted/wrong value while macro-indicators' primary
 * query also reads that same row and honestly reports tier-1 — both planes
 * are byte-identical by construction, so no comparison of this shape can
 * discriminate that failure. A genuinely independent tier-1 corroboration
 * would require a fresh at-request-time network re-fetch (the pattern
 * get_market_snapshot itself uses) — explicitly OUT OF SCOPE here (new
 * network dependency + latency on every get_macro_snapshot call, zero
 * historical incidents of this specific shape). Noted as a future FR-6
 * fast-follow candidate, not implemented.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * EC-2 (market-closed / degenerate flat case): this function requires NO
 * special-case for a closed market — it runs identically whether the market
 * is open or closed; the market-hours-awareness belongs entirely in the
 * caller's freshness gate (macroTools.ts wiring — reuses
 * freshnessSlaChecker.ts's `signalType: "price"` SLA), not here.
 *
 * @module domain/services/vnIndexPlausibilityGuard
 */

/** EC-3: level-vs-level divergence, denominator = local reference (not delta-vs-delta, not move size). */
export const VNINDEX_CROSS_PLANE_DIVERGENCE_THRESHOLD_PCT = 5;

export interface VnIndexPlausibilityInput {
  /** macro-indicators' reported vnIndex. Precondition: finite, > 0 — caller pre-filters. */
  macroVnIndex: number;
  /** data.vnIndex_is_estimate; caller defaults to true if the field is absent (FDA-7 precedent). */
  macroIsEstimate: boolean;
  /**
   * data.vnIndex_source_tier; caller defaults to 4 if absent (FDA-7 precedent).
   * Verified BINARY for this field only (usecases.go tierLive=1/tierFixture=4 — no
   * 2/3 possible for vnIndex specifically) — macroIsEstimate and macroSourceTier
   * are redundant signals today; the >=3 check below is defensive forward-compat,
   * not live-reachable.
   */
  macroSourceTier: 1 | 2 | 3 | 4;
  /** vn_index_cache.price (or market_prices.VNINDEX), or null if no row / row <= 0. */
  localVnIndex: number | null;
  /**
   * Caller-computed: row exists AND price>0 AND freshnessSlaChecker's
   * `checkSignalSla("price", ageMinutes)` says "ok". EC-1's "unavailable" and
   * "stale-beyond-SLA" cases are NOT distinguished — both collapse to false.
   */
  localReferenceTrustworthy: boolean;
}

export type VnIndexPlausibilityVerdict =
  // null divergencePct = fail-open path, the divergence check was never evaluated.
  | { trustworthy: true; divergencePct: number | null }
  | { trustworthy: false; reason: "cross_plane_divergence"; divergencePct: number }
  | { trustworthy: false; reason: "both_sides_untrustworthy" };

/**
 * Evaluate whether macro-indicators' reported vnIndex is plausible against
 * apps/mcp-server's own local VN-Index reference.
 *
 * EC-1 asymmetric fail behavior:
 *   - local ref untrustworthy AND macro is_estimate/tier>=3 -> fail-CLOSED
 *     (both sides untrustworthy — say nothing rather than guess).
 *   - local ref untrustworthy BUT macro tier-1 -> fail-OPEN (cannot
 *     corroborate; serve the value as today, avoids over-suppression).
 *
 * FR-2: once the local reference IS trustworthy, the divergence check runs
 * UNCONDITIONALLY — regardless of macroIsEstimate/macroSourceTier — so a
 * tier-1 MISLABELING (flags say live, value is still garbage) is also caught.
 */
export function evaluateVnIndexPlausibility(
  input: VnIndexPlausibilityInput,
): VnIndexPlausibilityVerdict {
  if (!input.localReferenceTrustworthy) {
    if (input.macroIsEstimate || input.macroSourceTier >= 3) {
      return { trustworthy: false, reason: "both_sides_untrustworthy" }; // fail-CLOSED
    }
    return { trustworthy: true, divergencePct: null }; // fail-OPEN — cannot corroborate, serve as today
  }

  // FR-2: unconditional — runs regardless of macroIsEstimate/macroSourceTier once local ref is trustworthy.
  const local = input.localVnIndex;
  if (local === null || local <= 0) return { trustworthy: true, divergencePct: null }; // defensive, should be unreachable

  const divergencePct = (Math.abs(input.macroVnIndex - local) / local) * 100;
  if (divergencePct >= VNINDEX_CROSS_PLANE_DIVERGENCE_THRESHOLD_PCT) {
    // >= not > — matches macroOutlierGuard.ts's own at-or-beyond convention, same file family.
    return { trustworthy: false, reason: "cross_plane_divergence", divergencePct };
  }
  return { trustworthy: true, divergencePct };
}
