/**
 * Task 239 — get_market_context compound MCP tool (Sprint 037)
 *
 * A single compound tool that replaces the 5-call opening sequence every
 * analysis agent performs at the start of each session:
 *
 *   get_watchlist → get_market_snapshot → get_macro_snapshot
 *     → get_alerts → get_analysis_history
 *
 * Returns a single structured text response with 5 labeled sections,
 * reducing agent startup latency and token overhead.
 *
 * Tool registered:
 *   1. get_market_context — compound context fetch for all analysis agents
 *
 * @module interface/mcp/tools/marketContextTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import {
  buildWatchlistSection,
  buildMacroSection,
  buildAlertsSection,
  buildAnalysisSection,
  buildSystemStatusText,
} from "../../../../domain/services/marketContextBuilder.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_market_context compound tool on an McpServer instance.
 *
 * This single tool replaces the 5-call opening sequence every analysis agent
 * uses at session start. All 5 data sources are queried in a single DB
 * transaction pass and assembled into one structured text response.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerMarketContextTools(server: McpServer): void {
  server.tool(
    "get_market_context",
    "One-shot compound context fetch for analysis agents. " +
      "Returns a single response with 5 labeled sections: " +
      "(1) WATCHLIST & PRICES — all watchlist stocks with last known price/change; " +
      "(2) MACRO — latest commodity prices and macro indicators (oil, gold, USD/VND, CPI); " +
      "(3) OPEN ALERTS — unread alerts within the time window; " +
      "(4) RECENT ANALYSIS — latest RAG analysis entries ordered by impact score; " +
      "(5) SYSTEM STATUS — health summary with pending alert count and last cycle time. " +
      "Use this at the start of every agent session instead of calling " +
      "get_watchlist + get_market_snapshot + get_macro_snapshot + get_alerts + get_analysis_history separately.",
    {
      hours_back: z.coerce
        .number()
        .int()
        .min(1)
        .max(168)
        .default(24)
        .optional()
        .describe(
          "How many hours back to look for alerts and analysis entries (default: 24, max: 168)",
        ),
    },
    async ({ hours_back: hoursBackRaw }) => {
      const hoursBack = hoursBackRaw ?? 24;

      try {
        await initDatabase();
        const db = getDb();

        const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString();

        const sections: string[] = [
          buildWatchlistSection(db),
          "",
          buildMacroSection(db),
          "",
          buildAlertsSection(db, since, hoursBack),
          "",
          buildAnalysisSection(db, since, hoursBack),
          "",
          buildSystemStatusText(db),
        ];

        return {
          content: [{ type: "text" as const, text: sections.join("\n") }],
        };
      } catch (err) {
        console.error("[get_market_context] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error assembling market context: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
