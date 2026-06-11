/**
 * fedRatesHandler.ts — GET /api/fed-rates
 *
 * TASK17-PAGE17 endpoint:
 * US Federal Reserve EFFR & IORB rate time-series plus the EFFR–IORB
 * liquidity spread. Data backend for the "Lãi suất Fed Mỹ" analyst page.
 *
 * Source table: fred_series_daily (stored-data-only; NO live network calls).
 * Read path: fetchEffrIorbSamples (infrastructure) + computeFedLiquiditySpread (domain).
 * NO SQL in this handler — db injected by server.ts; all DB access goes through
 * fetchEffrIorbSamples.
 *
 * Fixed lookback: 180 days (full-window page, no query param).
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:  string,              // ISO 8601 server clock
 *     asOf:         string | null,       // latest paired date, null when empty
 *     effr:         number | null,       // latest EFFR (%)
 *     iorb:         number | null,       // latest IORB (%)
 *     spread:       number | null,       // latest EFFR − IORB (%)
 *     trend30d:     string | null,       // "widening"|"narrowing"|"stable"|null
 *     sampleCount:  number,              // total paired rows in window
 *     series:       FedRateSeriesRow[]   // ascending by date, length === sampleCount
 *   }
 *
 * 200 + honest empty-state when no paired rows (asOf/effr/iorb/spread/trend30d all null,
 * sampleCount 0, series []).
 * Only GET is served; other methods → 405.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports: fetchEffrIorbSamples (infrastructure/db), computeFedLiquiditySpread (domain).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { fetchEffrIorbSamples } from "../../../infrastructure/db/fredQueries.js";
import {
  computeFedLiquiditySpread,
} from "../../../domain/services/macro/computeFedLiquiditySpread.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed lookback window — full-window page like the financials screener. */
const LOOKBACK_DAYS = 180;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One row in the time-series array. */
export interface FedRateSeriesRow {
  date: string;
  effr: number;
  iorb: number;
  spread: number;  // round(effr − iorb, 4)
}

/** Full response body for GET /api/fed-rates. */
export interface FedRatesResponse {
  generatedAt: string;
  asOf: string | null;
  effr: number | null;
  iorb: number | null;
  spread: number | null;
  trend30d: string | null;
  sampleCount: number;
  series: FedRateSeriesRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round a number to `dp` decimal places (standard JS Math.round semantics).
 *
 * @param value  The number to round.
 * @param dp     Decimal places (must be 0–15).
 * @returns      Rounded number.
 */
export function roundDp(value: number, dp: number): number {
  const factor = Math.pow(10, dp);
  return Math.round(value * factor) / factor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate the GET /api/fed-rates response.
 * Called by the HTTP handler with an injected DB instance.
 *
 * @param db - SQLite database instance (injected by server.ts — NO getDb() here)
 * @returns FedRatesResponse object (caller serialises to JSON)
 */
export function handleGetFedRates(db: Database): FedRatesResponse {
  const generatedAt = new Date().toISOString();

  const samples = fetchEffrIorbSamples(db, LOOKBACK_DAYS);

  // Empty-state guard — do NOT let InsufficientDataError escape.
  if (samples.length === 0) {
    return {
      generatedAt,
      asOf: null,
      effr: null,
      iorb: null,
      spread: null,
      trend30d: null,
      sampleCount: 0,
      series: [],
    };
  }

  const summary = computeFedLiquiditySpread(samples);

  const series: FedRateSeriesRow[] = samples.map((s) => ({
    date: s.date,
    effr: s.effr,
    iorb: s.iorb,
    spread: roundDp(s.effr - s.iorb, 4),
  }));

  return {
    generatedAt,
    asOf: summary.asOf,
    effr: summary.effr,
    iorb: summary.iorb,
    spread: summary.spread,  // use domain value — do NOT re-round
    trend30d: summary.trend30d,
    sampleCount: summary.samples,
    series,
  };
}

/**
 * Handle GET /api/fed-rates.
 * Only GET is served; other methods → 405 Method Not Allowed.
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetFedRatesHttp(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  try {
    const body = handleGetFedRates(db);
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
