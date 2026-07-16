/**
 * Infrastructure — barrel export (Adapters)
 *
 * Concrete adapters that implement domain repository interfaces.
 * Contains all I/O: SQLite, LanceDB, HTTP scrapers, PDF parsing.
 *
 * Sub-folders:
 *   db/        — SQLite database access (better-sqlite3)
 *   fetchers/  — HTTP scrapers (news, market data, SSC portal)
 *   rag/       — RAG HTTP client (ragHttpClient.ts) — boundary to rag-service (port 5002),
 *                the single LanceDB writer (G5b, R-1 resolved)
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

// ── RAG (G5b, R-1 resolved): HTTP boundary to rag-service (port 5002) ────────
// Legacy Task 011/012 direct-LanceDB re-exports (embed/embedBatch/.../
// initVectorStore/insertVector/.../closeVectorStore) removed — they were
// orphaned (zero consumers anywhere, prod or test, of this barrel's Task
// 011/012 exports; confirmed by repo-wide grep) and pointed at
// rag/_deprecated/*, which was deleted as dead-code removal
// (CI-RED-da847805-FIX: its module-level `@lancedb/lancedb` native-addon
// import was crashing `bun test` on load — a native segfault, not a logic
// assertion). Use `ragSearch`/`ragIndex`/etc. from `./rag/index.js` directly.

// ── Task 029: SSC portal scraper ─────────────────────────────────────────────
export {
  listSscDocuments,
  buildSscSearchUrl,
  parseSscHtml,
  type SscDocument,
  type HttpClient,
} from "./fetchers/index.js";
