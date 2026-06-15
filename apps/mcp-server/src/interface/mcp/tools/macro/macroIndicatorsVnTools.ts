/**
 * VMT-7c — MCP Tool: get_vn_macro_indicators
 *
 * Thin proxy to Zone-A POST /macro-indicators on the macro-indicators microservice.
 * Response mirrors MacroIndicatorsGSOResponse DTO (dtos_vmt_macro.go) field-for-field.
 *
 * Returns IIP (Index of Industrial Production) for 4 sectors:
 *   iip_all_industry, iip_manufacturing, iip_mining, iip_electricity
 * All values are primary source (NSO monthly Excel, sheet "2.IIPthang").
 * is_estimate = false (PROBE-3 confirmed).
 *
 * HTTP base URL: MACRO_INDICATORS_URL env var → fallback http://localhost:5004
 *
 * @module interface/mcp/tools/macro/macroIndicatorsVnTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod output schema — mirrors MacroIndicatorsGSOResponse DTO field-for-field
// ─────────────────────────────────────────────────────────────────────────────

const IIPSectorSchema = z.object({
  key: z.string(),
  name_vi: z.string(),
  /** Current-month YoY % (col 2): tháng N vs cùng kỳ năm trước */
  yoy_pct: z.number(),
  /** YTD YoY % (col 3): N tháng vs cùng kỳ năm trước */
  ytd_yoy_pct: z.number(),
  /** MoM % (col 4): tháng N vs tháng trước */
  mom_pct: z.number(),
  /** false — primary source (PROBE-3 confirmed) */
  is_estimate: z.boolean(),
});

const MacroIndicatorsGSOResponseSchema = z.object({
  status: z.string(),
  period: z.string(),
  /** 4 IIP sectors: iip_all_industry, iip_manufacturing, iip_mining, iip_electricity */
  iip: z.array(IIPSectorSchema),
  source: z.string(),
  fetched_at: z.string(),
  /** false — all IIP values are primary source */
  is_estimate: z.boolean(),
  error: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register get_vn_macro_indicators MCP tool.
 * @param server The McpServer instance to register tools on.
 */
export function registerMacroIndicatorsVnTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  server.tool(
    "get_vn_macro_indicators",
    "Returns Vietnam GSO Index of Industrial Production (IIP) for 4 key sectors: " +
      "iip_all_industry, iip_manufacturing, iip_mining, iip_electricity. " +
      "Each sector carries YoY %, YTD YoY %, and MoM % change. " +
      "Source: NSO monthly Excel sheet '2.IIPthang' (primary source, is_estimate=false). " +
      "Routes through HTTP POST /macro-indicators to the macro-indicators microservice (port 5004). " +
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
        "/macro-indicators",
        body,
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_vn_macro_indicators] macro-indicators unavailable", {
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
export { MacroIndicatorsGSOResponseSchema };
