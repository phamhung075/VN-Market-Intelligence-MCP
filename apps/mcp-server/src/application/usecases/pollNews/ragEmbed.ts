/**
 * RAG embed — Poll News (FACTORY-APP-split-pollNews, stage 2: dedup/insert)
 *
 * Embeds a newly-inserted news entry into LanceDB (non-fatal — a failure
 * here must never abort the poll cycle). Derives doc metadata (level/tags/
 * source_domain/sector) from the AnalysisEntry plus the originating RSS
 * item's source key.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 244-307 of the pre-stage-2 orchestrator). Task 1840a / DFR-P1-MCP FR-5.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { AnalysisEntry } from "../../../domain/services/newsNormalizer.js";
import { logger } from "../../../infrastructure/logger.js";
import type { InsertAnalysisFn } from "./types.js";

/**
 * Embed one newly-inserted AnalysisEntry into LanceDB via the injected
 * ragInsertFn. Non-fatal: any failure (network, malformed URL, missing
 * config) is caught and logged, never rethrown.
 *
 * @param entry       - The just-inserted AnalysisEntry (from normalizeNews)
 * @param itemSource  - The originating RssItem's `source` key (tag derivation)
 * @param ragInsertFn - Injectable RAG insert function
 */
export async function embedEntryToRag(
  entry: AnalysisEntry,
  itemSource: string | undefined,
  ragInsertFn: InsertAnalysisFn,
): Promise<void> {
  try {
    const { randomUUID } = await import("node:crypto");
    const level = entry.affectedActions.length > 0 ? "action" : "domain";
    // First affected action is the primary ticker (uppercase); use for actionCode
    const primaryTickerUpper = entry.affectedActions[0]?.toUpperCase();
    const actionCode = primaryTickerUpper?.toLowerCase();
    const tags = [
      "news",
      (itemSource ?? "unknown").toLowerCase(),
      ...entry.affectedActions.map((c) => c.toLowerCase()),
    ];
    // Derive source_domain from article URL — E1: guard parse failure
    let source_domain = "";
    try {
      if (entry.sourceUrl) {
        source_domain = new URL(entry.sourceUrl).hostname;
      }
    } catch { /* malformed URL — use empty string */ }
    // Derive sector from ticker via mcp.config.json market.referenceStocks
    // DFR-P1-MCP FR-5: lookupSectorForTicker — inline pure lookup
    let sector = "";
    if (primaryTickerUpper) {
      try {
        const { loadMcpConfig } = await import("../../../infrastructure/config.js");
        const cfg = loadMcpConfig();
        const refStocks = (cfg.market as unknown as Record<string, unknown>)?.referenceStocks as
          Record<string, string[]> | undefined;
        if (refStocks) {
          for (const [sectorName, tickers] of Object.entries(refStocks)) {
            if (Array.isArray(tickers) && tickers.includes(primaryTickerUpper)) {
              sector = sectorName;
              break;
            }
          }
        }
      } catch { /* sector lookup best-effort */ }
    }
    await ragInsertFn({
      id: randomUUID(),
      level,
      title: entry.sourceTitle,
      summary: entry.summary,
      tags,
      ...(actionCode !== undefined && { actionCode }),
      // DFR-P1-MCP FR-5: new metadata fields
      doc_type: "news",
      depth_tier: "shallow",
      source_domain,
      published_at: entry.publishedAt ?? "",
      confidence: entry.confidence ?? 0,
      impact_score: entry.impactScore ?? 0,
      ticker: primaryTickerUpper ?? "",
      sector,
    });
  } catch (err) {
    logger.warn("[pollNews] ragInsert failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      title: entry.sourceTitle?.slice(0, 80),
    });
  }
}
