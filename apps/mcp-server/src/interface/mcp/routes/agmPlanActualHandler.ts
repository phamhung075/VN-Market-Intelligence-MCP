/**
 * agmPlanActualHandler.ts — GET /api/agm-plan-actual
 *
 * TASK17-AGM endpoint wave:
 * Serve AGM plan-vs-actual delivery analysis for the "Kế hoạch vs Thực hiện" page.
 *
 * Source tables: agm_plan (planned targets) + agm_actuals (reported values).
 * Join dimension: (stock_code, year, ptid).
 * Full-year actual: agm_actuals row with report_term_id = 1.
 *
 * PTID vocabulary (same on both tables):
 *   5 = "Doanh thu"          (revenue)
 *   8 = "Lợi nhuận trước thuế" (pre-tax profit / PBT)
 *   9 = "Lợi nhuận sau thuế"   (after-tax profit / PAT)
 *
 * report_term_id semantics (authoritative — agmPlanFetcher.ts:9):
 *   1 = full-year, 2 = Q1, 3 = Q2, 4 = Q3/Q4, 5 = H1
 *   => comparison actual is the row with report_term_id = 1.
 *
 * Computation per (stock_code, year, ptid):
 *   completion_pct = 100 * actual_ty / plan_ty   (plan_ty = 0 → null)
 * Classification (only when full-year actual exists):
 *   EXCEEDED  >= 100
 *   ON_TRACK  >= 90 and < 100
 *   BEHIND    < 90
 *   IN_PROGRESS: full-year actual absent (open year or not yet filed)
 *
 * OPEN-YEAR GUARD (critical — see task spec):
 *   If no report_term_id=1 row exists for (stock, year, ptid):
 *     status = "IN_PROGRESS", actual_ty = null, completion_pct = null.
 *   Never render an open year as 0% / BEHIND.
 *   Optionally include latest YTD term value as ytd_ty + ytd_term_id for context.
 *
 * Query params:
 *   ?year=YYYY  — default = defaultYear (latest closed year with full-year actuals)
 *   ?limit=N    — default 200, clamped [1, 500]
 *
 * Response: 200 + JSON envelope on success (200 + empty items[] when no data).
 * 500 on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Store functions from agmPlanStore.ts are reused; a new bulk-query helper
 * `queryAgmPlanActual` is added to agmPlanStore.ts for this endpoint.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  queryAgmPlanActual,
  type AgmPlanActualItem,
} from "../../../infrastructure/db/agmPlanStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const PTID_LABELS: Record<number, string> = {
  5: "Doanh thu",
  8: "Lợi nhuận trước thuế",
  9: "Lợi nhuận sau thuế",
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AgmStatus = "EXCEEDED" | "ON_TRACK" | "BEHIND" | "IN_PROGRESS";

/** One metric row (one ptid) within a stock-year entry. */
export interface AgmMetric {
  ptid: number;
  label: string;
  plan_ty: number | null;
  actual_ty: number | null;
  completion_pct: number | null;
  status: AgmStatus;
  ytd_ty: number | null;
  ytd_term_id: number | null;
}

/** One stock-year item in the response. */
export interface AgmPlanActualStockItem {
  stockCode: string;
  year: number;
  metrics: AgmMetric[];
}

/** Summary counts over the served year's metric rows. */
export interface AgmPlanActualSummary {
  year: number;
  exceeded: number;
  onTrack: number;
  behind: number;
  inProgress: number;
  total: number;
}

