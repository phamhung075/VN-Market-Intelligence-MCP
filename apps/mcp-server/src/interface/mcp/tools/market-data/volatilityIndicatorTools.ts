/**
 * Interface — get_volatility_indicators MCP Tool (Part B: BREADTH-TIME-SERIES sprint)
 *
 * Registers the `get_volatility_indicators` MCP tool (#180). This is an mcp-server
 * PROXY to the existing Go TA endpoint POST /ta/volatility-indicators at port 5003.
 * Implements Part B of the BREADTH-TIME-SERIES task to unblock NFR-P01-3
 * (P0-1 volatility e2e via gateway).
 *
 * Proxied endpoint: technical-analysis service at http://localhost:5003
 * Route: POST /ta/volatility-indicators
 *
 * Honest-NULL preserved: if the Go service returns null for rv_60d_pct or
 * drawdown_252d_pct (Sprint-0 backfill not yet complete), those nulls are
 * passed through unchanged — never default-filled.
 *
 * Error contract (NFR-P01-1): {error:'...'} on upstream failure — never throws.
 *
 * Gauge-ready scalar: rv_20d_percentile (P1 Fear & Greed volatility leg).
 *
 * DDD layer: interface/mcp/tools — calls infrastructure/microservices/clients.ts.
 *
 * @module interface/mcp/tools/market-data/volatilityIndicatorTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  computeVolatilityIndicators,
  type ComputeVolatilityResponse,
} from "../../../../infrastructure/microservices/clients.js";
import { logger } from "../../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_volatility_indicators tool.
 *
 * @param server - McpServer instance.
 */
export function registerVolatilityIndicatorTools(server: McpServer): void {
  server.tool(
    "get_volatility_indicators",
    "VN-Index realized volatility + regime band for P1 Fear & Greed gauge. " +
      "Proxies to Go TA microservice POST /ta/volatility-indicators (port 5003). " +
      "Returns: " +
      "(1) rv_10d_pct / rv_20d_pct / rv_60d_pct — annualized realized volatility (log-returns); " +
      "    rv_60d null until Sprint-0 backfill provides ≥61 bars; " +
      "(2) gk_vol_20d_pct — Garman-Klass estimator rolling 20d; " +
      "(3) vol_regime — LOW/NORMAL/ELEVATED/CRISIS label from percentile rank; " +
      "(4) vol_regime_pct — the percentile rank (0–1) used for regime classification; " +
      "(5) drawdown_252d_pct — 252-session max drawdown; null until Sprint-0 ≥252 bars; " +
      "(6) rv_20d_percentile — Gauge-Ready Scalar: rank of rv_20d in available history (P1 input); " +
      "(7) atr_by_ticker — optional per-ticker ATR%(14) when tickers supplied. " +
      "Honest-NULL: null fields mean insufficient history — never default-filled. " +
      "Error: returns {error:'...'} when upstream Go service is unavailable (NFR-P01-1). " +
      "Source tier: 3 (derived from daily_ohlcv Tier 2 prices). " +
      "Package destination: P1 fear-greed-gauge, alert-commander, market-watcher.",
    {
      tickers: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of stock tickers (e.g. ['FPT','VCB']) to compute per-ticker ATR%(14). " +
          "When omitted, only market-wide VN-Index volatility metrics are returned.",
        ),
    },
    async ({ tickers }) => {
      try {
        const result: ComputeVolatilityResponse = await computeVolatilityIndicators({
          ...(tickers && tickers.length > 0 ? { tickers } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...result,
                  source_tier: 3,
                  fetched_at:  new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("[get_volatility_indicators] upstream Go service unavailable", { error: msg });
        // NFR-P01-1: {error:'...'} on failure — never throws
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Volatility indicators unavailable: ${msg}` },
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
