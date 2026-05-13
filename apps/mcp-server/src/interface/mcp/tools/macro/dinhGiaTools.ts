/**
 * Task 1426b — Yield Spread Signal MCP Tool
 *
 * Interface layer: registers `get_yield_spread_signal`.
 *
 * Tool: get_yield_spread_signal
 *   Input:  optional { _testEarningYield?: number, _testDepositRate?: number }
 *   Output: YieldSpreadSignal JSON
 *   - Reads tracked_indicators where indicator='market_earning_yield' and source='bau_phase2'
 *     (latest row) for the equity earnings yield
 *   - Reads sbv_rates.max_deposit_rate_pct (latest row) for the deposit rate
 *   - Calls computeYieldSpreadSignal(earningYield, depositRate)
 *   - Falls back to 0 if either source is missing (domain handles UNKNOWN gracefully)
 *
 * Pure domain call — no HTTP in handler.
 *
 * Sprint: 1426 — Báu Phase 2 (Dinh Gia)
 *
 * @module interface/mcp/tools/macro/dinhGiaTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  computeYieldSpreadSignal,
  type YieldSpreadSignal,
} from "../../../../domain/services/macro/yieldSpreadSignal.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the latest market_earning_yield value from tracked_indicators.
 * Filters by source='bau_phase2' to ensure we read the value computed by
 * the 1426a marketEarningYield domain service.
 * Returns 0 if no row found.
 */
function readEarningYield(): number {
  try {
    const db = getDb();
    const row = db
      .prepare<{ value: number }, [string, string]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ? AND source = ?
         ORDER BY fetched_at DESC LIMIT 1`,
      )
      .get("market_earning_yield", "bau_phase2");
    return row?.value ?? 0;
  } catch (err) {
    logger.warn("[get_yield_spread_signal] could not read tracked_indicators", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Read the latest max_deposit_rate_pct from sbv_rates.
 * Returns 0 if the table is empty or the row has no value.
 */
function readDepositRate(): number {
  try {
    const db = getDb();
    const row = db
      .prepare<{ max_deposit_rate_pct: number }, []>(
        `SELECT max_deposit_rate_pct FROM sbv_rates ORDER BY effective_date DESC LIMIT 1`,
      )
      .get();
    return row?.max_deposit_rate_pct ?? 0;
  } catch (err) {
    logger.warn("[get_yield_spread_signal] could not read sbv_rates", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

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

  // ── get_yield_spread_signal ────────────────────────────────────────────────
  server.tool(
    "get_yield_spread_signal",
    "Computes the yield spread signal for the Dinh Gia (valuation) layer of the " +
      "Trần Ngọc Báu macro framework (Phase 2). " +
      "Reads the market earnings yield from tracked_indicators (source: bau_phase2) and the " +
      "SBV max deposit rate from sbv_rates, then classifies the spread into one of: " +
      "CHEAP (spread >2pp), FAIRLY_VALUED (0 < spread ≤ 2pp), EXPENSIVE (spread ≤ 0), " +
      "or UNKNOWN (data unavailable). " +
      "Returns label, spread, earningYield, depositRate, reasoning, and computedAt. " +
      "Source tier: 3 (derived — yield spread is computed from cached earnings yield and deposit rate).",
    {
      /**
       * Test-only: inject earnings yield directly (bypasses DB read).
       * e.g. 7.32 means 7.32% p.a.
       */
      _testEarningYield: z.number().optional(),
      /**
       * Test-only: inject deposit rate directly (bypasses DB read).
       * e.g. 5.50 means 5.50% p.a.
       */
      _testDepositRate: z.number().optional(),
    },
    (args) => {
      const { _testEarningYield, _testDepositRate } = args as {
        _testEarningYield?: number;
        _testDepositRate?: number;
      };

      try {
        // Ensure schema tables exist (no-op if already initialised)
        initDatabase();

        const earningYield =
          _testEarningYield !== undefined ? _testEarningYield : readEarningYield();
        const depositRate =
          _testDepositRate !== undefined ? _testDepositRate : readDepositRate();

        const signal: YieldSpreadSignal = computeYieldSpreadSignal(
          earningYield,
          depositRate,
        );

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 3 as const,
            ...signal,
          }, null, 2) }],
        };
      } catch (err) {
        logger.error("[get_yield_spread_signal] unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 3 as const,
                error: `Error computing yield spread signal: ${(err as Error).message}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}
