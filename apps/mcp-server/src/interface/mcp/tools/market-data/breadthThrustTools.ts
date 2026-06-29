/**
 * Interface — get_breadth_thrust MCP Tool (BREADTH-TIME-SERIES)
 *
 * Registers the `get_breadth_thrust` MCP tool (#179). Exposes:
 *   - Advance-Decline Line (ADL) and 60-session history
 *   - RANA (Ratio-Adjusted Net Advances) today
 *   - McClellan Oscillator (null until 39 sessions)
 *   - McClellan Summation (null until 39 sessions)
 *   - Floor Panic / Ceiling FOMO flags (>15% threshold)
 *   - is_halt_day flag (floor > 50% of total)
 *   - Zweig Thrust flags (null until 14 sessions)
 *   - breadth_z_score — Gauge-Ready Scalar (P1 Fear & Greed breadth leg)
 *     ALWAYS PRESENT in response; null when <21 sessions or osc not warmed up.
 *   - history_quality: INSUFFICIENT / WARMUP / SUFFICIENT
 *
 * Error contract:
 *   - Returns {error:'...'} when table is empty (NFR-BR-3).
 *   - Returns {error:'...'} on DB failure.
 *   - NEVER fabricates a score.
 *
 * Data source: market_breadth_history (Tier 2 derived from
 *   vndirect:api-finfo.vndirect.com.vn/v4/vnmarket_prices).
 *
 * DDD layer: interface/mcp/tools — may import application and infrastructure.
 *
 * @module interface/mcp/tools/market-data/breadthThrustTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getBreadthThrust } from "../../../../application/usecases/getBreadthThrust.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_breadth_thrust tool.
 *
 * @param server - McpServer instance.
 * @param db     - Optional DB injection (defaults to getDb() for production).
 */
export function registerBreadthThrustTools(server: McpServer, db?: Database): void {
  server.tool(
    "get_breadth_thrust",
    "HOSE market breadth time-series analysis for P1 Fear & Greed gauge. " +
      "Reads market_breadth_history (forward-accruing daily table; no backfill). " +
      "Returns: " +
      "(1) Advance-Decline Line (ADL) cumulative sum + 60-session history; " +
      "(2) RANA today (Ratio-Adjusted Net Advances, range -100 to +100); " +
      "(3) McClellan Oscillator (EMA19-EMA39 of RANA; null until 39 sessions); " +
      "(4) McClellan Summation (running sum of McClellan Osc; null until 39 sessions); " +
      "(5) Floor Panic flag (floor/total > 15%) and Ceiling FOMO flag (ceiling/total > 15%); " +
      "(6) is_halt_day when floor > 50% of total (circuit-breaker halt proxy); " +
      "(7) Zweig Thrust: thrust_triggered (10+ consecutive qualifying sessions in 14-session window), " +
      "    thrust_sessions_count, thrust_possible (>=5 qualifying); null until 14 sessions; " +
      "(8) breadth_z_score — 6-field Gauge-Ready Scalar: z of McClellan Osc vs available history; " +
      "    null when <21 sessions or osc not yet warmed up; ALWAYS present (never omitted). " +
      "history_quality: INSUFFICIENT (<10 sessions), WARMUP (10-39), SUFFICIENT (>=40). " +
      "Error: returns {error:'...'} when table empty or on DB failure (NFR-BR-3). " +
      "Source tier: 2 (VnDirect aggregator). " +
      "Package destination: P1 fear-greed-gauge, market-watcher, alert-commander.",
    {},
    async () => {
      try {
        const resolvedDb = db ?? getDb();
        const result = await getBreadthThrust(resolvedDb);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // NFR-BR-3: always return {error:...} on failure
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Breadth thrust data unavailable: ${msg}` },
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
