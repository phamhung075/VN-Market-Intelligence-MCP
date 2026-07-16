/**
 * RAG — barrel export
 *
 * G5a/G5b (P2-F): Legacy LanceDB implementations (embeddings.ts, vectorstore.ts, retriever.ts)
 * were moved to _deprecated/ when rag-service (port 5002) became the single LanceDB writer
 * (R-1 resolved). _deprecated/ was tests-only (zero production imports, confirmed by repo-wide
 * grep) and has since been deleted as dead-code removal (CI-RED-da847805-FIX) — its module-level
 * `@lancedb/lancedb` native-addon import was crashing `bun test` (native segfault, not a logic
 * assertion) whenever any test file loaded it. Active exports: ragHttpClient (HTTP boundary to
 * rag-service) only.
 */

// ── Active HTTP client (G5b canonical path) ──────────────────────────────────
export {
  ragSearch,
  ragIndex,
  ragHealthCheck,
  ragRebuildFts,
  type RagSearchRequest,
  type RagSearchResponse,
  type RagSearchResultDTO,
  type RagIndexRequest,
  type RagIndexResponse,
  type AnalysisInput,
  type RagRebuildFtsResponse,
} from "./ragHttpClient.js";
