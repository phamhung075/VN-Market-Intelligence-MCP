/**
 * Infrastructure — vnstock Data Store
 *
 * SQLite storage for all vnstock data: financials, trading stats,
 * officers, shareholders, events, balance sheet, cash flow.
 * Lazy-fetched and cached locally.
 *
 * Rate limit strategy: vnstock free = 60 req/min.
 * Each stock needs ~9 requests for full snapshot.
 * With 4 stocks in watchlist = 36 requests = well within limit.
 * Lazy fetch: only refresh if data is older than staleness threshold.
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";
import { bridgeOCFToFinancialReports, bridgeNetProfitToFinancialReports } from "./schema-financial-reports.js";
import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../../domain/models/vnstockTypes.js";
import type { VnstockEvent } from "../../domain/models/shared-types.js";
import type { DailyForeignFlow } from "../../domain/services/foreignFlowAnalyzer.js";
import type { ForeignFlowUpsertItem } from "../../domain/models/shared-types.js";

// ---------------------------------------------------------------------------
// DDL — canonical SSOT is initDatabase() in schema.ts (Task 1042)
// Tests use src/__tests__/helpers/vnstockTestDdl.ts for in-memory setup.
// ---------------------------------------------------------------------------

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
      _tradingStatsHasDateColumn = null;
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
        _tradingStatsHasDateColumn = null;

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

// ---------------------------------------------------------------------------
// Staleness check — lazy fetch only if data is old
// ---------------------------------------------------------------------------

/**
 * Check if data for a given code+type was fetched recently.
 * @param code - Stock code
 * @param dataType - "financials" | "trading_stats" | "officers" | "shareholders" | "events" | "balance_sheet" | "cash_flow"
 * @param maxAgeMinutes - Max age before considered stale (default: 360 = 6 hours)
 */
export function isStale(code: string, dataType: string, maxAgeMinutes = 360): boolean {
  const db = getDb();
  try {
    const row = db
      .prepare<{ fetched_at: string }, [string, string]>(
        `SELECT fetched_at FROM vnstock_fetch_log
         WHERE code = ? AND data_type = ?`,
      )
      .get(code, dataType);

    if (!row) return true;

    const fetchedAt = new Date(row.fetched_at).getTime();
    const now = Date.now();
    return now - fetchedAt > maxAgeMinutes * 60 * 1000;
  } catch {
    return true;
  }
}

/**
 * Mark a (code, dataType) pair as fetched.
 *
 * @param code            Stock code
 * @param dataType        Data type identifier
 * @param backoffMinutes  Optional. When set, back-dates `fetched_at` so that
 *                        the next isStale() check returns true after roughly
 *                        `backoffMinutes` (assuming the caller uses a 6h-24h
 *                        freshness window). Used on empty/timeout results to
 *                        throttle retries WITHOUT silencing the source for the
 *                        full freshness window. When omitted, stamps `now`
 *                        (full backoff — appropriate for stored success).
 */
export function markFetched(
  code: string,
  dataType: string,
  backoffMinutes?: number,
): void {
  const db = getDb();
  if (backoffMinutes !== undefined && backoffMinutes > 0) {
    // Back-date so that next isStale() check trips after ~backoffMinutes.
    // We stamp fetched_at = now - (24h - backoffMinutes) which means callers
    // using any freshness window between backoffMinutes and 24h will retry
    // again roughly `backoffMinutes` from now.
    const offsetMinutes = 24 * 60 - backoffMinutes;
    db.prepare(
      `INSERT OR REPLACE INTO vnstock_fetch_log (code, data_type, fetched_at)
       VALUES (?, ?, datetime('now', ? || ' minutes'))`,
    ).run(code, dataType, `-${offsetMinutes}`);
    return;
  }
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_fetch_log (code, data_type, fetched_at)
     VALUES (?, ?, datetime('now'))`,
  ).run(code, dataType);
}

// ---------------------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------------------

export function storeFinancials(f: VnstockFinancials): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_financials
     (code, year_report, quarter, revenue_bn, revenue_yoy, net_profit_bn, net_profit_yoy,
      eps, pe, pb, roe, roa, debt_to_equity, net_profit_margin, nim, npl, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    f.code, f.yearReport, f.quarter, f.revenue, f.revenueYoY, f.netProfit, f.netProfitYoY,
    f.eps, f.pe, f.pb, f.roe, f.roa, f.debtToEquity, f.netProfitMargin,
    f.nim, f.npl, f.source, f.fetchedAt,
  );
  markFetched(f.code, "financials");
  // Task 1941d: lift net_profit_bn into financial_reports.net_profit_api_bridge
  // so cashFlowTool prefers the API value over OCR extraction for OCF/NI ratio.
  bridgeNetProfitToFinancialReports(getDb(), f.code);
}

// Cached column-presence flag — production DBs predate the `date` column
// (commit af09eb8 dropped date partitioning in favour of UNIQUE(code)).
// Tests build their own schemas with date, so we detect at runtime instead
// of forcing a single schema everywhere.
let _tradingStatsHasDateColumn: boolean | null = null;
function tradingStatsHasDate(db: ReturnType<typeof getDb>): boolean {
  if (_tradingStatsHasDateColumn !== null) return _tradingStatsHasDateColumn;
  try {
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(vnstock_trading_stats)")
      .all();
    _tradingStatsHasDateColumn = cols.some((c) => c.name === "date");
  } catch {
    _tradingStatsHasDateColumn = false;
  }
  return _tradingStatsHasDateColumn;
}

export function storeTradingStats(s: VnstockTradingStats, date?: string): void {
  const db = getDb();
  if (tradingStatsHasDate(db)) {
    const today = date ?? new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR REPLACE INTO vnstock_trading_stats
       (code, date, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio,
        avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, market_cap_bn, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      s.code, today, s.foreignRoom, s.foreignVolume, s.currentHoldingRatio, s.maxHoldingRatio,
      s.avgVolume2w, s.high52w, s.low52w, s.pctFromHigh52w, s.pctFromLow52w, s.marketCapBn ?? null, s.fetchedAt,
    );
  } else {
    // Production schema without `date` column — UNIQUE(code) replaces UNIQUE(code, date)
    db.prepare(
      `INSERT OR REPLACE INTO vnstock_trading_stats
       (code, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio,
        avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, market_cap_bn, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      s.code, s.foreignRoom, s.foreignVolume, s.currentHoldingRatio, s.maxHoldingRatio,
      s.avgVolume2w, s.high52w, s.low52w, s.pctFromHigh52w, s.pctFromLow52w, s.marketCapBn ?? null, s.fetchedAt,
    );
  }
  markFetched(s.code, "trading_stats");
}

