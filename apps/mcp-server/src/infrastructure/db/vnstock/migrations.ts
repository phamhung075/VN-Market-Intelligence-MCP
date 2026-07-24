/**
 * Infrastructure — vnstock DB Migrations
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted verbatim from
 * vnstockStore.ts (937L monolith) — zero logic change.
 *
 * <!-- size-justification: 256L — pure-DDL migration function (runVnstockMigrations)
 * covers 3 independent legacy-schema repairs (add `date` column, drop stale
 * UNIQUE(code) via table rebuild, ensure UNIQUE(code,date) index) each with
 * its own try/catch fail-safe boundary — decomposing further would fragment
 * a single ordered migration sequence across files with no safety benefit. -->
 *
 * DDL — canonical SSOT is initDatabase() in schema.ts (Task 1042).
 * Tests use src/__tests__/helpers/vnstockTestDdl.ts for in-memory setup.
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { logger } from "../../logger.js";
import { resetTradingStatsDateCache } from "./tradingStatsStore.js";

/**
 * runVnstockMigrations — ALTER TABLE migration for old production DBs that
 * were created before the `date` column was added to vnstock_trading_stats.
 * Called from index.ts after initDatabase(). Safe to call multiple times.
 */
export function runVnstockMigrations(injectedDb?: ReturnType<typeof getDb>): void {
  const db = injectedDb ?? getDb();
  try {
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(vnstock_trading_stats)")
      .all();
    const hasDate = cols.some((c) => c.name === "date");
    if (!hasDate && cols.length > 0) {
      db.exec(
        `ALTER TABLE vnstock_trading_stats ADD COLUMN date TEXT NOT NULL DEFAULT '1970-01-01'`,
      );
      logger.info("[vnstock-store] migrated vnstock_trading_stats: added date column");
      resetTradingStatsDateCache();
    }
    // FIX-B-1: idempotent migration for market_cap_bn on existing production DBs
    const hasMarketCap = cols.some((c) => c.name === "market_cap_bn");
    if (!hasMarketCap && cols.length > 0) {
      db.exec(
        `ALTER TABLE vnstock_trading_stats ADD COLUMN market_cap_bn REAL`,
      );
      logger.info("[vnstock-store] migrated vnstock_trading_stats: added market_cap_bn column");
    }
  } catch (err) {
    logger.warn("[vnstock-store] trading_stats date-column migration skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Migration: remove stale UNIQUE(code) single-column constraint if present.
  //
  // Background: old production DBs have UNIQUE(code) in the original DDL, which
  // manifests as sqlite_autoindex_vnstock_trading_stats_1. A later migration added
  // uq_vnstats_code_date (UNIQUE on (code, date)) via CREATE UNIQUE INDEX.
  //
  // With both constraints in place, upsertForeignFlow's
  //   ON CONFLICT(code, date) DO UPDATE SET …
  // cannot handle UNIQUE(code) violations — SQLite fires the autoindex constraint
  // first, throwing "UNIQUE constraint failed: vnstock_trading_stats.code" on every
  // push that sends a ticker already present with any date.
  //
  // SQLite does not support DROP CONSTRAINT. The only fix is table rebuild:
  //   RENAME → CREATE (UNIQUE(code,date) only) → INSERT SELECT → DROP old → done.
  // Guard: only run when the DDL contains UNIQUE(code) as a standalone constraint.
  try {
    const ddlRow = db
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='vnstock_trading_stats'",
      )
      .get();

    if (!ddlRow) {
      logger.debug(
        "[vnstock-store] vnstock_trading_stats not found, skipping UNIQUE(code) constraint check",
      );
    } else {
      const ddl = ddlRow.sql;
      // Detect old UNIQUE(code) single-column constraint in DDL body.
      // Must NOT match UNIQUE(code, date) — only the bare UNIQUE(code) form.
      const hasUniqueCodeOnly =
        /UNIQUE\s*\(\s*code\s*\)/.test(ddl) && !/UNIQUE\s*\(\s*code\s*,\s*date\s*\)/.test(ddl);

      if (hasUniqueCodeOnly) {
        logger.warn(
          "[vnstock-store] detected UNIQUE(code) without UNIQUE(code,date) in DDL — rebuilding table",
        );

        // Dedup first so the new UNIQUE(code,date) index doesn't hit duplicates
        db.exec(`
          DELETE FROM vnstock_trading_stats
          WHERE id NOT IN (
            SELECT MAX(id) FROM vnstock_trading_stats GROUP BY code, date
          )
        `);

        // Build column list from actual old-table columns so the INSERT SELECT
        // works regardless of which optional columns exist in the old schema.
        const existingCols = db
          .query<{ name: string }, []>("PRAGMA table_info(vnstock_trading_stats)")
          .all()
          .map((c) => c.name);

        const canonicalCols = [
          "id",
          "code",
          "foreign_room",
          "foreign_volume",
          "current_holding_ratio",
          "max_holding_ratio",
          "avg_volume_2w",
          "high_52w",
          "low_52w",
          "pct_from_high_52w",
          "pct_from_low_52w",
          "market_cap_bn",
          "fetched_at",
          "created_at",
          "date",
        ];
        const sharedCols = canonicalCols.filter((c) => existingCols.includes(c));
        const colList = sharedCols.join(", ");

        db.exec(
          `ALTER TABLE vnstock_trading_stats RENAME TO vnstock_trading_stats_old_uq_code`,
        );
        db.exec(`
          CREATE TABLE vnstock_trading_stats (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            code                  TEXT NOT NULL,
            foreign_room          INTEGER,
            foreign_volume        INTEGER,
            current_holding_ratio REAL,
            max_holding_ratio     REAL,
            avg_volume_2w         INTEGER,
            high_52w              REAL,
            low_52w               REAL,
            pct_from_high_52w     REAL,
            pct_from_low_52w      REAL,
            market_cap_bn         REAL,
            fetched_at            TEXT NOT NULL DEFAULT (datetime('now')),
            created_at            TEXT NOT NULL DEFAULT (datetime('now')),
            date                  TEXT NOT NULL DEFAULT '1970-01-01',
            UNIQUE(code, date)
          )
        `);
        db.exec(
          `INSERT INTO vnstock_trading_stats (${colList}) SELECT ${colList} FROM vnstock_trading_stats_old_uq_code`,
        );
        db.exec(`DROP TABLE vnstock_trading_stats_old_uq_code`);

        // Reset module-level cache — new schema has date column
        resetTradingStatsDateCache();

        logger.info("[vnstock-store] vnstock_trading_stats rebuilt with UNIQUE(code, date) only");
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      logger.debug(
        "[vnstock-store] vnstock_trading_stats not found, skipping UNIQUE(code) rebuild",
      );
    } else {
      logger.error("[vnstock-store] UNIQUE(code) constraint rebuild FAILED", {
        error: msg,
        remediation: "Manual fix: DROP TABLE vnstock_trading_stats; run initDatabase() to recreate",
      });
      throw err;
    }
  }

  // Migration: ensure UNIQUE(code, date) index exists for ON CONFLICT(code, date)
  // upsert to work. The ALTER TABLE migration above only adds the column + a
  // regular (non-unique) index. ON CONFLICT requires a UNIQUE index.
  // Production DBs migrated from old schema have the column but lack the
  // UNIQUE constraint — causing "ON CONFLICT clause does not match any
  // PRIMARY KEY or UNIQUE constraint" errors on every push-foreign-flow call.
  try {
    // Dedup BEFORE creating the UNIQUE index.
    // When the `date` column was added via ALTER TABLE DEFAULT '1970-01-01',
    // every pre-existing row got the same date. This produces N duplicate
    // (code, '1970-01-01') pairs. CREATE UNIQUE INDEX fails on duplicates.
    // Fix: keep only the row with the highest id per (code, date) — that row
    // has the most recent fetched_at value (largest autoincrement).
    // Safe to run on clean DBs (DELETE affects 0 rows when no duplicates exist).
    db.exec(`
      DELETE FROM vnstock_trading_stats
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM vnstock_trading_stats
        GROUP BY code, date
      )
    `);
    logger.info("[vnstock-store] dedup vnstock_trading_stats (code, date) complete");

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_vnstats_code_date ON vnstock_trading_stats(code, date)`,
    );
    // Drop the old non-unique index if it exists — the unique index supersedes it
    db.exec(`DROP INDEX IF EXISTS idx_vnstats_code_date`);

    // VALIDATE: Ensure the UNIQUE index was created successfully
    // Check if table has rows (meaning it exists and has data)
    const tableExists = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM pragma_table_list() WHERE name = 'vnstock_trading_stats'`
      )
      .get();

    if (!tableExists || tableExists.cnt === 0) {
      // Table doesn't exist yet (normal in test environment before initDatabase)
      logger.debug("[vnstock-store] vnstock_trading_stats table does not exist yet, skipping UNIQUE index validation");
      return;
    }

    const indexCheck = db
      .prepare<{ name: string; "unique": number }, [string]>(
        `SELECT name, "unique" FROM pragma_index_list('vnstock_trading_stats') WHERE name = ?`
      )
      .get('uq_vnstats_code_date');

    if (!indexCheck) {
      throw new Error(
        "UNIQUE index 'uq_vnstats_code_date' was not created. " +
        "Verify table exists and has 'code' and 'date' columns."
      );
    }
    if (!indexCheck.unique) {
      throw new Error(
        "Index 'uq_vnstats_code_date' exists but is not UNIQUE. " +
        "Drop and recreate it."
      );
    }

    logger.info("[vnstock-store] UNIQUE(code, date) index validated on vnstock_trading_stats");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If table doesn't exist, log at debug level and continue (test environment)
    if (msg.includes("no such table")) {
      logger.debug("[vnstock-store] vnstock_trading_stats table does not exist, skipping UNIQUE index validation");
      return;
    }
    // Real error in production — fail fast
    logger.error("[vnstock-store] UNIQUE(code, date) index validation FAILED", {
      error: msg,
      remediation: "Manual fix: DROP TABLE vnstock_trading_stats; run initDatabase() to recreate",
    });
    throw err;
  }
}
