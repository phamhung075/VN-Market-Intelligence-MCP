/**
 * Interface — get_foreign_accum_rank MCP Tool (IND-P1-MCP-PROXY-INDICATORS)
 *
 * Registers the `get_foreign_accum_rank` MCP tool (#184). This is an mcp-server
 * PROXY to the Go stock-price endpoint POST /price/foreign-accum-rank at port 5000.
 *
 * Proxied endpoint: stock-price service at http://{STOCK_PRICE_URL}/price/foreign-accum-rank
 *
 * Honest-NULL preserved:
 *   - foreign_accum_z_market null when < 5 tickers have ≥ 5 bars of foreign flow data.
 *   - per-ticker room_exhaustion null when foreign room data unavailable.
 *   - per-ticker null_reason passed through unchanged.
 *
 * Error contract: {error:'...'} on upstream failure — never throws.
 *
 * Gauge-ready scalar: foreign_accum_z_market (P1 Fear & Greed foreign-flow leg).
 *
 * DDD layer: interface/mcp/tools — calls infrastructure/microservices/clients.ts.
 *
 * @module interface/mcp/tools/market-data/foreignAccumRankTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  computeForeignAccumRank,
  type ComputeForeignAccumRankResponse,
} from "../../../../infrastructure/microservices/clients.js";
import { logger } from "../../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_foreign_accum_rank tool.
 *
 * @param server - McpServer instance.
 */
export function registerForeignAccumRankTools(server: McpServer): void {
  server.tool(
    "get_foreign_accum_rank",
    "VN-Index watchlist foreign investor accumulation/distribution ranking for P1 Fear & Greed gauge. " +
      "Proxies to Go stock-price microservice POST /price/foreign-accum-rank (port 5000). " +
      "Returns: " +
      "(1) per-ticker net_flow_5d_raw + net_flow_20d_raw — raw foreign net flow (shares); " +
      "(2) per-ticker cum_net_flow_5d_normalized + cum_net_flow_20d_normalized — normalized cumulative flow; " +
      "(3) per-ticker z_score_5d + rank + label (ACCUMULATING/NEUTRAL/DISTRIBUTING); " +
      "(4) per-ticker room_exhaustion — boolean (null when foreign room data unavailable); " +
      "(5) foreign_accum_z_market — gauge-ready scalar: mean z-score across tickers with ≥5 bars " +
      "    (positive = net market accumulation); null when < 5 qualifying tickers; " +
      "(6) adtv_unit: 'shares'; computed_as_of — ISO8601 timestamp of computation. " +
      "Honest-NULL: foreign_accum_z_market null = insufficient data, never default-filled. " +
      "room_exhaustion null per-ticker when foreign room unavailable — pass through unchanged. " +
      "Error: returns {error:'...'} when upstream Go service is unavailable. " +
      "Source tier: 3 (derived from daily_ohlcv Tier 2 + foreign flow data). " +
      "Package destination: P1 fear-greed-gauge, market-watcher, CHEF analyst.",
    {
      watchlist_tickers: z
        .array(z.string())
        .optional()
        .describe(
          "Optional override of watchlist tickers (e.g. ['FPT','VCB']). " +
          "If omitted, the stock-price service uses its server-configured WATCHLIST_TICKERS.",
        ),
    },
    async ({ watchlist_tickers }) => {
      try {
        const result: ComputeForeignAccumRankResponse = await computeForeignAccumRank({
          ...(watchlist_tickers && watchlist_tickers.length > 0
            ? { codes: watchlist_tickers }
            : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...result,
                  source_tier: 3,
                  fetched_at: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("[get_foreign_accum_rank] upstream Go service unavailable", { error: msg });
        // Error contract: {error:'...'} on failure — never throws
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Foreign accum rank unavailable: ${msg}` },
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
