/**
 * Infrastructure — vnstock Foreign Flow Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith).
 *
 * <!-- size-justification: 240L — upsertForeignFlow carries a dual-schema
 * write path (with/without the `date` column, detected via imported
 * tradingStatsHasDate) plus a UNIQUE-constraint existence guard and a
 * normalise+dedup pass, ALL load-bearing for FIX-FOREIGN-FLOW-INTEGRITY-BREAK
 * and duplicate-key safety on the hottest external write path (VPS push).
 * Splitting the two branches into separate files would duplicate the
 * normalise/dedup preamble and fragment a single atomic write decision across
 * files — higher risk than staying over cap. Extracted verbatim from the
 * original monolith with zero logic change. -->
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { logger } from "../../logger.js";
import type { DailyForeignFlow } from "../../../domain/services/foreignFlowAnalyzer.js";
import type { ForeignFlowUpsertItem } from "../../../domain/models/shared-types.js";
import { tradingStatsHasDate } from "./tradingStatsStore.js";

/**
 * Get foreign flow history for delta calculation.
 * Returns rows sorted by date DESC (most recent first).
 *
 * @param code - Stock code
 * @param days - Number of days to retrieve (default: 10)
 */
export function getForeignFlowHistory(code: string, days = 10): DailyForeignFlow[] {
  const db = getDb();
  // Use fetched_at — the production schema lacks the `date` column.
  // Project fetched_at AS date so the DailyForeignFlow consumers see the
  // same shape they did before the column rename.
  const rows = db
    .prepare<any, [string, number]>(
      `SELECT code,
              substr(fetched_at, 1, 10) AS date,
              foreign_volume, foreign_room, current_holding_ratio
       FROM vnstock_trading_stats
       WHERE code = ?
       ORDER BY fetched_at DESC
       LIMIT ?`,
    )
    .all(code, days);

  return rows.map((row) => ({
    code: row.code,
    date: row.date,
    foreignVolume: row.foreign_volume ?? 0,
    foreignRoom: row.foreign_room ?? 0,
    holdingRatio: row.current_holding_ratio ?? null,
  }));
}

/**
 * Upsert foreign flow columns only.
 *
 * Uses INSERT INTO ... ON CONFLICT(code, date) DO UPDATE SET to write only
 * the four foreign-flow-specific columns. The price/financial columns written
 * by storeTradingStats (avg_volume_2w, high_52w, low_52w, pct_from_*,
 * max_holding_ratio) are intentionally omitted from the DO UPDATE clause and
 * are therefore NEVER overwritten by this function.
 *
 * Normalises holding_ratio: if value > 1.0 it is divided by 100 (VPS API
 * sometimes returns percentage form, e.g. 48.87 instead of 0.4887).
 *
 * @param items  - Array of foreign flow items to upsert.
 * @param db     - Optional Database instance (defaults to production getDb()).
 *                 Inject an in-memory DB in tests.
 * @returns number of rows affected (inserted + updated)
 */
