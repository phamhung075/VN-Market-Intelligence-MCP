/**
 * Task 1880a — Investment Clock Phase MCP Tool
 * Task 1880b — Pyramid Tier MCP Tool
 *
 * Interface layer: registers two MCP tools:
 *   - get_investment_clock_phase (1880a)
 *   - get_pyramid_tier           (1880b)
 *
 * Tool: get_investment_clock_phase
 *   Input:  optional { _testSnapshot?: { pmi?: number | null; cpi?: number | null;
 *                                        gdpGrowth?: number | null;
 *                                        inflationRate?: number | null } }
 *   Output: { phase, pmi, cpi, growth_signal, inflation_signal, thresholds, fetched_at }
 *   - Production path: reads macro_indicators WHERE country='Vietnam' ORDER BY fetched_at DESC
 *   - Calls classifyInvestmentClockPhase() domain function with plain values
 *   - No HTTP — DB read only
 *
 * Tool: get_pyramid_tier
 *   Input:  { asset_class: string }
 *   Output: { asset_class, tier, tier_description } | { asset_class, tier: null, reason }
 *   - Zero I/O — pure static lookup, fully deterministic
 *
 * Pattern follows carryTools.ts: optional test-injection param bypasses DB read.
 *
 * @module interface/mcp/tools/macro/investmentClockTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  classifyInvestmentClockPhase,
  type InvestmentClockPhase,
} from "../../../../domain/services/macro/investmentClock.js";
import {
  classifyPyramidTier,
} from "../../../../domain/services/macro/pyramidTier.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB query helper
// ─────────────────────────────────────────────────────────────────────────────

interface MacroIndicatorsRow {
  manufacturing_pmi: number | null;
  gdp_growth: number | null;
  cpi: number | null;
  inflation_rate: number | null;
  fetched_at: string | null;
}

/**
 * Reads the latest Vietnam macro_indicators row.
 * Returns null if no row exists or a DB error occurs.
 */
