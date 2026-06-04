/**
 * get_agm_plan MCP Tool — RAPID-DATA-LAYER FIX-G
 *
 * Returns AGM planned targets + actual full-year results for a ticker,
 * and computes plan_drift_pct = (full_year_actual - planned) / planned * 100
 * for each metric (revenue/PBT/PAT).
 *
 * Honest null contract:
 *   - plan_drift_pct is null when no plan exists for a metric (e.g. banks
 *     don't publish revenue targets → revenue plan always null for banks).
 *   - actual values are null when no full-year (report_term_id=1) row found.
 *
 * PTID  → metric: 5=revenue, 8=PBT (lợi nhuận trước thuế), 9=PAT (lợi nhuận sau thuế)
 * report_norm_id: 2206=revenue, 2211=PBT, 2212=PAT
 * report_term_id=1 → full-year actual
 *
 * Layer: interface/mcp/tools — imports infrastructure/db directly (MCP tools may).
 *
 * @module interface/mcp/tools/financial-reports/agmPlanTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import {
  getAgmPlan,
  getAgmActuals,
  initAgmPlanTables,
} from "../../../../infrastructure/db/agmPlanStore.js";
import type { AgmPlanRow, AgmActualRow } from "../../../../infrastructure/db/agmPlanStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// PTID / report_norm_id constants
// ─────────────────────────────────────────────────────────────────────────────

// Planned target PTIDs
const PTID_REVENUE = 5; // Doanh thu kế hoạch
const PTID_PBT = 8;     // Lợi nhuận trước thuế kế hoạch
const PTID_PAT = 9;     // Lợi nhuận sau thuế kế hoạch

// Actual report_norm_ids
const NORM_REVENUE = 2206; // Revenue (doanh thu)
const NORM_PBT = 2211;     // PBT (lợi nhuận trước thuế)
const NORM_PAT = 2212;     // PAT (lợi nhuận sau thuế)

// Full-year actual term ID
const TERM_FULL_YEAR = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Output type (exported for test consumers)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanMetric {
  planned_ty: number | null;
  actual_ty: number | null;
  /** (actual - planned) / planned * 100. Null if no plan. */
  plan_drift_pct: number | null;
}

export interface AgmPlanResult {
  ticker: string;
  year: number | null;
  revenue: PlanMetric;
  pbt: PlanMetric;
  pat: PlanMetric;
  planned: AgmPlanRow[];
  actuals: AgmActualRow[];
  fetched_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core computation — injectable DB for tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute plan_drift_pct when both plan and actual are available.
 * Returns null if plan is null (banks) or plan is 0 (division guard).
 */
function computeDrift(
  plannedTy: number | null,
  actualTy: number | null,
): number | null {
  if (plannedTy === null || plannedTy === 0 || actualTy === null) return null;
  return ((actualTy - plannedTy) / plannedTy) * 100;
}

/**
 * Build the AgmPlanResult for a single ticker and optional year.
 * If year is omitted, uses the latest year with plan data.
 */
export function queryAgmPlan(
  db: Database,
  ticker: string,
  year?: number,
): AgmPlanResult {
  const code = ticker.toUpperCase().trim();

  // Ensure tables exist (idempotent for fresh DBs or test DBs)
  initAgmPlanTables(db);

  const allPlanned = getAgmPlan(db, code, year);
  const allActuals = getAgmActuals(db, code, year);

  // Determine the year to use (latest available from DB if not specified)
  // If data is empty, resolvedYear is null (honest: we have no data).
  const latestPlanYear =
    allPlanned.length > 0
      ? Math.max(...allPlanned.map((r) => r.year))
      : null;
  const latestActualYear =
    allActuals.length > 0
      ? Math.max(...allActuals.map((r) => r.year))
      : null;

  // If caller supplied a year, use it only if data exists for that year
  const resolvedYear: number | null = (() => {
    if (year !== undefined) {
      // Check if any row exists for the requested year
      const hasPlan = allPlanned.some((r) => r.year === year);
      const hasActual = allActuals.some((r) => r.year === year);
      return hasPlan || hasActual ? year : null;
    }
    // No year specified — use latest year with any data
    if (latestPlanYear !== null && latestActualYear !== null) {
      return Math.max(latestPlanYear, latestActualYear);
    }
    return latestPlanYear ?? latestActualYear;
  })();

  // Filter to resolved year
  const planned = resolvedYear !== null
    ? allPlanned.filter((r) => r.year === resolvedYear)
    : allPlanned;
  const actuals = resolvedYear !== null
    ? allActuals.filter((r) => r.year === resolvedYear)
    : allActuals;

  // Extract planned values by PTID
  const planRevenue = planned.find((r) => r.ptid === PTID_REVENUE);
  const planPbt = planned.find((r) => r.ptid === PTID_PBT);
  const planPat = planned.find((r) => r.ptid === PTID_PAT);

  // Extract full-year actual values by norm_id (report_term_id = 1)
  const actualRevenue = actuals.find(
    (r) => r.report_norm_id === NORM_REVENUE && r.report_term_id === TERM_FULL_YEAR,
  );
  const actualPbt = actuals.find(
    (r) => r.report_norm_id === NORM_PBT && r.report_term_id === TERM_FULL_YEAR,
  );
  const actualPat = actuals.find(
    (r) => r.report_norm_id === NORM_PAT && r.report_term_id === TERM_FULL_YEAR,
  );

  const plannedRevTy = planRevenue?.value_ty ?? null;
  const plannedPbtTy = planPbt?.value_ty ?? null;
  const plannedPatTy = planPat?.value_ty ?? null;

  const actualRevTy = actualRevenue?.value_ty ?? null;
  const actualPbtTy = actualPbt?.value_ty ?? null;
  const actualPatTy = actualPat?.value_ty ?? null;

  // Latest fetched_at from either table
  const allFetchedAt = [
    ...planned.map((r) => r.fetched_at),
    ...actuals.map((r) => r.fetched_at),
  ];
  const fetchedAt =
    allFetchedAt.length > 0 ? allFetchedAt.sort().at(-1)! : null;

  return {
    ticker: code,
    year: resolvedYear,
    revenue: {
      planned_ty: plannedRevTy,
      actual_ty: actualRevTy,
      plan_drift_pct: computeDrift(plannedRevTy, actualRevTy),
    },
    pbt: {
      planned_ty: plannedPbtTy,
      actual_ty: actualPbtTy,
      plan_drift_pct: computeDrift(plannedPbtTy, actualPbtTy),
    },
    pat: {
      planned_ty: plannedPatTy,
      actual_ty: actualPatTy,
      plan_drift_pct: computeDrift(plannedPatTy, actualPatTy),
    },
    planned,
    actuals,
    fetched_at: fetchedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_agm_plan MCP tool.
 *
 * Tool: get_agm_plan
 * Params:
 *   ticker (required) — stock code, e.g. "FPT"
 *   year   (optional) — plan year, e.g. 2025. Defaults to latest available.
 */
export function registerAgmPlanTools(server: McpServer): void {
  server.tool(
    "get_agm_plan",
    "Get AGM planned targets vs actual full-year results for a ticker. Returns planned revenue/PBT/PAT (tỷ đồng), full-year actuals, and plan_drift_pct = (actual-plan)/plan*100. Honest null when metric has no plan (e.g. banks don't publish revenue plan).",
    {
      ticker: z.string().min(1).max(10).describe("Stock code, e.g. FPT"),
      year: z
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe("Plan year (e.g. 2025). Defaults to latest available year."),
    },
    async ({ ticker, year }) => {
      const db = getDb();
      const result = queryAgmPlan(db, ticker, year);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
