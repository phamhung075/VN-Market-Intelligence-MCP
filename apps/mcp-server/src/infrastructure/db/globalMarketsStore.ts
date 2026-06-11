/**
 * globalMarketsStore.ts
 *
 * Read-only infrastructure store for the `commodity_prices_history` table.
 * Part of the TASK17-PAGE12 endpoint wave (GET /api/global-markets).
 *
 * Table: commodity_prices_history
 *   id INTEGER PK, source TEXT, fetched_at TEXT ISO8601-with-ms-and-Z
 *   brent_crude_usd REAL, gold_usd_per_oz REAL, usd_vnd_rate REAL, vix REAL
 *   sp500 REAL, shanghai_comp REAL, hang_seng REAL, dxy REAL
 *   copper_usd REAL, silver_usd_per_oz REAL, jpy_vnd_rate REAL, us10y_yield REAL
 *   cny_vnd_rate REAL — DEAD COLUMN (always 0), NEVER exposed in responses
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   1226 rows, hourly (~35/day), span ~51 days
 *   brent/gold/usd_vnd = 1226/1226 (100%)
 *   vix/sp500/shanghai/hang_seng/dxy/copper/silver/jpy_vnd = 837/1226 (all recent rows)
 *   us10y_yield = 743/1226
 *   cny_vnd_rate = 0/1226 (DEAD — excluded)
 *
 * CRITICAL ZERO-AS-MISSING RULE: value of 0 means "not captured" for market
 * indicators (older rows), NOT a real price. Delta computation in handler must
 * treat baseline <= 0 as NULL (unavailable).
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — NEVER string-interpolate user input.
 *
 * @module infrastructure/db/globalMarketsStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row from commodity_prices_history.
 * cny_vnd_rate is intentionally omitted — dead column, never exposed.
 */
export type CommodityPriceRow = {
  source: string;
  fetched_at: string;
  brent_crude_usd: number;
  gold_usd_per_oz: number;
  usd_vnd_rate: number;
  vix: number;
  sp500: number;
  shanghai_comp: number;
  hang_seng: number;
  dxy: number;
  copper_usd: number;
  silver_usd_per_oz: number;
  jpy_vnd_rate: number;
  us10y_yield: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the latest row (MAX(fetched_at)) from commodity_prices_history.
 * Returns null when the table is empty.
 *
 * @param db - SQLite database instance (injected)
 */
export function getLatestRow(db: Database): CommodityPriceRow | null {
  const row = db
    .prepare(
      `SELECT source, fetched_at,
              brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
              vix, sp500, shanghai_comp, hang_seng, dxy,
              copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield
       FROM commodity_prices_history
       ORDER BY fetched_at DESC
       LIMIT 1`,
    )
    .get() as CommodityPriceRow | null;
  return row ?? null;
}

/**
 * Return the baseline row with MAX(fetched_at) WHERE fetched_at <= beforeIso.
 * Used for 24h and 7d delta computation.
 * Returns null when no row exists before the given timestamp.
 *
 * @param db        - SQLite database instance (injected)
 * @param beforeIso - ISO 8601 timestamp string (same "YYYY-MM-DDTHH:MM:SS.sssZ"
 *                    form as fetched_at so SQLite string comparison works correctly)
 */
export function getBaselineRow(db: Database, beforeIso: string): CommodityPriceRow | null {
  const row = db
    .prepare(
      `SELECT source, fetched_at,
              brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
              vix, sp500, shanghai_comp, hang_seng, dxy,
              copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield
       FROM commodity_prices_history
       WHERE fetched_at <= ?
       ORDER BY fetched_at DESC
       LIMIT 1`,
    )
    .get(beforeIso) as CommodityPriceRow | null;
  return row ?? null;
}

/**
 * Return rows with fetched_at >= sinceIso, ordered ASC for sparklines.
 * A LIMIT is applied to guard against huge result sets.
 *
 * @param db       - SQLite database instance (injected)
 * @param sinceIso - ISO 8601 timestamp string lower bound (parameterized)
 * @param limit    - Maximum row count (caller should pass ~2000)
 */
export function getSeriesSince(
  db: Database,
  sinceIso: string,
  limit: number,
): CommodityPriceRow[] {
  const rows = db
    .prepare(
      `SELECT source, fetched_at,
              brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
              vix, sp500, shanghai_comp, hang_seng, dxy,
              copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield
       FROM commodity_prices_history
       WHERE fetched_at >= ?
       ORDER BY fetched_at ASC
       LIMIT ?`,
    )
    .all(sinceIso, limit) as CommodityPriceRow[];
  return rows;
}
