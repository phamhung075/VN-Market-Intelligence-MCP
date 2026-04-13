/**
 * Task 1179 — get_ticker_intelligence MCP tool
 *
 * STUB: This file is created in Task 1178 (RED phase) to allow TypeScript
 * compilation. The actual implementation is Task 1179.
 *
 * DO NOT add production logic here during Task 1178.
 *
 * Layer: interface
 * DDD: imports infrastructure store functions (see TECH-071)
 */

import type { Database } from "bun:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Format a complete intelligence brief from pre-computed section strings.
 *
 * @param code      - Uppercased stock ticker
 * @param sections  - Tuple of 6 section content strings
 * @param timestamp - ISO 8601 UTC timestamp string
 * @returns Formatted plain-text brief with header, 6 sections, and footer
 */
export function formatTickerIntelligence(
  _code: string,
  _sections: [string, string, string, string, string, string],
  _timestamp: string,
): string {
  throw new Error("Not implemented — Task 1179");
}

/**
 * Aggregate data from 6 sources and return a formatted Vietnamese intelligence brief.
 *
 * @param code - Stock ticker (will be uppercased and trimmed inside handler)
 * @param db   - SQLite database connection (injected for testing)
 * @returns Complete 6-section brief string (never throws to caller)
 */
export async function handleGetTickerIntelligence(
  _code: string,
  _db: Database,
): Promise<string> {
  throw new Error("Not implemented — Task 1179");
}

/**
 * Register get_ticker_intelligence MCP tool on the server.
 *
 * @param server - McpServer instance
 * @param db     - Optional injected Database; defaults to getDb() in production
 */
export function registerTickerIntelligenceTools(
  _server: McpServer,
  _db?: Database,
): void {
  throw new Error("Not implemented — Task 1179");
}
