/**
 * Interface — get_market_sentiment_index MCP Tool (P0-4-MARKET-SENTIMENT-INDEX)
 *
 * Registers the `get_market_sentiment_index` MCP tool. Exposes:
 *   - Confidence-weighted daily sentiment score (bullish=+1, bearish=-1, neutral=0)
 *   - Z-score vs 60/90-day baseline — null when <21 real days (no fabricated baseline)
 *   - 5-day EMA of sentiment
 *   - Bull/bear/neutral dispersion from last 5 calendar days
 *   - Article volume spike flag (today > 2× 30d daily average)
 *   - Gauge-ready scalar: news_sentiment_z (P1 Fear & Greed sentiment leg)
 *
 * Data source: rag_analyses (Tier 3 derived — no new fetch, READ-ONLY).
 * Routes via gateway; never calls vn-market tools directly.
 *
 * DDD layer: interface/mcp/tools — may import application and infrastructure.
 *
 * @module interface/mcp/tools/news-analysis/marketSentimentTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getMarketSentimentIndex } from "../../../../application/usecases/getMarketSentimentIndex.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_market_sentiment_index tool.
 *
 * @param server - McpServer instance
 * @param db     - Optional DB injection (defaults to getDb() for production)
 */
export function registerMarketSentimentTools(server: McpServer, db?: Database): void {
  server.tool(
    "get_market_sentiment_index",
    "Market-wide news sentiment index derived from stored rag_analyses. " +
      "Returns: (1) confidence-weighted daily sentiment score (bullish=+1, bearish=-1, neutral=0), " +
      "(2) z-score vs 60/90-day baseline — null when <21 actual days (no fabricated distribution), " +
      "(3) 5-day EMA of sentiment, " +
      "(4) bull/bear/neutral dispersion ratios from last 5 calendar days, " +
      "(5) article-volume spike flag (today count > 2× 30d average). " +
      "Gauge-ready scalar: news_sentiment_z (z_60d preferred, z_90d fallback; null when INSUFFICIENT). " +
      "history_quality: EMPTY | INSUFFICIENT | SUFFICIENT — ALWAYS present for consumer self-gating. " +
      "Source tier: 3 (derived from rag_analyses — Tier 3; no new fetch, read-only). " +
      "Gauge dependency: news_sentiment_z is the P1 Fear & Greed sentiment leg. " +
      "Package destination: market-analyst, digest-predict, fear-greed-gauge.",
    {},
    async () => {
      try {
        const resolvedDb = db ?? getDb();
        const result = await getMarketSentimentIndex(resolvedDb);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // NFR-P04-3: never expose raw SQL error; return {error:...}
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Market sentiment data unavailable: ${msg}` },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
