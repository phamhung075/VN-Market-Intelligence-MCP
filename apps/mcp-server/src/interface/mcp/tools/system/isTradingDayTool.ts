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
 * @param server The McpServer instance to register the tool on.
 */
export function registerIsTradingDayTool(server: McpServer): void {
  server.tool(
    "is_trading_day",
    "Check if a given date is a VN exchange (HOSE/HNX) trading day. " +
      "Returns open/holiday/half_day/weekend/unknown status using embedded VN calendar (2024–2027). " +
      "If no date is provided, defaults to today in VN timezone (GMT+7). " +
      "Read-only — writes nothing to the database.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .optional()
        .describe(
          "Date to check in YYYY-MM-DD format (VN timezone, GMT+7). " +
            "Defaults to today in VN time if omitted.",
        ),
    },
    async ({ date }) => {
      const queryDate = date ?? getTodayVnDate();
      const result = isVnTradingDay(queryDate);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
