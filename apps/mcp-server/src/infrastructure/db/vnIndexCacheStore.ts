/**
 * vnIndexCacheStore.ts — VN-Index snapshot cache writer
 *
 * FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20)
 *
 * Upserts the latest VNINDEX (or other index) snapshot into vn_index_cache.
 * The table holds exactly one row per code (code = PRIMARY KEY).
 * INSERT OR REPLACE acts as an idempotent upsert.
 *
 * DDD layer: infrastructure/db — may use SQLite, must not import domain/.
 *
 * @module infrastructure/db/vnIndexCacheStore
 */

import type { Database } from "bun:sqlite";
import type { MarketPrice } from "../fetchers/hose.js";

/**
 * Upserts a MarketPrice snapshot into the vn_index_cache table.
 *
 * Uses parameterised SQL only (no string interpolation).
 * INSERT OR REPLACE on PRIMARY KEY (code) guarantees the table holds
 * at most one row per index code — no phantom duplicates.
 *
 * @param db    - Open bun:sqlite Database instance
 * @param price - MarketPrice snapshot to persist
 */
export function upsertVnIndexCache(db: Database, price: MarketPrice): void {
  db.prepare(`
    INSERT OR REPLACE INTO vn_index_cache (code, price, prev_price, change_pct, volume, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    price.code,
    price.price,
    price.previousPrice,
    price.changePct,
    price.volume,
    price.fetchedAt,
  );
}

/**
 * Reads the cached VNINDEX snapshot from vn_index_cache.
 * Returns null when the table has no row for the requested code.
 *
 * @param db   - Open bun:sqlite Database instance
 * @param code - Index code (default: "VNINDEX")
 */
export interface VnIndexCacheRow {
  code: string;
  price: number;
  prev_price: number;
  change_pct: number;
  volume: number;
  fetched_at: string;
}

export function getVnIndexCache(
  db: Database,
  code = "VNINDEX",
): VnIndexCacheRow | null {
  return (
    db
      .prepare<VnIndexCacheRow, [string]>(
        `SELECT code, price, prev_price, change_pct, volume, fetched_at
         FROM vn_index_cache
         WHERE code = ?`,
      )
      .get(code) ?? null
  );
}
