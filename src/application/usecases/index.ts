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

// Task 102: News polling use case (30-min cron + dedup + cascade + alert)
export { pollNews } from "./pollNews.js";
export type { PollNewsResult, PollNewsOptions, SourceFetchers } from "./pollNews.js";

// Task 103: Market open/close scan use case
export { scanMarket } from "./scanMarket.js";
export type { MarketScanResult, ScanMarketOptions, PriceFetcher } from "./scanMarket.js";

// Task 104: SSC nightly report check (20:00 GMT+7)
export { checkSscReports } from "./checkSscReports.js";
export type {
  CheckSscReportsOptions,
  SscCheckResult,
  WatchlistEntry,
  PipelineParams,
} from "./checkSscReports.js";
