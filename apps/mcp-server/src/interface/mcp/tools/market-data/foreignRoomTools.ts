/**
 * Interface — get_foreign_room MCP Tool (P0-2-FOREIGN-ROOM-SUITE)
 *
 * Registers the `get_foreign_room` MCP tool. Exposes:
 *   - Per-ticker room utilization, 5d depletion velocity, ROOM_LOCKED/FULL_ROOM_SELL flags
 *   - Market-wide and sector cap-weighted saturation
 *   - Gauge-ready scalar: foreign_outflow_z_5d (P1 Fear & Greed foreign-outflow leg)
 *
 * Data source: vnstock_trading_stats (Tier 2, populated daily) + foreign_room_events table.
 * Routes via gateway; never calls vn-market tools directly.
 *
 * DDD layer: interface/mcp/tools — may import application and infrastructure.
 *
 * @module interface/mcp/tools/market-data/foreignRoomTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getForeignRoom } from "../../../../application/usecases/getForeignRoom.js";
import { summarizeForeignRoomTickers } from "../../../../domain/services/market-data/foreignRoomAnalyzer.js";

/** Default top_n when the caller omits it — see summarizeForeignRoomTickers. */
const DEFAULT_TOP_N = 10;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the get_foreign_room tool.
 *
 * @param server - McpServer instance
 * @param db     - Optional DB injection (defaults to getDb() for production)
 */
export function registerForeignRoomTools(server: McpServer, db?: Database): void {
  server.tool(
    "get_foreign_room",
    "Foreign investor room utilization and saturation suite for VN watchlist tickers. " +
      "Returns per-ticker: room_utilization_pct (current_holding/max_holding × 100), " +
      "foreign_room_remaining (shares), 5-day depletion velocity, ROOM_LOCKED flag " +
      "(utilization ≥99% AND not recovering), FULL_ROOM_SELL flag (utilization ≥99% AND " +
      "holding ratio declining 3d), and recent ROOM_FULL/ROOM_REOPEN events. " +
      "Market-level: cap-weighted saturation (0–100%), sector breakdown, and " +
      "foreign_outflow_z_5d (gauge-ready z-score of market-wide velocity vs 20-session " +
      "baseline; null when <20 sessions). " +
      "Source tier: 2 (vnstock_trading_stats, populated daily post-HOSE close). " +
      "Foreign-restricted stocks (max_holding_ratio=0) returned with foreign_restricted=true " +
      "and all derived fields null — never fabricated. " +
      "Gauge dependency: foreign_outflow_z_5d is the P1 Fear & Greed foreign-outflow leg. " +
      "Package destination: market-analyst, alert-commander, digest-predict. " +
      "TOKEN-BUDGET GUARD: when `code` is omitted, `tickers[]` is trimmed to `top_n` entries " +
      "(default 10) — never the full traded universe inline. Prioritizes ROOM_LOCKED/" +
      "FULL_ROOM_SELL flagged tickers, then highest |depletion_velocity_5d|. `tickers_rollup` " +
      "carries aggregate counts over the FULL universe regardless of trimming; when tickers are " +
      "omitted, `fetch_more.omitted_codes` lists them for individual re-fetch via `code=<ticker>`.",
    {
      code: z
        .string()
        .optional()
        .describe(
          "Optional stock ticker (e.g. 'VCB'). When omitted, returns data for all watchlist tickers.",
        ),
      top_n: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(DEFAULT_TOP_N)
        .describe(
          `Max tickers to include inline when 'code' is omitted (default ${DEFAULT_TOP_N}). ` +
            "Effective limit is min(top_n, actual ticker count) — never a fixed universe-size " +
            "assumption. Ignored when 'code' is set (single-ticker response is never trimmed).",
        ),
    },
    async ({ code, top_n }) => {
      try {
        const resolvedDb = db ?? getDb();
        const resolvedTopN = top_n ?? DEFAULT_TOP_N;
        const result = await getForeignRoom(resolvedDb, code);

        const { tickers, rollup, omitted_codes } = summarizeForeignRoomTickers(
          result.tickers,
          resolvedTopN,
        );

        const payload = {
          as_of_date: result.as_of_date,
          tickers,
          tickers_rollup: rollup,
          market: result.market,
          source_tier: result.source_tier,
          coverage_note: result.coverage_note,
          more_available: omitted_codes.length > 0,
          ...(omitted_codes.length > 0
            ? {
                fetch_more: {
                  omitted_codes,
                  hint:
                    `${omitted_codes.length} ticker(s) omitted from this response to stay under ` +
                    `the tool-result token budget. Call get_foreign_room again with ` +
                    `code="<TICKER>" for full detail on any one of them, or raise top_n ` +
                    `(currently ${resolvedTopN}).`,
                },
              }
            : {}),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // NFR-P02-2: never expose raw DB error messages
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Foreign room data unavailable: ${msg}` }, null, 2),
          }],
        };
      }
    },
  );
}
