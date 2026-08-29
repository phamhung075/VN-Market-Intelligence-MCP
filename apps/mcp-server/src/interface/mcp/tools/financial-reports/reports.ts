/**
 * Task 085 — SSC Report MCP Tools
 *
 * Interface layer: registers three MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. fetch_ssc_reports    — triggers the full BCTC pipeline (SSC → PDF → parse → store)
 *   2. get_financial_summary — queries SQLite and returns formatted key financial metrics
 *   3. compare_financials   — queries two periods and returns YoY/QoQ comparison
 *
 * Dependencies:
 *   - fetchParseAndStoreBctc (application use case)
 *   - getDb / initDatabase   (infrastructure — SQLite)
 *   - computePeriodDelta     (domain service)
 *
 * @module interface/mcp/tools/reports
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { computePeriodDelta } from "../../../../domain/services/financial-reports/periodDeltaComputer.js";
import {
  checkBctcIdentityGuard,
  buildBctcCorruptDataMessage,
} from "../../../../domain/services/financial-reports/bctcIdentityGuard.js";
import {
  fetchParseAndStoreBctc,
  type FetchParseAndStoreBctcParams,
  type QuarterString,
} from "../../../../application/usecases/fetchParseAndStoreBctc.js";

import type { FinancialReport } from "../../../../../bctc-schema.js";
import type { FinancialMetrics } from "../../../../domain/services/financial-reports/periodDeltaComputer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection type for the fetch pipeline
// Allows tests to inject a mock instead of hitting the real SSC portal
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineFn = (
  params: FetchParseAndStoreBctcParams,
) => Promise<FinancialReport | null>;

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const QuarterEnum = z.enum(["Q1", "Q2", "Q3", "Q4"]);

const PeriodSchema = z.object({
  year: z.coerce.number().int().min(2010).max(2030),
  quarter: QuarterEnum,
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a million-VND value as billions (tỷ), e.g. 39_500_000 → "39,500.0 tỷ VND" */
function fmtBillions(millionVnd: number): string {
  const billion = millionVnd / 1000;
  return `${billion.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ VND`;
}

/** Format a percentage, null → "N/A" */
function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "N/A";
  return `${v.toFixed(decimals)}%`;
}

/** Format a ratio multiplier, null → "N/A" */
function fmtX(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "N/A";
  return `${v.toFixed(decimals)}x`;
}

/** Format VND per share */
function fmtVnd(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return `${v.toLocaleString("vi-VN")} VND`;
}

/** Format absolute + percent change for display in a comparison table */
function fmtChange(
  changeAbsolute: number,
  changePct: number | null,
  unit = "",
): string {
  const sign = changeAbsolute >= 0 ? "+" : "";
  const pctStr = changePct != null ? ` (${sign}${changePct.toFixed(1)}%)` : "";
  return `${sign}${changeAbsolute.toFixed(1)}${unit}${pctStr}`;
}

/**
 * Build a concise summary string for a FinancialReport.
 * All monetary values are expressed in tỷ VND (billion VND = million × 1000 ÷ 1000).
 */
