/**
 * Task 1423e — Macro Calendar MCP Tool
 *
 * Interface layer: registers `get_macro_calendar`.
 *
 * Tool: get_macro_calendar
 *   Input:  optional { days?: number }  (default 60)
 *   Output: MacroCalendarResult JSON
 *
 * Pure domain call — no DB, no HTTP.
 *
 * @module interface/mcp/tools/macro/carryTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  getMacroCalendar,
  type MacroCalendarResult,
} from "../../../../domain/services/macro/macroCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register carry/calendar macro MCP tools: get_macro_calendar.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerCarryTools(server: McpServer): void {
  server.tool(
    "get_macro_calendar",
    "Returns upcoming macro events (FOMC meetings, GSO CPI/GDP releases, Vietnam PMI, " +
      "SBV policy meetings) within the next N days (default 60). " +
      "Each event is annotated with isPivotWindow=true when it falls in months 3, 6, 9, or 12 " +
      "(quarter-end periods of heightened VN market sensitivity). " +
      "Also returns currentMonthIsPivotWindow, nextPivotWindow label, and a warning if " +
      "within 14 days of a pivot month.",
    {
      /** Number of calendar days to look ahead (default 60, max 365). */
      days: z.number().int().min(1).max(365).optional(),
      /**
       * Test-only: ISO date string to use as reference date instead of today.
       * e.g. "2026-05-15"
       */
      _testReferenceDate: z.string().optional(),
    },
    (args) => {
      const { days, _testReferenceDate } = args as {
        days?: number;
        _testReferenceDate?: string;
      };

      const referenceDate = _testReferenceDate
        ? new Date(_testReferenceDate)
        : undefined;

      const result: MacroCalendarResult = getMacroCalendar(referenceDate, days ?? 60);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
