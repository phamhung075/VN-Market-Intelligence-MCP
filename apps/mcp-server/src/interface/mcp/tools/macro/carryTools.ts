/**
 * CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2 — MCP Tool Handler Rewire
 *
 * Interface layer: registers `get_carry_trade_signal` and `get_macro_calendar`.
 *
 * Tool: get_carry_trade_signal → HTTP POST /snapshot (body "{}"),
 *       projects snapshot.signals.carry sub-object.
 *       Surfaces source_tier, is_estimate, fetched_at_source, reasoning
 *       directly from the CarrySignalDTO — no fixture values possible.
 *
 * Tool: get_macro_calendar → HTTP GET /macro-calendar?days={days} (unchanged).
 *
 * HTTP base URL: read from env var MACRO_INDICATORS_URL (see macroHttpClient.ts).
 * Graceful failure: returns { error: "macro-indicators service unavailable" } on any
 * HTTP error or network failure, or { error: "carry signal not available in snapshot" }
 * when signals.carry is absent from the snapshot response.
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
      "Routes through HTTP POST /snapshot to the macro-indicators microservice (port 5004) " +
      "and projects the carry sub-object. " +
      "Returns regime, carrySpread (null when inputs are estimated), vndDepositRate, " +
      "fedFundsRate, computedAt, source_tier (2=administered-published, 4=fixture/estimate), " +
      "is_estimate (true when any carry input fell back to fixture), and fetched_at_source " +
      "(FRED source date for fedFunds; null when unavailable). " +
      "Source tier: reflects live carry inputs — tier:2 when live, tier:4 when fixture fallback.",
    {},
    async () => {
      const url = `${baseUrl}/snapshot`;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: "{}",
        });

        if (!response.ok) {
          logger.warn("[get_carry_trade_signal] HTTP error from macro-indicators /snapshot", {
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

        const snapshot = await response.json() as {
          signals?: {
            carry?: unknown;
          };
        };

        const carrySignal = snapshot?.signals?.carry;
        if (carrySignal == null) {
          logger.warn("[get_carry_trade_signal] /snapshot response missing signals.carry", { url });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "carry signal not available in snapshot" }, null, 2),
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(carrySignal, null, 2) }],
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
      days: z.coerce.number().int().min(1).max(365).optional(),
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
