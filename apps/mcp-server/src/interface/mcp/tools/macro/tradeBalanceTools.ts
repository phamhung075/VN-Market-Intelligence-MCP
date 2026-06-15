/**
 * VMT-7a — MCP Tool: get_vn_trade_balance
 *
 * Thin proxy to Zone-A POST /trade-balance on the macro-indicators microservice.
 * Response mirrors TradeBalanceResponse DTO (dtos_vmt_trade.go) field-for-field.
 *
 * Honesty invariants (PERMANENT — ARCH Decision A):
 *   - bloc_split.fdi.is_estimate = true (always)
 *   - bloc_split.domestic.is_estimate = true (always)
 * These MUST appear in the MCP output. Never strip them.
 *
 * HTTP base URL: MACRO_INDICATORS_URL env var → fallback http://localhost:5004
 *
 * @module interface/mcp/tools/macro/tradeBalanceTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod output schema — mirrors TradeBalanceResponse DTO field-for-field
// ─────────────────────────────────────────────────────────────────────────────

const HSSectorSchema = z.object({
  name_vi: z.string(),
  absolute_bn_usd: z.number(),
  yoy_pct: z.number(),
  is_estimate: z.boolean(),
});

const BlocShareSchema = z.object({
  share_pct: z.number(),
  /** PERMANENT — ARCH Decision A: always true */
  is_estimate: z.boolean(),
});

const BlocSplitSchema = z.object({
  fdi: BlocShareSchema,
  domestic: BlocShareSchema,
  fdi_registered_mn_usd: z.number(),
  note: z.string(),
});

const TradeBalanceResponseSchema = z.object({
  status: z.string(),
  period: z.string(),
  export_total_mn_usd: z.number(),
  import_total_mn_usd: z.number(),
  trade_balance_mn_usd: z.number(),
  export_ytd_mn_usd: z.number(),
  import_ytd_mn_usd: z.number(),
  export_yoy_pct: z.number(),
  import_yoy_pct: z.number(),
  hs_exports: z.array(HSSectorSchema),
  hs_imports: z.array(HSSectorSchema),
  bloc_split: BlocSplitSchema,
  is_estimate: z.boolean(),
  source: z.string(),
  fetched_at: z.string(),
  error: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register get_vn_trade_balance MCP tool.
 * @param server The McpServer instance to register tools on.
 */
export function registerTradeBalanceTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  server.tool(
    "get_vn_trade_balance",
    "Returns Vietnam monthly trade balance data from the NSO (General Statistics Office). " +
      "Includes total exports/imports in M USD, YoY % changes, YTD cumulative figures, " +
      "HS-sector breakdowns (sheets 14.XK exports + 15.NK imports), and the FDI vs domestic " +
      "bloc-split estimate (ARCH Decision A — is_estimate=true PERMANENT on bloc_split). " +
      "Routes through HTTP POST /trade-balance to the macro-indicators microservice (port 5004). " +
      "Accepts optional period (YYYY-MM); defaults to the most recent monthly release. " +
      "bloc_split.fdi.is_estimate and bloc_split.domestic.is_estimate are ALWAYS true — " +
      "this is a permanent honesty invariant, not a data quality issue.",
    {
      /** Optional period override (YYYY-MM). Defaults to most recent monthly release. */
      period: z.string().optional(),
    },
    async (args) => {
      const { period } = args as { period?: string };
      const body = period ? { period } : {};

      const result = await macroFetch<unknown>(
        baseUrl,
        "/trade-balance",
        body,
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_vn_trade_balance] macro-indicators unavailable", {
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
export { TradeBalanceResponseSchema };
