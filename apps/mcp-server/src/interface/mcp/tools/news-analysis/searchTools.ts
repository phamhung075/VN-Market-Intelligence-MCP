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

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { searchStocks, formatSearchResults } from "../../../../domain/services/stockSearch.js";
import { logger } from "../../../../infrastructure/logger.js";

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
// search_stocks — REMOVED from MCP registration (sprint-036 task 230).
// The domain service (searchStocks / formatSearchResults) is still importable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerSearchStocksTools(_server: McpServer): void {
  // No-op: search_stocks is no longer exposed as an MCP tool.
}
