/**
 * Task 087 — Analysis MCP Tools (stub)
 *
 * Placeholder for task 083 (Analysis MCP tools: fetch_and_analyze,
 * run_impact_chain, search_similar_context).
 *
 * This module exports a no-op `registerAnalysisTools` so that server.ts can
 * import and call it unconditionally.  Task 083 will replace the empty body
 * with the real tool registrations once the cascade engine (062) is done.
 *
 * @module interface/mcp/tools/analysis
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register analysis MCP tools on the given McpServer instance.
 *
 * Currently a no-op stub — real tools will be added in task 083.
 *
 * @param _server - The McpServer instance (unused until task 083).
 */
export function registerAnalysisTools(_server: McpServer): void {
  // Intentionally empty — task 083 will implement the real tools.
}
