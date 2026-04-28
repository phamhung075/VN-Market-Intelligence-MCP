/**
 * VN-Index Refresh Job (Task 1397)
 *
 * Fetches VNINDEX (and optionally HNX-INDEX / UPCOM-INDEX) from the VnDirect
 * vnmarket_prices API and upserts into market_prices + market_prices_history.
 *
 * Called by the scheduler every 5 min during VN market hours.
 * Does NOT depend on the VPS price-push pipeline — fetches directly.
 *
 * Layer: interface/scheduler
 */

import { fetchVnIndex, storeMarketPrices } from "../../infrastructure/fetchers/hose.js";
import { logger } from "../../infrastructure/logger.js";

/** Index codes to refresh on each cycle. */
const INDEX_CODES = ["VNINDEX"];

export interface VnIndexRefreshResult {
  fetched: number;   // number of index codes successfully fetched
  stored: number;    // number of MarketPrice rows passed to storeMarketPrices
  skipped: number;   // codes that returned null (API unavailable)
}

/**
 * Fetch all INDEX_CODES and upsert into market_prices.
 * Never throws — errors are logged and counted as skipped.
 */
export async function runVnIndexRefreshJob(): Promise<VnIndexRefreshResult> {
  let fetched = 0;
  let skipped = 0;
  const prices = [];

  for (const code of INDEX_CODES) {
    try {
      const price = await fetchVnIndex(code);
      if (price === null) {
        logger.debug("[vn-index-refresh] API returned null", { code });
        skipped++;
      } else {
        prices.push(price);
        fetched++;
      }
    } catch (err) {
      logger.warn("[vn-index-refresh] fetch failed", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  if (prices.length > 0) {
    await storeMarketPrices(prices);
    logger.debug("[vn-index-refresh] stored", { count: prices.length });
  }

  return { fetched, stored: prices.length, skipped };
}
