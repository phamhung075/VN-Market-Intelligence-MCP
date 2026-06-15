/**
 * CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2 — MCP Tool Handler Rewire
 *
 * Interface layer: registers `get_yield_spread_signal`.
 *
 * Tool: get_yield_spread_signal → HTTP POST /snapshot (body "{}"),
 *       projects snapshot.signals.yield sub-object.
 *       Surfaces source_tier + is_estimate from the YieldSignalDTO.
 *       NOTE: is_estimate=true / source_tier=4 is expected and correct — the
 *       earningYield input is still a fixture estimate; surfacing this flag is
 *       honest provenance, not a bug.
 *
 * HTTP base URL: read from env var MACRO_INDICATORS_URL (see macroHttpClient.ts).
 * Graceful failure: returns { error: "macro-indicators service unavailable" } on any
 * HTTP error or network failure, or { error: "yield signal not available in snapshot" }
 * when signals.yield is absent from the snapshot response.
 *
 * Sprint: CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2
 *
 * @module interface/mcp/tools/macro/dinhGiaTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register Dinh Gia (valuation) MCP tools:
 *   - get_yield_spread_signal
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerDinhGiaTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  // ── get_yield_spread_signal ────────────────────────────────────────────────
  server.tool(
    "get_yield_spread_signal",
    "Computes the yield spread signal for the Dinh Gia (valuation) layer of the " +
      "Trần Ngọc Báu macro framework (Phase 2). " +
      "Routes through HTTP POST /snapshot to the macro-indicators microservice (port 5004) " +
      "and projects the yield sub-object. " +
      "Returns label, spread, earningYield, depositRate, computedAt, " +
      "source_tier (2=administered-published, 4=fixture/estimate), " +
      "and is_estimate (true when any yield input fell back to fixture). " +
      "Source tier: tier:2 when both earningYield and depositRate are live; tier:4 on fixture fallback.",
    {},
    async () => {
      const result = await macroFetch<{ signals?: { yield?: unknown } }>(
        baseUrl,
        "/snapshot",
        {},
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_yield_spread_signal] macro-indicators unavailable", {
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
      const yieldSignal = snapshot?.signals?.yield;
      if (yieldSignal == null) {
        logger.warn("[get_yield_spread_signal] /snapshot response missing signals.yield");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "yield signal not available in snapshot" }, null, 2),
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(yieldSignal, null, 2) }],
      };
    },
  );
}
