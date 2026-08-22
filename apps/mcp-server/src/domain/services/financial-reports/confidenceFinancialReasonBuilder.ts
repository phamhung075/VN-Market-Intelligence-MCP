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
 * outlier) — the two families the original hard-coded hint named — AND that
 * rule fired ALONE (`violations.length === 1`), which is the ONLY way the
 * resulting confidence can land on a value that rule family can actually
 * produce (0.0 hard-fail for VAL-01/VAL-10, 0.8 single-soft-violation for
 * VAL-03). Gating on rule-membership alone is NOT sufficient: BCTC-VAL-03
 * is a soft, stacking violation (unlike VAL-01/VAL-10, which hard-fail and
 * always return exactly 1 violation) — it can co-fire with BCTC-VAL-05,
 * BCTC-VAL-06, or BCTC-VAL-01-SCALE/POSITION to land confidence on 0.4 or
 * 0.6, values the VNM/VEA rule family cannot produce
 * (FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY, 2026-08-14 QA finding:
 * {totalAssets:1000, totalEquity:500, totalLiabilities:400,
 * operatingMargin:2.0, netRevenue:-1} -> VAL-03+VAL-05 stack ->
 * confidence=0.6, outside {0.0, 0.8}).
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
  // AC-2: the rule must have fired ALONE — a stacked soft violation (e.g.
  // BCTC-VAL-03 + BCTC-VAL-05) lands confidence on 0.4/0.6, values this rule
  // family can never actually produce (0.0/0.8 only).
  const matchesVnmVeaSignature =
    violations.length === 1 &&
    (violations[0]!.rule === "BCTC-VAL-01" ||
      violations[0]!.rule === "BCTC-VAL-03" ||
      violations[0]!.rule === "BCTC-VAL-10");
  return matchesVnmVeaSignature
    ? `${ruleText} (matches the VNM/VEA OCR-corruption signature: assets<equity or margin>100%).`
    : `${ruleText}.`;
}
