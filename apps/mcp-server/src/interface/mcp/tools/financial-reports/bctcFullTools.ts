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
import { validateFinancialReport } from "../../../../domain/services/financial-reports/bctcValidator.js";

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
  /**
   * BAL-1c: period basis tag written by finalize_bctc_refine.
   * 'standalone_quarter' — Q1/Q2/Q3 YTD figures (treated as standalone for comparison).
   * 'full_year_cumulative' — Q4 FY figures (Jan–Dec cumulative; Q4 VAS standard).
   * NULL — unknown / not yet tagged (guard passes through; safe fail-open).
   */
  period_basis: string | null;
  /**
   * BAL-1a-BACKFILL: needed for read-time current_ratio recompute.
   * Contains balance_sheet_json blob (JSON string) from which currentLiabilities.total
   * is read — same source as BLOCK-3 in finalizeBctcRefineTool.ts.
   * Available via SELECT * (column exists in financial_reports schema).
   */
  balance_sheet_json: string | null;
  /**
   * BAL-1d: report scope structural column written by finalize_bctc_refine.
   * 'consolidated' — consolidated group report (hợp nhất).
   * 'parent_only'  — parent entity only (riêng lẻ); revenue=0, dividends as profit.
   * NULL           — unknown / not yet tagged (PUB-8 falls back to inline heuristic).
   */
  report_scope: string | null;
  /**
   * FU-LF-VALIDATION-STATUS-REFLOW: persisted validation status (from parseBctcReport).
   * May be stale for reports refined after 2026-05-24. The serve path recomputes
   * this on-read from corrected scalars — the persisted column is only a fallback.
   * Values: 'passed' | 'passed_with_warnings' | 'failed' | 'low_confidence' | 'pending'
   * Optional: column may not be present in legacy test fixtures (added as nullable migration).
   */
  validation_status?: string | null;
  /**
   * FU-LF-VALIDATION-STATUS-REFLOW: human-readable notes from the original validation.
   * May be stale. The computed notes are preferred at serve time.
   * Optional: column may not be present in legacy test fixtures.
   */
  validation_notes?: string | null;
}

interface RagRow {
  sentiment: string | null;
  created_at: string;
}

// FIX-D: vnstock_balance_sheet row for receivables query
interface BalanceSheetVnstockRow {
  receivables_bn: number | null;
}

