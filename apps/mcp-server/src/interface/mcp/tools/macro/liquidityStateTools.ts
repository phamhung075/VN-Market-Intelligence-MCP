/**
 * VMT-7e — MCP Tool: get_vn_liquidity_state
 *
 * Thin proxy to Zone-A POST /liquidity-state on the macro-indicators microservice.
 * Response mirrors LiquidityStateResponse DTO (dtos_vmt_liquidity.go) field-for-field.
 *
 * Honesty invariants (PERMANENT — surface all, never strip):
 *   - irs.is_estimate = true PERMANENT (DD-6: HNX OTC IRS not machine-readable)
 *   - interbank_1w.is_estimate = true PERMANENT (architect Decision B)
 *   - interbank_1w.rate_1w_pct = null PERMANENT (no machine-readable source)
 *   - interbank_1w.blocked_reason MUST appear (explains permanent null)
 *   - omo.is_estimate reflects parse success (false=ok, true=parse failure fail-closed)
 *
 * HTTP base URL: MACRO_INDICATORS_URL env var → fallback http://localhost:5004
 *
 * @module interface/mcp/tools/macro/liquidityStateTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod output schema — mirrors LiquidityStateResponse DTO field-for-field
// ─────────────────────────────────────────────────────────────────────────────

const PolicyRatesSchema = z.object({
  refi_rate_pct: z.number(),
  discount_rate_pct: z.number(),
  lombard_rate_pct: z.number(),
  source: z.string(),
  fetched_at: z.string(),
  is_estimate: z.boolean(),
});

const SJCGoldGapSchema = z.object({
  sjc_price_mn_vnd: z.number(),
  world_price_mn_vnd: z.number(),
  sjc_gap_mn_vnd: z.number(),
  is_estimate: z.boolean(),
  note: z.string(),
  fetched_at: z.string(),
});

const FXCouplingSchema = z.object({
  usd_vnd_center: z.number(),
  usd_vnd_buy: z.number(),
  usd_vnd_sell: z.number(),
  band_pct: z.number(),
  dxy: z.number(),
  cny_vnd_rate: z.number(),
  is_estimate: z.boolean(),
  fetched_at: z.string(),
});

const IRSSchema = z.object({
  /** PERMANENT true — DD-6 invariant: HNX OTC IRS not machine-readable */
  is_estimate: z.boolean(),
  note: z.string(),
});

const OMOSchema = z.object({
  /** null when parse failed (fail-closed) */
  net_outstanding_bn_vnd: z.number().nullable(),
  total_add_bn_vnd: z.number(),
  total_absorb_bn_vnd: z.number(),
  auction_date: z.string(),
  /** false on parse success; true on parse failure (fail-closed) */
  is_estimate: z.boolean(),
  /** non-empty only when is_estimate=true due to fetch/parse error */
  blocked_reason: z.string().optional(),
  source: z.string(),
  fetched_at: z.string(),
});

const InterbankRateSchema = z.object({
  /**
   * ALWAYS null — no machine-readable source exists.
   * dttktt.sbv.gov.vn = 100% packet loss (architect Decision B PERMANENT).
   */
  rate_1w_pct: z.number().nullable(),
  /** PERMANENT true — architect Decision B invariant */
  is_estimate: z.boolean(),
  /** MUST be set on ALL paths explaining the permanent null rate */
  blocked_reason: z.string(),
});

const LiquidityStateResponseSchema = z.object({
  status: z.string(),
  policy_rates: PolicyRatesSchema,
  sjc_gold_gap: SJCGoldGapSchema,
  fx_coupling: FXCouplingSchema,
  /** irs.is_estimate MUST be true ALWAYS (DD-6 fail-closed invariant) */
  irs: IRSSchema,
  /** omo.is_estimate=false on parse success; true on parse failure */
  omo: OMOSchema,
  /**
   * interbank_1w.is_estimate=true PERMANENT
   * interbank_1w.rate_1w_pct=null PERMANENT
   * interbank_1w.blocked_reason MUST be present
   */
  interbank_1w: InterbankRateSchema,
  fetched_at: z.string(),
  source: z.string(),
  error: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register get_vn_liquidity_state MCP tool.
 * @param server The McpServer instance to register tools on.
 */
export function registerLiquidityStateTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  server.tool(
    "get_vn_liquidity_state",
    "Returns Vietnam liquidity state snapshot from the State Bank of Vietnam (SBV) and market.db. " +
      "Covers: policy rates (refi/discount/lombard from SBV HTML or DB fallback), " +
      "SJC gold gap (domestic vs world price from market.db), " +
      "FX coupling (USD/VND center+band+DXY/CNY from market.db), " +
      "IRS permanent estimate marker (irs.is_estimate=true PERMANENT — DD-6: HNX OTC IRS not machine-readable), " +
      "OMO net outstanding (SBV nghiep-vu-thi-truong-mo Liferay HTML; is_estimate reflects parse success), " +
      "interbank 1-week rate (PERMANENTLY BLOCKED — interbank_1w.is_estimate=true, rate_1w_pct=null, " +
      "blocked_reason set: dttktt.sbv.gov.vn = 100% packet loss, architect Decision B). " +
      "Routes through HTTP POST /liquidity-state to the macro-indicators microservice (port 5004). " +
      "No body parameters — always returns the most recent available state.",
    {},
    async () => {
      const result = await macroFetch<unknown>(
        baseUrl,
        "/liquidity-state",
        {},
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_vn_liquidity_state] macro-indicators unavailable", {
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
export { LiquidityStateResponseSchema };
