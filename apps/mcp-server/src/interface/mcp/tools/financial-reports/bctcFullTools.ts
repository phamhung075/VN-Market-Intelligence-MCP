/**
 * Task 240 — get_bctc_full Compound MCP Tool
 *
 * Bundles three previously-separate calls into one:
 *   1. BCTC Summary  (latest financial report for the stock)
 *   2. QoQ/YoY Comparison (latest vs prior period)
 *   3. Sentiment Trend  (OLS slope over the last 30 days of rag_analyses)
 *
 * The tool accepts an optional injected Database (`_testDb`) so that tests
 * can run against an in-memory SQLite instance without hitting the real DB.
 *
 * All monetary values are in million VND (as stored in financial_reports).
 * Display formatting converts to tỷ (billion) VND where noted.
 *
 * @module interface/mcp/tools/bctcFullTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";

import { getDb } from "../../../../infrastructure/db/schema.js";
import { computePeriodDelta } from "../../../../domain/services/financial-reports/periodDeltaComputer.js";
import { computeSentimentTrend } from "../../../../domain/services/sentimentTrend.js";
import { logger } from "../../../../infrastructure/logger.js";
import type { FinancialMetrics } from "../../../../domain/services/financial-reports/periodDeltaComputer.js";
import { isBankFormFromDb } from "../../../../domain/services/financial-reports/bctcFormType.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types
// ─────────────────────────────────────────────────────────────────────────────

/** Exported for testability (DV-BANK-2). */
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
  /** Domain stored at ingest (e.g. "banking" for VCB, ACB). Used for bank-form detection. */
  domain: string | null;
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
  /** BEQ-4b: PENDING | DONE | PARTIAL — used by buildComparisonSection guard */
  refine_status: string;
}

interface RagRow {
  sentiment: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers (mirrored from reports.ts to keep tool self-contained)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert million VND → "X,XXX.X tỷ VND" */
export function fmtBillions(millionVnd: number): string {
  const billion = millionVnd / 1000;
  return `${billion.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ VND`;
}

/** Format percentage — null → "N/A" */
function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "N/A";
  return `${v.toFixed(decimals)}%`;
}

/** Format ratio multiplier — null → "N/A" */
function fmtX(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "N/A";
  return `${v.toFixed(decimals)}x`;
}

/** Format VND-per-share value */
function fmtVnd(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return `${v.toLocaleString("vi-VN")} VND`;
}

