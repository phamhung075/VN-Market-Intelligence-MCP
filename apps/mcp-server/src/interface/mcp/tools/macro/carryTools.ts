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
 * Tool: get_macro_calendar → served directly from the in-repo static
 *       schedule (domain/services/macro/macroCalendar.ts#getMacroCalendar),
 *       NO HTTP hop. FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE: previously this
 *       routed to the macro-indicators Go `/macro-calendar` endpoint, which
 *       is a permanent FDA-4 honest-unavailable STUB (no live source was
 *       ever wired there) — always returning empty events/status:
 *       "unavailable"/source_tier:4. The ~36-event 2026 FOMC/GSO-CPI/
 *       GSO-GDP/Vietnam-PMI/SBV schedule already lived, unwired, in this
 *       same mcp-server as a pure domain function. Repointing here keeps
 *       the fix wholly inside apps/mcp-server/ and drops an unnecessary
 *       network hop for data that was already in-repo.
 *
 * HTTP base URL: read from env var MACRO_INDICATORS_URL (see macroHttpClient.ts).
 * Graceful failure: returns { error: "macro-indicators service unavailable" } on any
 * HTTP error or network failure, or { error: "carry signal not available in snapshot" }
 * when signals.carry is absent from the snapshot response.
 * (get_macro_calendar has no HTTP failure mode — it is a pure in-process read.)
 *
 * @module interface/mcp/tools/macro/carryTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";
import { getMacroCalendar } from "../../../../domain/services/macro/macroCalendar.js";

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
      const result = await macroFetch<{ signals?: { carry?: unknown } }>(
        baseUrl,
        "/snapshot",
        {},
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_carry_trade_signal] macro-indicators unavailable", {
          degrade: result.degrade,
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

      const snapshot = result.data;
      const carrySignal = snapshot?.signals?.carry;
      if (carrySignal == null) {
        logger.warn("[get_carry_trade_signal] /snapshot response missing signals.carry");
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
    },
  );

  // ── get_macro_calendar ─────────────────────────────────────────────────────
  server.tool(
    "get_macro_calendar",
    "Returns upcoming macro events (FOMC meetings, GSO CPI/GDP releases, Vietnam PMI, " +
      "SBV policy meetings) within the next N days (default 60, max 365). " +
      "Served directly from the in-repo static 2026 schedule — no HTTP hop, no upstream " +
      "dependency. `days` is a generic window filter applied against today's date; it is " +
      "NOT a single-month special case. Each event carries isPivotWindow (true for " +
      "quarter-end months 3/6/9/12). The envelope also carries currentMonthIsPivotWindow, " +
      "nextPivotWindow, and pivotWindowWarning (non-null when within 14 days of the next " +
      "pivot month — this is the pivot_window/pivot_window_active signal consumed by " +
      "alert-commander and digest-predict). " +
      "Source tier: 3 (derived — static computed schedule, dates approximate/subject to " +
      "official confirmation; updated annually). is_estimate: true (honest label for the " +
      "static-schedule nature — not a live-confirmed feed, not fabricated data).",
    {
      /** Number of calendar days to look ahead (default 60, max 365). */
      days: z.coerce.number().int().min(1).max(365).optional(),
    },
    async (args) => {
      const { days } = args as { days?: number };
      const daysParam = days ?? 60;

      const calendar = getMacroCalendar(new Date(), daysParam);

      const payload = {
        source_tier: 3,
        is_estimate: true,
        status: "ok",
        daysRequested: daysParam,
        events: calendar.events,
        currentMonthIsPivotWindow: calendar.currentMonthIsPivotWindow,
        nextPivotWindow: calendar.nextPivotWindow,
        pivotWindowWarning: calendar.pivotWindowWarning,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
