/**
 * FIX-ERRAUDIT-W2-MCP-DATALAYER — safeQuery + failLoud
 *
 * Generic DB-read utilities that kill the fabricated-default anti-pattern.
 *
 * EXPORTS
 *   safeQuery<T>   — discriminated DB read; never collapses error to []
 *   failLoud       — structured degrade logger; replaces bare catch{ return 0 }
 *
 * DDD LAYER: domain/utils
 *   - Only imports `bun:sqlite` (type-only) — NO infrastructure/, application/, interface/ imports.
 *   - domain/services CAN import this; infrastructure + application CAN import this.
 *   - Uses console.error (Bun global) matching the NFR-1 convention established by
 *     infrastructure/fetchers/fetchDeadline.ts (no logger import to avoid upward deps).
 *
 * DISCRIMINATION CONTRACT
 *   { ok: true;  rows: T[] }           — query succeeded; rows may be empty (genuine no-rows)
 *   { ok: false; reason: 'no-rows' }   — query succeeded but returned 0 rows (legit-empty path)
 *   { ok: false; reason: 'db-error' }  — DB threw (locked, corrupt, missing table) — always LOGGED
 *
 * A genuine 0-row result is preserved as reason:'no-rows' so callers can distinguish
 * "no data yet" from "DB is broken". The fake-0 / fake-[] class is eliminated.
 *
 * USAGE
 *   const result = safeQuery<MyRow>(db, sql, params, 'ctx-label');
 *   if (!result.ok) { handle drop-dimension; return degraded; }
 *   const rows = result.rows; // non-empty T[]
 *
 * @module domain/utils/safeQuery
 */

import type { Database, SQLQueryBindings } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated result returned by safeQuery.
 *
 * ok:true  → query returned ≥1 rows; rows is non-empty
 * ok:false, reason:'no-rows'  → query OK but 0 rows (genuine empty — legit path)
 * ok:false, reason:'db-error' → DB threw; error is logged via failLoud
 */
export type SafeQueryResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; reason: "no-rows" | "db-error" };

// ─────────────────────────────────────────────────────────────────────────────
// failLoud — structured degrade logger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured degrade logger — replaces bare `catch { return [] | null | 0 }`.
 *
 * Emits one console.error line in the format:
 *   [degraded:<ctx>] <reason> — <err.message>
 *
 * Returns the typed degrade marker so callers can write:
 *   catch (err) { return failLoud(err, 'ctx'); }
 *
 * @param err  The caught error (unknown — typed internally)
 * @param ctx  Attribution context string (e.g. 'imfConvictionBridge', 'scanMarket.getAvgVolume')
 * @returns    Always returns undefined (void marker) — callers discard or ignore
 */
export function failLoud(err: unknown, ctx: string): undefined {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[degraded:${ctx}] db-error — ${msg}`);
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery<T>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic discriminated DB read.
 *
 * - On DB throw (locked, corrupt, missing table): calls failLoud + returns db-error.
 * - On 0 rows returned: returns no-rows (PRESERVED — legit-empty path).
 * - On ≥1 rows returned: returns ok:true with typed rows.
 *
 * NEVER returns { ok: true, rows: [] } — zero rows always routes to reason:'no-rows'.
 * This eliminates the "empty-success masquerading as real data" anti-pattern.
 *
 * params is typed as SQLQueryBindings[] to match bun:sqlite's prepare<T, P>.all() signature.
 * SQL injection is the caller's responsibility (parameterised queries required).
 *
 * @param db     SQLite Database instance (injected — ports pattern)
 * @param sql    Parameterised SQL string
 * @param params Bound parameters array (must satisfy SQLQueryBindings[])
 * @param ctx    Attribution label used by failLoud on error
 */
export function safeQuery<T>(
  db: Database,
  sql: string,
  params: SQLQueryBindings[],
  ctx: string,
): SafeQueryResult<T> {
  try {
    const rows = db.prepare<T, SQLQueryBindings[]>(sql).all(...params);
    if (rows.length === 0) {
      return { ok: false, reason: "no-rows" };
    }
    return { ok: true, rows };
  } catch (err) {
    failLoud(err, ctx);
    return { ok: false, reason: "db-error" };
  }
}
