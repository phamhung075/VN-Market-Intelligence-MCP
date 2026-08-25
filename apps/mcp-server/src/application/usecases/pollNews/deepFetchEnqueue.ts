/**
 * Deep-fetch enqueue — Poll News (FACTORY-APP-split-pollNews, stage 2: dedup/insert)
 *
 * Evaluates a newly-inserted entry against the deep-fetch relevance gate
 * (domain/services/deepFetchGate.js) and enqueues it for full-page-content
 * fetch when it qualifies. Non-fatal — gate failure must never abort the
 * poll cycle. DFR-P2-MCP.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 309-360 of the pre-stage-2 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type { AnalysisEntry } from "../../../domain/services/newsNormalizer.js";
import type { WatchlistEntry } from "../../../domain/services/cascadeEngine.js";
import { logger } from "../../../infrastructure/logger.js";

/**
 * Runs only on newly-inserted articles (no re-fetch of duplicates).
 *
 * @param db         - bun:sqlite Database for the deep-fetch queue table
 * @param entry      - The just-inserted AnalysisEntry
 * @param watchlist  - Current watchlist (drives ticker/sector gate inputs)
 */
export async function runDeepFetchGate(
  db: Database,
  entry: AnalysisEntry,
  watchlist: WatchlistEntry[],
): Promise<void> {
  try {
    const { shouldDeepFetch, buildSectorKeywordMap } = await import("../../../domain/services/deepFetchGate.js");
    const { enqueueIfNotPresent } = await import("../../../infrastructure/db/deepFetchQueueStore.js");

    // Load watchlist tickers for gate (active only)
    const watchlistTickers = watchlist
      .filter((w) => !("active" in w) || (w as { active?: boolean }).active !== false)
      .map((w) => w.actionCode?.toUpperCase() ?? "")
      .filter(Boolean);

    // Build sector keyword map from watchlist entries (pure — no I/O)
    // watchlist entries from DB carry sector via WatchlistEntry shape
    const sectorEntries = watchlist.map((w) => ({
      ticker: w.actionCode?.toUpperCase() ?? "",
      sector: (w as { sector?: string }).sector ?? "",
      active: !("active" in w) || (w as { active?: boolean }).active !== false,
    }));
    const sectorKeywords = buildSectorKeywordMap(sectorEntries);

    const hit = shouldDeepFetch({
      title: entry.sourceTitle ?? "",
      snippet: entry.summary ?? "",
      impactScore: entry.impactScore ?? 0,
      sentiment: entry.sentiment ?? "neutral",
      sourceUrl: entry.sourceUrl ?? "",
      affectedActions: entry.affectedActions,
      watchlistTickers,
      sectorKeywords,
    });

    if (hit && entry.sourceUrl) {
      // Derive source_domain independently (can't access ragInsertFn inner scope)
      let gateSourceDomain = "";
      try {
        gateSourceDomain = new URL(entry.sourceUrl).hostname;
      } catch { /* malformed URL */ }
      const gatePrimaryTicker = entry.affectedActions[0]?.toUpperCase() ?? null;
      enqueueIfNotPresent(db, {
        source_url: entry.sourceUrl,
        source_domain: gateSourceDomain,
        rag_id: entry.id ?? "",
        ticker: gatePrimaryTicker,
      });
    }
  } catch (gateErr) {
    logger.warn("[pollNews] deep-fetch gate error (non-fatal)", {
      error: gateErr instanceof Error ? gateErr.message : String(gateErr),
    });
  }
}