export function storeOfficers(code: string, officers: VnstockOfficer[]): void {
  // Guard: ensure officers is actually an array (not null, undefined, or other type)
  if (!officers || !Array.isArray(officers)) {
    logger.warn(
      `[vnstock-store] storeOfficers: officers is not an array for ticker ${code}`,
      { code, officersType: typeof officers, isArray: Array.isArray(officers) }
    );
    markFetched(code, "officers");
    return;
  }
  const valid = officers.filter((o) => !!o.code);
  const dropped = officers.length - valid.length;
  if (dropped > 0) {
    logger.warn(
      `[vnstock-store] storeOfficers: dropped ${dropped} row(s) with null/empty code for ticker ${code}`,
      { code, dropped }
    );
  }
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_officers (code, name, position, own_percent, quantity, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const o of valid) {
      stmt.run(o.code, o.name, o.position, o.ownPercent, o.quantity, now);
    }
  });
  insertAll();
  markFetched(code, "officers");
}

export function storeShareholders(code: string, holders: VnstockShareholder[]): void {
  // Guard: ensure holders is actually an array (not null, undefined, or other type)
  if (!holders || !Array.isArray(holders)) {
    logger.warn(
      `[vnstock-store] storeShareholders: holders is not an array for ticker ${code}`,
      { code, holdersType: typeof holders, isArray: Array.isArray(holders) }
    );
    markFetched(code, "shareholders");
    return;
  }
  const valid = holders.filter((h) => !!h.code);
  const dropped = holders.length - valid.length;
  if (dropped > 0) {
    logger.warn(
      `[vnstock-store] storeShareholders: dropped ${dropped} row(s) with null/empty code for ticker ${code}`,
      { code, dropped }
    );
  }
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const h of valid) {
      stmt.run(h.code, h.name, h.quantity, h.ownPercent, now);
    }
  });
  insertAll();
  markFetched(code, "shareholders");
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export function getLatestFinancials(code: string): VnstockFinancials | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_financials WHERE code = ? ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    source: row.source,
    revenue: row.revenue_bn,
    revenueYoY: row.revenue_yoy,
    netProfit: row.net_profit_bn,
    netProfitYoY: row.net_profit_yoy,
    eps: row.eps,
    pe: row.pe,
    pb: row.pb,
    roe: row.roe,
    roa: row.roa,
    debtToEquity: row.debt_to_equity,
    netProfitMargin: row.net_profit_margin,
    nim: row.nim,
    npl: row.npl,
    fetchedAt: row.fetched_at,
  };
}

