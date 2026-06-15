/**
 * VMT-7d — MCP Tool: get_cpi_components
 *
 * Thin proxy to Zone-A POST /cpi-components on the macro-indicators microservice.
 * Response mirrors CPIComponentsResponse DTO (dtos_vmt_cpi.go) field-for-field.
 *
 * CRITICAL weights policy (pass-through — do NOT coerce null → 0):
 *   - CPIBasketDTO.weight_pct is ALWAYS null (nil pointer in Go)
 *   - CPIComponentsResponse.weights_is_estimate is ALWAYS true
 *   - Weights are NOT available from the monthly NSO Excel sheet
 *   - Do not fill, coerce, or strip these null values — surface as-is
 *
 * HTTP base URL: MACRO_INDICATORS_URL env var → fallback http://localhost:5004
 *
 * @module interface/mcp/tools/macro/cpiComponentsTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod output schema — mirrors CPIComponentsResponse DTO field-for-field
// ─────────────────────────────────────────────────────────────────────────────

const CPIBasketSchema = z.object({
  key: z.string(),
  name_vi: z.string(),
  /** Month-on-month change % (col 4) */
  mom_pct: z.number(),
  /** YTD average YoY % (col 5) */
  avg_ytd_yoy_pct: z.number(),
  /** Current-month YoY % */
  yoy_pct: z.number(),
  /**
   * ALWAYS null — weights NOT available from monthly NSO Excel.
   * Source: CPI methodology PDF (updated ~every 5 years).
   * Do NOT coerce null → 0. Surface as-is.
   */
  weight_pct: z.number().nullable(),
  /** false for index values (primary source, PROBE-3 confirmed) */
  is_estimate: z.boolean(),
});

const CPIComponentsResponseSchema = z.object({
  status: z.string(),
  period: z.string(),
  /** Total CPI basket ("CHỈ SỐ GIÁ TIÊU DÙNG") — weight_pct is null */
  headline: CPIBasketSchema,
  /** All recognized basket-level CPI rows — weight_pct is null on all */
  baskets: z.array(CPIBasketSchema),
  /** ALWAYS true — weights not available from monthly Excel */
  weights_is_estimate: z.boolean(),
  weights_note: z.string(),
  source: z.string(),
  fetched_at: z.string(),
  /** false — all CPI index values are primary source */
  is_estimate: z.boolean(),
  error: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register get_cpi_components MCP tool.
 * @param server The McpServer instance to register tools on.
 */
export function registerCpiComponentsTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  server.tool(
    "get_cpi_components",
    "Returns Vietnam CPI component breakdown from the NSO (General Statistics Office). " +
      "Includes the headline CPI basket and all 11 main basket categories with " +
      "MoM %, YTD average YoY %, and current-month YoY % for each. " +
      "Source: NSO monthly Excel sheet '16.CPI' (primary source, is_estimate=false). " +
      "IMPORTANT: weight_pct is ALWAYS null on all baskets and headline — " +
      "basket weights are not published in the monthly Excel (only in the CPI methodology PDF, " +
      "updated every ~5 years). weights_is_estimate=true PERMANENT. " +
      "Routes through HTTP POST /cpi-components to the macro-indicators microservice (port 5004). " +
      "Accepts optional period (YYYY-MM); defaults to the most recent monthly release.",
    {
      /** Optional period override (YYYY-MM). Defaults to most recent monthly release. */
      period: z.string().optional(),
    },
    async (args) => {
      const { period } = args as { period?: string };
      const body = period ? { period } : {};

      const result = await macroFetch<unknown>(
        baseUrl,
        "/cpi-components",
        body,
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_cpi_components] macro-indicators unavailable", {
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
      };
    },
  );
}

// Export schema for downstream consumers / tests
export { CPIComponentsResponseSchema };
