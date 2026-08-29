/**
 * size-justification: 200L — FIX-BCTC-DATA-GAP-FAMILY U4/U5 extend this single
 * shared serve/write corruption guard (already at 104L, no baseline entry) with
 * two more OCR-corruption fingerprints that MUST live in the same predicate
 * chain — the income-broken-with-assets check (U4, HPG class) and the
 * scale-corruption floor/ratio check (U5, VEA class) — so all three serve paths
 * (get_financial_summary / compare_financials / get_bctc_full) share one guard
 * call instead of drifting across call sites. Splitting the predicates into a
 * sibling module would fragment the guard's API for zero readability gain;
 * the input interface, doc comments and reasons are the cohesive unit.
 *
 * bctcIdentityGuard — shared balance-sheet identity guard for BCTC serve paths.
 *
 * FIX-BCTC-BANK-SUMMARY-MAPPING W1 (FR-5, AC-4, AC-7): factors the identity
 * check originally inlined ONLY inside get_financial_summary (reports.ts,
 * lines 295-324) into ONE shared helper, called by ALL THREE
 * `financial_reports` serve paths:
 *   - get_financial_summary (interface/mcp/tools/financial-reports/reports.ts)
 *   - compare_financials    (interface/mcp/tools/financial-reports/reports.ts)
 *   - get_bctc_full         (interface/mcp/tools/financial-reports/bctcFullTools.ts)
 *
 * OCR corruption fingerprint: total_assets <= 0 OR total_assets < equity_total.
 * A valid balance sheet must satisfy Total Assets >= Equity (equity is funded
 * by assets). Serving these values raw produces nonsensical derived ratios
 * (e.g. net_margin 229,157%, ROE undefined, ebitda ~1e14). Hard-block:
 * confidence=0, suppress derived ratios entirely — never serve a labeled
 * "Validation FAILED" reading for a genuinely-corrupt row (AC-7).
 *
 * Recurrence: VNM → VEA → CTG (3rd occurrence) — the guard belongs at the
 * serve layer (ALL read paths), not a per-ticker patch.
 *
 * FIX-BCTC-DATA-GAP-FAMILY U4 (income-broken-with-assets, HPG 42nd+ cycle):
 * total_assets > 0 AND net_revenue == 0 AND operating_profit == 0 AND
 * net_profit == 0 → the income statement was missed while the balance sheet
 * survived (HPG 2026-Q1/Q4 PARTIAL rows: OP=0, NR≈0, NP≈0, TA>0 — PUB-8's
 * parent-only heuristic does NOT fire because NP is also 0). Only fires when
 * ALL THREE income fields are supplied by the caller (existing call sites
 * that pass only totalAssets/equityTotal fail open — backward compatible).
 *
 * FIX-BCTC-DATA-GAP-FAMILY U5 (scale-corruption, VNM/VEA class): a uniform
 * ~10^6× downscale of every value keeps TA>equity (identity passes) but puts
 * total_assets below any real listed-company floor (VEA 2025-Q4: TA=20.7M VND,
 * EQ=20.4M VND vs a real ~10^11 VND balance sheet), or makes TA/equity exceed
 * any plausible leverage cap. Generic floor + ratio bound — no ticker list.
 *
 * Layer: domain (pure calc, zero I/O — no DB, no MCP types).
 *
 * @module domain/services/financial-reports/bctcIdentityGuard
 */

export interface BctcIdentityGuardInput {
  /**
   * `total_assets` is a nullable REAL column (bctc-schema.ts) — a row that has
   * not been extracted/refined yet (e.g. fresh insert, REJECTED_SANITY,
   * refine_status=PENDING) legitimately has total_assets=NULL. That is a
   * DIFFERENT condition from "extracted as a known-bad 0/negative value"
   * (the OCR-corruption fingerprint this guard exists to catch) — NULL must
   * fail OPEN here and let the caller's own no-data/publishability gate
   * (PUB-1..8, "Chưa có dữ liệu BCTC", "No financial data found", …) handle it.
   */
  totalAssets: number | null | undefined;
  equityTotal: number | null | undefined;
  /**
   * FIX-BCTC-DATA-GAP-FAMILY U4: income-statement scalars (DB units, million
   * VND). OPTIONAL — the income-broken predicate only fires when all three are
   * supplied (non-undefined); callers that pass only balance-sheet fields fail
   * open, preserving backward compatibility with pre-U4 call sites and tests.
   */
  netRevenue?: number | null | undefined;
  operatingProfit?: number | null | undefined;
  netProfit?: number | null | undefined;
}

export interface BctcIdentityGuardResult {
  /** true when this row is an OCR-corruption fingerprint and must be hard-blocked. */
  corrupt: boolean;
  /** Human-readable reason, set only when corrupt=true. */
  reason: string | null;
}

/**
 * FIX-BCTC-DATA-GAP-FAMILY U5: absolute total-assets floor in VND — no real
 * listed company on HOSE/HNX/UPCOM reports below 1 tỷ VND total assets. The
 * DB stores million VND, so the comparison uses the derived
 * BCTC_TOTAL_ASSETS_FLOOR_MILLION_VND (1000).
 */
