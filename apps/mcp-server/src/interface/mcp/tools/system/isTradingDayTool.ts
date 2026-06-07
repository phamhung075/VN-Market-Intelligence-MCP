/**
 * is_trading_day MCP Tool — DWF-DEV-MCP-1
 *
 * Returns VN exchange open/holiday/half-day status for a given date.
 * Uses the embedded VN calendar (vnTradingCalendar.ts) — no network, no DB writes.
 *
 * Tool contract:
 *   is_trading_day(date?: string) → TradingDayResult
 *
 * If no date param, defaults to today in VN timezone (GMT+7).
 *
 * @module interface/mcp/tools/system/isTradingDayTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isVnTradingDay, getTodayVnDate } from "../../../../domain/services/vnTradingCalendar.js";

/**
 * Register the `is_trading_day` tool on the MCP server.
 *
 * DEREGISTER: is_trading_day removed (U3 TOOL-SURFACE-UPGRADE).
 * Designed for DWF-PHASE1 (cowork-match-slots) which is NOT active on main branch.
 * The worktree version is unshipped. Zero claims across 4 layers on main.
 * Domain logic (isVnTradingDay) retained for direct use when DWF-PHASE2 is scoped.
 * Re-register when DWF-PHASE2 enters active sprint scope.
 *
 * @param _server The McpServer instance (unused — tool deregistered).
 */
export function registerIsTradingDayTool(_server: McpServer): void {
  // Tool deregistered: is_trading_day — TOOL-SURFACE-UPGRADE U3
  // DWF-PHASE1 not in current scope; re-register when DWF-PHASE2 activates.
  void _server; // explicit unused-param acknowledgement
}
