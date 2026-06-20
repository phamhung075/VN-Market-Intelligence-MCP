/**
 * VN-Index Refresh Job (Task 1397)
 *
 * Fetches VNINDEX (and optionally HNX-INDEX / UPCOM-INDEX) from the VnDirect
 * vnmarket_prices API and upserts into:
 *   - market_prices + market_prices_history (via storeMarketPrices)
 *   - vn_index_cache (via upsertVnIndexCache — FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH)
 *
 * Called by the scheduler every 5 min during VN market hours.
 * Does NOT depend on the VPS price-push pipeline — fetches directly.
 *
 * Layer: interface/scheduler
 */

import type { MarketPrice } from "../../infrastructure/fetchers/hose.js";
import { fetchVnIndex, storeMarketPrices } from "../../infrastructure/fetchers/hose.js";
import { upsertVnIndexCache } from "../../infrastructure/db/vnIndexCacheStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";

/** Index codes to refresh on each cycle. */
const INDEX_CODES = ["VNINDEX"];

export interface VnIndexRefreshResult {
  fetched: number;   // number of index codes successfully fetched
  stored: number;    // number of MarketPrice rows passed to storeMarketPrices
  skipped: number;   // codes that returned null (API unavailable)
}

/**
 * Injectable cache-write function signature.
 * Production uses upsertVnIndexCache(getDb(), price).
 * Tests can inject a no-op or a spy to avoid requiring the table to exist.
 * @internal
 */
export type UpsertVnIndexCacheFn = (price: MarketPrice) => void;

/**
 * Fetch all INDEX_CODES and upsert into market_prices + vn_index_cache.
 * Never throws — errors are logged and counted as skipped.
 *
 * @param _upsertCacheFn Optional injected cache writer (for testing only).
 *   When omitted, the production upsertVnIndexCache(getDb(), price) is used.
 */
export async function runVnIndexRefreshJob(
  _upsertCacheFn?: UpsertVnIndexCacheFn,
): Promise<VnIndexRefreshResult> {
  let fetched = 0;
  let skipped = 0;
  const prices: MarketPrice[] = [];

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
    // FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH: also upsert into vn_index_cache so
    // the DB integrity sweep (cron-db-data-integrity) finds a non-empty table and
    // freshness SLA checks have a real timestamp to evaluate.
    const upsertCache: UpsertVnIndexCacheFn =
      _upsertCacheFn ?? ((p) => {
        try {
          upsertVnIndexCache(getDb(), p);
        } catch (cacheErr) {
          // Non-fatal: market_prices write already succeeded. Log and continue.
          // This tolerates the table being absent on a schema-migration edge (first boot).
          logger.warn("[vn-index-refresh] vn_index_cache upsert failed (non-fatal)", {
            code: p.code,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        }
      });
    for (const p of prices) {
      upsertCache(p);
    }
    logger.debug("[vn-index-refresh] stored + cache updated", { count: prices.length });
  }

  return { fetched, stored: prices.length, skipped };
}
