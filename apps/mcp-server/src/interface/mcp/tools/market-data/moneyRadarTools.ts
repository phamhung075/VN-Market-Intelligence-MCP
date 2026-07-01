/**
 * Interface — get_money_radar_composite MCP Tool (MONEY-RADAR-P0-T2-COMPOSITE)
 *
 * Registers the `get_money_radar_composite` tool: the Money Radar fusion +
 * divergence aggregator per docs/architecture-briefs/2026-07-01-money-radar.md
 * §4 (output schema) and §3 L2 (D1-D4 divergence detectors).
 *
 * REUSE-FIRST (brief §2 C2) — wires 8 already-LIVE tools + the 4 new T1
 * oscillators via application/usecases/getMoneyRadarComposite.ts; this file
 * is a thin MCP registration + error boundary, no business logic.
 *
 * Honest-NULL (HN-1..HN-7): the usecase never fabricates a value — this
 * wrapper passes the response through unchanged.
 *
 * DDD layer: interface/mcp/tools — may import application and infrastructure.
 *
 * @module interface/mcp/tools/market-data/moneyRadarTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getMoneyRadarComposite } from "../../../../application/usecases/getMoneyRadarComposite.js";
import { logger } from "../../../../infrastructure/logger.js";

/**
 * Register the get_money_radar_composite tool.
 *
 * @param server - McpServer instance.
 * @param db     - Optional DB injection (defaults to getDb() for production).
 */
export function registerMoneyRadarTools(server: McpServer, db?: Database): void {
  server.tool(
    "get_money_radar_composite",
    "Money Radar — market-wide capital-flow / smart-money-rotation composite score, " +
      "with a divergence engine (D1 index-vs-breadth, D2 price-vs-OBV, D3 crowd-vs-foreign, " +
      "D4 unconfirmed breakout). REUSE-FIRST: fuses get_foreign_flow-family, " +
      "get_foreign_accum_rank, get_foreign_room, get_carry_trade_signal, " +
      "get_credit_flow_signal, get_volatility_indicators, and the 4 Phase-0 " +
      "money-flow oscillators (OBV slope, rel-vol z(20), up/down vol ratio, degraded VWAP) " +
      "into a single [-1,+1] score. " +
      "Returns: score (null when coverage_pct<0.5 — never zero-filled), delta_5d " +
      "(null when <6 accrued history points), divergence{flag,severity,detectors,null_reason?} " +
      "(flag=UNKNOWN — never GREEN — when a detector's axis is null), coverage_pct, " +
      "source_tier (min contributing tier, honest floor), is_estimate, null_reason, " +
      "and components (per-component normalized [-1,1] values, null when gated out). " +
      "Honest-NULL: credit-flow is excluded whenever it is_estimate (SBV YoY/RE-credit " +
      "defaults never enter the score as real — HN-3). No ticker argument — market-wide only. " +
      "Source tier: variable — honest floor across contributing components (T1=oscillators-none-yet, " +
      "T2=foreign-flow/room/credit-live/carry-live, T3=accum-rank/oscillators/volatility, T4=estimate-fallback).",
    {},
    async () => {
      try {
        const resolvedDb = db ?? getDb();
        const result = await getMoneyRadarComposite(resolvedDb);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("[get_money_radar_composite] unexpected failure", { error: message });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Money Radar composite unavailable: ${message}` }, null, 2),
            },
          ],
        };
      }
    },
  );
}
