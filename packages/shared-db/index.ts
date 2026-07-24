/**
 * @vn-market/shared-db
 *
 * SQLite schema constants and migration utilities.
 * Re-exports schema slices from apps/mcp-server for use by future
 * microservices that need direct DB access.
 *
 * Phase 0 stub: re-exports are wired up as services are extracted in Phases 1–3.
 */

export const SHARED_DB_VERSION = "1.0.0";

/**
 * DB_SCHEMA_MODULES lists all schema slices maintained in the monorepo.
 * Microservices should only import the slices they own.
 *
 * Schema source: apps/mcp-server/src/infrastructure/db/schema-*.ts
 *
 * KEEP IN SYNC with apps/mcp-server/src/infrastructure/db/schema-*.ts — every
 * schema-*.ts basename on disk there must have a matching entry here (and
 * vice versa). No automated drift-check exists yet (no test harness in this
 * package); verify manually with:
 *   ls apps/mcp-server/src/infrastructure/db/ | grep '^schema-'
 */
export const DB_SCHEMA_MODULES = [
  "schema-alerts",
  "schema-backtesting",
  "schema-briefings",
  "schema-financial-reports",
  "schema-macro",
  "schema-market-data",
  "schema-news",
  "schema-portfolio",
  "schema-system",
] as const;

export type DbSchemaModule = typeof DB_SCHEMA_MODULES[number];
