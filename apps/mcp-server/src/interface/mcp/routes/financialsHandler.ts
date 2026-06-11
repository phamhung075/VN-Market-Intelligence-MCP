/**
 * financialsHandler.ts — GET /api/financials
 *
 * TASK17-PAGE16 endpoint:
 * Cross-sectional Valuation & Fundamentals Screener.
 * One row per code (latest period), universe-wide (no per-code filter).
 * Distinct in shape from the per-code shareholders/officers endpoints —
 * this is a full-universe screener with summary medians and rankings.
 *
 * Source table: vnstock_financials (stored-data-only; NO live network calls).
 * Read path: financialsStore (infrastructure) — NO SQL in this handler.
 * This handler ONLY maps + aggregates — db injected by server.ts.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   79 rows, 78 distinct codes, fresh through 2026-06-10.
 *   MBS has 2 periods — latest wins via NOT EXISTS correlated subquery.
 *   All key columns (pe,pb,roe,roa,revenue_bn,net_profit_bn,eps) are non-null.
 *   Expected live medians (78 codes, 0-based floor(n/2) = index 39):
 *     medianPe ≈ 14.09, medianPb ≈ 1.62, medianRoe ≈ 12.53.
 *
 * Query params: NONE (full-universe screener — no filtering).
 *   Unknown params are silently ignored.
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:  string,              // ISO 8601 server clock
 *     asOf:         string | null,       // MAX(fetched_at) across table
 *     count:        number,              // rows.length
 *     rows:         ScreenerRow[],       // one per code, ordered code ASC
 *     summary:      ScreenerSummary,     // count + medianPe/Pb/Roe
 *     rankings:     ScreenerRankings     // cheapestPe / highestRoe / highestRevenueYoy
 *   }
 *
 * 200 + empty state when table has no rows (NO error).
 * 500 JSON {error:"db_error"} on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from financialsStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getLatestPerCode,
  getAsOf,
  type FinancialRow,
} from "../../../infrastructure/db/financialsStore.js";
import { computeStaleness } from "./_staleness.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One row in the screener response — latest period per code. */
export interface ScreenerRow {
  code: string;
  period: string;          // e.g. "2024Q4" — `${yearReport}Q${quarter}`
  yearReport: number;
  quarter: number;
  revenueBn: number | null;
  revenueYoy: number | null;
  netProfitBn: number | null;
  netProfitYoy: number | null;
  eps: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  netProfitMargin: number | null;
  nim: number | null;
  npl: number | null;
}

/** Summary statistics for the full universe. */
export interface ScreenerSummary {
  count: number;
  medianPe: number | null;
  medianPb: number | null;
  medianRoe: number | null;
}

/** Cheapest PE entry. */
export interface CheapestPeEntry {
  code: string;
  pe: number | null;
  roe: number | null;
}

/** Highest ROE entry. */
export interface HighestRoeEntry {
  code: string;
  roe: number | null;
  pe: number | null;
}

/** Highest Revenue YoY entry. */
export interface HighestRevenueYoyEntry {
  code: string;
  revenueYoy: number | null;
}

/** Rankings block. */
export interface ScreenerRankings {
  cheapestPe: CheapestPeEntry[];
  highestRoe: HighestRoeEntry[];
  highestRevenueYoy: HighestRevenueYoyEntry[];
}

/** Staleness threshold for financials data: 14 calendar days. */
export const FINANCIALS_STALENESS_THRESHOLD_DAYS = 14;

/** Full response body for GET /api/financials. */
export interface FinancialsResponse {
  generatedAt: string;
  asOf: string | null;
  /** true when asOf is more than 14 calendar days old */
  stale: boolean;
  /** Calendar days past the 14-day staleness threshold (0 when not stale) */
  staleByDays: number;
  count: number;
  rows: ScreenerRow[];
  summary: ScreenerSummary;
  rankings: ScreenerRankings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the median of a number array.
 *
 * Definition (LOAD-BEARING — do NOT change):
 *   - Filter to finite numbers only (drops null, NaN, Infinity).
 *   - Sort ASCENDING.
 *   - Return sorted[Math.floor(sorted.length / 2)] rounded to 2 dp.
 *   - Return null if no finite values remain.
 *
 * Note: this uses the 0-based floor(n/2) index, NOT the average of two middle
 * elements. For n=78, index = 39 (0-based), which is the 40th element.
 *
 * @param values - Raw numeric values (may include nulls — caller passes mapped array)
 * @returns Median rounded to 2 dp, or null if empty
 */
export function computeMedian(values: (number | null | undefined)[]): number | null {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length === 0) return null;
  finite.sort((a, b) => a - b);
  const idx = Math.floor(finite.length / 2);
  // idx is safe: finite.length >= 1 guarantees idx >= 0
  const val = finite[idx];
  if (val == null) return null;
  return Math.round(val * 100) / 100;
}

