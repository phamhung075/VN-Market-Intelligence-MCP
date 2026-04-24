/**
 * Infrastructure — barrel export (Adapters)
 *
 * Concrete adapters that implement domain repository interfaces.
 * Contains all I/O: SQLite, LanceDB, HTTP scrapers, PDF parsing.
 *
 * Sub-folders:
 *   db/        — SQLite database access (better-sqlite3)
 *   fetchers/  — HTTP scrapers (news, market data, SSC portal)
 *   rag/       — LanceDB vector store + embedding pipeline
 *
 * Populated by future tasks:
 *   - Task 011: Embedding pipeline (HuggingFace ONNX)
 *   - Task 012: LanceDB vector store
 *   - Task 021-030: News and market data fetchers
 */

// ── Task 002: SQLite schema + migrations ─────────────────────────────────────
export { getDb, initDatabase, closeDb } from "./db/index.js";

// ── Task 003: Env config + structured logging ────────────────────────────────
export {
  AppConfigError,
  requireEnv,
  loadConfig,
  config,
  type AppConfig,
  type LogLevel,
} from "./config.js";

export {
  createLogger,
  logger,
  type Logger,
  type LogEntry,
  type LogSink,
} from "./logger.js";

// ── Task 011: Embedding pipeline (HuggingFace ONNX) ──────────────────────────
export {
  embed,
  embedBatch,
  cosineSimilarity,
  getEmbeddingPipeline,
  buildBctcEmbeddingText,
} from "./rag/index.js";

// ── Task 012: LanceDB vector store ──────────────────────────────────────────
export {
  initVectorStore,
  insertVector,
  searchSimilar,
  closeVectorStore,
  type VectorEntry,
  type SearchResult,
  type SearchFilters,
} from "./rag/index.js";

// ── Task 029: SSC portal scraper ─────────────────────────────────────────────
export {
  listSscDocuments,
  buildSscSearchUrl,
  parseSscHtml,
  type SscDocument,
  type HttpClient,
} from "./fetchers/index.js";