export function upsertForeignFlow(
  items: ForeignFlowUpsertItem[],
  db?: ReturnType<typeof getDb>,
): number {
  if (items.length === 0) return 0;

  const database = db ?? getDb();

  // When a custom DB is injected (tests / non-default instance), bypass the
  // module-level cache and probe the schema directly so that each test DB
  // is evaluated independently.
  let hasDate: boolean;
  if (db !== undefined) {
    try {
      const cols = database
        .query<{ name: string }, []>("PRAGMA table_info(vnstock_trading_stats)")
        .all();
      hasDate = cols.some((c) => c.name === "date");
    } catch {
      hasDate = false;
    }
  } else {
    hasDate = tradingStatsHasDate(database);
  }

  // Normalise holding_ratio before any DB calls (mutates a local copy).
  const normalisedRaw = items.map((item) => {
    const ratio =
      item.holding_ratio != null && item.holding_ratio > 1.0
        ? item.holding_ratio / 100
        : item.holding_ratio;
    return { ...item, holding_ratio: ratio };
  });

  // Deduplicate by (code, date) — last occurrence wins (most recent VPS value).
  // VPS vn-foreign-flow service occasionally sends duplicate ticker codes in a
  // single payload. Without dedup the SQLite transaction hits the UNIQUE(code, date)
  // constraint on the second row and throws "UNIQUE constraint failed".
  const dedupMap = new Map<string, typeof normalisedRaw[0]>();
  for (const item of normalisedRaw) {
    const key = `${item.code}\0${item.date ?? ""}`;
    dedupMap.set(key, item); // overwrite → last value wins
  }
  const normalised = Array.from(dedupMap.values());

  let affected = 0;

  // Guard: Verify UNIQUE(code, date) constraint exists before attempting ON CONFLICT
  // This catches misconfigured production DBs where the migration silently failed.
  // Note: SQLite auto-creates autoindex if UNIQUE constraint is in CREATE TABLE (e.g. sqlite_autoindex_*),
  // or we check for the explicit uq_vnstats_code_date index created by runVnstockMigrations().
  if (hasDate) {
    try {
      const indexList = database
        .prepare<{ name: string; "unique": number }, []>(
          `SELECT name, "unique" FROM pragma_index_list('vnstock_trading_stats')
           WHERE "unique" = 1`
        )
        .all();

      // Check if ANY unique index exists for this table
      // It could be:
      // 1. uq_vnstats_code_date (explicit index created by runVnstockMigrations)
      // 2. sqlite_autoindex_vnstock_trading_stats_1 (implicit from UNIQUE in CREATE TABLE)
      // 3. Other unique indexes (future compatibility)
      const hasUniqueConstraint = indexList.length > 0;

      if (!hasUniqueConstraint) {
        throw new Error(
          "UNIQUE constraint missing on vnstock_trading_stats. " +
          "Run runVnstockMigrations() or recreate the table. " +
          "ON CONFLICT will fail without this constraint."
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("pragma_index_list")) {
        // pragma_index_list doesn't exist on this SQLite version — graceful fallback
        logger.warn("[upsert-foreign-flow] constraint validation skipped (pragma_index_list unavailable)");
      } else if (err instanceof Error && err.message.includes("UNIQUE constraint missing")) {
        // Real error about missing constraint — propagate
        logger.error("[upsert-foreign-flow] constraint check failed", {
          error: err.message,
        });
        throw err;
      } else {
        // Other errors (e.g., parse error on query)
        logger.warn("[upsert-foreign-flow] constraint validation skipped (query error)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (hasDate) {
    // Primary path — UNIQUE(code, date). Use ON CONFLICT DO UPDATE SET so that
    // only the four foreign-flow columns are touched; price/financial columns
    // written by storeTradingStats (avg_volume_2w, high_52w, low_52w, …) are
    // never overwritten or NULLed.
    const stmt = database.prepare(
      `INSERT INTO vnstock_trading_stats
         (code, date, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
       ON CONFLICT(code, date) DO UPDATE SET
         foreign_volume        = excluded.foreign_volume,
         foreign_room          = excluded.foreign_room,
         current_holding_ratio = excluded.current_holding_ratio,
         fetched_at            = excluded.fetched_at`,
    );

    const runAll = database.transaction(() => {
      for (const item of normalised) {
        stmt.run(
          item.code,
          item.date,
          item.foreign_volume,
          item.foreign_room,
          item.holding_ratio,
          item.fetched_at,
        );
        affected++;
      }
    });
    runAll();

    // Log summary
    logger.debug("[upsert-foreign-flow] batch complete (with date column)", {
      itemsProcessed: normalised.length,
      rowsAffected: affected,
    });
  } else {
    // Legacy-schema fallback — no date column, UNIQUE(code) only.
    const stmt = database.prepare(
      `INSERT INTO vnstock_trading_stats
         (code, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
       VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
       ON CONFLICT(code) DO UPDATE SET
         foreign_volume        = excluded.foreign_volume,
         foreign_room          = excluded.foreign_room,
         current_holding_ratio = excluded.current_holding_ratio,
         fetched_at            = excluded.fetched_at`,
    );

    const runAll = database.transaction(() => {
      for (const item of normalised) {
        stmt.run(
          item.code,
          item.foreign_volume,
          item.foreign_room,
          item.holding_ratio,
          item.fetched_at,
        );
        affected++;
      }
    });
    runAll();

    // Log summary
    logger.debug("[upsert-foreign-flow] batch complete (legacy schema, no date column)", {
      itemsProcessed: normalised.length,
      rowsAffected: affected,
    });
  }

  return affected;
}
