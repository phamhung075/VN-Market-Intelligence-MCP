/**
 * VMT-7b — MCP Tool: get_vn_bop
 *
 * Thin proxy to Zone-A POST /bop on the macro-indicators microservice.
 * Response mirrors BOPResponse DTO (dtos_vmt_bop.go) field-for-field.
 *
 * Honesty invariants:
 *   - offshore_parked.is_estimate = true (always)
 *   - errors_omissions_mn_usd follows BPM6 sign convention (negative = outflow)
 *   - fx_incidence.is_estimate = false (primary source, PROBE-2 confirmed)
 * These MUST appear in the MCP output. Never strip them.
 *
 * HTTP base URL: MACRO_INDICATORS_URL env var → fallback http://localhost:5004
 *
 * @module interface/mcp/tools/macro/bopTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod output schema — mirrors BOPResponse DTO field-for-field
// ─────────────────────────────────────────────────────────────────────────────

const BOPCurrentAccountSchema = z.object({
  current_account_total_mn_usd: z.number(),
  goods_exports_mn_usd: z.number(),
  goods_imports_mn_usd: z.number(),
  goods_net_mn_usd: z.number(),
  services_exports_mn_usd: z.number(),
  services_imports_mn_usd: z.number(),
  services_net_mn_usd: z.number(),
  primary_income_net_mn_usd: z.number(),
  secondary_income_net_mn_usd: z.number(),
});

const BOPFinancialAccountSchema = z.object({
  financial_account_mn_usd: z.number(),
  fdi_net_mn_usd: z.number(),
  portfolio_investment_net_mn_usd: z.number(),
  other_investment_net_mn_usd: z.number(),
});

const FXIncidenceSchema = z.object({
  label: z.string(),
  errors_omissions_mn_usd: z.number(),
  /** false — primary source (PROBE-2 confirmed) */
  is_estimate: z.boolean(),
});

const OffshoreParkedSchema = z.object({
  /** null when preconditions not met */
  offshore_parked_mn_usd: z.number().nullable(),
  /** PERMANENT — always true */
  is_estimate: z.boolean(),
  note: z.string(),
});

const BOPResponseSchema = z.object({
  status: z.string(),
  quarter: z.string(),
  period: z.string(),
  current_account: BOPCurrentAccountSchema,
  capital_account_mn_usd: z.number(),
  financial_account: BOPFinancialAccountSchema,
  /** BPM6 sign convention: negative = outflows */
  errors_omissions_mn_usd: z.number(),
  overall_balance_mn_usd: z.number(),
  reserve_assets_mn_usd: z.number(),
  fx_incidence: FXIncidenceSchema,
  offshore_parked: OffshoreParkedSchema,
  source: z.string(),
  fetched_at: z.string(),
  is_estimate: z.boolean(),
  error: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register get_vn_bop MCP tool.
 * @param server The McpServer instance to register tools on.
 */
export function registerBopTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  server.tool(
    "get_vn_bop",
    "Returns Vietnam Balance of Payments (BOP) data from the State Bank of Vietnam (SBV). " +
      "Covers current account (goods, services, primary/secondary income), capital account, " +
      "financial account (FDI, portfolio, other), errors & omissions (BPM6 sign: negative=outflow), " +
      "overall balance, reserve assets, FX-incidence discriminator (DD-5), and offshore-parking " +
      "heuristic estimate (offshore_parked.is_estimate=true PERMANENT). " +
      "Routes through HTTP POST /bop to the macro-indicators microservice (port 5004). " +
      "Accepts optional quarter_start / quarter_end (YYYY-MM-DD); defaults to the most recent quarter. " +
      "fx_incidence.is_estimate=false (primary source). offshore_parked.is_estimate=true always.",
    {
      /** Optional quarter start override (YYYY-MM-DD). */
      quarter_start: z.string().optional(),
      /** Optional quarter end override (YYYY-MM-DD). */
      quarter_end: z.string().optional(),
    },
    async (args) => {
      const { quarter_start, quarter_end } = args as {
        quarter_start?: string;
        quarter_end?: string;
      };
      const url = `${baseUrl}/bop`;
      const bodyObj: Record<string, string> = {};
      if (quarter_start) bodyObj.quarter_start = quarter_start;
      if (quarter_end) bodyObj.quarter_end = quarter_end;
      const body = Object.keys(bodyObj).length > 0 ? JSON.stringify(bodyObj) : "{}";

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body,
        });

        if (!response.ok) {
          logger.warn("[get_vn_bop] HTTP error from macro-indicators /bop", {
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
        logger.warn("[get_vn_bop] fetch failed", {
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

// Export schema for downstream consumers / tests
export { BOPResponseSchema };