export const BCTC_TOTAL_ASSETS_FLOOR_VND = 1_000_000_000;
const BCTC_TOTAL_ASSETS_FLOOR_MILLION_VND = BCTC_TOTAL_ASSETS_FLOOR_VND / 1_000_000;

/**
 * FIX-BCTC-DATA-GAP-FAMILY U5: max plausible total_assets/equity ratio.
 * Real leverage rarely exceeds ~20x; > 10^4 is only reachable by mixed-scale
 * OCR corruption (one side downscaled, the other not) — where the identity
 * check alone cannot catch it because TA > equity still holds.
 */
export const BCTC_SCALE_RATIO_CAP = 10_000;

/**
 * checkBctcIdentityGuard — pure predicate: does this row violate the
 * balance-sheet identity (total_assets > 0 AND total_assets >= equity_total),
 * the income-broken-with-assets fingerprint (U4), or scale plausibility (U5)?
 *
 * Generic across ALL tickers/forms (bank + corporate) — keys ONLY on the
 * scalar values, never on validation_status, ticker, or form type.
 * A `validation_status="failed"` row whose identity still holds (e.g. FPT
 * 2026-Q1) does NOT trip this guard — see NFR/AC-8 non-regression.
 *
 * total_assets == null (not yet extracted) fails OPEN — not corrupt, not
 * assessable. Only a DEFINITE non-positive/sub-equity number is a corruption
 * fingerprint (see BctcIdentityGuardInput.totalAssets doc). U4/U5 additionally
 * require total_assets > 0 (balance sheet survived) — they never fire on a
 * zero/absent asset row, which the identity branch already hard-blocks.
 */
export function checkBctcIdentityGuard(
  input: BctcIdentityGuardInput,
): BctcIdentityGuardResult {
  const { totalAssets, equityTotal, netRevenue, operatingProfit, netProfit } = input;

  if (totalAssets == null) {
    return { corrupt: false, reason: null };
  }

  const effectiveEquity = equityTotal ?? 0;

  if (totalAssets <= 0 || totalAssets < effectiveEquity) {
    const reason =
      totalAssets <= 0
        ? `total_assets=${totalAssets} (zero or negative — OCR extraction failure)`
        : `total_assets=${totalAssets} < equity_total=${effectiveEquity} (balance-sheet identity violated)`;
    return { corrupt: true, reason };
  }

  // ── FIX-BCTC-DATA-GAP-FAMILY U4: income-broken-with-assets ───────────────
  // HPG 2026-Q1/2025-Q4 fingerprint: balance sheet survived (TA>0) but the
  // entire income statement extracted as zeros (NR=0 AND OP=0 AND NP=0) —
  // partial OCR miss, not a genuine zero-profit quarter. Only fires when the
  // caller supplied all three income fields.
  if (
    netRevenue !== undefined &&
    operatingProfit !== undefined &&
    netProfit !== undefined &&
    totalAssets > 0 &&
    netRevenue === 0 &&
    operatingProfit === 0 &&
    netProfit === 0
  ) {
    return {
      corrupt: true,
      reason:
        `income statement absent while balance sheet present (total_assets=${totalAssets}, ` +
        `net_revenue=0, operating_profit=0, net_profit=0) — partial OCR extraction`,
    };
  }

  // ── FIX-BCTC-DATA-GAP-FAMILY U5: scale plausibility ──────────────────────
  // Absolute floor: TA below 1 tỷ VND is impossible for a listed company.
  // Ratio cap: TA/equity > 10^4 detects mixed-scale corruption (identity
  // alone cannot — TA > equity still holds).
  if (totalAssets > 0 && totalAssets < BCTC_TOTAL_ASSETS_FLOOR_MILLION_VND) {
    return {
      corrupt: true,
      reason:
        `total_assets=${totalAssets} below absolute floor ` +
        `(${BCTC_TOTAL_ASSETS_FLOOR_MILLION_VND} million VND = 1 tỷ VND) — scale corruption (uniform ~10^6× downscale suspected)`,
    };
  }
  if (effectiveEquity > 0 && totalAssets / effectiveEquity > BCTC_SCALE_RATIO_CAP) {
    return {
      corrupt: true,
      reason:
        `total_assets/equity_total=${(totalAssets / effectiveEquity).toExponential(2)} ` +
        `> cap ${BCTC_SCALE_RATIO_CAP} — scale corruption (mixed-unit OCR extraction)`,
    };
  }

  return { corrupt: false, reason: null };
}

/**
 * buildBctcCorruptDataMessage — the shared "[CORRUPT DATA — SKIP]" text block.
 * Byte-identical across all three serve paths so callers cannot silently drift.
 */
export function buildBctcCorruptDataMessage(
  actionCode: string,
  sortKey: string,
  reason: string,
): string {
  return [
    `=== ${actionCode} — ${sortKey} ===`,
    ``,
    `[CORRUPT DATA — SKIP]`,
    `This report has a balance-sheet identity violation and cannot be served.`,
    `Reason  : ${reason}`,
    `Confidence: 0% (forced — corrupt flag)`,
    ``,
    `No derived ratios (margin, ROE, ROA, D/E) are shown — they would be meaningless.`,
    ``,
    `Action: Re-extract via /api/bctc-inspect or re-run the BCTC refine pipeline for ${actionCode} ${sortKey}.`,
  ].join("\n");
}