/** Full response body for GET /api/agm-plan-actual. */
export interface AgmPlanActualResponse {
  generatedAt: string;
  defaultYear: number | null;
  availableYears: number[];
  items: AgmPlanActualStockItem[];
  summary: AgmPlanActualSummary;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify completion_pct into a status string.
 * Returns IN_PROGRESS when pct is null (full-year actual missing).
 * Exported for unit testing.
 */
export function classifyStatus(pct: number | null): AgmStatus {
  if (pct === null) return "IN_PROGRESS";
  if (pct >= 100) return "EXCEEDED";
  if (pct >= 90) return "ON_TRACK";
  return "BEHIND";
}

/**
 * Compute completion_pct safely.
 * Returns null if plan_ty is 0, null, or actual is null (prevents divide-by-zero).
 * Exported for unit testing.
 */
export function computeCompletionPct(
  plan_ty: number | null,
  actual_ty: number | null,
): number | null {
  if (plan_ty === null || plan_ty === 0 || actual_ty === null) return null;
  return (100 * actual_ty) / plan_ty;
}

/**
 * Build the metrics array for a (stockCode, year) pair from raw store rows.
 * Groups by ptid: plan row + full-year actual (term_id=1) + latest YTD (best available non-1 term).
 * Exported for testability.
 */
export function buildMetrics(rows: AgmPlanActualItem[]): AgmMetric[] {
  // Group by ptid
  const byPtid = new Map<number, AgmPlanActualItem[]>();
  for (const row of rows) {
    const list = byPtid.get(row.ptid) ?? [];
    list.push(row);
    byPtid.set(row.ptid, list);
  }

  const metrics: AgmMetric[] = [];

  for (const [ptid, ptRows] of byPtid) {
    const planRow = ptRows.find((r) => r.source === "plan") ?? null;
    const fullYearRow = ptRows.find((r) => r.source === "actual" && r.report_term_id === 1) ?? null;
    // YTD = latest non-1 term (highest term_id as proxy for most recent within year)
    const ytdRow =
      ptRows
        .filter((r) => r.source === "actual" && r.report_term_id !== 1)
        .sort((a, b) => (b.report_term_id ?? 0) - (a.report_term_id ?? 0))[0] ?? null;

    const plan_ty = planRow?.value_ty ?? null;
    const actual_ty = fullYearRow?.value_ty ?? null;
    const pct = computeCompletionPct(plan_ty, actual_ty);
    const status = classifyStatus(pct);

    metrics.push({
      ptid,
      label: PTID_LABELS[ptid] ?? `ptid_${ptid}`,
      plan_ty: plan_ty ?? null,
      actual_ty: actual_ty ?? null,
      completion_pct: pct !== null ? Math.round(pct * 10) / 10 : null,
      status,
      ytd_ty: ytdRow?.value_ty ?? null,
      ytd_term_id: ytdRow?.report_term_id ?? null,
    });
  }

  // Stable order: ptid ascending (5, 8, 9)
  metrics.sort((a, b) => a.ptid - b.ptid);

  return metrics;
}

/**
 * Build summary counts from a flat list of metrics.
 * Exported for testability.
 */
export function buildAgmSummary(
  year: number,
  allMetrics: AgmMetric[],
): AgmPlanActualSummary {
  let exceeded = 0;
  let onTrack = 0;
  let behind = 0;
  let inProgress = 0;

  for (const m of allMetrics) {
    if (m.status === "EXCEEDED") exceeded++;
    else if (m.status === "ON_TRACK") onTrack++;
    else if (m.status === "BEHIND") behind++;
    else inProgress++;
  }

  return {
    year,
    exceeded,
    onTrack,
    behind,
    inProgress,
    total: allMetrics.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query AGM plan-vs-actual data for a given year and limit.
 *
 * Returns:
 *   - defaultYear: latest year that has at least one full-year (term_id=1) actual
 *   - availableYears: all distinct years in agm_plan DESC
 *   - items: per-(stockCode, year) list with metrics
 *   - raw allMetrics for summary computation
 *
 * @param db    - SQLite database instance (injected)
 * @param year  - Year to serve (defaults to defaultYear if null)
 * @param limit - Max stock items to return (default 200, clamped [1, 500])
 */
export function queryAgmPlanActualForYear(
  db: Database,
  year: number | null,
  limit: number = DEFAULT_LIMIT,
): {
  defaultYear: number | null;
  availableYears: number[];
  items: AgmPlanActualStockItem[];
  allMetrics: AgmMetric[];
} {
  const clampedLimit = Math.min(MAX_LIMIT, Math.max(1, isNaN(limit) ? DEFAULT_LIMIT : limit));

  // Find defaultYear: latest year that has at least one full-year actual
  const defaultYearRow = db
    .prepare<{ year: number }, []>(
      `SELECT MAX(a.year) AS year
       FROM agm_actuals a
       WHERE a.report_term_id = 1`,
    )
    .get() as { year: number | null } | null;
  const defaultYear = defaultYearRow?.year ?? null;

  // Available years: distinct years in agm_plan DESC
  const availableYearRows = db
    .prepare<{ year: number }, []>(
      `SELECT DISTINCT year FROM agm_plan ORDER BY year DESC`,
    )
    .all() as { year: number }[];
  const availableYears = availableYearRows.map((r) => r.year);

  const serveYear = year ?? defaultYear;
  if (serveYear === null) {
    // No data at all
    return { defaultYear: null, availableYears, items: [], allMetrics: [] };
  }

  // Fetch all raw rows from the store for the target year
  const rawRows = queryAgmPlanActual(db, serveYear);

  // Group by stock_code
  const byStock = new Map<string, AgmPlanActualItem[]>();
  for (const row of rawRows) {
    const list = byStock.get(row.stock_code) ?? [];
    list.push(row);
    byStock.set(row.stock_code, list);
  }

  // Build stock items, sorted by stock_code for stable output, limited
  const stockCodes = [...byStock.keys()].sort().slice(0, clampedLimit);

  const items: AgmPlanActualStockItem[] = [];
  const allMetrics: AgmMetric[] = [];

  for (const code of stockCodes) {
    const rows = byStock.get(code)!;
    const metrics = buildMetrics(rows);
    items.push({ stockCode: code, year: serveYear, metrics });
    allMetrics.push(...metrics);
  }

  return { defaultYear, availableYears, items, allMetrics };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/agm-plan-actual.
 *
 * @param req  - Incoming HTTP request (reads ?year= and ?limit= query params)
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetAgmPlanActual(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    const yearParam = url.searchParams.get("year");
    const year = yearParam ? (parseInt(yearParam, 10) || null) : null;

    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const { defaultYear, availableYears, items, allMetrics } = queryAgmPlanActualForYear(
      db,
      year,
      limit,
    );

    const serveYear = year ?? defaultYear;
    const summary = buildAgmSummary(serveYear ?? 0, allMetrics);

    const body: AgmPlanActualResponse = {
      generatedAt: now.toISOString(),
      defaultYear,
      availableYears,
      items,
      summary,
      count: items.length,
    };

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
