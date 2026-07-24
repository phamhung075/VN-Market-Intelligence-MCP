/**
 * Infrastructure — vnstock fetch-log utilities
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). Shared staleness-check helpers used by every per-entity
 * store in this folder — kept in its own module rather than duplicated 8x.
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";

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
