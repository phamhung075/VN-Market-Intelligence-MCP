/**
 * Application — Sync Sector Peer Data (Budget-Aware)
 *
 * Resolves sector peer stocks from the user's watchlist using sectorPeers.ts,
 * then calls syncStockLight for each peer (up to MAX_PEER_SYNCS_PER_CYCLE per cycle).
 *
 * Rate limit budget:
 *   Watchlist sync:  4 stocks × 7 types = 28 calls (worst case)
 *   Peer sync:       5 peers  × 3 types = 15 calls (worst case)
 *   Total:           43 calls → 72% of 60/min free tier → safe margin
 *
 * Design decisions:
 *   - MAX_PEER_SYNCS_PER_CYCLE = 5 to stay within budget
 *   - Uses syncStockLight (3 types, 24h/12h/24h staleness) not syncStock (7 types, 6h/2h)
 *   - Failures are silently counted as skipped — peer sync is best-effort
 *   - Should only run during market hours (caller's responsibility)
 *
 * Layer: application/usecases
 */

import { logger } from "../../infrastructure/logger.js";
import { getContextStocksForWatchlist } from "../../domain/services/sectorPeers.js";
import { syncStockLight } from "./syncVnstockData.js";
import type { DomainType } from "../../../bctc-schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum peer stocks to sync per intelligence cycle (rate limit guard).
 *
 * Raised from 5 → 30 (task 1006): with 8 watchlist stocks across 6+ sectors,
 * the context stock pool can reach 29+ codes. At cap=5 only the first 5 were
 * ever synced — automotive peers (HAX/CTF/TMT/SMA at positions 13-16) were
 * permanently skipped and their PE/PB/ROE showed as N/A.
 *
 * syncStockLight is fully lazy: it checks staleness before any API call and
 * returns 0 immediately when data is fresh. So raising the cap to 30 costs
 * zero extra API calls for already-synced peers — only truly stale data is
 * fetched. Rate budget: 4 watchlist × 7 types (28) + up to 30 peers × 0 avg
 * (most fresh) + occasional stale = well within 60 req/min free tier.
 */
export const MAX_PEER_SYNCS_PER_CYCLE = 40;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sync lightweight vnstock data for sector peers derived from the watchlist.
 *
 * Resolves peers via getContextStocksForWatchlist(), then syncs up to
 * MAX_PEER_SYNCS_PER_CYCLE peers using syncStockLight (3 data types, relaxed staleness).
 *
 * @param watchlistEntries - Watchlist stocks with their domain classification
 * @returns Counts of synced (had stale data), skipped (fresh or failed), and total API calls
 */
export async function syncSectorPeers(
  watchlistEntries: { actionCode: string; domain: DomainType }[],
): Promise<{ synced: number; skipped: number; apiCalls: number }> {
  if (watchlistEntries.length === 0) {
    return { synced: 0, skipped: 0, apiCalls: 0 };
  }

  const contextStocks = getContextStocksForWatchlist(watchlistEntries);
  const peers = contextStocks.slice(0, MAX_PEER_SYNCS_PER_CYCLE);

  let synced = 0;
  let skipped = 0;
  let apiCalls = 0;

  for (const peer of peers) {
    try {
      const calls = await syncStockLight(peer.code);
      apiCalls += calls;
      if (calls > 0) {
        synced++;
        logger.debug("[peer-sync] synced peer", { code: peer.code, apiCalls: calls, domain: peer.domain });
      } else {
        skipped++;
        logger.debug("[peer-sync] peer fresh, skipped", { code: peer.code });
      }
    } catch (err) {
      skipped++;
      logger.warn("[peer-sync] failed for peer (non-fatal)", {
        code: peer.code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[peer-sync] complete", {
    watchlistStocks: watchlistEntries.length,
    peersAvailable: contextStocks.length,
    peersProcessed: peers.length,
    synced,
    skipped,
    apiCalls,
  });

  return { synced, skipped, apiCalls };
}
