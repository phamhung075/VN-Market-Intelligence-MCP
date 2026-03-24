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
 *   - Task 002: SQLite schema + migrations
 *   - Task 011: Embedding pipeline (HuggingFace ONNX)
 *   - Task 012: LanceDB vector store
 *   - Task 021-030: News and market data fetchers
 */

// Re-export all infrastructure adapters as they are implemented
export {};
