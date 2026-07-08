/**
 * FACTORY-APP-split-fetchParseAndStoreBctc — shared types extracted from
 * fetchParseAndStoreBctc.ts so the orchestrator file can stay a thin sequencer.
 * Re-exported from fetchParseAndStoreBctc.ts for backward-compatible imports
 * (checkSscReports.ts, interface/mcp/tools/financial-reports/reports.ts).
 */

import type { AnalysisInput } from "../../../infrastructure/rag/ragHttpClient.js";
import type { HttpClient } from "../../../infrastructure/fetchers/ssc.js";

/** Quarter string accepted by the use case params (human-friendly). */
export type QuarterString = "Q1" | "Q2" | "Q3" | "Q4";

/**
 * Injectable function signature for inserting an analysis entry via rag-service.
 * G5b (P2-F): defaults to ragIndex via HTTP (port 5002); no direct LanceDB access.
 */
export type InsertAnalysisFn = (entry: AnalysisInput) => Promise<void>;

export interface FetchParseAndStoreBctcParams {
  /** Stock ticker / action code e.g. "VCB", "HPG" */
  actionCode: string;
  /** Four-digit fiscal year e.g. 2025 */
  year: number;
  /** Quarter string e.g. "Q1", "Q2", "Q3", "Q4" */
  quarter: QuarterString;
  /**
   * Optional HTTP client used by listSscDocuments when fetching the SSC portal.
   * Inject a mock in tests to avoid real network calls.
   */
  sscHttpClient?: HttpClient;
  /**
   * Optional HTTP client used by downloadAndExtractPdf when downloading the PDF.
   * Inject a mock in tests to avoid real network calls.
   */
  pdfHttpClient?: HttpClient;
  /**
   * Optional override for extracted PDF text.
   * When provided the PDF download + extraction step is bypassed and this text
   * is used directly. Useful in tests to decouple from pdf-parse.
   */
  pdfTextOverride?: string;
  /**
   * Optional insertAnalysis implementation.
   * G5b: defaults to ragIndex via rag-service HTTP (port 5002).
   */
  insertAnalysisFn?: InsertAnalysisFn;
  /**
   * Optional pre-discovered PDF URL (Task 289).
   * When provided the Step 1 SSC portal listing is bypassed and this URL is
   * used directly for download + extraction. Used by checkSscReports when
   * the SSC document was already resolved.
   */
  pdfUrl?: string;
  /**
   * Task 1294b: Enable fallback to news chain signals when PDF timeout occurs.
   * Defaults to true. Set to false to disable fallback and throw on timeout.
   */
  enableBctcFallback?: boolean;
}
