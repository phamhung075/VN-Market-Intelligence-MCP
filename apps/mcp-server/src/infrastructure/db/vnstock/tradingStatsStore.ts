/**
 * Infrastructure — vnstock Trading Stats Store
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts.
 * Owns the `_tradingStatsHasDateColumn` schema-detection cache — shared with
 * foreignFlowStore.ts (writes the same table) and migrations.ts (resets the
 * cache after a schema-changing migration). Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import type { VnstockTradingStats } from "../../../domain/models/vnstockTypes.js";
import { markFetched } from "./fetchLog.js";

// Cached column-presence flag — production DBs predate the `date` column
// (commit af09eb8 dropped date partitioning in favour of UNIQUE(code)). Tests
// build their own schemas with date, so we detect at runtime instead of
// forcing a single schema everywhere.
let _tradingStatsHasDateColumn: boolean | null = null;

/** Reset the cached schema-detection flag. Called by migrations.ts after any
 * DDL change to vnstock_trading_stats (ADD COLUMN date, table rebuild). */
export function resetTradingStatsDateCache(): void {
  _tradingStatsHasDateColumn = null;
}

export function tradingStatsHasDate(db: ReturnType<typeof getDb>): boolean {
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
    // FIX-FOREIGN-FLOW-INTEGRITY-BREAK: Writer B (VCI/vnstock) must NOT overwrite
    // foreign_volume / foreign_room — those belong to Writer A (VPS push / upsertForeignFlow).
    // VCI writes cumulative holding (foreigner_pct × total_shares) which is semantically
    // incompatible with Writer A's daily buy−sell net. Use ON CONFLICT DO UPDATE SET that
    // EXCLUDES foreign_volume and foreign_room from the update clause.
    // On INSERT (new row) we write foreign_volume/foreign_room as NULL to avoid fabricated
    // values appearing before Writer A has run; on CONFLICT (existing row) we skip them.
    db.prepare(
      `INSERT INTO vnstock_trading_stats
       (code, date, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio,
        avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, market_cap_bn, fetched_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code, date) DO UPDATE SET
         current_holding_ratio = excluded.current_holding_ratio,
         max_holding_ratio     = excluded.max_holding_ratio,
         avg_volume_2w         = excluded.avg_volume_2w,
         high_52w              = excluded.high_52w,
         low_52w               = excluded.low_52w,
         pct_from_high_52w     = excluded.pct_from_high_52w,
         pct_from_low_52w      = excluded.pct_from_low_52w,
         market_cap_bn         = excluded.market_cap_bn,
         fetched_at            = excluded.fetched_at`,
    ).run(
      s.code, today, s.currentHoldingRatio, s.maxHoldingRatio,
      s.avgVolume2w, s.high52w, s.low52w, s.pctFromHigh52w, s.pctFromLow52w, s.marketCapBn ?? null, s.fetchedAt,
    );
  } else {
    // Production schema without `date` column — UNIQUE(code) replaces UNIQUE(code, date).
    // Same write-isolation rule applies: do NOT overwrite foreign_volume / foreign_room.
    db.prepare(
      `INSERT INTO vnstock_trading_stats
       (code, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio,
        avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, market_cap_bn, fetched_at)
       VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         current_holding_ratio = excluded.current_holding_ratio,
         max_holding_ratio     = excluded.max_holding_ratio,
         avg_volume_2w         = excluded.avg_volume_2w,
         high_52w              = excluded.high_52w,
         low_52w               = excluded.low_52w,
         pct_from_high_52w     = excluded.pct_from_high_52w,
         pct_from_low_52w      = excluded.pct_from_low_52w,
         market_cap_bn         = excluded.market_cap_bn,
         fetched_at            = excluded.fetched_at`,
    ).run(
      s.code, s.currentHoldingRatio, s.maxHoldingRatio,
      s.avgVolume2w, s.high52w, s.low52w, s.pctFromHigh52w, s.pctFromLow52w, s.marketCapBn ?? null, s.fetchedAt,
    );
  }
  markFetched(s.code, "trading_stats");
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
