/**
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
}

export interface BctcIdentityGuardResult {
  /** true when this row is an OCR-corruption fingerprint and must be hard-blocked. */
  corrupt: boolean;
  /** Human-readable reason, set only when corrupt=true. */
  reason: string | null;
}

/**
 * checkBctcIdentityGuard — pure predicate: does this row violate the
 * balance-sheet identity (total_assets > 0 AND total_assets >= equity_total)?
 *
 * Generic across ALL tickers/forms (bank + corporate) — keys ONLY on
 * total_assets/equity_total, never on validation_status, ticker, or form type.
 * A `validation_status="failed"` row whose identity still holds (e.g. FPT
 * 2026-Q1) does NOT trip this guard — see NFR/AC-8 non-regression.
 *
 * total_assets == null (not yet extracted) fails OPEN — not corrupt, not
 * assessable. Only a DEFINITE non-positive/sub-equity number is a corruption
 * fingerprint (see BctcIdentityGuardInput.totalAssets doc).
 */
export function checkBctcIdentityGuard(
  input: BctcIdentityGuardInput,
): BctcIdentityGuardResult {
  const { totalAssets, equityTotal } = input;

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
