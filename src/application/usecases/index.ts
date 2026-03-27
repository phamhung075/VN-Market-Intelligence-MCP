/**
 * Application Use Cases — barrel export
 *
 * Orchestrates domain services and infrastructure adapters to fulfill
 * higher-level business flows. Use cases are the entry points for
 * complex multi-step operations.
 *
 * Populated by future tasks:
 *   - Task 047: ParseBctcUseCase (BCTC PDF → FinancialReport)
 *   - Task 048: FetchParseStoreBctcUseCase (SSC → parse → SQLite + LanceDB)
 *   - Task 065: PatternMatcherUseCase
 *   - Task 066: AiSummaryUseCase
 */

// Re-export all use cases as they are implemented

// Task 047: BCTC parse pipeline (text → FinancialReport → SQLite)
export { parseBctcReport } from "./parseBctcReport.js";
export type { ParseBctcReportParams } from "./parseBctcReport.js";

// Task 048: SSC fetch → parse → store pipeline (SSC portal → PDF → SQLite + LanceDB)
export { fetchParseAndStoreBctc } from "./fetchParseAndStoreBctc.js";
export type {
  FetchParseAndStoreBctcParams,
  InsertAnalysisFn,
  QuarterString,
} from "./fetchParseAndStoreBctc.js";

// Task 062: Causal cascade orchestrator (news → RAG → CausalChain)
export { runImpactChain } from "./runImpactChain.js";
export type { RunCascadeInput, RagRetriever } from "./runImpactChain.js";