function readVietnamMacroIndicators(): MacroIndicatorsRow | null {
  try {
    const db = getDb();
    const row = db
      .prepare<MacroIndicatorsRow, [string]>(
        `SELECT manufacturing_pmi, gdp_growth, cpi, inflation_rate, fetched_at
         FROM macro_indicators
         WHERE country = ?
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get("Vietnam");
    return row ?? null;
  } catch (err) {
    logger.warn("[get_investment_clock_phase] could not read macro_indicators", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register Investment Clock MCP tools on the given server instance.
 *   - get_investment_clock_phase (1880a)
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerInvestmentClockTools(server: McpServer): void {

  // ── get_investment_clock_phase ────────────────────────────────────────────
  server.tool(
    "get_investment_clock_phase",
    "Classifies the current Vietnam macro regime into one of four Investment Clock phases " +
      "(Recovery, Overheat, Stagflation, Reflation) based on manufacturing PMI (growth proxy) " +
      "and CPI (inflation proxy) from the macro_indicators table. " +
      "Growth: PMI > 50 = expansion (UP); ≤ 50 = contraction (DOWN). " +
      "Fallback growth: gdp_growth > 0 = UP. " +
      "Inflation: CPI > 3.0% = HIGH (SBV early-warning threshold); ≤ 3.0 = LOW. " +
      "Fallback inflation: inflation_rate column. " +
      "Returns phase, raw signal values, signal labels, thresholds, and fetched_at for staleness assessment. " +
      "Source tier: 2 (aggregator — macro_indicators table populated by TradingEconomics scraper).",
    {
      /**
       * Test-only: inject snapshot values directly (bypasses DB read).
       * All sub-fields are optional; omitted fields fall through to null.
       * Mirror of the _testCommodityClient pattern in macroTools.ts.
       */
      _testSnapshot: z
        .object({
          pmi: z.number().nullable().optional(),
          cpi: z.number().nullable().optional(),
          gdpGrowth: z.number().nullable().optional(),
          inflationRate: z.number().nullable().optional(),
        })
        .optional(),
    },
    (args) => {
      const { _testSnapshot } = args as {
        _testSnapshot?: {
          pmi?: number | null;
          cpi?: number | null;
          gdpGrowth?: number | null;
          inflationRate?: number | null;
        };
      };

      try {
        // Ensure schema tables exist (no-op if already initialised)
        initDatabase();

        let pmi: number | null;
        let cpi: number | null;
        let gdpGrowth: number | null | undefined;
        let inflationRate: number | null | undefined;
        let fetchedAt: string | null;

        if (_testSnapshot !== undefined) {
          // Test injection path — bypass DB
          pmi = _testSnapshot.pmi ?? null;
          cpi = _testSnapshot.cpi ?? null;
          gdpGrowth = _testSnapshot.gdpGrowth ?? null;
          inflationRate = _testSnapshot.inflationRate ?? null;
          fetchedAt = new Date().toISOString();
        } else {
          // Production path — read DB
          const row = readVietnamMacroIndicators();
          pmi = row?.manufacturing_pmi ?? null;
          cpi = row?.cpi ?? null;
          gdpGrowth = row?.gdp_growth ?? null;
          inflationRate = row?.inflation_rate ?? null;
          fetchedAt = row?.fetched_at ?? null;
        }

        const classification = classifyInvestmentClockPhase({
          pmi,
          cpi,
          gdpGrowth,
          inflationRate,
        });

        const result: {
          source_tier: 2;
          phase: InvestmentClockPhase | null;
          reason?: string;
          pmi: number | null;
          cpi: number | null;
          growth_signal: "UP" | "DOWN" | null;
          inflation_signal: "HIGH" | "LOW" | null;
          thresholds: { pmi_expansion: number; cpi_pressure: number };
          fetched_at: string | null;
        } = {
          source_tier: 2 as const,
          phase: classification.phase,
          ...(classification.reason ? { reason: classification.reason } : {}),
          pmi,
          cpi,
          growth_signal: classification.growthSignal,
          inflation_signal: classification.inflationSignal,
          thresholds: {
            pmi_expansion: 50,
            cpi_pressure: 3.0,
          },
          fetched_at: fetchedAt,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        logger.error("[get_investment_clock_phase] unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 2 as const,
                error: `Error computing investment clock phase: ${(err as Error).message}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1880b — get_pyramid_tier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register Pyramid Tier MCP tool on the given server instance.
 *   - get_pyramid_tier (1880b, tool #128)
 *
 * Pure static lookup — zero I/O, fully deterministic, never throws.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerPyramidTierTool(server: McpServer): void {
  server.tool(
    "get_pyramid_tier",
    "Classifies an asset class into one of five pyramid tiers: " +
      "cash (highest safety) | bonds | equity | alt (alternative assets) | speculative (highest risk). " +
      "Covers VN market asset classes (VN equity, government bond, etc.) plus global instruments " +
      "(crypto, gold, REIT, warrant, penny stock, etc.). " +
      "Input is case-insensitive and whitespace-trimmed. " +
      "Unknown inputs return tier=null with reason='unknown_asset_class' — never throws. " +
      "Zero I/O — pure static lookup, fully deterministic.",
    {
      asset_class: z
        .string()
        .describe(
          "Asset class name to classify (e.g. 'VN equity', 'crypto', 'gold', 'government bond')",
        ),
    },
    (args) => {
      const { asset_class } = args as { asset_class: string };

      const classification = classifyPyramidTier(asset_class);

      const result: {
        asset_class: string;
        tier: string | null;
        tier_description?: string;
        reason?: string;
      } = {
        asset_class,
        tier: classification.tier,
        ...(classification.tier_description
          ? { tier_description: classification.tier_description }
          : {}),
        ...(classification.reason ? { reason: classification.reason } : {}),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
