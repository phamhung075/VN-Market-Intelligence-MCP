/**
 * Export Tools — MCP tool for portfolio snapshot export
 *
 * Tools registered:
 *   1. export_portfolio_snapshot — dumps all portfolio data to a timestamped JSON file
 *
 * @module interface/mcp/tools/exportTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exportPortfolioSnapshot } from "../../../../application/usecases/exportPortfolioSnapshot.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

// export_portfolio_snapshot — REMOVED from MCP registration (sprint-036 task 230).
// Portfolio snapshot export runs as part of the scheduled weekly report job.
// The exportPortfolioSnapshot use case is still available for internal/cron use.
export function registerExportTools(_server: McpServer): void {
  // No-op: export_portfolio_snapshot is no longer exposed as an MCP tool.
}