/** Format a signed change value with optional pct */
function fmtChange(changeAbsolute: number, changePct: number | null, unit = ""): string {
  const sign = changeAbsolute >= 0 ? "+" : "";
  const pctStr = changePct != null ? ` (${sign}${changePct.toFixed(1)}%)` : "";
  return `${sign}${changeAbsolute.toFixed(1)}${unit}${pctStr}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → FinancialMetrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * rowToMetrics — map a DB row to FinancialMetrics for period-delta computation.
 *
 * C-3 bank guard: for bank reports, grossProfit is structurally absent (null in DB).
 * null→0 in JS would produce a misleading "0.0% -> 0.0% (+0.0 pp)" gross-margin QoQ
 * comparison. To prevent this, grossMarginPct is set to NaN for banks so that
 * computePeriodDelta propagates NaN and buildComparisonSection omits the gross-margin line.
 */
function rowToMetrics(row: ReportRow, bankForm = false): FinancialMetrics {
  return {
    netRevenue: row.net_revenue,
    // C-3: for banks, gross_profit is null (notApplicable); use NaN as sentinel
    // so downstream gross-margin delta renders as N/A rather than 0.0%.
    grossProfit: bankForm ? NaN : row.gross_profit,
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
    // C-3: gross_margin_pct is null/0 for banks — use NaN as sentinel
    grossMarginPct: bankForm ? NaN : (row.gross_margin_pct ?? 0),
    netMarginPct: row.net_margin_pct ?? 0,
    roe: row.roe ?? 0,
    debtToEquity: row.debt_to_equity ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the BCTC SUMMARY section from the latest financial_reports row.
 *
 * C-2 bank guard: for bank reports (Mẫu B02-TCTD), gross_profit is structurally
 * absent. fmtBillions(null) returns "0.0 tỷ VND" (null→0 in JS division), which is
 * misleading — a bank has no gross profit concept, not zero gross profit.
 * For banks: substitute with net_revenue line labeled as "Net Interest Income" (proxy).
 * Also omit Current Ratio (derived from current_assets which banks do not report).
 *
 * Exported for testability (DV-BANK-2).
 */
export function buildSummarySection(code: string, row: ReportRow, bankForm = false): string {
  // C-2: gross profit line — banks show net interest income proxy instead
  const grossProfitLine = bankForm
    ? `Net Interest Inc.: ${fmtBillions(row.net_revenue)}  (net interest income — maps to net_revenue)`
    : `Gross Profit     : ${fmtBillions(row.gross_profit)}  (${fmtPct(row.gross_margin_pct)})`;

  // C-2: current ratio — N/A for banks (no current_assets concept in Mẫu B02-TCTD)
  const currentRatioLine = bankForm
    ? `Current Ratio    : N/A (bank — no current assets concept)`
    : `Current Ratio    : ${fmtX(row.current_ratio)}`;

  const lines: string[] = [
    `=== BCTC SUMMARY: ${code} ===`,
    `Period: ${row.sort_key} (${row.audit_status})`,
    `Company: ${row.company_name ?? code}`,
    ``,
    `--- Income Statement ---`,
    `Net Revenue      : ${fmtBillions(row.net_revenue)}`,
    grossProfitLine,
    `Operating Profit : ${fmtBillions(row.operating_profit)}  (${fmtPct(row.operating_margin_pct)})`,
    `EBITDA           : ${fmtBillions(row.ebitda)}`,
    `Net Profit       : ${fmtBillions(row.net_profit)}  (${fmtPct(row.net_margin_pct)})`,
    `EPS              : ${fmtVnd(row.eps)}`,
    ``,
    `--- Balance Sheet ---`,
    `Total Assets     : ${fmtBillions(row.total_assets)}`,
    `Equity           : ${fmtBillions(row.equity_total)}`,
    `Total Liab.      : ${fmtBillions(row.total_liabilities)}`,
    `Cash             : ${fmtBillions(row.cash)}`,
    ``,
    `--- Ratios ---`,
    `ROE              : ${fmtPct(row.roe)}`,
    `ROA              : ${fmtPct(row.roa)}`,
    currentRatioLine,
    `D/E Ratio        : ${fmtX(row.debt_to_equity)}`,
    `Net Debt/EBITDA  : ${fmtX(row.net_debt_to_ebitda)}`,
    `P/E              : ${fmtX(row.pe)}`,
    `P/B              : ${fmtX(row.pb)}`,
    ``,
    `Confidence       : ${(row.extraction_confidence * 100).toFixed(0)}%`,
    `Published        : ${row.published_at}`,
  ];
  return lines.join("\n");
}

/**
 * Build the QoQ/YoY COMPARISON section.
 * Finds the prior period automatically:
 *   - If latest is Q1, compare to Q4 of prior year (YoY logic simplified: prior year same quarter)
 *   - Otherwise compare to the immediately preceding quarter of the same year
 * Falls back to the most recent prior row if the above is not available.
 *
 * C-3 bank guard: the gross-margin QoQ line is omitted for bank reports.
 * rowToMetrics sets grossMarginPct=NaN for banks, which would produce "NaN% -> NaN%".
 * Simpler and cleaner to omit the line entirely when bankForm=true.
 */
function buildComparisonSection(
  db: Database,
  code: string,
  latest: ReportRow,
  bankForm = false,
): string {
  // Determine the prior sort_key to look up
  const latestQ = latest.period_quarter ?? 0;
  const latestY = latest.period_year;

  let priorRow: ReportRow | null = null;

  if (latestQ > 0) {
    // Try the quarter immediately before
    const priorQ = latestQ - 1;
    const priorY = priorQ === 0 ? latestY - 1 : latestY;
    const priorQType = priorQ === 0 ? "Q4" : `Q${priorQ}`;

    priorRow = db
      .query<ReportRow, [string, number, string]>(
        `SELECT * FROM financial_reports
         WHERE action_code = ? AND period_year = ? AND period_type = ?
         ORDER BY sort_key DESC LIMIT 1`,
      )
      .get(code, priorY, priorQType);
  }

  // Fallback: any earlier row
  if (!priorRow) {
    priorRow = db
      .query<ReportRow, [string, string]>(
        `SELECT * FROM financial_reports
         WHERE action_code = ? AND sort_key < ?
         ORDER BY sort_key DESC LIMIT 1`,
      )
      .get(code, latest.sort_key);
  }

  if (!priorRow) {
    return [
      `=== QoQ/YoY COMPARISON ===`,
      `Chỉ có một kỳ báo cáo. Không đủ dữ liệu để so sánh.`,
    ].join("\n");
  }

  // BEQ-4b: contamination guard — prior period not yet refined → withhold comparison
  // to prevent OCR-parse garbage (e.g. FPT 2025-Q4 net_profit=net_revenue÷1000)
  // from producing nonsense YoY deltas (e.g. +12146%).
  // Once BEQ-2 refine backfill runs and refine_status → DONE, the guard auto-lifts.
  if (priorRow.refine_status === "PENDING") {
    return [
      `=== QoQ/YoY COMPARISON ===`,
      `Period prior (${priorRow.sort_key}) not yet refined — comparison withheld to avoid contamination.`,
      `Run refine pipeline for ${code} ${priorRow.sort_key} to enable this comparison.`,
    ].join("\n");
  }

  const deltaType = latest.period_year !== priorRow.period_year ? "YoY" : "QoQ";
  const m1 = rowToMetrics(latest, bankForm);
  const m2 = rowToMetrics(priorRow, bankForm);
  const delta = computePeriodDelta(m1, m2, deltaType);

  const p1 = latest.sort_key;
  const p2 = priorRow.sort_key;

  const lines: string[] = [
    `=== QoQ/YoY COMPARISON ===`,
    `${deltaType}: ${p2} -> ${p1}`,
    ``,
    `Net Revenue  : ${fmtBillions(m2.netRevenue)} -> ${fmtBillions(m1.netRevenue)}  ${fmtChange((m1.netRevenue - m2.netRevenue) / 1000, delta.netRevenue.changePct, " ty")}`,
    `Net Profit   : ${fmtBillions(m2.netProfit)} -> ${fmtBillions(m1.netProfit)}  ${fmtChange((m1.netProfit - m2.netProfit) / 1000, delta.netProfit.changePct, " ty")}`,
    `EPS          : ${fmtVnd(m2.eps)} -> ${fmtVnd(m1.eps)}  ${fmtChange(delta.eps.changeAbsolute, delta.eps.changePct, " VND")}`,
    // C-3: omit gross-margin QoQ line for banks (structurally absent, shows as 0.0% → 0.0%)
    ...(bankForm
      ? []
      : [
          `Gross Margin : ${fmtPct(m2.grossMarginPct)} -> ${fmtPct(m1.grossMarginPct)}  (${delta.grossMarginPP.changePP >= 0 ? "+" : ""}${delta.grossMarginPP.changePP.toFixed(1)} pp)`,
        ]),
    `Net Margin   : ${fmtPct(m2.netMarginPct)} -> ${fmtPct(m1.netMarginPct)}  (${delta.netMarginPP.changePP >= 0 ? "+" : ""}${delta.netMarginPP.changePP.toFixed(1)} pp)`,
    `ROE          : ${fmtPct(m2.roe)} -> ${fmtPct(m1.roe)}  (${delta.roePP.changePP >= 0 ? "+" : ""}${delta.roePP.changePP.toFixed(1)} pp)`,
  ];

  return lines.join("\n");
}

/**
 * Build the SENTIMENT TREND section from rag_analyses over the last 30 days.
 */
function buildSentimentSection(db: Database, code: string): string {
  const WINDOW_DAYS = 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (WINDOW_DAYS - 1));
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let entries: Array<{ sentiment: string; createdAt: string }> = [];

  try {
    const rows = db
      .query<RagRow, [string, string]>(
        `SELECT sentiment, created_at
         FROM   rag_analyses
         WHERE  affected_actions LIKE ?
           AND  created_at >= ?
         ORDER BY created_at ASC`,
      )
      .all(`%${code}%`, cutoffStr);

    entries = rows.map((r) => ({
      sentiment: r.sentiment ?? "neutral",
      createdAt: r.created_at,
    }));
  } catch (err) {
    logger.warn("[bctcFullTools] rag_analyses query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const trend = computeSentimentTrend(entries, code, WINDOW_DAYS);

  const dirLabel =
    trend.trendDirection === "improving"
      ? "TĂNG (đang cải thiện)"
      : trend.trendDirection === "deteriorating"
        ? "GIẢM (đang xấu đi)"
        : "ỔN ĐỊNH";

  const slopeSign = trend.slope >= 0 ? "+" : "";
  const rSquared = entries.length >= 2
    ? ` | r2 est. ~${Math.min(1, Math.abs(trend.slope) / 2).toFixed(2)}`
    : "";

  const lines: string[] = [
    `=== SENTIMENT TREND ===`,
    `Window: ${WINDOW_DAYS} days | Entries: ${entries.length}`,
  ];

  if (entries.length === 0) {
    lines.push(`Không có dữ liệu cảm tính cho ${code} trong ${WINDOW_DAYS} ngày qua.`);
  } else {
    lines.push(`Direction: ${dirLabel}`);
    lines.push(`Slope: ${slopeSign}${trend.slope.toFixed(2)}${rSquared}`);
    lines.push(`Summary: ${trend.summary}`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// PUB-1..4 Publishability Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PublishabilityCheck — result of the four-gate publish check.
 */
interface PublishabilityCheck {
  publishable: boolean;
  reason?: string;            // Human-readable refusal text when not publishable
  partialWarning?: string;    // Warning text for partial REJECTED_SANITY (publishable=true)
}

/**
 * checkPublishability — evaluates PUB-1 through PUB-4 binding conditions.
 *
 * Called immediately after `latestRow` query, before building any financial output.
 * Uses the injected `db` parameter directly (no HTTP calls — supports in-memory test DBs).
 *
 * PUB-1: refine_status IN ('DONE', 'PARTIAL')
 * PUB-2: ≥1 bctc_table_rows row with non-null value_current
 * PUB-3: ≥1 balance_sheet non-summary row (is_summary_row=0)
 * PUB-4: No REJECTED_SANITY units, or partial rejection with warning
 *
 * C-1 bank guard: banks (Mẫu B02-TCTD) have Roman-numeral codes (I, VIII, IX…) that
 * CAST to NULL, so the corporate `CAST(code AS INTEGER) BETWEEN 100 AND 440` predicate
 * matches zero rows for ACB/VCB → publishable=false (false block). For banks, PUB-3
 * accepts any non-summary 'general' row with value_current IS NOT NULL instead.
 *
 * @param db          Database instance (injected for testability)
 * @param reportId    Financial report UUID
 * @param bankForm    True when the report follows Mẫu B02-TCTD (bank form).
 * @returns PublishabilityCheck with publishable flag and optional reason/warning
 */
/** Exported for testability (DV-BANK-1). */
export function checkPublishability(db: Database, reportId: string, bankForm = false): PublishabilityCheck {
  // PUB-1: refine_status must be DONE or PARTIAL
  const report = db
    .query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    )
    .get(reportId);

  if (!report || !["DONE", "PARTIAL"].includes(report.refine_status)) {
    return {
      publishable: false,
      reason: "Chưa có dữ liệu BCTC",
    };
  }

  // PUB-2: at least one bctc_table_rows row with non-null value_current
  const rowCount = db
    .query<{ cnt: number }, [string]>(
      "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ? AND value_current IS NOT NULL",
    )
    .get(reportId);

  if (!rowCount || rowCount.cnt === 0) {
    return {
      publishable: false,
      reason: "refine data absent — report has no extracted rows",
    };
  }

  // PUB-3: balance sheet has at least one non-summary child row.
  //
  // FU-6f B-3 FIX: also accept balance rows in statement_section='general'.
  //
  // Root cause: refinedMarkdownParser SECTION_HEADERS did not detect the balance-sheet
  // header for FPT and ACB, causing all balance rows to land in statement_section='general'
  // (the BCTC-LAYOUT-FIRST follow-up will fix the labeling). Until then, PUB-3 must
  // also accept 'general' rows that carry standard Vietnamese balance-sheet codes (100-440):
  //   assets 100-299, liabilities 300-399, equity 400-440 (Mẫu B01-DN / B02-TCTD).
  //
  // C-1 bank path (BANK-DEV-1): bank rows have Roman-numeral codes (I, VIII, IX…) that
  // CAST to NULL, so CAST(code AS INTEGER) BETWEEN 100 AND 440 matches zero rows.
  // ACB live data: 95 'general' rows, 0 'balance_sheet' rows, all codes Roman/null.
  // For banks: accept any non-summary 'general' row with value_current IS NOT NULL.
  // This preserves the "real data exists, not forced-zero" intent of PUB-3.
  //
  // This does NOT change statement_section labels — it only broadens the publishability
  // check to match current parser reality. BCTC-LAYOUT-FIRST will re-label correctly.
  const balanceChildren = bankForm
    ? // C-1 bank path: any non-summary general row with real value
      db
        .query<{ cnt: number }, [string]>(
          `SELECT COUNT(*) as cnt FROM bctc_table_rows
           WHERE report_id = ?
             AND is_summary_row = 0
             AND statement_section = 'general'
             AND value_current IS NOT NULL`,
        )
        .get(reportId)
    : // Corporate path (unchanged): balance_sheet OR general with numeric code 100-440
      db
        .query<{ cnt: number }, [string]>(
          `SELECT COUNT(*) as cnt FROM bctc_table_rows
           WHERE report_id = ?
             AND is_summary_row = 0
             AND (
               statement_section = 'balance_sheet'
               OR (
                 statement_section = 'general'
                 AND code IS NOT NULL
                 AND CAST(code AS INTEGER) BETWEEN 100 AND 440
               )
             )`,
        )
        .get(reportId);

  if (!balanceChildren || balanceChildren.cnt === 0) {
    return {
      publishable: false,
      reason: "balance sheet has no decomposition — forced-zero pass suspected",
    };
  }

  // PUB-4: check for REJECTED_SANITY units
  const totalUnitCount = db
    .query<{ cnt: number }, [string]>(
      "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ?",
    )
    .get(reportId);

  const rejectedUnitCount = db
    .query<{ cnt: number }, [string]>(
      "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ? AND window_status = 'REJECTED_SANITY'",
    )
    .get(reportId);

  if (rejectedUnitCount && rejectedUnitCount.cnt > 0) {
    const total = totalUnitCount?.cnt ?? 0;
    const rejected = rejectedUnitCount.cnt;

    if (rejected >= total) {
      // All units rejected — fully unpublishable
      return {
        publishable: false,
        reason: "All refined units rejected by sanity gates; no publishable data",
      };
    }

    // Partial rejection — publishable with warning
    return {
      publishable: true,
      partialWarning: `[PUB-4 WARNING] ${rejected}/${total} refined units rejected by sanity gates; data for rejected sections may be incomplete`,
    };
  }

  return { publishable: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the `get_bctc_full` compound MCP tool on `server`.
 *
 * @param server  - The McpServer instance.
 * @param _testDb - Optional injected Database for unit tests.
 */
export function registerBctcFullTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_bctc_full",
    "Compound tool: returns BCTC financial summary + QoQ/YoY comparison + " +
    "30-day sentiment trend for a stock in a single call. " +
    "Replaces calling get_financial_summary + compare_financials + get_sentiment_trend separately. " +
    "Use code (required), optional year and quarter to filter the report period.",
    {
      code: z
        .string()
        .min(2)
        .max(10)
        .describe("Stock ticker code, e.g. VCB"),
      year: z.coerce
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe("Fiscal year filter (optional — defaults to most recent)"),
      quarter: z
        .enum(["Q1", "Q2", "Q3", "Q4"])
        .optional()
        .describe("Quarter filter: Q1 | Q2 | Q3 | Q4 (optional)"),
    },
    async ({ code, year, quarter }) => {
      const db = _testDb ?? getDb();
      const upperCode = code.toUpperCase().trim();

      try {
        // ── 1. Fetch latest financial report ─────────────────────────────
        const conditions: string[] = ["action_code = $code"];
        const params: Record<string, string | number> = { $code: upperCode };

        if (year !== undefined) {
          conditions.push("period_year = $year");
          params["$year"] = year;
        }
        if (quarter !== undefined) {
          conditions.push("period_type = $quarter");
          params["$quarter"] = quarter;
        }

        const whereClause = conditions.join(" AND ");
        const latestRow = db
          .query<ReportRow, typeof params>(
            `SELECT * FROM financial_reports WHERE ${whereClause} ORDER BY sort_key DESC LIMIT 1`,
          )
          .get(params);

        if (!latestRow) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chưa có dữ liệu BCTC cho ${upperCode}. Kiểm tra bằng list_stored_pdfs.`,
              },
            ],
          };
        }

        // ── Compute bank-form discriminator ──────────────────────────────
        // BANK-DEV-2: structural signal from bctc_table_rows (3-digit code absence).
        // Domain column is universally "other" in live DB — cannot be used.
        // isBankFormFromDb issues SELECT code FROM bctc_table_rows WHERE report_id = ?
        // and returns true when NO 3-digit numeric codes exist (bank Mẫu B02-TCTD).
        const bankForm = isBankFormFromDb(db, latestRow.id);

        // ── PUB-1..4 Publishability guard ─────────────────────────────────
        // PUB-1: refine_status IN ('DONE', 'PARTIAL')
        // PUB-2: ≥1 extracted row with value_current IS NOT NULL
        // PUB-3: balance sheet has ≥1 non-summary child row (no forced-zero)
        // PUB-4: no REJECTED_SANITY units, or partial rejection warning
        // If any gate fails, return human-readable refusal — no financial data served.
        const pubCheck = checkPublishability(db, latestRow.id, bankForm);
        if (!pubCheck.publishable) {
          return {
            content: [
              {
                type: "text" as const,
                text: pubCheck.reason ?? "Chưa có dữ liệu BCTC",
              },
            ],
          };
        }

        // PUB-4 partial rejection: log warning but continue serving clean sections
        if (pubCheck.partialWarning) {
          logger.warn("[bctcFullTools] PUB-4 partial REJECTED_SANITY", {
            code: upperCode,
            report_id: latestRow.id,
            warning: pubCheck.partialWarning,
          });
        }

        // ── 2. Build the three sections ──────────────────────────────────
        const summarySection = buildSummarySection(upperCode, latestRow, bankForm);
        const comparisonSection = buildComparisonSection(db, upperCode, latestRow, bankForm);
        const sentimentSection = buildSentimentSection(db, upperCode);

        const output = [summarySection, "", comparisonSection, "", sentimentSection].join("\n");

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (err) {
        // HOTFIX 1288c: Suppress query errors (main server just queries local DB)
        // VPS will log detailed errors if PDF extraction fails
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving BCTC full report for ${upperCode}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
