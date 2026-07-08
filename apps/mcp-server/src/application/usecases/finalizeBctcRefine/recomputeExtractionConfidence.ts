/**
 * recomputeExtractionConfidence.ts — BLOCK-5, relocated verbatim
 * (FACTORY-INTERFACE-extract-finalizeBctc-usecase).
 *
 * DDD layer: application (usecases/finalizeBctcRefine).
 *
 * BUG 2 fix (FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE, brief
 * 2026-06-12-bctc-refine-state-machine-ruling §BUG 2): extraction_confidence
 * is frozen at OCR-parse time and never updated after refine/finalize. A
 * successful refine can produce 100+ high-quality rows, but PUB-5 still
 * blocks publishing because the stale OCR confidence < 0.5.
 *
 * Fix: compute refined_confidence from section presence (weighted):
 *   balance_sheet 0.4 + income_statement 0.4 + cash_flow 0.2
 * Guard: only overwrite if refined_confidence EXCEEDS the current OCR value.
 *   If OCR is 0.85 and refine only got 2/3 sections (0.6–0.8), preserve the
 *   higher OCR value — a downward rewrite would penalise good extractions.
 *
 * Runs OUTSIDE the main transaction. Non-fatal (same pattern as the other
 * BLOCK-*.ts siblings in this directory).
 *
 * IMPORTANT (task DoD): this function's output must be IDENTICAL before/after
 * this relocation — treat any output diff as a bug in the extraction, not an
 * intended behavior change.
 *
 * @module application/usecases/finalizeBctcRefine/recomputeExtractionConfidence
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { checkSectionCompleteness } from "../../../domain/services/financial-reports/bctcSectionCompleteness.js";
import { checkBctcIdentityGuard } from "../../../domain/services/financial-reports/bctcIdentityGuard.js";
import type { FinalizeBctcTableRow } from "./finalizeBctcRefineTypes.js";

interface ConfRow {
  extraction_confidence: number | null;
  total_assets: number | null;
  equity_total: number | null;
}

/**
 * recomputeExtractionConfidence — BLOCK-5 main entry.
 * Non-fatal: any error is logged and swallowed.
 */
export function recomputeExtractionConfidence(
  db: Database,
  report_id: string,
  finalRows: FinalizeBctcTableRow[],
): void {
  try {
    const confidenceCompleteness = checkSectionCompleteness(finalRows);
    const refinedConfidence =
      (confidenceCompleteness.hasBalanceSheet   ? 0.4 : 0) +
      (confidenceCompleteness.hasIncomeStatement ? 0.4 : 0) +
      (confidenceCompleteness.hasCashFlow        ? 0.2 : 0);

    const confRow = db
      .prepare<ConfRow, [string]>(
        "SELECT extraction_confidence, total_assets, equity_total FROM financial_reports WHERE id = ?",
      )
      .get(report_id);

    // DSI-S3 C5: missing confidence MUST NOT grant max-confidence —
    // treat null as 0 so a refinedConfidence > 0 always overwrites.
    const currentConfidence: number = confRow?.extraction_confidence ?? 0;

    // FIX-BCTC-BANK-SUMMARY-MAPPING W5 (AC-6): a genuinely FR-5-corrupt
    // row (balance-sheet identity violated per the SAME canonical guard
    // used by the serve paths) must NEVER show a healthy confidence
    // value, no matter how many sections the refined markdown covers.
    // Section-completeness (below) is a TRANSCRIPTION-COVERAGE signal,
    // not a DATA-CORRECTNESS signal. Hard override: corrupt → confidence
    // forced to 0 unconditionally (bypasses the refined>current comparison
    // below).
    const identityGuardForConfidence = checkBctcIdentityGuard({
      totalAssets: confRow?.total_assets,
      equityTotal: confRow?.equity_total,
    });

    if (identityGuardForConfidence.corrupt) {
      db.prepare(
        "UPDATE financial_reports SET extraction_confidence = 0 WHERE id = ?",
      ).run(report_id);
      logger.warn(
        "[finalize_bctc_refine] BLOCK-5 confidence forced to 0 — FR-5 identity guard corrupt",
        { report_id, reason: identityGuardForConfidence.reason },
      );
    } else if (refinedConfidence > currentConfidence) {
      db.prepare(
        "UPDATE financial_reports SET extraction_confidence = ? WHERE id = ?",
      ).run(refinedConfidence, report_id);
      logger.info(
        "[finalize_bctc_refine] BLOCK-5 extraction_confidence recomputed (FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE)",
        {
          report_id,
          old_confidence: currentConfidence,
          new_confidence: refinedConfidence,
          hasBalanceSheet:    confidenceCompleteness.hasBalanceSheet,
          hasIncomeStatement: confidenceCompleteness.hasIncomeStatement,
          hasCashFlow:        confidenceCompleteness.hasCashFlow,
        },
      );
    } else {
      logger.info(
        "[finalize_bctc_refine] BLOCK-5 extraction_confidence guard: no override (refined <= current)",
        {
          report_id,
          current_confidence: currentConfidence,
          refined_confidence: refinedConfidence,
        },
      );
    }
  } catch (confErr) {
    // Non-fatal: table rows and all prior backfills are already committed.
    // Confidence recompute failure leaves stale OCR confidence in place; PUB-5
    // may still block but will unblock on the next finalize run.
    logger.warn("[finalize_bctc_refine] BLOCK-5 confidence recompute error (non-fatal)", {
      report_id,
      error: confErr instanceof Error ? confErr.message : String(confErr),
    });
  }
}
