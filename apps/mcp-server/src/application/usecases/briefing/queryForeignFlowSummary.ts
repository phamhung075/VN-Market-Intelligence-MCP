/**
 * Morning Briefing — Step 15: foreign flow summary (previous trading day, watchlist only).
 *
 * Extracted from assembleBriefing.ts (formerly the module-level queryForeignFlowSummary
 * helper at line 474) — FACTORY-APP-split-assembleBriefing.
 *
 * `queryForeignFlowSummary` (this file's raw/throwing implementation) is the
 * exact function `assembleBriefing.ts` re-exports as `queryForeignFlowSummary_TEST`
 * — kept unwrapped (no try/catch) so unit tests can exercise the SQL filter
 * logic directly against an injected in-memory DB, same as before the split.
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { sqlInClause } from "../../../infrastructure/db/sqlHelpers.js";
import type { ForeignFlowBriefingRow } from "./types.js";

interface VnstatsRow {
  code: string;
  date: string;
  foreign_volume: number;
}

/**
 * Query vnstock_trading_stats for the most-recent foreign_volume per watchlist stock.
 * Returns top 3 net-buy + top 3 net-sell rows (up to 6 total).
 * Excludes rows where foreign_volume = 0, NULL, or the sentinel ±9999999.
 * Returns [] when watchlist is empty or no qualifying rows exist.
 *
 * @internal exported raw (throws on DB error) — see queryForeignFlowSummary_TEST re-export.
 */
export function queryForeignFlowSummary(
  db: Database,
  watchlistCodes: string[],
): ForeignFlowBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const placeholders = sqlInClause(watchlistCodes.length);
  const rows = db
    .prepare<VnstatsRow, (string | number)[]>(`
      SELECT code,
             substr(fetched_at, 1, 10) AS date,
             foreign_volume
      FROM vnstock_trading_stats
      WHERE code IN (${placeholders})
        AND foreign_volume IS NOT NULL
        AND foreign_volume != 0
        AND ABS(foreign_volume) != 9999999
        AND (code, fetched_at) IN (
              SELECT code, MAX(fetched_at)
              FROM vnstock_trading_stats
              WHERE code IN (${placeholders})
              GROUP BY code
            )
      ORDER BY foreign_volume DESC
    `)
    .all(...watchlistCodes, ...watchlistCodes);

  const netBuyRows = rows
    .filter((r) => r.foreign_volume > 0)
    .slice(0, 3)
    .map((r): ForeignFlowBriefingRow => ({
      code: r.code,
      direction: "net_buy",
      foreignVolume: r.foreign_volume,
      date: r.date,
    }));

  // rows is ordered DESC so most-negative values are at the end
  const netSellRows = rows
    .filter((r) => r.foreign_volume < 0)
    .slice(-3)
    .map((r): ForeignFlowBriefingRow => ({
      code: r.code,
      direction: "net_sell",
      foreignVolume: r.foreign_volume,
      date: r.date,
    }));

  return [...netBuyRows, ...netSellRows];
}

/** Step wrapper — swallows/logs errors so a foreign-flow query failure never aborts the briefing. */
export function queryForeignFlowSummaryStep(
  db: Database,
  watchlistCodes: string[],
): ForeignFlowBriefingRow[] {
  try {
    return queryForeignFlowSummary(db, watchlistCodes);
  } catch (ffErr) {
    logger.warn("[assembleBriefing] foreignFlowSummary step failed", {
      error: ffErr instanceof Error ? ffErr.message : String(ffErr),
    });
    return [];
  }
}
