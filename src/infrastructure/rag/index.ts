/**
 * RAG — barrel export
 *
 * Re-exports embedding pipeline and utilities.
 * Future tasks will add vector store (LanceDB) exports here.
 */

export {
  embed,
  embedBatch,
  cosineSimilarity,
  getEmbeddingPipeline,
  buildBctcEmbeddingText,
} from "./embeddings.js";
