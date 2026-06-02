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
 * Section detection: rows.some(r => r.statement_section === '<section>')
 *
 * Fail-safe contract: empty rows → all false (no promotion to DONE without evidence).
 *
 * @param rows  All bctc_table_rows for one report (or a typed-row subset)
 * @returns     SectionCompletenessResult with per-section presence booleans + isComplete
 */
export function checkSectionCompleteness(rows: AggregatorRow[]): SectionCompletenessResult {
  if (rows.length === 0) {
    return { hasBalanceSheet: false, hasIncomeStatement: false, hasCashFlow: false, isComplete: false };
  }
  const hasBalanceSheet    = rows.some(r => r.statement_section === "balance_sheet");
  const hasIncomeStatement = rows.some(r => r.statement_section === "income_statement");
  const hasCashFlow        = rows.some(r => r.statement_section === "cash_flow");
  const isComplete         = hasBalanceSheet && hasIncomeStatement && hasCashFlow;
  return { hasBalanceSheet, hasIncomeStatement, hasCashFlow, isComplete };
}
