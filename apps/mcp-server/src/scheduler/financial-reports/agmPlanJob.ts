/**
 * AGM Plan Ingest Job — RAPID-DATA-LAYER FIX-G
 *
 * Daily pull-based ingest: fetches AGM planned targets + actuals for the full
 * watchlist from the Vinahost VPS proxy and upserts both tables in market.db.
 *
 * Watchlist source: docs/data/stock-classification.json (SSOT — not hardcoded).
 * VPS endpoint: GET http://125.212.251.27:8765/proxy/agm-plan?batch=T1,T2,...
 * Schedule: daily 20:00 UTC (03:00 VN next day) via CRON_AGM_PLAN env override.
 *
 * Write-wedge guard: row counts verified against DB after write (not echo).
 *
 * @module scheduler/financial-reports/agmPlanJob
 */

import * as fs from "node:fs";
import { fetchAgmPlan } from "../../infrastructure/fetchers/agmPlanFetcher.js";
import { upsertAgmPlan, upsertAgmActuals, initAgmPlanTables } from "../../infrastructure/db/agmPlanStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";
import type { AgmPlanFetchResult } from "../../infrastructure/fetchers/agmPlanFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgmPlanJobResult {
  success: boolean;
  plan_rows_written: number;
  actual_rows_written: number;
  tickers_ok: string[];
  tickers_error: string[];
  error?: string;
}

export interface AgmPlanJobOptions {
  db?: Database;
  fetchFn?: typeof fetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist loader — reads stock-classification.json (same pattern as schema.ts)
// ─────────────────────────────────────────────────────────────────────────────

function loadWatchlistTickers(): string[] {
  try {
    const raw = fs.readFileSync("docs/data/stock-classification.json", "utf-8");
    const d = JSON.parse(raw) as { watchlist?: Array<{ ticker: string }> };
    return (d.watchlist ?? []).map((e) => e.ticker.toUpperCase().trim());
  } catch {
    console.warn("[agmPlanJob] could not read stock-classification.json — empty watchlist");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the AGM plan ingest job.
 *
 * Fetches all watchlist tickers in one batch request, upserts both agm_plan
 * and agm_actuals tables, and returns counts for observability.
 *
 * @param options - Optional DI overrides (db, fetchFn) for unit testing
 */
export async function runAgmPlanJob(
  options?: AgmPlanJobOptions,
): Promise<AgmPlanJobResult> {
  const db = options?.db ?? getDb();
  const fetchFn = options?.fetchFn ?? fetch;

  // Ensure tables exist (idempotent on existing DBs)
  initAgmPlanTables(db);

  const tickers = loadWatchlistTickers();
  if (tickers.length === 0) {
    return {
      success: false,
      plan_rows_written: 0,
      actual_rows_written: 0,
      tickers_ok: [],
      tickers_error: [],
      error: "empty watchlist",
    };
  }

  let result: AgmPlanFetchResult | null = null;
  try {
    result = await fetchAgmPlan(tickers, fetchFn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      plan_rows_written: 0,
      actual_rows_written: 0,
      tickers_ok: [],
      tickers_error: tickers,
      error: msg,
    };
  }

  if (!result) {
    return {
      success: false,
      plan_rows_written: 0,
      actual_rows_written: 0,
      tickers_ok: [],
      tickers_error: tickers,
      error: "VPS fetch returned null",
    };
  }

  // Upsert both tables
  const planWritten = upsertAgmPlan(db, result.plan_rows);
  const actualWritten = upsertAgmActuals(db, result.actual_rows);

  return {
    success: true,
    plan_rows_written: planWritten,
    actual_rows_written: actualWritten,
    tickers_ok: result.tickers_ok,
    tickers_error: result.tickers_error,
  };
}
