/**
 * Evening Summary — Step 6c: data timestamps for FR-3 crisis detection.
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";

/**
 * Fetches MAX(market_prices.updated_at) (excluding TEST/PROBE rows) and
 * MAX(rag_analyses.created_at) — used by FR-3 evening summary data crisis
 * detection to flag stale price/news data in the evening report.
 */
export function queryDataTimestamps(db: Database): { lastPriceUpdate?: string; lastNewsUpdate?: string } {
  let lastPriceUpdate: string | undefined;
  let lastNewsUpdate: string | undefined;
  try {
    const priceRow = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(updated_at) AS ts FROM market_prices WHERE code NOT IN ('TEST','PROBE')",
      )
      .get();
    if (priceRow?.ts) {
      lastPriceUpdate = priceRow.ts;
    }

    const newsRow = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(created_at) AS ts FROM rag_analyses",
      )
      .get();
    if (newsRow?.ts) {
      lastNewsUpdate = newsRow.ts;
    }
  } catch (tsErr) {
    logger.warn("[assembleEveningSummary] data timestamp fetch failed", {
      error: tsErr instanceof Error ? tsErr.message : String(tsErr),
    });
  }

  return {
    ...(lastPriceUpdate !== undefined ? { lastPriceUpdate } : {}),
    ...(lastNewsUpdate !== undefined ? { lastNewsUpdate } : {}),
  };
}
