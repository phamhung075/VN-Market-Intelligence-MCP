/**
 * bctcSectionCompleteness — pure domain function to detect section completeness
 * of a bctc_table_rows set.
 *
 * Sprint BCTC-EXTRACT-QUALITY Phase-2 | BEQ-5
 * DDD layer: domain (pure function, zero I/O, zero infrastructure imports)
 *
 * Used by BEQ-6 (backfillBctcScalarsTool) and BEQ-7 (finalizeBctcRefineTool)
 * to prevent false-DONE on balance-sheet-only fragments.
 *
 * @module domain/services/financial-reports/bctcSectionCompleteness
 */

/**
 * Minimal row shape required for section detection.
 * Compatible with AggregatorRow (bctcScalarAggregator) and bctc_table_rows DB shape.
 */
export interface AggregatorRow {
  statement_section: string;
  code: string | null;
  label: string;
  value_current: number | null;
  is_summary_row: number;
  unit: string;
}

/**
 * SectionCompletenessResult — output of checkSectionCompleteness.
 *
 * isComplete = hasBalanceSheet && hasIncomeStatement && hasCashFlow
 *
 * A row set is complete only when all three statement sections are present.
 * Empty rows → all false (fail-safe: no evidence → no promotion to DONE).
 */
export interface SectionCompletenessResult {
  hasBalanceSheet: boolean;
  hasIncomeStatement: boolean;
  hasCashFlow: boolean;
  /** true only when all three sections are present */
  isComplete: boolean;
}

/**
 * checkSectionCompleteness — detect whether a bctc_table_rows set contains
 * rows from all three financial statement sections.
 *
 * Pure function: zero I/O, zero side effects. Callers pass the full row set
 * for one report; this function checks for the presence of each section.
 *
 * Section detection:
 *   hasBalanceSheet  — rows tagged `balance_sheet` OR `general` (legacy extractor
 *                      produced `general` for balance-sheet rows; both are valid)
 *   hasIncomeStatement — rows tagged `income_statement`
 *   hasCashFlow       — rows tagged `cash_flow` OR `general` rows carrying an
 *                      unambiguous cash-flow-statement content signal (see below)
 *
 * The guarded failure mode: ALL rows are `balance_sheet` (or `general`) with
 * zero `income_statement` and zero `cash_flow` rows.  Both income+CF absent
 * simultaneously is the corpus-poison signal — not mere absence of one section.
 *
 * FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG: some markdown-refine
 * windows never match a section-header pattern (refinedMarkdownParser.ts
 * SECTION_HEADERS) and leave the WHOLE primary-statement table — income statement
 * AND cash flow statement rows together — tagged statement_section="general"
 * (confirmed live: HPG 2026-Q1, 233/282 rows "general", ZERO rows tagged
 * "cash_flow", even though real cash-flow data is present in that bucket). Without
 * this extension, hasCashFlow is permanently false for such reports and this gate
 * blocks aggregateScalars forever — the reflow tool (backfillBctcScalarsTool) can
 * never re-derive the stale legacy scalars even after a mapping fix ships, since it
 * hits this SAME gate on every re-attempt.
 *
 * The extension is narrow (content-gated, not "any general row"), so it does NOT
 * reintroduce the false-DONE risk this gate exists to prevent: a genuinely
 * CF-absent report (e.g. a balance-sheet-only fragment) has zero rows matching
 * the signal anywhere, so hasCashFlow correctly stays false for it. The signal —
 * "lưu chuyển tiền" ("cash flow") — is literal in every VAS indirect cash-flow-
 * statement subtotal line (operating/investing/financing/net-change), universal
 * across issuers and periods, so this is real evidence of cash-flow content, not
 * a guess.
 *
 * Fail-safe contract: empty rows → all false (no promotion to DONE without evidence).
 *
 * @param rows  All bctc_table_rows for one report (or a typed-row subset)
 * @returns     SectionCompletenessResult with per-section presence booleans + isComplete
 */
const CASH_FLOW_LABEL_SIGNAL = /l[uư]u\s*chuy[eể]n\s*ti[eề]n/i;

export function checkSectionCompleteness(rows: AggregatorRow[]): SectionCompletenessResult {
  if (rows.length === 0) {
    return { hasBalanceSheet: false, hasIncomeStatement: false, hasCashFlow: false, isComplete: false };
  }
  // `general` is the legacy-extractor tag for balance-sheet rows; treat as equivalent
  const hasBalanceSheet    = rows.some(r => r.statement_section === "balance_sheet" || r.statement_section === "general");
  const hasIncomeStatement = rows.some(r => r.statement_section === "income_statement");
  const hasCashFlow        =
    rows.some(r => r.statement_section === "cash_flow") ||
    rows.some(r => r.statement_section === "general" && CASH_FLOW_LABEL_SIGNAL.test(r.label));
  const isComplete         = hasBalanceSheet && hasIncomeStatement && hasCashFlow;
  return { hasBalanceSheet, hasIncomeStatement, hasCashFlow, isComplete };
}
