/**
 * MCP Tool: compute_accruals — Task 1878b
 *
 * Returns a time-series of Sloan Accruals Ratios for a given ticker.
 *
 * Formula: Accruals_t = (NetIncome_t - OperatingCashFlow_t) / TotalAssets_t
 *
 * Sign semantics:
 *   Positive → NI > OCF — earnings elevated relative to cash generation (potential inflation signal)
 *   Negative → OCF > NI — conservative earnings, cash-backed
 *
 * Unit: ratio (dimensionless)
 *
 * Input:
 *   ticker   — VN stock ticker, case-insensitive (normalized to uppercase)
 *   quarters — number of most-recent quarterly periods to return (default 8, max 20)
 *
 * Output:
 *   { ticker, formula, unit, quarters_requested, quarters_returned, data: AccrualPoint[] }
 *
 * Layer: interface — reads financial_reports via injected DB, calls domain computeAccrualPoint.
 * DDD: accruals.ts (domain) has no infrastructure imports. This file handles all I/O.
 *
 * @module interface/mcp/tools/financial-reports/computeAccrualsTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "bun:sqlite";

import { computeAccrualPoint } from "../../../../domain/services/financial-reports/accruals.js";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ── Output types ─────────────────────────────────────────────────────────────

interface AccrualPoint {
  period_year: number;
  period_quarter: number;
  net_income_m: number | null;
  ocf_m: number | null;
  total_assets_m: number | null;
  accruals_ratio: number | null;
  missing: string[];
  error: string | null;
}

interface AccrualsEnvelope {
  ticker: string;
  formula: string;
  unit: "ratio";
  quarters_requested: number;
  quarters_returned: number;
  data: AccrualPoint[];
}

// ── Zod input schema ─────────────────────────────────────────────────────────

const InputSchema = z.object({
  ticker: z
    .string()
    .min(1, "ticker is required")
    .max(10)
    .transform((v) => v.toUpperCase())
    .describe("VN stock ticker (e.g. VCB, FPT). Case-insensitive."),
  quarters: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(8)
    .describe("Number of most-recent quarters to include (default: 8, max: 20)."),
});

// ── DB row type ───────────────────────────────────────────────────────────────

interface FinancialReportRow {
  period_year: number;
  period_quarter: number;
  net_income_m: number | null;
  ocf_m: number | null;
  total_assets_m: number | null;
}

// ── Handler factory (testable — accepts injected DB) ─────────────────────────

export type ComputeAccrualsInput = { ticker: string; quarters?: number };

export type ComputeAccrualsOutput = {
  content: [{ type: "text"; text: string }];
};

/**
 * Build the tool handler with an injected DB instance.
 * Used in tests to inject an in-memory SQLite DB.
 */
export function buildComputeAccrualsHandler(
  db: InstanceType<typeof Database>,
): (input: ComputeAccrualsInput) => Promise<ComputeAccrualsOutput> {
  return async (rawInput: ComputeAccrualsInput): Promise<ComputeAccrualsOutput> => {
    // Validate + normalize input
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const envelope: AccrualsEnvelope = {
        ticker: String(rawInput.ticker ?? ""),
        formula: "(NetIncome - OCF) / TotalAssets",
        unit: "ratio",
        quarters_requested: 0,
        quarters_returned: 0,
        data: [],
      };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "validation_error", details: parsed.error.issues, ...envelope },
              null,
              2,
            ),
          },
        ],
      };
    }

    const { ticker, quarters } = parsed.data;

    // Query: DESC LIMIT N to get most-recent N quarters, then reverse for ascending output
    const rows = db
      .prepare<FinancialReportRow, [string, number]>(
        `SELECT
          period_year,
          period_quarter,
          net_profit          AS net_income_m,
          operating_cash_flow AS ocf_m,
          total_assets        AS total_assets_m
        FROM financial_reports
        WHERE action_code    = ?
          AND period_quarter IS NOT NULL
          AND period_quarter BETWEEN 1 AND 4
        ORDER BY period_year DESC, period_quarter DESC
        LIMIT ?`,
      )
      .all(ticker, quarters);

    // Reverse → ascending (oldest first)
    rows.reverse();

    // Apply domain function per row
    const data: AccrualPoint[] = rows.map((row) => {
      const domainResult = computeAccrualPoint({
        net_income_m: row.net_income_m,
        ocf_m: row.ocf_m,
        total_assets_m: row.total_assets_m,
      });

      return {
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        net_income_m: row.net_income_m,
        ocf_m: row.ocf_m,
        total_assets_m: row.total_assets_m,
        accruals_ratio: domainResult.accruals_ratio,
        missing: domainResult.missing,
        error: domainResult.error,
      };
    });

    const envelope: AccrualsEnvelope = {
      ticker,
      formula: "(NetIncome - OCF) / TotalAssets",
      unit: "ratio",
      quarters_requested: quarters,
      quarters_returned: data.length,
      data,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(envelope, null, 2) }],
    };
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────
// DEREGISTER: compute_accruals removed (U3 TOOL-SURFACE-UPGRADE) — domain calculation
// with no live data store dependency and zero claims across 4 layers.
// Handler retained for direct invocation / future re-registration.

export function registerComputeAccrualsTool(_server: McpServer): void {
  // Tool deregistered: compute_accruals — TOOL-SURFACE-UPGRADE U3
  // No sprint plan to wire; domain logic retained via buildComputeAccrualsHandler.
  void _server; // explicit unused-param acknowledgement
}
