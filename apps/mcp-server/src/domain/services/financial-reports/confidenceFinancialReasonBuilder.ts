/**
 * confidenceFinancialReasonBuilder.ts — Task 1345b
 *
 * Domain service: extracted from parseBctcReport.ts
 * (FIX-CI-SIZELINT-BCTC-1345B-PARSE-VALIDATOR-PAIR, 2026-08-05) — the
 * self-contained "reason/detail builder" 7ac55adc8 added, moved to its own
 * domain module (pure function, zero I/O) rather than pushing
 * parseBctcReport.ts's size-lint baseline. Re-exported from
 * parseBctcReport.ts unchanged so no import path needs to move
 * (FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY.test.ts dynamic-imports it from
 * there).
 *
 * Domain layer: ZERO imports from infrastructure/. No I/O, no DB, no HTTP.
 */

import { validateFinancialFiguresDetailed } from "./financialFiguresRules.js";
import type { FinancialFiguresInput } from "./financialFiguresValidator.js";

/**
 * Build a truthful, figure-bearing description of WHY `confidenceFinancial`
 * is what it is — consumed by the `[BCTC-1345b]` alert text in `storeReport`.
 *
 * AC-1: must name the detector that ACTUALLY fired — cross-statement unit
 * mismatch, intra-BS unit mismatch, or the specific BCTC-VAL-NN rule, with
 * the offending figures. Never a hard-coded ticker-pattern hint.
 * AC-2: the VNM/VEA corruption-signature phrase may only be attached when
 * the value came from `validateFinancialFiguresDetailed` and the matched
 * rule is BCTC-VAL-01 (assets<equity) or BCTC-VAL-03/BCTC-VAL-10 (margin
 * outlier) — the two families the original hard-coded hint named — AND the
 * resulting confidence is a value that rule family can actually produce
 * (0.0 hard-fail / 0.8 single-soft-violation). This falls out of the
 * function's own structure (VAL-01 hard-fails to exactly 0.0; a lone
 * VAL-03 soft violation yields exactly 0.8) rather than a separate gate.
 *
 * When `crossStmtMismatch` or `bsIntraStmtMismatch` fired, `validateFinancialFigures()`
 * was NEVER called (parseBctcReport's short-circuit) — so this branch never
 * mentions BCTC-VAL-NN rules or the VNM/VEA signature at all.
 */
export function describeConfidenceFinancialReason(params: {
  crossStmtMismatch: boolean;
  bsIntraStmtMismatch: boolean;
  figures: FinancialFiguresInput;
}): string {
  const { crossStmtMismatch, bsIntraStmtMismatch, figures } = params;
  const { totalAssets, netRevenue, totalLiabilities } = figures;

  if (crossStmtMismatch || bsIntraStmtMismatch) {
    const parts: string[] = [];
    if (crossStmtMismatch && totalAssets !== null && netRevenue !== null && netRevenue !== 0) {
      const ratio = totalAssets > netRevenue ? totalAssets / netRevenue : netRevenue / totalAssets;
      parts.push(
        `cross-statement unit mismatch (assets/revenue ratio ${ratio.toFixed(0)}x — total_assets=${totalAssets}, net_revenue=${netRevenue})`,
      );
    }
    if (bsIntraStmtMismatch && totalAssets !== null && totalLiabilities !== null && totalLiabilities !== 0) {
      const ratio = totalAssets > totalLiabilities ? totalAssets / totalLiabilities : totalLiabilities / totalAssets;
      parts.push(
        `intra-BS unit mismatch (assets/liabilities ratio ${ratio.toFixed(0)}x — total_assets=${totalAssets}, total_liabilities=${totalLiabilities})`,
      );
    }
    return (
      `${parts.join(" AND ")}. OCR unit-normalisation defect (one statement in raw VND, ` +
      `another in triệu) — validateFinancialFigures() was NOT evaluated for this record.`
    );
  }

  const { violations } = validateFinancialFiguresDetailed(figures);
  if (violations.length === 0) {
    return "validateFinancialFigures() found no rule violation for the extracted figures — this alert fired from extraction confidence, not the financial-figures rule set.";
  }

  const ruleText = violations.map((v) => `${v.rule}: ${v.detail}`).join("; ");
  const matchesVnmVeaSignature = violations.some(
    (v) => v.rule === "BCTC-VAL-01" || v.rule === "BCTC-VAL-03" || v.rule === "BCTC-VAL-10",
  );
  return matchesVnmVeaSignature
    ? `${ruleText} (matches the VNM/VEA OCR-corruption signature: assets<equity or margin>100%).`
    : `${ruleText}.`;
}