// FIX-D: structured_data output type (exported for test consumers)
export interface BctcStructuredData {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  debt_to_equity: number | null;
  equity_total: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  cash: number | null;
  long_term_debt: number | null;
  profit_before_tax: number | null;
  operating_cf: number | null;
  net_profit: number | null;
  eps: number | null;
  net_revenue: number | null;
  receivables: number | null;
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
export function buildSummarySection(
  code: string,
  row: ReportRow,
  bankForm = false,
  sanitizedRatios?: PublishabilityCheck["sanitizedRatios"],
  computedValidationStatus?: { status: string; note: string | null },
): string {
  // C-2: gross profit line — banks show net interest income proxy instead
  const grossProfitLine = bankForm
    ? `Net Interest Inc.: ${fmtBillions(row.net_revenue)}  (net interest income — maps to net_revenue)`
    : `Gross Profit     : ${fmtBillions(row.gross_profit)}  (${fmtPct(row.gross_margin_pct)})`;

  // PUB-6: use sanitized ratio values when out-of-bounds ratios were detected.
  // sanitizedRatios overrides the row value with null (→ "N/A") for each offending ratio.
  // A trust note is appended to the ratios section to explain the N/A substitution.
  const effectiveRoa = sanitizedRatios ? sanitizedRatios.roa : row.roa;
  const effectiveRoe = sanitizedRatios ? sanitizedRatios.roe : row.roe;
  const effectiveNetDebtToEbitda = sanitizedRatios
    ? sanitizedRatios.net_debt_to_ebitda
    : row.net_debt_to_ebitda;
  const effectiveEps = sanitizedRatios ? sanitizedRatios.eps : row.eps;
  // BAL-1f: current_ratio may be withheld by PUB-6 sanitization (> 1000x band).
  // Use sanitizedRatios.current_ratio when set; otherwise use row.current_ratio
  // (which is already null for parse-artifact denominators after recompute-on-read).
  const effectiveCurrentRatio = sanitizedRatios
    ? sanitizedRatios.current_ratio
    : row.current_ratio;
  // FU-DE-SERVE-HONEST: debt_to_equity from recompute-on-read is already null for
  // empty-decomposition case. PUB-6 sanitizedRatios may further null it (defense-in-depth).
  const effectiveDebtToEquity = sanitizedRatios
    ? sanitizedRatios.debt_to_equity
    : row.debt_to_equity;
  const pub6Note = sanitizedRatios
    ? `[PUB-6] Some ratio(s) withheld (N/A) — out-of-bounds value detected; likely unit scale or stale pre-refine ratio.`
    : null;

  // C-2: current ratio — N/A for banks (no current_assets concept in Mẫu B02-TCTD)
  const currentRatioLine = bankForm
    ? `Current Ratio    : N/A (bank — no current assets concept)`
    : `Current Ratio    : ${fmtX(effectiveCurrentRatio)}`;

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
    `EPS              : ${fmtVnd(effectiveEps)}`,
    ``,
    `--- Balance Sheet ---`,
    `Total Assets     : ${fmtBillions(row.total_assets)}`,
    `Equity           : ${fmtBillions(row.equity_total)}`,
    `Total Liab.      : ${fmtBillions(row.total_liabilities)}`,
    `Cash             : ${fmtBillions(row.cash)}`,
    ``,
    `--- Ratios ---`,
    `ROE              : ${fmtPct(effectiveRoe)}`,
    `ROA              : ${fmtPct(effectiveRoa)}`,
    currentRatioLine,
    `D/E Ratio        : ${fmtX(effectiveDebtToEquity)}`,
    `Net Debt/EBITDA  : ${fmtX(effectiveNetDebtToEbitda)}`,
    `P/E              : ${fmtX(row.pe)}`,
    `P/B              : ${fmtX(row.pb)}`,
    ...(pub6Note ? [``, pub6Note] : []),
    ``,
    `Confidence       : ${(row.extraction_confidence * 100).toFixed(0)}%`,
    `Published        : ${row.published_at}`,
    // FU-LF-VALIDATION-STATUS-REFLOW: show recomputed validation status (not stale persisted value)
    ...(computedValidationStatus
      ? [
          ``,
          `Validation       : ${computedValidationStatus.status}${computedValidationStatus.note ? ` — ${computedValidationStatus.note}` : ""}`,
        ]
      : []),
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

  // PUB-7 (BAL-1c): period basis mismatch guard — STRUCTURAL column-based check.
  // Uses the `period_basis` column written by finalize_bctc_refine (BAL-1c):
  //   'full_year_cumulative' — Q4/FY figures (VAS standard: Jan–Dec cumulative)
  //   'standalone_quarter'   — Q1/Q2/Q3 YTD figures (treated as standalone)
  //   NULL                   — unknown / not yet tagged → guard passes through (fail-open)
  //
  // Mismatch: one side is 'full_year_cumulative' and the other is 'standalone_quarter'.
  // A NULL on either side means the period_basis has not been populated yet — we fall
  // back to the legacy period_type heuristic so the guard still fires for known Q4 rows
  // that pre-date the column backfill (graceful degradation, not silent skip).
  //
  // Case A: latest is full_year_cumulative vs prior is standalone_quarter → withhold
  const latestBasis = latest.period_basis;
  const priorBasis = priorRow.period_basis;

  // Resolve effective basis: use column value when available; fall back to period_type heuristic.
  const effectiveLatestBasis: string | null =
    latestBasis ?? (latest.period_type === "Q4" ? "full_year_cumulative" : "standalone_quarter");
  const effectivePriorBasis: string | null =
    priorBasis ?? (priorRow.period_type === "Q4" ? "full_year_cumulative" : "standalone_quarter");

  if (effectiveLatestBasis === "full_year_cumulative" && effectivePriorBasis === "standalone_quarter") {
    return [
      `=== QoQ/YoY COMPARISON ===`,
      `PUB-7: Period basis mismatch — ${latest.sort_key} is FY-cumulative (period_basis=${latestBasis ?? "inferred"}) vs ${priorRow.sort_key} standalone-quarter. Comparison withheld to prevent false delta.`,
      `Standalone Q4 figure requires subtraction: Q4 = FY − Q1−Q2−Q3 (not yet implemented).`,
      `Use get_financial_summary for same-quarter YoY comparison.`,
    ].join("\n");
  }
  // Case B: latest is standalone_quarter vs prior is full_year_cumulative → withhold
  if (effectiveLatestBasis === "standalone_quarter" && effectivePriorBasis === "full_year_cumulative") {
    return [
      `=== QoQ/YoY COMPARISON ===`,
      `PUB-7: Period basis mismatch — ${latest.sort_key} standalone-quarter vs ${priorRow.sort_key} FY-cumulative (period_basis=${priorBasis ?? "inferred"}). Comparison withheld to prevent false YoY delta (e.g. Q1-standalone vs FY gives misleading -80%+ swing).`,
      `Use get_financial_summary for same-quarter YoY comparison.`,
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
 * PublishabilityCheck — result of the PUB-1..8 publish check.
 */
interface PublishabilityCheck {
  publishable: boolean;
  reason?: string;            // Human-readable refusal text when not publishable
  partialWarning?: string;    // Warning text for partial REJECTED_SANITY or PUB-6 ratio-sanity (publishable=true)
  /** PUB-6: sanitized ratio values — null means out-of-bounds (render as N/A). Only set when PUB-6 fires. */
  sanitizedRatios?: {
    roa: number | null;
    roe: number | null;
    net_debt_to_ebitda: number | null;
    eps: number | null;
    /** BAL-1f: current_ratio plausibility band — null when > 1000x (parse artifact). */
    current_ratio: number | null;
    /** FU-DE-SERVE-HONEST: debt_to_equity — null when decomposition absent (micro-residual + liabilities present). */
    debt_to_equity: number | null;
  };
}

/**
 * checkPublishability — evaluates PUB-1 through PUB-8 binding conditions.
 *
 * Called immediately after `latestRow` query, before building any financial output.
 * Uses the injected `db` parameter directly (no HTTP calls — supports in-memory test DBs).
 *
 * PUB-1: refine_status IN ('DONE', 'PARTIAL')
 * PUB-2: ≥1 bctc_table_rows row with non-null value_current
 * PUB-3: ≥1 balance_sheet non-summary row (is_summary_row=0)
 * PUB-4: No REJECTED_SANITY units, or partial rejection with warning
 * PUB-5 (BAL-0): extraction_confidence ≥ 0.5 (HPG parent-only is 44% → blocked)
 * PUB-6 (BAL-0): ratio sanity bounds — |ROA|≤100%, |ROE|≤300%, |NetDebt/EBITDA|≤200x,
 *                 EPS in [0, 100000] VND. Offending ratios marked N/A (partial, not full block).
 * PUB-8 (BAL-0): parent-only heuristic — net_revenue=0 AND net_profit>0 AND conf<0.6 → BLOCK
 *
 * C-1 bank guard (BAL-1b): banks (Mẫu B02-TCTD) have Roman-numeral codes (I, VIII, IX…)
 * that CAST to NULL, so the corporate `CAST(code AS INTEGER) BETWEEN 100 AND 440` predicate
 * matches zero rows for ACB/VCB → publishable=false (false block). For banks, PUB-3
 * accepts any non-summary row where statement_section IN ('general', 'balance_sheet') —
 * 'general' covers legacy ACB/VCB parsing; 'balance_sheet' covers EIB/SHB correctly parsed.
 *
 * @param db          Database instance (injected for testability)
 * @param reportId    Financial report UUID
 * @param bankForm    True when the report follows Mẫu B02-TCTD (bank form).
 * @param row         Optional latest ReportRow (avoids second DB query; required for PUB-5/6/8).
 * @returns PublishabilityCheck with publishable flag and optional reason/warning/sanitizedRow
 */
/** Exported for testability (DV-BANK-1). */
export function checkPublishability(
  db: Database,
  reportId: string,
  bankForm = false,
  row?: ReportRow,
): PublishabilityCheck {
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
  // C-1 bank path (BANK-DEV-1 → BAL-1b): bank rows have Roman-numeral codes (I, VIII, IX…)
  // that CAST to NULL, so CAST(code AS INTEGER) BETWEEN 100 AND 440 matches zero rows.
  // Legacy ACB/VCB: parser dumped all rows into statement_section='general' (0 'balance_sheet').
  // Correctly-parsed EIB/SHB: rows labeled statement_section='balance_sheet' (0 'general').
  // BAL-1b fix: the bank path must accept EITHER 'general' OR 'balance_sheet' to cover both
  // parser generations. The original 'general'-only clause blocked EIB/SHB (B-1 gate mismatch).
  // This preserves the "real data exists, not forced-zero" intent of PUB-3 for all bank parsings.
  //
  // This does NOT change statement_section labels — it only broadens the publishability
  // check to match current parser reality. BCTC-LAYOUT-FIRST will re-label correctly.
  const balanceChildren = bankForm
    ? // C-1 bank path: accept legacy 'general' rows (ACB/VCB parser reality) OR
      // correctly-labeled 'balance_sheet' rows (EIB/SHB and future banks parsed correctly).
      // BAL-1b: broadened to cover both label conventions — do NOT restrict to one section.
      db
        .query<{ cnt: number }, [string]>(
          `SELECT COUNT(*) as cnt FROM bctc_table_rows
           WHERE report_id = ?
             AND is_summary_row = 0
             AND (statement_section = 'general' OR statement_section = 'balance_sheet')
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

  // ── PUB-5 (BAL-0): extraction confidence gate ────────────────────────────
  // Block reports with extraction_confidence < 0.5 (e.g. HPG parent-only at 44%).
  // Row is passed from the call site; if absent, gate is silently skipped (safe fail-open
  // because PUB-1..4 structural guards still apply).
  const MIN_SERVE_CONFIDENCE = 0.5;
  if (row != null && row.extraction_confidence < MIN_SERVE_CONFIDENCE) {
    return {
      publishable: false,
      reason: `PUB-5: Extraction confidence too low (${(row.extraction_confidence * 100).toFixed(0)}%) — minimum ${MIN_SERVE_CONFIDENCE * 100}% required for serving as headline. Report may be parent-only or poorly extracted.`,
    };
  }

  // ── PUB-8 (BAL-1d upgraded): parent-only structural column + NULL fallback ──
  //
  // BAL-1d: the `report_scope` column is now the STRUCTURAL signal for parent-only
  // detection. finalize_bctc_refine writes 'parent_only' when net_revenue=0/NULL
  // AND net_profit>0. For newly finalized reports the column is authoritative.
  //
  // For pre-BAL-1d records (report_scope IS NULL), fall back to the original inline
  // heuristic (rev=0, np>0, conf<0.6) — same pattern as period_basis/PUB-7 fallback.
  // This ensures live protection for the existing corpus until a corpus re-finalize runs.
  //
  // Structural path (report_scope set): block unconditionally when parent_only,
  // regardless of confidence — the structural column is more authoritative than
  // the confidence threshold (finalize-time heuristic was already guarded for FPs).
  //
  // Inline heuristic path (report_scope IS NULL — pre-finalize records):
  //   Block when rev=0 AND np>0 AND conf<0.6 (original PUB-8 pre-BAL-1d).
  if (row != null) {
    if (row.report_scope === "parent_only") {
      // STRUCTURAL path: column-based, authoritative
      return {
        publishable: false,
        reason: `PUB-8: Parent-only filing (report_scope=parent_only, Rev=${row.net_revenue?.toFixed(1) ?? "NULL"}, NP=${row.net_profit?.toFixed(1) ?? "NULL"}) — consolidated report required for headline serving.`,
      };
    } else if (row.report_scope === null) {
      // NULL FALLBACK path: pre-finalize records — inline heuristic (mirrors original PUB-8)
      const PARENT_ONLY_CONFIDENCE_THRESHOLD = 0.6;
      if (
        row.net_revenue === 0 &&
        row.net_profit > 0 &&
        row.extraction_confidence < PARENT_ONLY_CONFIDENCE_THRESHOLD
      ) {
        return {
          publishable: false,
          reason: `PUB-8: Parent-only filing suspected (report_scope=NULL/untagged, Rev=0, NP=${row.net_profit.toFixed(1)}, confidence ${(row.extraction_confidence * 100).toFixed(0)}%) — consolidated report required for headline serving. Re-finalize to stamp report_scope structural column.`,
        };
      }
    }
    // report_scope='consolidated' → PUB-8 passes (structural confirmation, no further check)
  }

  // ── PUB-6 (BAL-0 + BAL-1f): ratio sanity bounds ─────────────────────────
  // Ratios are re-derived read-time (BAL-1a / BAL-1f recompute block above).
  // Stale/scaled-wrong values can still reach here via paths that skip recompute.
  // Rather than blocking the whole report, withhold offending ratios as N/A.
  // The sanitizedRatios map is returned for callers to apply when rendering.
  //
  // BAL-1f: adds current_ratio plausibility band (> 1000x → N/A).
  // The recompute-on-read block already guards at denominator level; this gate
  // is defense-in-depth for any path where current_ratio escapes that guard
  // (e.g. persisted value pre-dates BAL-1f, or a future code path bypasses it).
  if (row != null) {
    const badRatios: string[] = [];
    if (row.roa != null && Math.abs(row.roa) > 100) {
      badRatios.push(`ROA=${row.roa.toFixed(2)}%`);
    }
    if (row.roe != null && Math.abs(row.roe) > 300) {
      badRatios.push(`ROE=${row.roe.toFixed(2)}%`);
    }
    if (row.net_debt_to_ebitda != null && Math.abs(row.net_debt_to_ebitda) > 200) {
      badRatios.push(`NetDebt/EBITDA=${row.net_debt_to_ebitda.toFixed(2)}x`);
    }
    if (row.eps != null && (row.eps < 0 || row.eps > 100_000)) {
      badRatios.push(`EPS=${row.eps.toFixed(0)} VND`);
    }
    // BAL-1f: current_ratio > 1000x is physically impossible — parse artifact.
    if (row.current_ratio != null && row.current_ratio > 1000) {
      badRatios.push(`CurrentRatio=${row.current_ratio.toFixed(0)}x`);
    }
    // FU-DE-SERVE-HONEST PUB-6 defense-in-depth: D/E = 0.00x while total_liabilities > 0
    // → debt decomposition absent; false 'debt-free' must not reach MARKET/FB.
    // The recompute-on-read block above already sets debt_to_equity=null for this case,
    // so this PUB-6 branch is defense-in-depth for any path that bypasses recompute
    // (e.g. persisted pre-fix value escaping the guard, or a future code path).
    // Trigger: debt_to_equity=0 (exact zero from null debt scalars) AND total_liabilities > 0.
    // Also catches micro-residuals (e.g. 2.7e-13) via the implausibly-small threshold.
    const DE_MICRO_THRESHOLD = 1e-6;  // below this value is a floating-point artifact, not real
    if (
      row.debt_to_equity !== null &&
      row.debt_to_equity <= DE_MICRO_THRESHOLD &&
      row.total_liabilities !== null &&
      row.total_liabilities > 0
    ) {
      badRatios.push(`D/E=${row.debt_to_equity.toExponential(2)} (decomp absent, total_liab=${row.total_liabilities.toFixed(0)})`);
    }
    if (badRatios.length > 0) {
      return {
        publishable: true,
        partialWarning: `[PUB-6 RATIO-SANITY] Out-of-bounds ratio(s) withheld: ${badRatios.join(", ")} — unit scale or stale pre-refine value. Affected field(s) shown as N/A.`,
        sanitizedRatios: {
          roa: row.roa != null && Math.abs(row.roa) > 100 ? null : row.roa,
          roe: row.roe != null && Math.abs(row.roe) > 300 ? null : row.roe,
          net_debt_to_ebitda:
            row.net_debt_to_ebitda != null && Math.abs(row.net_debt_to_ebitda) > 200
              ? null
              : row.net_debt_to_ebitda,
          eps: row.eps != null && (row.eps < 0 || row.eps > 100_000) ? null : row.eps,
          // BAL-1f: current_ratio plausibility band — > 1000x → null (rendered as N/A).
          current_ratio:
            row.current_ratio != null && row.current_ratio > 1000 ? null : row.current_ratio,
          // FU-DE-SERVE-HONEST: D/E micro-residual + liabilities present → null (decomp absent).
          debt_to_equity:
            row.debt_to_equity !== null &&
            row.debt_to_equity <= DE_MICRO_THRESHOLD &&
            row.total_liabilities !== null &&
            row.total_liabilities > 0
              ? null
              : row.debt_to_equity,
        },
      };
    }
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

        // ── BAL-1a-BACKFILL: Recompute ratio columns from correct base scalars ──
        //
        // Root cause (brief 2026-06-02 §2.2, Option R approved 2026-06-02T14:14Z):
        //   The persisted ratio columns (roe, roa, current_ratio, debt_to_equity,
        //   net_debt_to_ebitda) retain OCR-parse values that may be stale, unit-scale
        //   wrong, or zero (incomeBroken guard fired at parse time).
        //   The refine pipeline corrects base scalars but BAL-1a finalize BLOCK-3 runs
        //   only for newly re-finalized rows; historically finalized rows or rows
        //   ingested before BAL-1a still carry stale ratio columns.
        //
        // Fix (Option R — recompute-on-read):
        //   Inline-recompute the 5 ratios from the correct persisted base scalars,
        //   then MUTATE latestRow in place so that checkPublishability (PUB-6) and
        //   buildSummarySection both see correct values with no further changes.
        //
        // Formula SSOT: mirrors finalizeBctcRefineTool.ts BLOCK-3 (BAL-1a) exactly —
        //   same scalars, same guards, same null-safety contract.
        //   safeDivide: null when denominator ≤ 0 or result non-finite.
        //
        //   roe               = net_profit / equity_total × 100  (guard: equity_total > 0)
        //   roa               = net_profit / total_assets  × 100 (guard: total_assets > 0)
        //   current_ratio     = current_assets / currentLiabilities.total
        //                       (source: balance_sheet_json.currentLiabilities.total;
        //                        guard: denominator > 0 and not null)
        //   debt_to_equity    = (short_term_debt + long_term_debt) / equity_total
        //                       (guard: equity_total > 0, both debt values non-null)
        //   net_debt_to_ebitda = (short_term_debt + long_term_debt - cash) / ebitda
        //                       (guard: ebitda > 0)
        //
        // The persisted ratio columns are deprecated-cache after this change.
        // get_bctc_full must never read them directly — the mutated latestRow values
        // shadow them for all downstream paths (checkPublishability + buildSummarySection).
        // No DB write, no schema migration required.
        {
          // Local safeDivide: mirrors ratioComputer.ts safeDivide — same contract.
          const safeDivideRead = (num: number, denom: number): number | null => {
            if (denom === 0) return null;
            const r = num / denom;
            if (!Number.isFinite(r)) return null;
            return r;
          };

          const {
            net_profit,
            equity_total,
            total_assets,
            current_assets,
            ebitda,
            cash,
            short_term_debt,
            long_term_debt,
            balance_sheet_json,
          } = latestRow;

          // roe: net_profit / equity_total × 100
          latestRow.roe =
            net_profit !== null && equity_total !== null && equity_total > 0
              ? (safeDivideRead(net_profit, equity_total) !== null
                  ? safeDivideRead(net_profit, equity_total)! * 100
                  : null)
              : null;

          // roa: net_profit / total_assets × 100
          latestRow.roa =
            net_profit !== null && total_assets !== null && total_assets > 0
              ? (safeDivideRead(net_profit, total_assets) !== null
                  ? safeDivideRead(net_profit, total_assets)! * 100
                  : null)
              : null;

          // current_ratio: current_assets / currentLiabilities.total
          // currentLiabilities.total is NOT a scalar column — read from balance_sheet_json.
          // Mirrors finalizeBctcRefineTool.ts BLOCK-3 L749-767.
          //
          // BAL-1f: guard against parse artifacts — a clTotal > 0 guard alone is
          // insufficient when the parser emits micro-residuals (e.g. FPT had
          // currentLiabilities.total = 1e-6 from component rounding:
          // shortTermDebt=0 + accountsPayable=1e-6 + ... = 1e-6).
          // 1e-6 > 0 is true → current_assets / 1e-6 ≈ 4.15e13 (garbage).
          //
          // Principled threshold: clTotal must be ≥ 0.1% of current_assets
          // (meaningful fraction check) AND ≥ 1.0 million VND absolute floor.
          // Both conditions must hold; otherwise treat denominator as N/A.
          // A result > 1000x is also clamped to null (implausible band).
          // This mirrors VNM's honest N/A behaviour (missing currentLiabilities
          // breakdown → null → served as N/A correctly).
          let recomputedCurrentRatio: number | null = null;
          if (current_assets !== null && balance_sheet_json) {
            try {
              const bs = JSON.parse(balance_sheet_json) as Record<string, unknown>;
              const clTotal =
                bs["currentLiabilities"] !== null &&
                typeof bs["currentLiabilities"] === "object" &&
                bs["currentLiabilities"] !== undefined
                  ? (bs["currentLiabilities"] as Record<string, unknown>)["total"]
                  : undefined;
              // BAL-1f: principled floor — clTotal must be a meaningful fraction of
              // current_assets (≥ 0.1%) AND above an absolute minimum (1.0 million VND).
              // Micro-residuals from component rounding (e.g. 1e-6) fail both checks → N/A.
              const MIN_CL_FRACTION = 0.001; // 0.1% of current_assets
              const MIN_CL_ABSOLUTE = 1.0;   // 1 million VND minimum
              const clIsPlausible =
                typeof clTotal === "number" &&
                clTotal >= MIN_CL_ABSOLUTE &&
                (current_assets === 0 || clTotal >= current_assets * MIN_CL_FRACTION);
              if (clIsPlausible) {
                const ratio = safeDivideRead(current_assets, clTotal as number);
                // BAL-1f: implausible result band — current_ratio > 1000x is physically
                // impossible for any real company; treat as N/A (defense-in-depth).
                recomputedCurrentRatio = ratio !== null && ratio <= 1000 ? ratio : null;
              }
            } catch {
              // JSON parse error — leave recomputedCurrentRatio null (safe fallback)
            }
          }
          latestRow.current_ratio = recomputedCurrentRatio;

          // operating_margin_pct / gross_margin_pct / net_margin_pct recompute
          // BAL-1f: the recompute block previously omitted these three margin columns.
          // buildSummarySection reads row.operating_margin_pct directly — if left as
          // the stale persisted value (= 0 for FPT despite op_profit=2,747,763 and
          // net_revenue=12,479,997), the display shows 0.0% instead of the true 22.02%.
          //
          // Formula SSOT: mirrors ratioComputer.ts operatingMarginPct ~L81-85.
          //   gross_margin    = gross_profit   / net_revenue × 100
          //   operating_margin = operating_profit / net_revenue × 100
          //   net_margin      = net_profit     / net_revenue × 100
          //
          // Income-broken guard (mirrors ratioComputer.ts L71-72):
          //   when ALL of [net_revenue, gross_profit, operating_profit] are 0,
          //   the income statement extraction failed — set all margin ratios to null.
          {
            const incomeKeyFields = [
              latestRow.net_revenue,
              latestRow.gross_profit,
              latestRow.operating_profit,
            ];
            const incomeBroken = incomeKeyFields.every((v) => v === 0);
            const nr = latestRow.net_revenue;
            if (!incomeBroken && nr !== null && nr !== 0) {
              latestRow.gross_margin_pct =
                latestRow.gross_profit !== null
                  ? (safeDivideRead(latestRow.gross_profit, nr) ?? null) !== null
                    ? safeDivideRead(latestRow.gross_profit, nr)! * 100
                    : null
                  : null;
              latestRow.operating_margin_pct =
                latestRow.operating_profit !== null
                  ? (safeDivideRead(latestRow.operating_profit, nr) ?? null) !== null
                    ? safeDivideRead(latestRow.operating_profit, nr)! * 100
                    : null
                  : null;
              latestRow.net_margin_pct =
                latestRow.net_profit !== null
                  ? (safeDivideRead(latestRow.net_profit, nr) ?? null) !== null
                    ? safeDivideRead(latestRow.net_profit, nr)! * 100
                    : null
                  : null;
            } else {
              // Income broken or net_revenue = 0 → margins are meaningless
              latestRow.gross_margin_pct = null;
              latestRow.operating_margin_pct = null;
              latestRow.net_margin_pct = null;
            }
          }

          // debt_to_equity: (short_term_debt + long_term_debt) / equity_total
          //
          // FU-DE-SERVE-HONEST: guard against false 'debt-free 0.00x' when debt
          // decomposition is absent from the refined data.
          // Root cause: refine pipeline leaves short_term_debt + long_term_debt ≈ 0
          // for reports where the liabilities decomposition was not extracted
          // (FPT-Q1/VNM/EIB/SHB/DHG are affected). The arithmetic debt/equity = ~0
          // is correct given the data but materially false as a published signal
          // (total_liabilities carries the real value, just not decomposed).
          //
          // Guard: if (short_term_debt + long_term_debt) is implausibly tiny
          // AND total_liabilities > 0, the decomposition is absent — serve N/A.
          //
          // Threshold: debt sum must be ≥ 0.1% of total_liabilities to be meaningful.
          // Absolute floor: ≥ 1.0 million VND (mirrors BAL-1f current_ratio floor).
          // Micro-residuals (e.g. 2.7e-13 from FPT-2025Q4) and zeros both fail.
          //
          // SCOPE BOUNDARY: FU-DE-DECOMP-MAPPING (upstream data gap, architect spike)
          // is NOT in scope here — this is the serve-honesty half only.
          {
            const debtSum =
              short_term_debt !== null && long_term_debt !== null
                ? short_term_debt + long_term_debt
                : null;
            const totalLiab = latestRow.total_liabilities;

            const MIN_DEBT_FRACTION = 0.001;  // 0.1% of total_liabilities
            const MIN_DEBT_ABSOLUTE = 1.0;    // 1 million VND floor

            // Check if decomposition is plausibly present:
            //   debtSum must exist, ≥ MIN_DEBT_ABSOLUTE, and ≥ MIN_DEBT_FRACTION of total_liab
            const debtDecompPlausible =
              debtSum !== null &&
              debtSum >= MIN_DEBT_ABSOLUTE &&
              (totalLiab === null || totalLiab === 0 || debtSum >= totalLiab * MIN_DEBT_FRACTION);

            if (debtDecompPlausible && equity_total !== null && equity_total > 0) {
              latestRow.debt_to_equity = safeDivideRead(debtSum!, equity_total);
            } else if (!debtDecompPlausible && totalLiab !== null && totalLiab > 0) {
              // Decomposition absent (micro-residual or zero) while real liabilities exist.
              // Serve N/A — false 'debt-free' is a publishable misrepresentation.
              latestRow.debt_to_equity = null;
            } else {
              // Standard null path: debtSum null or equity ≤ 0
              latestRow.debt_to_equity =
                debtSum !== null && equity_total !== null && equity_total > 0
                  ? safeDivideRead(debtSum, equity_total)
                  : null;
            }
          }

          // net_debt_to_ebitda: (short_term_debt + long_term_debt - cash) / ebitda
          // Guard: ebitda > 0 (mirrors ratioComputer.ts L132)
          latestRow.net_debt_to_ebitda =
            short_term_debt !== null &&
            long_term_debt !== null &&
            cash !== null &&
            ebitda !== null &&
            ebitda > 0
              ? safeDivideRead(short_term_debt + long_term_debt - cash, ebitda)
              : null;
        }

        // ── FU-LF-VALIDATION-STATUS-REFLOW: Recompute validation_status on read ──
        //
        // Root cause: validation_status is set at OCR-parse time and frozen there.
        // After refine corrects the balance scalars, the persisted validation_status
        // remains 'failed' with stale notes (e.g. 'Liabilities (0) + Equity (0)')
        // even for balance-EXACT reports like FPT-2026Q1.
        //
        // Fix (recompute-on-read, mirrors BAL-1a Option R pattern):
        //   Call validateFinancialReport with the NOW-CORRECT latestRow scalars
        //   (after the BAL-1a recompute block above has mutated latestRow).
        //   This kills the stale class corpus-wide without requiring a re-finalize pass.
        //
        // The computed status is used only for OUTPUT (Validation line in summary).
        // It is NOT written back to the DB here — finalizeBctcRefineTool BLOCK-4
        // handles the write-back for future-finalized reports (prong a of the fix).
        //
        // Note: isBankForm is needed for bctcValidator C-5/C-7 guards.
        // We compute bankFormForValidation inline here (before the main bankForm
        // discriminator below) using the same isBankFormFromDb call.
        let computedValidationStatus: { status: string; note: string | null } | undefined;
        {
          const bankFormForValidation = isBankFormFromDb(db, latestRow.id);
          const valResult = validateFinancialReport({
            balanceSheet: {
              totalAssets: latestRow.total_assets,
              totalLiabilities: latestRow.total_liabilities,
              equityTotal: latestRow.equity_total,
              currentAssets: latestRow.current_assets,
              nonCurrentAssets:
                latestRow.total_assets > 0 && latestRow.current_assets > 0
                  ? latestRow.total_assets - latestRow.current_assets
                  : 0,
            },
            incomeStatement: {
              netRevenue: latestRow.net_revenue,
              grossProfit: latestRow.gross_profit,
              netProfit: latestRow.net_profit,
            },
            extractionConfidence: latestRow.extraction_confidence,
            isBankForm: bankFormForValidation,
          });

          let computedStatus: string;
          if (!valResult.isValid) {
            computedStatus = "failed";
          } else if (valResult.warnings.length > 0) {
            computedStatus = "passed_with_warnings";
          } else {
            computedStatus = "passed";
          }

          const note: string | null =
            valResult.errors.length > 0
              ? valResult.errors.slice(0, 2).join("; ")
              : valResult.warnings.length > 0
                ? valResult.warnings.slice(0, 2).join("; ")
                : null;

          computedValidationStatus = { status: computedStatus, note };
        }

        // ── Compute bank-form discriminator ──────────────────────────────
        // BANK-DEV-2: structural signal from bctc_table_rows (3-digit code absence).
        // Domain column is universally "other" in live DB — cannot be used.
        // isBankFormFromDb issues SELECT code FROM bctc_table_rows WHERE report_id = ?
        // and returns true when NO 3-digit numeric codes exist (bank Mẫu B02-TCTD).
        const bankForm = isBankFormFromDb(db, latestRow.id);

        // ── PUB-1..8 Publishability guard ─────────────────────────────────
        // PUB-1: refine_status IN ('DONE', 'PARTIAL')
        // PUB-2: ≥1 extracted row with value_current IS NOT NULL
        // PUB-3: balance sheet has ≥1 non-summary child row (no forced-zero)
        // PUB-4: no REJECTED_SANITY units, or partial rejection warning
        // PUB-5: extraction_confidence ≥ 0.5
        // PUB-6: ratio bounds sanity (|ROA|≤100%, |ROE|≤300%, |NetDebt/EBITDA|≤200x, EPS∈[0,100000])
        // PUB-7: period basis mismatch guard (in buildComparisonSection)
        // PUB-8: parent-only heuristic (Rev=0, NP>0, conf<0.6)
        // If any gate fails, return human-readable refusal — no financial data served.
        // latestRow is passed to avoid a second DB query for PUB-5/6/8 scalar checks.
        const pubCheck = checkPublishability(db, latestRow.id, bankForm, latestRow);
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
        // Pass sanitizedRatios from PUB-6 check (null when gate did not fire).
        // Pass computedValidationStatus (recomputed on-read from corrected scalars).
        const summarySection = buildSummarySection(upperCode, latestRow, bankForm, pubCheck.sanitizedRatios, computedValidationStatus);
        const comparisonSection = buildComparisonSection(db, upperCode, latestRow, bankForm);
        const sentimentSection = buildSentimentSection(db, upperCode);

        const textOutput = [summarySection, "", comparisonSection, "", sentimentSection].join("\n");

        // ── FIX-D: structured_data block ─────────────────────────────────
        // All numeric values are recomputed on read (latestRow has already been
        // mutated by the BAL-1a recompute block above — no stale persisted columns).
        // receivables is queried live from vnstock_balance_sheet.receivables_bn
        // matching the same period (year_report + quarter). Null when absent (honest).
        //
        // Per derived-column-reflow lesson: NEVER serve stale persisted ratios.
        // latestRow.roe / .debt_to_equity are already recomputed-on-read above.
        let receivables: number | null = null;
        try {
          const bsRow = db
            .prepare<BalanceSheetVnstockRow, [string, number, number]>(
              `SELECT receivables_bn
               FROM vnstock_balance_sheet
               WHERE code = ? AND year_report = ? AND quarter = ?
               ORDER BY fetched_at DESC
               LIMIT 1`,
            )
            .get(upperCode, latestRow.period_year, latestRow.period_quarter ?? 0);
          receivables = bsRow != null && bsRow.receivables_bn != null
            ? bsRow.receivables_bn
            : null;
        } catch {
          // vnstock_balance_sheet may not exist in legacy test DBs — safe-degrade to null
          receivables = null;
        }

        const structuredData: BctcStructuredData = {
          // Market valuation ratios (persisted, not recomputed — sourced from market data)
          pe: latestRow.pe ?? null,
          pb: latestRow.pb ?? null,
          // Recomputed-on-read ratios (latestRow mutated by BAL-1a block above)
          roe: latestRow.roe ?? null,
          debt_to_equity: latestRow.debt_to_equity ?? null,
          // Balance sheet scalars (in million VND as stored)
          equity_total: latestRow.equity_total !== undefined ? latestRow.equity_total : null,
          total_assets: latestRow.total_assets !== undefined ? latestRow.total_assets : null,
          total_liabilities: latestRow.total_liabilities !== undefined ? latestRow.total_liabilities : null,
          cash: latestRow.cash !== undefined ? latestRow.cash : null,
          long_term_debt: latestRow.long_term_debt !== undefined ? latestRow.long_term_debt : null,
          // Income statement scalars
          profit_before_tax: latestRow.profit_before_tax !== undefined ? latestRow.profit_before_tax : null,
          operating_cf: latestRow.operating_cf !== undefined ? latestRow.operating_cf : null,
          net_profit: latestRow.net_profit !== undefined ? latestRow.net_profit : null,
          eps: latestRow.eps !== undefined ? latestRow.eps : null,
          net_revenue: latestRow.net_revenue !== undefined ? latestRow.net_revenue : null,
          // Live queried from vnstock_balance_sheet (not persisted in financial_reports)
          receivables,
        };

        // FIX-D: emit two content items:
        //   [0] plain-text summary (UNCHANGED — preserves backwards compat with all consumers)
        //   [1] JSON structured block { structured_data, refine_status, source_tier, fetchedAt }
        //       Machine-readable; downstream skills consume content[1] directly.
        return {
          content: [
            {
              type: "text" as const,
              text: textOutput,
            },
            {
              type: "text" as const,
              text: JSON.stringify({
                structured_data: structuredData,
                refine_status: latestRow.refine_status,
                source_tier: 2,
                fetchedAt: latestRow.published_at,
              }),
            },
          ],
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
