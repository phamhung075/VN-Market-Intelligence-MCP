/**
 * Interface — get_insider_sentiment MCP Tool (P0-5-INSIDER-SENTIMENT)
 *
 * Registers the `get_insider_sentiment` MCP tool (#178). Exposes:
 *   - Net buy-sell value per window (30d / 90d / 180d) in billion VND
 *   - Free-float-normalized score [-1, +1] using market_cap_bn proxy
 *   - ACCUMULATION / DISTRIBUTION / MIXED / NEUTRAL classification label
 *   - Large-deal flags (>10B VND threshold)
 *   - Gauge-ready scalar: net_sentiment_score (P1 Fear & Greed insider leg)
 *
 * MANDATORY QA hard gate: response always includes normalization_basis='market_cap_proxy'.
 *
 * Data source: insider_transactions (Tier 1 — SSC official portal) + vnstock_trading_stats.
 * READ-ONLY — no schema changes to insider_transactions (NFR-P05-1).
 *
 * DDD layer: interface/mcp/tools — may import application and infrastructure.
 *
 * @module interface/mcp/tools/market-data/insiderSentimentTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getInsiderSentiment } from "../../../../application/usecases/getInsiderSentiment.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_insider_sentiment tool.
 *
 * @param server - McpServer instance.
 * @param db     - Optional DB injection (defaults to getDb() for production).
 */
export function registerInsiderSentimentTools(server: McpServer, db?: Database): void {
  server.tool(
    "get_insider_sentiment",
    "Insider transaction net sentiment suite for VN watchlist tickers. " +
      "Computes net buy-sell value over 30d/90d/180d windows from SSC disclosure data, " +
      "free-float-normalized score clamped [-1, +1] using market_cap_bn as proxy " +
      "(normalization_basis='market_cap_proxy' always present — QA hard gate), " +
      "ACCUMULATION/DISTRIBUTION/MIXED/NEUTRAL classification, and large-deal flags (>10B VND). " +
      "When code is supplied: returns per-ticker insider signal. " +
      "When code is omitted: returns market-wide aggregate across all watchlist tickers. " +
      "Null handling: price=0 rows excluded (WARN logged); executed_volume=0 rows excluded; " +
      "market_cap_bn=NULL → net_sentiment_score=null (cannot normalize without denominator). " +
      "data_window_days counts included so consumers can self-gate on data availability. " +
      "Gauge-ready scalar: net_sentiment_score is the P1 Fear & Greed insider leg. " +
      "Source tier: 1 (Tier 1 — SSC official portal congbothongtin.ssc.gov.vn). " +
      "Package destination: market-analyst, alert-commander, fear-greed-gauge.",
    {
      code: z
        .string()
        .optional()
        .describe(
          "Stock ticker (e.g. 'FPT'). When omitted, returns market-wide aggregate " +
          "across all watchlist tickers.",
        ),
    },
    async ({ code }) => {
      try {
        const resolvedDb = db ?? getDb();
        const result = await getInsiderSentiment(resolvedDb, code);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // NFR-P05-3: always return {error:...} on failure
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Insider sentiment data unavailable: ${msg}` },
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
