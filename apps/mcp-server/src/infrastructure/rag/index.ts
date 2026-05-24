/**
 * RAG — barrel export
 *
 * G5a/G5b (P2-F): Legacy LanceDB implementations (embeddings.ts, vectorstore.ts, retriever.ts)
 * moved to _deprecated/ — rag-service (port 5002) is now the single LanceDB writer (R-1 resolved).
 * Active exports: ragHttpClient (HTTP boundary to rag-service).
 * Legacy re-exports preserved via _deprecated/ paths for backward-compat until tests are migrated.
 */

// ── Active HTTP client (G5b canonical path) ──────────────────────────────────
export {
  ragSearch,
  ragIndex,
  ragHealthCheck,
  type RagSearchRequest,
  type RagSearchResponse,
  type RagSearchResultDTO,
  type RagIndexRequest,
  type RagIndexResponse,
  type AnalysisInput,
} from "./ragHttpClient.js";

// ── Legacy re-exports from _deprecated/ (tests + backward-compat — do not use in new code) ──
export {
  embed,
  embedBatch,
  cosineSimilarity,
  getEmbeddingPipeline,
  buildBctcEmbeddingText,
} from "./_deprecated/embeddings.js";

export {
  initVectorStore,
  insertVector,
  searchSimilar,
  closeVectorStore,
  type VectorEntry,
  type SearchResult,
  type SearchFilters,
} from "./_deprecated/vectorstore.js";

export {
  searchContext,
  insertAnalysis,
  type SearchOptions,
} from "./_deprecated/retriever.js";