export function getTradingStats(code: string): VnstockTradingStats | null {
  const db = getDb();
  // Use fetched_at — production tables predate the `date` column (commit
  // af09eb8 removed the date partition; UNIQUE(code) is the active key).
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_trading_stats WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    foreignRoom: row.foreign_room,
    foreignVolume: row.foreign_volume,
    currentHoldingRatio: row.current_holding_ratio,
    maxHoldingRatio: row.max_holding_ratio,
    avgVolume2w: row.avg_volume_2w,
    high52w: row.high_52w,
    low52w: row.low_52w,
    pctFromHigh52w: row.pct_from_high_52w,
    pctFromLow52w: row.pct_from_low_52w,
    marketCapBn: row.market_cap_bn ?? null,
    fetchedAt: row.fetched_at,
  };
}

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
    holdingRatio: row.current_holding_ratio ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Foreign flow upsert — Task 1131, Sprint 061
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Events store / read
// ---------------------------------------------------------------------------

export function storeEvents(code: string, events: VnstockEvent[]): void {
  // Guard: ensure events is actually an array (not null, undefined, or other type)
  if (!events || !Array.isArray(events)) {
    logger.warn(
      `[vnstock-store] storeEvents: events is not an array for ticker ${code}`,
      { code, eventsType: typeof events, isArray: Array.isArray(events) }
    );
    markFetched(code, "events");
    return;
  }
  // Guard: skip rows where code is null/undefined/empty — prevents NOT NULL constraint failure
  const valid = events.filter((ev) => !!ev.code);
  const dropped = events.length - valid.length;
  if (dropped > 0) {
    logger.warn(
      `[vnstock-store] storeEvents: dropped ${dropped} row(s) with null/empty code for ticker ${code}`,
      { code, dropped }
    );
  }
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_events
     (code, event_name, event_date, event_type, description, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const ev of valid) {
      stmt.run(ev.code, ev.eventName, ev.eventDate, ev.eventType, ev.description, now);
    }
  });
  insertAll();
  markFetched(code, "events");
}

export function getEvents(code: string): VnstockEvent[] {
  const db = getDb();
  const rows = db
    .prepare<any, [string]>(
      `SELECT code, event_name, event_date, event_type, description
       FROM vnstock_events
       WHERE code = ?
       ORDER BY event_date ASC`,
    )
    .all(code);

  return rows.map((row) => ({
    code: row.code,
    eventName: row.event_name,
    eventDate: row.event_date,
    eventType: row.event_type,
    description: row.description ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Balance Sheet store/read
// ---------------------------------------------------------------------------

/**
 * Store a balance sheet row. Uses INSERT OR REPLACE (UPSERT on unique key).
 */
export function storeBalanceSheet(bs: VnstockBalanceSheet): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_balance_sheet
     (code, year_report, quarter, total_assets_bn, total_liabilities_bn, total_equity_bn,
      cash_bn, short_term_debt_bn, long_term_debt_bn, receivables_bn, inventory_bn,
      source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    bs.code, bs.yearReport, bs.quarter,
    bs.totalAssets, bs.totalLiabilities, bs.totalEquity,
    bs.cash, bs.shortTermDebt, bs.longTermDebt, bs.receivables, bs.inventory,
    bs.source, bs.fetchedAt,
  );
  markFetched(bs.code, "balance_sheet");
}

/**
 * Retrieve the most recent balance sheet for a stock (by year_report DESC, quarter DESC).
 */
export function getLatestBalanceSheet(code: string): VnstockBalanceSheet | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_balance_sheet
       WHERE code = ?
       ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    totalAssets: row.total_assets_bn,
    totalLiabilities: row.total_liabilities_bn,
    totalEquity: row.total_equity_bn,
    cash: row.cash_bn,
    shortTermDebt: row.short_term_debt_bn,
    longTermDebt: row.long_term_debt_bn,
    receivables: row.receivables_bn,
    inventory: row.inventory_bn,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}

// ---------------------------------------------------------------------------
// Cash Flow store/read
// ---------------------------------------------------------------------------

/**
 * Store a cash flow row. Uses INSERT OR REPLACE (UPSERT on unique key).
 */
export function storeCashFlow(cf: VnstockCashFlow): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_cash_flow
     (code, year_report, quarter, operating_cf_bn, investing_cf_bn,
      financing_cf_bn, net_cf_bn, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    cf.code, cf.yearReport, cf.quarter,
    cf.operatingCashFlow, cf.investingCashFlow,
    cf.financingCashFlow, cf.netCashFlow,
    cf.source, cf.fetchedAt,
  );
  markFetched(cf.code, "cash_flow");
  // Task 1878a: bridge OCF to financial_reports immediately after store.
  // Updates ALL quarters for this ticker (idempotent, covers historical rows).
  bridgeOCFToFinancialReports(db, cf.code);
}

/**
 * Retrieve the most recent cash flow for a stock (by year_report DESC, quarter DESC).
 */
export function getLatestCashFlow(code: string): VnstockCashFlow | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_cash_flow
       WHERE code = ?
       ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    operatingCashFlow: row.operating_cf_bn,
    investingCashFlow: row.investing_cf_bn,
    financingCashFlow: row.financing_cf_bn,
    netCashFlow: row.net_cf_bn,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}
