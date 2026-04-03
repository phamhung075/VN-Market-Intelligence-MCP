/**
 * Crisis Tools — Task 267
 *
 * MCP tool: get_crisis_early_warning
 *
 * Returns:
 * - Active crisis indicators (velocity spikes) for watchlist stocks
 * - Reputation scores for stocks with score < 50
 *
 * Input: optional list of stock codes (defaults to full watchlist)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  getCrisisEarlyWarning,
  formatCrisisWarningOutput,
} from "../.././../application/usecases/getCrisisEarlyWarning.js";
import { getDb } from "../.././../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_crisis_early_warning MCP tool.
 *
 * @param server - McpServer instance
 * @param injectedDb - Optional injected Database (for testing)
 */
export function registerCrisisTools(
  server: McpServer,
  injectedDb?: Database,
): void {
  server.tool(
    "get_crisis_early_warning",
    "Get crisis early warning radar for watchlist stocks. Returns velocity-based crisis indicators and reputation scores. Flags stocks with mention velocity > 2× baseline or reputation score < 50.",
    {
      codes: z
        .array(z.string())
        .optional()
        .describe(
          "List of stock codes to check (e.g. ['VNM', 'FPT']). If omitted, checks full watchlist.",
        ),
    },
    async (args) => {
      try {
        const db = injectedDb ?? getDb();

        // Resolve stock codes: use provided list or load from watchlist
        let stockCodes: string[] = args.codes ?? [];
        if (stockCodes.length === 0) {
          const rows = db
            .prepare("SELECT code FROM watchlist")
            .all() as { code: string }[];
          stockCodes = rows.map((r) => r.code);
        }

        const result = await getCrisisEarlyWarning(db, stockCodes);
        const content = formatCrisisWarningOutput(result);

        return { content };
      } catch (err) {
        console.error("[get_crisis_early_warning] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
