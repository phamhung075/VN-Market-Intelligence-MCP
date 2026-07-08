/**
 * revalidateBalanceIdentity.ts — BLOCK-4, relocated verbatim
 * (FACTORY-INTERFACE-extract-finalizeBctc-usecase).
 *
 * DDD layer: application (usecases/finalizeBctcRefine).
 *
 * Root cause (FU-LF-VALIDATION-STATUS-REFLOW): validation_status is frozen at
 * OCR-parse time (parseBctcReport.ts). BLOCK-1 corrects base scalars, BLOCK-3
 * re-derives ratios, but validation_status stays 'failed' with stale notes
 * (e.g. 'Liabilities (0) + Equity (0)') even for balance-EXACT reports after
 * refine. A consumer filtering validation_status='passed' wrongly skips
 * correct data.
 *
 * Fix (finalize prong): after BLOCK-1+BLOCK-3 commit the corrected scalars,
 * re-run validateFinancialReport from the freshly committed values, then
 * UPDATE validation_status + validation_notes to reflect the CURRENT state.
 *
 * Non-fatal: error logged; scalar/ratio backfills already committed.
 * isBankFormFromRows uses the already-computed finalRows (same source as the
 * C-4 bank-form detection upstream in the main use case).
 *
 * @module application/usecases/finalizeBctcRefine/revalidateBalanceIdentity
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { isBankFormFromRows } from "../../../domain/services/financial-reports/bctcFormType.js";
import { checkBctcIdentityGuard } from "../../../domain/services/financial-reports/bctcIdentityGuard.js";
import { validateFinancialReport } from "../../../domain/services/financial-reports/bctcValidator.js";
import type { FinalizeBctcTableRow } from "./finalizeBctcRefineTypes.js";

interface ValidationSourceRow {
  net_revenue: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
  current_assets: number | null;
  extraction_confidence: number | null;
}

/**
 * revalidateBalanceIdentity — BLOCK-4 main entry.
 * Non-fatal: any error is logged and swallowed.
 */
export function revalidateBalanceIdentity(
  db: Database,
  report_id: string,
  finalRows: FinalizeBctcTableRow[],
): void {
  try {
    const valSrc = db
      .prepare<ValidationSourceRow, [string]>(
        `SELECT net_revenue, gross_profit, net_profit,
                total_assets, total_liabilities, equity_total,
                current_assets, extraction_confidence
         FROM financial_reports WHERE id = ?`,
      )
      .get(report_id);

    if (!valSrc) return;

    const isBankForValidation = isBankFormFromRows(finalRows);

    const valResult = validateFinancialReport({
      balanceSheet: {
        totalAssets:      valSrc.total_assets      ?? 0,
        totalLiabilities: valSrc.total_liabilities ?? 0,
        equityTotal:      valSrc.equity_total      ?? 0,
        currentAssets:    valSrc.current_assets    ?? 0,
        nonCurrentAssets:
          (valSrc.total_assets ?? 0) > 0 && (valSrc.current_assets ?? 0) > 0
            ? (valSrc.total_assets ?? 0) - (valSrc.current_assets ?? 0)
            : 0,
      },
      incomeStatement: {
        netRevenue:  valSrc.net_revenue  ?? 0,
        grossProfit: valSrc.gross_profit ?? 0,
        netProfit:   valSrc.net_profit   ?? 0,
      },
      // DSI-S3 C5: missing confidence MUST NOT grant max-confidence (1).
      // A report with no confidence measurement → 0, which PUB-5 gates.
      extractionConfidence: valSrc.extraction_confidence ?? 0,
      isBankForm: isBankForValidation,
    });

    // FIX-BCTC-BANK-SUMMARY-MAPPING W5 (AC-6, FR-6): re-apply the
    // canonical FR-5 identity guard (bctcIdentityGuard.ts, W1 — the SAME
    // predicate the serve paths hard-block on) as the SSOT truthfulness
    // check for the write path too. validateFinancialReport's own
    // 1%/5% relative-diff math (above) is a finer-grained validator and
    // can DIVERGE from the guard's simpler totalAssets<=0||totalAssets
    // <equityTotal check in edge cases. Guard fires → status is ALWAYS
    // 'failed', regardless of what the finer-grained validator concluded.
    const identityGuardResult = checkBctcIdentityGuard({
      totalAssets: valSrc.total_assets,
      equityTotal: valSrc.equity_total,
    });

    let newValidationStatus: string;
    if (identityGuardResult.corrupt || !valResult.isValid) {
      newValidationStatus = "failed";
    } else if (valResult.warnings.length > 0) {
      newValidationStatus = "passed_with_warnings";
    } else {
      newValidationStatus = "passed";
    }

    const newValidationNotes: string | null = identityGuardResult.corrupt
      ? `FR-5 hard-block: ${identityGuardResult.reason}`
      : valResult.errors.length > 0
        ? valResult.errors.join("; ")
        : valResult.warnings.length > 0
          ? valResult.warnings.join("; ")
          : null;

    db.prepare(
      "UPDATE financial_reports SET validation_status = ?, validation_notes = ? WHERE id = ?",
    ).run(newValidationStatus, newValidationNotes, report_id);

    logger.info("[finalize_bctc_refine] BLOCK-4 validation_status refreshed (FU-LF-VALIDATION-STATUS-REFLOW)", {
      report_id,
      new_status: newValidationStatus,
      is_valid: valResult.isValid,
      error_count: valResult.errors.length,
      warning_count: valResult.warnings.length,
      identity_guard_corrupt: identityGuardResult.corrupt,
    });
  } catch (valErr) {
    // Non-fatal: scalar/ratio backfills already committed.
    // Stale validation_status remains; bctcFullTools recompute-on-read handles it.
    logger.warn("[finalize_bctc_refine] BLOCK-4 validation refresh error (non-fatal)", {
      report_id,
      error: valErr instanceof Error ? valErr.message : String(valErr),
    });
  }
}
