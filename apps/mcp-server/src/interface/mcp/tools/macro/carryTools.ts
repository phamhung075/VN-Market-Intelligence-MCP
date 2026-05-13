/**
 * Task 1423c / 1423e — Carry Trade Signal + Macro Calendar MCP Tools
 *
 * Interface layer: registers `get_carry_trade_signal` and `get_macro_calendar`.
 *
 * Tool: get_carry_trade_signal
 *   Input:  optional { _testVndRate?: number, _testFedRate?: number }
 *   Output: CarryTradeSignal JSON
 *   - Reads sbv_rates.max_deposit_rate_pct (latest row) for VND rate
 *   - Reads tracked_indicators where indicator='fed_funds_rate' for Fed rate
 *   - Calls computeCarryTradeSignal(vndRate, fedRate)
 *   - Falls back to 0 if either source is missing (domain handles UNKNOWN gracefully)
 *
 * Tool: get_macro_calendar
 *   Input:  optional { days?: number }  (default 60)
 *   Output: MacroCalendarResult JSON
 *
 * Pure domain calls — no HTTP in get_carry_trade_signal handler.
 *
 * @module interface/mcp/tools/macro/carryTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  getMacroCalendar,
  type MacroCalendarResult,
} from "../../../../domain/services/macro/macroCalendar.js";
import {
  computeCarryTradeSignal,
  type CarryTradeSignal,
} from "../../../../domain/services/macro/carryTradeSignal.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the latest max_deposit_rate_pct from sbv_rates.
 * Returns 0 if the table is empty or the row has no value.
 */
function readVndDepositRate(): number {
  try {
    const db = getDb();
    const row = db
      .prepare<{ max_deposit_rate_pct: number }, []>(
        `SELECT max_deposit_rate_pct FROM sbv_rates ORDER BY fetched_at DESC LIMIT 1`,
      )
      .get();
    return row?.max_deposit_rate_pct ?? 0;
  } catch (err) {
    logger.warn("[get_carry_trade_signal] could not read sbv_rates", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Read the latest fed_funds_rate value from tracked_indicators.
 * Returns 0 if no row found.
 */
function readFedFundsRate(): number {
  try {
    const db = getDb();
    const row = db
      .prepare<{ value: number }, [string]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ?
         ORDER BY extracted_at DESC LIMIT 1`,
      )
      .get("fed_funds_rate");
    return row?.value ?? 0;
  } catch (err) {
    logger.warn("[get_carry_trade_signal] could not read tracked_indicators", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

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

  // ── get_carry_trade_signal ─────────────────────────────────────────────────
  server.tool(
    "get_carry_trade_signal",
    "Computes the VND carry trade signal for the Thien Thoi (global liquidity) layer " +
      "of the Trần Ngọc Báu macro framework. " +
      "Reads the SBV max deposit rate from sbv_rates and the US Fed Funds rate from " +
      "tracked_indicators (source: FRED), then classifies the carry spread into one of: " +
      "HOT_MONEY_INFLOW (spread >2.5%), NEUTRAL (0.5–2.5%), FII_OUTFLOW_RISK (<0.5%). " +
      "Returns regime, carrySpread, vndDepositRate, fedFundsRate, reasoning, and computedAt. " +
      "Source tier: 3 (derived — computed from cached tier-2 inputs; carrySpread is derived).",
    {
      /**
       * Test-only: inject VND deposit rate directly (bypasses DB read).
       * e.g. 5.5 means 5.5% p.a.
       */
      _testVndRate: z.number().optional(),
      /**
       * Test-only: inject Fed Funds rate directly (bypasses DB read).
       * e.g. 4.33 means 4.33% p.a.
       */
      _testFedRate: z.number().optional(),
    },
    (args) => {
      const { _testVndRate, _testFedRate } = args as {
        _testVndRate?: number;
        _testFedRate?: number;
      };

      try {
        // Ensure schema tables exist (no-op if already initialised)
        initDatabase();

        const vndRate = _testVndRate !== undefined ? _testVndRate : readVndDepositRate();
        const fedRate = _testFedRate !== undefined ? _testFedRate : readFedFundsRate();

        const signal: CarryTradeSignal = computeCarryTradeSignal(vndRate, fedRate);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 3 as const,
            ...signal,
          }, null, 2) }],
        };
      } catch (err) {
        logger.error("[get_carry_trade_signal] unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 3 as const,
                error: (err as Error).message,
              }, null, 2),
            },
          ],
        };
      }
    },
  );

  server.tool(
    "get_macro_calendar",
    "Returns upcoming macro events (FOMC meetings, GSO CPI/GDP releases, Vietnam PMI, " +
      "SBV policy meetings) within the next N days (default 60). " +
      "Each event is annotated with isPivotWindow=true when it falls in months 3, 6, 9, or 12 " +
      "(quarter-end periods of heightened VN market sensitivity). " +
      "Also returns currentMonthIsPivotWindow, nextPivotWindow label, and a warning if " +
      "within 14 days of a pivot month. " +
      "Source tier: 3 (derived — static computed schedule, no live external source).",
    {
      /** Number of calendar days to look ahead (default 60, max 365). */
      days: z.number().int().min(1).max(365).optional(),
      /**
       * Test-only: ISO date string to use as reference date instead of today.
       * e.g. "2026-05-15"
       */
      _testReferenceDate: z.string().optional(),
    },
    (args) => {
      const { days, _testReferenceDate } = args as {
        days?: number;
        _testReferenceDate?: string;
      };

      const referenceDate = _testReferenceDate
        ? new Date(_testReferenceDate)
        : undefined;

      const result: MacroCalendarResult = getMacroCalendar(referenceDate, days ?? 60);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source_tier: 3 as const,
          ...result,
        }, null, 2) }],
      };
    },
  );
}
