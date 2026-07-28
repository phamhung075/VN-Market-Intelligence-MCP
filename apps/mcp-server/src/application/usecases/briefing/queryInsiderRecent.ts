/**
 * Morning Briefing — Step 14: insider transactions (last 24h, watchlist only).
 *
 * Extracted from assembleBriefing.ts (formerly the module-level queryInsiderRecent
 * helper at line 442) — FACTORY-APP-split-assembleBriefing.
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { sqlInClause } from "../../../infrastructure/db/sqlHelpers.js";
import type { InsiderBriefingRow } from "./types.js";

interface InsiderTransactionRow {
  code: string;
  type: string;
  executed_volume: number;
  insider_name: string;
  from_date: string;
}

/**
 * Query insider_transactions for watchlist stocks active in the last 24h.
 * Returns at most 3 rows ordered by executed_volume DESC.
 * Returns [] when watchlistCodes is empty, no rows match, or the query throws.
 */
function queryInsiderRecentImpl(
  db: Database,
  watchlistCodes: string[],
): InsiderBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const placeholders = sqlInClause(watchlistCodes.length);
  const rows = db
    .prepare<InsiderTransactionRow, (string | number)[]>(`
      SELECT code, type, executed_volume, insider_name, from_date
      FROM insider_transactions
      WHERE fetched_at >= ?
        AND code IN (${placeholders})
      ORDER BY executed_volume DESC
      LIMIT 3
    `)
    .all(since24h, ...watchlistCodes);
  return rows.map((r) => ({
    code: r.code,
    type: r.type,
    executedVolume: r.executed_volume,
    insiderName: r.insider_name,
    fromDate: r.from_date,
  }));
}

/** Step wrapper — swallows/logs errors so an insider-query failure never aborts the briefing. */
export function queryInsiderRecent(db: Database, watchlistCodes: string[]): InsiderBriefingRow[] {
  try {
    return queryInsiderRecentImpl(db, watchlistCodes);
  } catch (insiderErr) {
    logger.warn("[assembleBriefing] insiderRecent step failed", {
      error: insiderErr instanceof Error ? insiderErr.message : String(insiderErr),
    });
    return [];
  }
}
