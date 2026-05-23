/**
 * Task P2-B1 — MCP Tool Handler HTTP Rewire (R-3 Unblock)
 *
 * Interface layer: registers `get_yield_spread_signal`.
 * Previously called domain services directly; now routes through HTTP to
 * the macro-indicators microservice (port 5004).
 *
 * Tool: get_yield_spread_signal → HTTP GET /yield-spread-signal
 *
 * HTTP base URL: read from env var MACRO_INDICATORS_URL (see macroHttpClient.ts).
 * Graceful failure: returns { error: "macro-indicators service unavailable" } on any
 * HTTP error or network failure.
 *
 * Sprint: P2-B1 — Báu Phase 2 Micro-service Rewire
 *
 * @module interface/mcp/tools/macro/dinhGiaTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";

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
      "Routes through HTTP GET to the macro-indicators microservice (port 5004). " +
      "Returns label, spread, earningYield, depositRate, and computedAt. " +
      "Source tier: 3 (derived — computed by macro-indicators service).",
    {},
    async () => {
      const url = `${baseUrl}/yield-spread-signal`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          logger.warn("[get_yield_spread_signal] HTTP error from macro-indicators", {
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
        logger.warn("[get_yield_spread_signal] fetch failed", {
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
