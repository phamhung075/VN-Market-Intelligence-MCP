/**
 * Task 1879b — get_fed_liquidity_spread MCP Tool
 *
 * Interface layer: registers the `get_fed_liquidity_spread` tool.
 *
 * Tool: get_fed_liquidity_spread
 *   Input:  optional { days?: number }  (default 60, lookback window for samples)
 *   Output: FedLiquiditySpreadResult JSON
 *   - Reads fred_series_daily table via fetchEffrIorbSamples (infra)
 *   - Passes samples to computeFedLiquiditySpread (domain)
 *   - Returns { effr, iorb, spread, asOf, trend30d, samples }
 *
 * EFFR–IORB spread context:
 *   Positive spread = EFFR > IORB: reserves prefer overnight market over IORB
 *   Widening = improving risk appetite / liquidity flowing outward
 *   Narrowing = tightening / reserves retreating to IORB floor
 *
 * @module interface/mcp/tools/macro/getFedLiquiditySpreadTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  computeFedLiquiditySpread,
  InsufficientDataError,
  type FedLiquiditySpreadResult,
} from "../../../../domain/services/macro/computeFedLiquiditySpread.js";
import { fetchEffrIorbSamples } from "../../../../infrastructure/db/fredQueries.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_fed_liquidity_spread` MCP tool.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerFedLiquiditySpreadTool(server: McpServer): void {
  server.tool(
    "get_fed_liquidity_spread",
    "Returns the current EFFR–IORB liquidity spread from the Federal Reserve. " +
      "EFFR (Effective Federal Funds Rate) minus IORB (Interest on Reserve Balances) " +
      "measures how much the overnight money market rate exceeds the Fed's floor rate. " +
      "Includes 30-day OLS trend classification: " +
      "'widening' (slope > 0.01%/day), 'narrowing' (< -0.01%/day), 'stable', or null if < 30 samples. " +
      "Data sourced from FRED API via fred_series_daily table. " +
      "Source tier: 1 (primary official — FRED is the Federal Reserve's official data release).",
    {
      /**
       * Lookback window in calendar days for sample selection (default 60).
       * Increase to 90+ for more stable OLS trend on sparse data.
       */
      days: z.coerce.number().int().min(1).max(365).optional(),
    },
    (args) => {
      const { days } = args as { days?: number };
      const lookbackDays = days ?? 60;

      try {
        // Ensure schema tables exist (no-op if already initialised)
        initDatabase();

        const db = getDb();
        const samples = fetchEffrIorbSamples(db, lookbackDays);
        const result: FedLiquiditySpreadResult = computeFedLiquiditySpread(samples);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 1 as const,
            ...result,
          }, null, 2) }],
        };
      } catch (err) {
        if (err instanceof InsufficientDataError) {
          logger.warn("[get_fed_liquidity_spread] no EFFR/IORB data available", {
            error: err.message,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  source_tier: 1 as const,
                  error: "no_data",
                  message: "fred_series_daily has no paired EFFR+IORB rows. Run macroIndicatorRefreshJob to populate.",
                }),
              },
            ],
          };
        }

        logger.error("[get_fed_liquidity_spread] unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 1 as const,
                error: `Error computing Fed liquidity spread: ${(err as Error).message}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}
