/**
 * Task 184 — Stock Search MCP Tool
 *
 * Interface layer: registers the search_stocks MCP tool.
 *
 * Tool registered:
 *   1. search_stocks — find Vietnamese stocks by code, company name, or sector keyword
 *
 * @module interface/mcp/tools/searchTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { searchStocks, formatSearchResults } from "../../../domain/services/stockSearch.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the search_stocks MCP tool on a McpServer instance.
 *
 * The tool performs case-insensitive, diacritics-tolerant search across
 * the static Vietnamese stock catalogue using:
 *   1. stockAliases.ts alias dictionary (code + company names)
 *   2. sectorPeers.ts sector mappings
 *   3. Watchlist table (to flag already-watched stocks)
 *
 * Returns a plain-text table (no Markdown) with code, company name,
 * exchange, sector, and watchlist status.
 *
 * @param server - McpServer instance to register on
 */
export function registerSearchStocksTools(server: McpServer): void {
  server.tool(
    "search_stocks",
    "Search for Vietnamese stocks by code, company name, or sector keyword",
    {
      query: z
        .string()
        .describe(
          "Search term (e.g. 'VCB', 'Vietcombank', 'banking', 'ngan hang', 'thep')",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Maximum number of results to return (default: 10, max: 50)"),
    },
    async ({ query, limit }) => {
      try {
        // Initialise DB so we can read the watchlist (idempotent)
        await initDatabase();
        const db = getDb();

        // Fetch current watchlist codes
        const rows = db
          .prepare("SELECT code FROM watchlist")
          .all() as { code: string }[];
        const watchlistCodes = rows.map((r) => r.code);

        // Perform search
        const results = searchStocks(query, watchlistCodes, limit);
        const text = formatSearchResults(query, results);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[search_stocks] Error", {
          error: err instanceof Error ? err.message : String(err),
          query,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi tim kiem: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
