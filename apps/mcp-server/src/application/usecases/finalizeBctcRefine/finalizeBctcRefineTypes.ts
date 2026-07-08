/**
 * finalizeBctcRefineTypes.ts — shared row shape for the finalizeBctcRefine
 * use case family (FACTORY-INTERFACE-extract-finalizeBctc-usecase).
 *
 * DDD layer: application (usecases/finalizeBctcRefine).
 *
 * Extracted from finalizeBctcRefineTool.ts (interface layer) so the main
 * use case (parse/insert) and the post-transaction BLOCK-4/BLOCK-5 steps
 * that need read access to the same in-memory row set can share one type
 * without a circular import back through the orchestrator file.
 *
 * @module application/usecases/finalizeBctcRefine/finalizeBctcRefineTypes
 */

/**
 * FinalizeBctcTableRow — the row shape produced by the parseRefinedMarkdown
 * → applyCorrections pipeline, before INSERT into bctc_table_rows.
 */
export interface FinalizeBctcTableRow {
  report_id: string;
  page_number: number;
  statement_section: string;
  row_order: number;
  code: string | null;
  label: string;
  period_current: string;
  value_current: number | null;
  period_prior: string | null;
  value_prior: number | null;
  unit: string;
  is_summary_row: number;
  // FACTORY-INTERFACE-source-confidence-10-mask: honestly optional — see
  // resolveSourceConfidence() doc in finalizeBctcRefine.ts for why (parser
  // always supplies a real value in practice; the type does not overclaim
  // that as a guarantee).
  source_confidence: number | undefined;
}
