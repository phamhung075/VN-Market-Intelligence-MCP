/**
 * Interface — get_52w_proximity MCP Tool (IND-P1-MCP-PROXY-INDICATORS)
 *
 * Registers the `get_52w_proximity` MCP tool (#183). This is an mcp-server
 * PROXY to the Go TA endpoint POST /ta/52w-proximity at port 5003.
 *
 * Proxied endpoint: technical-analysis service at http://{TA_SERVICE_URL}/ta/52w-proximity
 *
 * Honest-NULL preserved: pct_above_ma200 null when denominator_ma200 = 0 (< 200 bars).
 * Per-ticker null_reason passed through unchanged.
 *
 * Error contract: {error:'...'} on upstream failure — never throws.
 *
 * Gauge-ready scalars: net_new_highs, denominator_ma200 (P1 Fear & Greed breadth leg).
 *
 * DDD layer: interface/mcp/tools — calls infrastructure/microservices/clients.ts.
 *
 * @module interface/mcp/tools/market-data/52wProximityTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compute52WProximity,
  type Compute52WProximityResponse,
} from "../../../../infrastructure/microservices/clients.js";
import { logger } from "../../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_52w_proximity tool.
 *
 * @param server - McpServer instance.
 */
export function register52WProximityTools(server: McpServer): void {
  server.tool(
    "get_52w_proximity",
    "VN-Index watchlist 52-week high/low proximity + MA50/MA200 for P1 Fear & Greed gauge. " +
      "Proxies to Go TA microservice POST /ta/52w-proximity (port 5003). " +
      "Returns: " +
      "(1) per-ticker high_52w / low_52w — rolling 252-session extremes; " +
      "(2) per-ticker pct_from_52w_high / pct_from_52w_low — % drawdown from high / rally from low; " +
      "(3) per-ticker above_ma50 + above_ma200 — boolean position relative to moving averages; " +
      "(4) per-ticker proximity_label (AT_HIGH/NEAR_HIGH/MID_RANGE/NEAR_LOW/AT_LOW) + new_high_today; " +
      "(5) aggregate: new_highs_count + new_lows_count + net_new_highs (scalar) + pct_above_ma50/ma200; " +
      "(6) denominator_ma200 — sample count for MA200 (0 when < 200 bars, pct_above_ma200 null); " +
      "(7) computed_as_of — ISO8601 timestamp of computation. " +
      "Honest-NULL: pct_above_ma200 null = insufficient history (< 200 bars), never default-filled. " +
      "Per-ticker null_reason present when ticker excluded from proximity calculation. " +
      "Error: returns {error:'...'} when upstream Go service is unavailable. " +
      "Source tier: 3 (derived from daily_ohlcv Tier 2 prices). " +
      "Package destination: P1 fear-greed-gauge, market-watcher, CHEF analyst.",
    {
      watchlist_tickers: z
        .array(z.string())
        .optional()
        .describe(
          "Optional override of watchlist tickers (e.g. ['FPT','VCB']). " +
          "If omitted, the TA service uses its server-configured WATCHLIST_TICKERS.",
        ),
    },
    async ({ watchlist_tickers }) => {
      try {
        const result: Compute52WProximityResponse = await compute52WProximity({
          ...(watchlist_tickers && watchlist_tickers.length > 0
            ? { tickers: watchlist_tickers }
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
        logger.warn("[get_52w_proximity] upstream Go service unavailable", { error: msg });
        // Error contract: {error:'...'} on failure — never throws
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `52-week proximity unavailable: ${msg}` },
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
