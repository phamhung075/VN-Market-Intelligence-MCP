/**
 * RAG — barrel export
 *
 * Re-exports embedding pipeline, utilities, and LanceDB vector store.
 */

export {
  embed,
  embedBatch,
  cosineSimilarity,
  getEmbeddingPipeline,
  buildBctcEmbeddingText,
} from "./embeddings.js";

export {
  initVectorStore,
  insertVector,
  searchSimilar,
  closeVectorStore,
  type VectorEntry,
  type SearchResult,
  type SearchFilters,
} from "./vectorstore.js";

export {
  searchContext,
  insertAnalysis,
  type SearchOptions,
  type AnalysisInput,
} from "./retriever.js";
