/**
 * Task P2-B1 — MCP Tool Handler HTTP Rewire (R-3 Unblock)
 *
 * Interface layer: registers `get_carry_trade_signal` and `get_macro_calendar`.
 * Previously called domain services directly; now routes through HTTP to
 * the macro-indicators microservice (port 5004).
 *
 * Tool: get_carry_trade_signal → HTTP GET /carry-trade-signal
 * Tool: get_macro_calendar     → HTTP GET /macro-calendar?days={days}
 *
 * HTTP base URL: read from env var MACRO_INDICATORS_URL (see macroHttpClient.ts).
 * Graceful failure: returns { error: "macro-indicators service unavailable" } on any
 * HTTP error or network failure.
 *
 * @module interface/mcp/tools/macro/carryTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register carry/calendar macro MCP tools:
 *   - get_carry_trade_signal
 *   - get_macro_calendar
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerCarryTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  // ── get_carry_trade_signal ─────────────────────────────────────────────────
  server.tool(
    "get_carry_trade_signal",
    "Computes the VND carry trade signal for the Thien Thoi (global liquidity) layer " +
      "of the Trần Ngọc Báu macro framework. " +
      "Routes through HTTP GET to the macro-indicators microservice (port 5004). " +
      "Returns regime, carrySpread, vndDepositRate, fedFundsRate, and computedAt. " +
      "Source tier: 3 (derived — computed by macro-indicators service).",
    {},
    async () => {
      const url = `${baseUrl}/carry-trade-signal`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          logger.warn("[get_carry_trade_signal] HTTP error from macro-indicators", {
            status: response.status,
            url,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
              },
            ],
          };
        }

        const data: unknown = await response.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        logger.warn("[get_carry_trade_signal] fetch failed", {
          error: err instanceof Error ? err.message : String(err),
          url,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
            },
          ],
        };
      }
    },
  );

  // ── get_macro_calendar ─────────────────────────────────────────────────────
  server.tool(
    "get_macro_calendar",
    "Returns upcoming macro events (FOMC meetings, GSO CPI/GDP releases, Vietnam PMI, " +
      "SBV policy meetings) within the next N days (default 60). " +
      "Routes through HTTP GET to the macro-indicators microservice (port 5004). " +
      "Source tier: 3 (derived — static computed schedule from macro-indicators service).",
    {
      /** Number of calendar days to look ahead (default 60, max 365). */
      days: z.number().int().min(1).max(365).optional(),
    },
    async (args) => {
      const { days } = args as { days?: number };
      const daysParam = days ?? 60;
      const url = `${baseUrl}/macro-calendar?days=${daysParam}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          logger.warn("[get_macro_calendar] HTTP error from macro-indicators", {
            status: response.status,
            url,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
              },
            ],
          };
        }

        const data: unknown = await response.json();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        logger.warn("[get_macro_calendar] fetch failed", {
          error: err instanceof Error ? err.message : String(err),
          url,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
            },
          ],
        };
      }
    },
  );
}