function buildReportSummary(report: FinancialReport): string {
  const { actionCode, period, incomeStatement: is, balanceSheet: bs, ratios, source } = report;

  const lines: string[] = [
    `=== ${actionCode} — ${period.sortKey} (${source.auditStatus}) ===`,
    ``,
    `--- Income Statement ---`,
    `Net Revenue     : ${fmtBillions(is.netRevenue)}`,
    `Gross Profit    : ${fmtBillions(is.grossProfit)}  (margin: ${fmtPct(ratios.grossMarginPct)})`,
    `Operating Profit: ${fmtBillions(is.operatingProfit)}  (margin: ${fmtPct(ratios.operatingMarginPct)})`,
    `EBITDA          : ${fmtBillions(is.ebitda)}`,
    `Net Profit      : ${fmtBillions(is.netProfit)}  (margin: ${fmtPct(ratios.netMarginPct)})`,
    `EPS             : ${fmtVnd(is.eps)}`,
    ``,
    `--- Balance Sheet ---`,
    `Total Assets    : ${fmtBillions(bs.totalAssets)}`,
    `Equity          : ${fmtBillions(bs.equity.total)}`,
    `Total Liab.     : ${fmtBillions(bs.totalLiabilities)}`,
    `Cash            : ${fmtBillions(bs.currentAssets.cash)}`,
    ``,
    `--- Ratios ---`,
    `ROE             : ${fmtPct(ratios.roe)}`,
    `ROA             : ${fmtPct(ratios.roa)}`,
    `Current Ratio   : ${fmtX(ratios.currentRatio)}`,
    `D/E Ratio       : ${fmtX(ratios.debtToEquity)}`,
    ``,
    `Confidence      : ${(source.extractionConfidence * 100).toFixed(0)}%`,
    `Published       : ${source.publishedAt}`,
  ];

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row type (subset of financial_reports columns used here)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportRow {
  id: string;
  action_code: string;
  company_name: string | null;
  period_year: number;
  period_quarter: number | null;
  period_type: string;
  sort_key: string;
  audit_status: string;
  extraction_confidence: number;
  net_revenue: number;
  gross_profit: number;
  operating_profit: number;
  ebitda: number;
  profit_before_tax: number;
  net_profit: number;
  eps: number;
  diluted_eps: number;
  total_assets: number;
  current_assets: number;
  cash: number;
  inventory: number;
  total_liabilities: number;
  short_term_debt: number;
  long_term_debt: number;
  equity_total: number;
  operating_cf: number;
  investing_cf: number;
  financing_cf: number;
  capex: number;
  free_cash_flow: number;
  gross_margin_pct: number | null;
  operating_margin_pct: number | null;
  net_margin_pct: number | null;
  roe: number | null;
  roa: number | null;
  current_ratio: number | null;
  debt_to_equity: number | null;
  net_debt_to_ebitda: number | null;
  pe: number | null;
  pb: number | null;
  published_at: string;
  yoy_delta_json: string | null;
  qoq_delta_json: string | null;
  /**
   * FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS: SELECT * already returns this
   * column — the interface was just missing the field. 'pending_extraction'
   * is D2's additive-only enum value (ensureFinancialReportShellRow.ts L34)
   * marking an unextracted shell row (NULL financial data, confidence 0),
   * distinct from legacy values (pending|passed|failed|passed_with_warnings|
   * low_confidence) which all carry real extracted data.
   */
  validation_status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// financial_reports row fetch — extracted from compare_financials's inline
// closure (R-4, CCATO-MCP-T3-PROBE-ADAPTERS architecture brief
// docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §2.2/§6):
// the CCATO `financials` probe adapter needs the IDENTICAL query (same DB,
// same shape, same honest-NULL semantics — claim-tool-map.json's
// `tool_null_markers` "period(s) not found" literal was authored against
// this exact query's caller message below) so both callers share one
// definition instead of two independently-drifting copies. Pure extraction:
// same SQL, same param binding, same return shape — zero behavior change at
// the compare_financials call site.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch one `financial_reports` row for a ticker/period, or null if absent.
 *
 * @param actionCode - Stock ticker code (caller's responsibility to uppercase;
 *                     matches the pre-existing inline closure's behavior).
 * @param year        - Period year.
 * @param quarter     - Period quarter string ("Q1".."Q4").
 * @param db          - Optional db injection (test isolation); defaults to getDb().
 */
export function fetchFinancialReportRow(
  actionCode: string,
  year: number,
  quarter: string,
  db: Database = getDb(),
): ReportRow | null {
  return db
    .prepare(
      `SELECT * FROM financial_reports
       WHERE action_code = $actionCode
         AND period_year = $year
         AND period_type = $quarter
       ORDER BY sort_key DESC LIMIT 1`,
    )
    .get({
      $actionCode: actionCode,
      $year: year,
      $quarter: quarter,
    }) as ReportRow | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → FinancialMetrics (for computePeriodDelta)
// ─────────────────────────────────────────────────────────────────────────────

export function rowToMetrics(row: ReportRow): FinancialMetrics {
  return {
    netRevenue: row.net_revenue,
    grossProfit: row.gross_profit,
    operatingProfit: row.operating_profit,
    netProfit: row.net_profit,
    ebitda: row.ebitda,
    eps: row.eps,
    totalAssets: row.total_assets,
    equity: row.equity_total,
    totalDebt: row.short_term_debt + row.long_term_debt,
    cash: row.cash,
    operatingCF: row.operating_cf,
    freeCashFlow: row.free_cash_flow,
    grossMarginPct: row.gross_margin_pct ?? 0,
    // DSI-S3 C4: null when DB column not yet computed — must NOT default to 0.
    netMarginPct: row.net_margin_pct ?? null,
    roe: row.roe ?? null,
    debtToEquity: row.debt_to_equity ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the three SSC report tools on an McpServer.
 *
 * @param server     - The McpServer instance to register tools on.
 * @param pipelineFn - Optional override for the fetch-parse-store pipeline.
 *                     Defaults to the real `fetchParseAndStoreBctc`.
 *                     Inject a mock in tests to avoid real network/PDF access.
 */
export function registerReportTools(
  server: McpServer,
  pipelineFn: PipelineFn = fetchParseAndStoreBctc,
): void {
  // ── 1. fetch_ssc_reports — REMOVED (sprint-036 task 230)
  // SSC report fetching is now handled by the automated sscCheckerJob cron.
  // Use get_financial_summary to read already-stored reports.

  // ── 2. get_financial_summary ─────────────────────────────────────────────
  server.tool(
    "get_financial_summary",
    "Get a formatted financial summary for a stock from the local database. " +
    "Returns key metrics: revenue, profit, EPS, ROE, ROA, margins, D/E ratio. " +
    "If year/quarter are omitted, returns the most recent available period.",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code, e.g. VCB"),
      year: z.coerce
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe("Fiscal year filter (optional)"),
      quarter: QuarterEnum.optional().describe(
        "Quarter filter: Q1 | Q2 | Q3 | Q4 (optional)",
      ),
    },
    async ({ actionCode, year, quarter }) => {
      try {
        await initDatabase();
        const db = getDb();

        // Build parameterised query
        const conditions: string[] = ["action_code = $actionCode"];
        const bindParams: Record<string, string | number> = {
          $actionCode: actionCode,
        };

        if (year !== undefined) {
          conditions.push("period_year = $year");
          bindParams["$year"] = year;
        }
        if (quarter !== undefined) {
          conditions.push("period_type = $quarter");
          bindParams["$quarter"] = quarter;
        }

        const whereClause = conditions.join(" AND ");

        const row = db
          .prepare(
            `SELECT * FROM financial_reports WHERE ${whereClause} ORDER BY sort_key DESC LIMIT 1`,
          )
          .get(bindParams) as ReportRow | null;

        if (!row) {
          const periodStr =
            year != null
              ? ` ${year}${quarter != null ? `-${quarter}` : ""}`
              : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `No financial data found for ${actionCode}${periodStr}. ` +
                  `Run fetch_ssc_reports to load data from the SSC portal.`,
              },
            ],
          };
        }

        // ── Pending-extraction gate (FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS) ────
        // D2's ensureFinancialReportShellRow.ts upserts a shell row the moment a
        // PDF is pulled, before extraction runs — validation_status='pending_extraction',
        // extraction_confidence=0, all financial columns NULL/0. Gate on
        // validation_status (NOT refine_status like get_bctc_full's PUB-1) —
        // refine_status only transitions via the separate agentic-refine pipeline;
        // rows extracted ONLY through the legacy scalar pipeline
        // (fetchParseAndStoreBctc/storeReport) never touch refine_status and sit
        // at the DB default forever despite holding real data — mirroring PUB-1's
        // field verbatim would wrongly hide legitimate legacy reports.
        if (row.validation_status === "pending_extraction") {
          return {
            content: [
              {
                type: "text" as const,
                text: `PDF downloaded but not yet extracted for ${actionCode} ${row.sort_key}. ` +
                  `Extraction runs automatically after the PDF is pulled — check back shortly.`,
              },
            ],
          };
        }

        // ── Balance-sheet identity guard (FIX-BCTC-BANK-SUMMARY-MAPPING W1) ────
        // Shared with get_bctc_full / compare_financials — see bctcIdentityGuard.ts.
        // Third occurrence: VNM → VEA → CTG — guard at serve layer, not per-ticker patch.
        // FIX-BCTC-DATA-GAP-FAMILY U4/U5: income scalars passed so the
        // income-broken-with-assets (HPG) and scale-corruption (VEA) predicates
        // fire on this serve path too.
        {
          const identityGuard = checkBctcIdentityGuard({
            totalAssets: row.total_assets,
            equityTotal: row.equity_total,
            netRevenue: row.net_revenue,
            operatingProfit: row.operating_profit,
            netProfit: row.net_profit,
          });
          if (identityGuard.corrupt) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: buildBctcCorruptDataMessage(
                    actionCode,
                    row.sort_key,
                    identityGuard.reason!,
                  ),
                },
              ],
            };
          }
        }

        const lines: string[] = [
          `=== ${actionCode} — ${row.sort_key} (${row.audit_status}) ===`,
          `Company         : ${row.company_name ?? actionCode}`,
          ``,
          `--- Income Statement ---`,
          `Net Revenue     : ${fmtBillions(row.net_revenue)}`,
          `Gross Profit    : ${fmtBillions(row.gross_profit)}  (${fmtPct(row.gross_margin_pct)})`,
          `Operating Profit: ${fmtBillions(row.operating_profit)}  (${fmtPct(row.operating_margin_pct)})`,
          `EBITDA          : ${fmtBillions(row.ebitda)}`,
          `Net Profit      : ${fmtBillions(row.net_profit)}  (${fmtPct(row.net_margin_pct)})`,
          `EPS             : ${fmtVnd(row.eps)}`,
          ``,
          `--- Balance Sheet ---`,
          `Total Assets    : ${fmtBillions(row.total_assets)}`,
          `Equity          : ${fmtBillions(row.equity_total)}`,
          `Total Liab.     : ${fmtBillions(row.total_liabilities)}`,
          `Cash            : ${fmtBillions(row.cash)}`,
          ``,
          `--- Ratios ---`,
          `ROE             : ${fmtPct(row.roe)}`,
          `ROA             : ${fmtPct(row.roa)}`,
          `Current Ratio   : ${fmtX(row.current_ratio)}`,
          `D/E Ratio       : ${fmtX(row.debt_to_equity)}`,
          `Net Debt/EBITDA : ${fmtX(row.net_debt_to_ebitda)}`,
          `P/E             : ${fmtX(row.pe)}`,
          `P/B             : ${fmtX(row.pb)}`,
          ``,
          `Confidence      : ${(row.extraction_confidence * 100).toFixed(0)}%`,
          `Published       : ${row.published_at}`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[get_financial_summary] error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving summary for ${actionCode}: ` +
                (err instanceof Error ? err.message : String(err)),
            },
          ],
        };
      }
    },
  );

  // ── 3. compare_financials ─────────────────────────────────────────────────
  server.tool(
    "compare_financials",
    "Compare financial performance between two reporting periods for a stock. " +
    "Uses computePeriodDelta to compute absolute and percent changes for all key metrics.",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code, e.g. VCB"),
      period1: PeriodSchema.describe("Current period (e.g. { year: 2024, quarter: 'Q1' })"),
      period2: PeriodSchema.describe("Comparison period (e.g. { year: 2023, quarter: 'Q1' })"),
    },
    async ({ actionCode, period1, period2 }) => {
      try {
        await initDatabase();
        const db = getDb();

        // R-4 extraction (CCATO-MCP-T3-PROBE-ADAPTERS): fetchRow moved to the
        // standalone exported fetchFinancialReportRow() above so the CCATO
        // `financials` probe adapter can reuse the identical query. Behavior
        // unchanged — same SQL, same params, same return shape.
        const row1 = fetchFinancialReportRow(actionCode, period1.year, period1.quarter, db);
        const row2 = fetchFinancialReportRow(actionCode, period2.year, period2.quarter, db);

        if (!row1 || !row2) {
          const missing: string[] = [];
          if (!row1) missing.push(`${period1.year}-${period1.quarter}`);
          if (!row2) missing.push(`${period2.year}-${period2.quarter}`);
          return {
            content: [
              {
                type: "text" as const,
                text: `Period(s) not found in database for ${actionCode}: ` +
                  missing.join(", ") +
                  `. Run fetch_ssc_reports for the missing periods.`,
              },
            ],
          };
        }

        // ── Pending-extraction gate (FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS) ────
        // D2's ensureFinancialReportShellRow.ts upserts a shell row the moment a
        // PDF is pulled, before extraction runs — validation_status='pending_extraction',
        // extraction_confidence=0, all financial columns NULL/0. Check BOTH
        // periods (mirrors the guard1/guard2 dual-check idiom below): a delta
        // computed against an unextracted shell period is meaningless regardless
        // of which side (period1/period2) is pending. Gate on validation_status
        // (NOT refine_status like get_bctc_full's PUB-1) — see get_financial_summary
        // above for the full rationale.
        {
          const pending: string[] = [];
          if (row1.validation_status === "pending_extraction") {
            pending.push(`${period1.year}-${period1.quarter}`);
          }
          if (row2.validation_status === "pending_extraction") {
            pending.push(`${period2.year}-${period2.quarter}`);
          }
          if (pending.length > 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `PDF downloaded but not yet extracted for ${actionCode}: ` +
                    pending.join(", ") +
                    `. Extraction runs automatically after the PDF is pulled — check back shortly.`,
                },
              ],
            };
          }
        }

        // ── Balance-sheet identity guard (FIX-BCTC-BANK-SUMMARY-MAPPING W1) ────
        // compare_financials previously ran its OWN independent fetchRow() with
        // NO guard call — never-fired scope gap. Check BOTH periods: a delta
        // computed against a corrupt period is meaningless regardless of which
        // side (period1/period2) is corrupt.
        // FIX-BCTC-DATA-GAP-FAMILY U4/U5: income scalars passed (see
        // get_financial_summary guard above for the rationale).
        {
          const guard1 = checkBctcIdentityGuard({
            totalAssets: row1.total_assets,
            equityTotal: row1.equity_total,
            netRevenue: row1.net_revenue,
            operatingProfit: row1.operating_profit,
            netProfit: row1.net_profit,
          });
          const guard2 = checkBctcIdentityGuard({
            totalAssets: row2.total_assets,
            equityTotal: row2.equity_total,
            netRevenue: row2.net_revenue,
            operatingProfit: row2.operating_profit,
            netProfit: row2.net_profit,
          });
          const failedGuard = guard1.corrupt ? guard1 : guard2.corrupt ? guard2 : null;
          const failedRow = guard1.corrupt ? row1 : row2;
          if (failedGuard) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: buildBctcCorruptDataMessage(
                    actionCode,
                    failedRow.sort_key,
                    failedGuard.reason!,
                  ),
                },
              ],
            };
          }
        }

        // Determine delta type: YoY if different year, QoQ if same year
        const deltaType =
          period1.year !== period2.year ? "YoY" : "QoQ";

        const metrics1 = rowToMetrics(row1);
        const metrics2 = rowToMetrics(row2);

        const delta = computePeriodDelta(metrics1, metrics2, deltaType);

        // ── Format comparison table ────────────────────────────────────────
        const p1Label = `${period1.year}-${period1.quarter}`;
        const p2Label = `${period2.year}-${period2.quarter}`;

        const col = (v: number, fmt: (n: number) => string) => fmt(v).padStart(16);
        const fmtB = (v: number) => fmtBillions(v);

        const lines: string[] = [
          `=== ${actionCode} — ${deltaType} Comparison: ${p1Label} vs ${p2Label} ===`,
          ``,
          `Metric                  ${p2Label.padStart(16)}    ${p1Label.padStart(16)}    Change`,
          `${"─".repeat(80)}`,
          [
            "Net Revenue (tỷ)",
            col(metrics2.netRevenue, fmtB),
            col(metrics1.netRevenue, fmtB),
            fmtChange(
              (metrics1.netRevenue - metrics2.netRevenue) / 1000,
              delta.netRevenue.changePct,
              " tỷ",
            ),
          ].join("    "),
          [
            "Net Profit  (tỷ)",
            col(metrics2.netProfit, fmtB),
            col(metrics1.netProfit, fmtB),
            fmtChange(
              (metrics1.netProfit - metrics2.netProfit) / 1000,
              delta.netProfit.changePct,
              " tỷ",
            ),
          ].join("    "),
          [
            "EPS         (VND)",
            col(metrics2.eps, fmtVnd),
            col(metrics1.eps, fmtVnd),
            fmtChange(
              delta.eps.changeAbsolute,
              delta.eps.changePct,
              " VND",
            ),
          ].join("    "),
          [
            "Total Assets(tỷ)",
            col(metrics2.totalAssets, fmtB),
            col(metrics1.totalAssets, fmtB),
            fmtChange(
              (metrics1.totalAssets - metrics2.totalAssets) / 1000,
              delta.totalAssets.changePct,
              " tỷ",
            ),
          ].join("    "),
          [
            "Equity      (tỷ)",
            col(metrics2.equity, fmtB),
            col(metrics1.equity, fmtB),
            fmtChange(
              (metrics1.equity - metrics2.equity) / 1000,
              delta.equity.changePct,
              " tỷ",
            ),
          ].join("    "),
          [
            "Operating CF(tỷ)",
            col(metrics2.operatingCF, fmtB),
            col(metrics1.operatingCF, fmtB),
            fmtChange(
              (metrics1.operatingCF - metrics2.operatingCF) / 1000,
              delta.operatingCF.changePct,
              " tỷ",
            ),
          ].join("    "),
          ``,
          `--- Margin Changes (percentage points) ---`,
          `Gross Margin : ${fmtPct(metrics2.grossMarginPct)} → ${fmtPct(metrics1.grossMarginPct)}  (${delta.grossMarginPP.changePP >= 0 ? "+" : ""}${delta.grossMarginPP.changePP.toFixed(1)} pp)`,
          `Net Margin   : ${fmtPct(metrics2.netMarginPct)} → ${fmtPct(metrics1.netMarginPct)}  (${delta.netMarginPP.changePP >= 0 ? "+" : ""}${delta.netMarginPP.changePP.toFixed(1)} pp)`,
          `ROE          : ${fmtPct(metrics2.roe)} → ${fmtPct(metrics1.roe)}  (${delta.roePP.changePP >= 0 ? "+" : ""}${delta.roePP.changePP.toFixed(1)} pp)`,
          `D/E Ratio    : ${fmtX(metrics2.debtToEquity)} → ${fmtX(metrics1.debtToEquity)}  (${delta.debtToEquityPP.changePP >= 0 ? "+" : ""}${delta.debtToEquityPP.changePP.toFixed(2)} pp)`,
          ``,
          `Delta type: ${deltaType}`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[compare_financials] error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error comparing financials for ${actionCode}: ` +
                (err instanceof Error ? err.message : String(err)),
            },
          ],
        };
      }
    },
  );

  // ── list_stored_pdfs — Show all downloaded BCTC PDFs ─────────────────
  server.tool(
    "list_stored_pdfs",
    "List all BCTC PDF files downloaded from the SSC portal. " +
      "Shows filename, size, and download date. Use this to see what reports are available " +
      "for AI-assisted analysis via the OCR/PEK pipeline (get_bctc_page_text, get_bctc_page_image).",
    {},
    async () => {
      const pdfDir = resolve(process.cwd(), "data", "pdfs");
      try {
        const files = readdirSync(pdfDir)
          .filter((f) => f.endsWith(".pdf"))
          .map((f) => {
            const stat = statSync(join(pdfDir, f));
            return {
              name: f,
              sizeMB: (stat.size / 1024 / 1024).toFixed(1),
              date: stat.mtime.toISOString().slice(0, 10),
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date));

        if (files.length === 0) {
          return { content: [{ type: "text" as const, text: "No BCTC PDFs found in data/pdfs/. Run fetch_ssc_reports to download some." }] };
        }

        const lines = ["BCTC PDFs available:", ""];
        for (const f of files) {
          lines.push(`  ${f.date}  ${f.sizeMB.padStart(6)} MB  ${f.name}`);
        }
        lines.push("", `Total: ${files.length} files`);
        lines.push("", "Use get_bctc_page_text or get_bctc_page_image to extract and analyze the report content via OCR.");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch {
        return { content: [{ type: "text" as const, text: "No data/pdfs/ directory found. Run fetch_ssc_reports first." }] };
      }
    },
  );

}
// DEREGISTER: read_bctc_pdf removed (U3 TOOL-SURFACE-UPGRADE) — superseded by
// get_bctc_page_text + get_bctc_page_image (OCR/PEK pipeline). Zero claims across 4 layers.