/**
 * Map a FinancialRow (store output, camelCase) to a ScreenerRow (handler output).
 * Numeric metric values are passed through UNROUNDED (let the frontend format).
 * Only the `period` string is synthesised here.
 *
 * @param row - FinancialRow from the store
 * @returns ScreenerRow ready for the response
 */
export function mapRow(row: FinancialRow): ScreenerRow {
  return {
    code:             row.code,
    period:           `${row.yearReport}Q${row.quarter}`,
    yearReport:       row.yearReport,
    quarter:          row.quarter,
    revenueBn:        row.revenueBn,
    revenueYoy:       row.revenueYoy,
    netProfitBn:      row.netProfitBn,
    netProfitYoy:     row.netProfitYoy,
    eps:              row.eps,
    pe:               row.pe,
    pb:               row.pb,
    roe:              row.roe,
    roa:              row.roa,
    debtToEquity:     row.debtToEquity,
    netProfitMargin:  row.netProfitMargin,
    nim:              row.nim,
    npl:              row.npl,
  };
}

/**
 * Build the summary block from screener rows.
 * Medians are rounded to 2 dp by computeMedian.
 *
 * @param rows - ScreenerRow[] (full universe)
 * @returns ScreenerSummary
 */
export function buildSummary(rows: ScreenerRow[]): ScreenerSummary {
  return {
    count:     rows.length,
    medianPe:  computeMedian(rows.map((r) => r.pe)),
    medianPb:  computeMedian(rows.map((r) => r.pb)),
    medianRoe: computeMedian(rows.map((r) => r.roe)),
  };
}

/**
 * Build the rankings block from screener rows.
 *
 * cheapestPe:       top 5 rows WHERE pe > 0, sorted pe ASC then code ASC.
 * highestRoe:       top 5 rows (all), sorted roe DESC then code ASC.
 * highestRevenueYoy: top 5 rows (all), sorted revenueYoy DESC then code ASC.
 *
 * Null values sort last in both directions (they are excluded from the pe>0 filter
 * automatically since null > 0 is false).
 *
 * @param rows - ScreenerRow[] (full universe)
 * @returns ScreenerRankings
 */
export function buildRankings(rows: ScreenerRow[]): ScreenerRankings {
  // cheapestPe — pe > 0 only, sort pe ASC then code ASC, top 5
  const cheapestPe: CheapestPeEntry[] = rows
    .filter((r) => r.pe != null && r.pe > 0)
    .sort((a, b) => {
      const peDiff = (a.pe ?? 0) - (b.pe ?? 0);
      if (peDiff !== 0) return peDiff;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 5)
    .map((r) => ({ code: r.code, pe: r.pe, roe: r.roe }));

  // highestRoe — all rows, sort roe DESC (null last) then code ASC, top 5
  const highestRoe: HighestRoeEntry[] = [...rows]
    .sort((a, b) => {
      if (a.roe == null && b.roe == null) return a.code.localeCompare(b.code);
      if (a.roe == null) return 1;
      if (b.roe == null) return -1;
      const diff = b.roe - a.roe;
      if (diff !== 0) return diff;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 5)
    .map((r) => ({ code: r.code, roe: r.roe, pe: r.pe }));

  // highestRevenueYoy — all rows, sort revenueYoy DESC (null last) then code ASC, top 5
  const highestRevenueYoy: HighestRevenueYoyEntry[] = [...rows]
    .sort((a, b) => {
      if (a.revenueYoy == null && b.revenueYoy == null) return a.code.localeCompare(b.code);
      if (a.revenueYoy == null) return 1;
      if (b.revenueYoy == null) return -1;
      const diff = b.revenueYoy - a.revenueYoy;
      if (diff !== 0) return diff;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 5)
    .map((r) => ({ code: r.code, revenueYoy: r.revenueYoy }));

  return { cheapestPe, highestRoe, highestRevenueYoy };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate the GET /api/financials response.
 * Called by the HTTP handler with an injected DB instance.
 * Pure-ish (deterministic given same DB state) — can be called directly in tests.
 * No query params needed — full-universe screener with no filtering.
 *
 * @param db  - SQLite database instance (injected by server.ts — NO getDb() here)
 * @param now - Optional clock override for staleness testing (defaults to new Date())
 * @returns FinancialsResponse object (caller serialises to JSON)
 */
export function handleGetFinancials(db: Database, now: Date = new Date()): FinancialsResponse {
  const rawRows = getLatestPerCode(db);
  const asOf = getAsOf(db);
  const rows = rawRows.map(mapRow);
  const summary = buildSummary(rows);
  const rankings = buildRankings(rows);

  // Staleness — threshold 14 calendar days (financials updated quarterly)
  const { stale, staleByDays } = computeStaleness(asOf, FINANCIALS_STALENESS_THRESHOLD_DAYS, now);

  return {
    generatedAt: now.toISOString(),
    asOf,
    stale,
    staleByDays,
    count: rows.length,
    rows,
    summary,
    rankings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/financials.
 * Unknown query params are silently ignored.
 *
 * @param req - Incoming HTTP request (no query params consumed)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetFinancialsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const body = handleGetFinancials(db, new Date());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
