/**
 * Interface — get_relative_strength MCP Tool (IND-P1-MCP-PROXY-INDICATORS)
 *
 * Registers the `get_relative_strength` MCP tool (#182). This is an mcp-server
 * PROXY to the Go TA endpoint POST /ta/relative-strength at port 5003.
 *
 * Proxied endpoint: technical-analysis service at http://{TA_SERVICE_URL}/ta/relative-strength
 *
 * Honest-NULL preserved: market_rs_composite null when watchlist N < 5 (low_sample_warning=true).
 * Per-ticker null_reason passed through unchanged.
 *
 * Error contract: {error:'...'} on upstream failure — never throws.
 *
 * Gauge-ready scalar: market_rs_composite (P1 Fear & Greed relative-strength leg).
 *
 * DDD layer: interface/mcp/tools — calls infrastructure/microservices/clients.ts.
 *
 * @module interface/mcp/tools/market-data/relativeStrengthTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  computeRelativeStrength,
  type ComputeRelativeStrengthResponse,
} from "../../../../infrastructure/microservices/clients.js";
import { logger } from "../../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_relative_strength tool.
 *
 * @param server - McpServer instance.
 */
export function registerRelativeStrengthTools(server: McpServer): void {
  server.tool(
    "get_relative_strength",
    "VN-Index watchlist Mansfield relative-strength vs VN-Index for P1 Fear & Greed gauge. " +
      "Proxies to Go TA microservice POST /ta/relative-strength (port 5003). " +
      "Returns: " +
      "(1) per-ticker rs_63d_pct / rs_126d_pct / rs_252d_pct — raw % outperformance vs index; " +
      "(2) per-ticker Mansfield RS (63d/126d/252d) — normalized relative strength; " +
      "(3) per-ticker composite_rs_score + composite_label (STRONG/NEUTRAL/WEAK); " +
      "(4) market_rs_composite — gauge-ready scalar: mean composite RS (null when N<5, low_sample_warning=true); " +
      "(5) low_sample_warning — true when fewer than 5 tickers have sufficient history; " +
      "(6) computed_as_of — ISO8601 timestamp of computation. " +
      "Honest-NULL: market_rs_composite null = insufficient watchlist coverage, never default-filled. " +
      "Per-ticker null_reason present when ticker excluded from RS calculation. " +
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
        const result: ComputeRelativeStrengthResponse = await computeRelativeStrength({
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
        logger.warn("[get_relative_strength] upstream Go service unavailable", { error: msg });
        // Error contract: {error:'...'} on failure — never throws
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Relative strength unavailable: ${msg}` },
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
