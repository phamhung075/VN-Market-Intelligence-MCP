/**
 * Interface — get_roc_momentum MCP Tool (IND-P1-MCP-PROXY-INDICATORS)
 *
 * Registers the `get_roc_momentum` MCP tool (#181). This is an mcp-server
 * PROXY to the Go TA endpoint POST /ta/roc-momentum at port 5003.
 *
 * Proxied endpoint: technical-analysis service at http://{TA_SERVICE_URL}/ta/roc-momentum
 *
 * Honest-NULL preserved: momentum_factor_z null when < 13 bars available
 * (12+1 skip period). Per-ticker null_reason passed through unchanged.
 *
 * Error contract: {error:'...'} on upstream failure — never throws.
 *
 * Gauge-ready scalar: momentum_factor_z (P1 Fear & Greed momentum leg).
 *
 * DDD layer: interface/mcp/tools — calls infrastructure/microservices/clients.ts.
 *
 * @module interface/mcp/tools/market-data/rocMomentumTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  computeROCMomentum,
  type ComputeROCMomentumResponse,
} from "../../../../infrastructure/microservices/clients.js";
import { logger } from "../../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_roc_momentum tool.
 *
 * @param server - McpServer instance.
 */
export function registerROCMomentumTools(server: McpServer): void {
  server.tool(
    "get_roc_momentum",
    "VN-Index watchlist ROC-12-1 momentum factor for P1 Fear & Greed gauge. " +
      "Proxies to Go TA microservice POST /ta/roc-momentum (port 5003). " +
      "Returns: " +
      "(1) per-ticker roc_12_1 — 12-month minus 1-month return (skip-month momentum); " +
      "(2) per-ticker z_score + decile (1=bottom, 10=top) + label (MOMENTUM_LEADER/NEUTRAL/LAGGARD); " +
      "(3) factor_return_buckets — 10-decile return spread showing factor efficacy; " +
      "(4) momentum_factor_z — gauge-ready scalar: median z-score across deciles (null until 13 bars); " +
      "(5) computed_as_of — ISO8601 timestamp of computation. " +
      "Honest-NULL: momentum_factor_z null = insufficient history, never default-filled. " +
      "Per-ticker null_reason present when ticker excluded from computation. " +
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
        const result: ComputeROCMomentumResponse = await computeROCMomentum({
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
        logger.warn("[get_roc_momentum] upstream Go service unavailable", { error: msg });
        // Error contract: {error:'...'} on failure — never throws
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `ROC momentum unavailable: ${msg}` },
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
