/**
 * getContinuityCheckedOhlcvSeries — application/usecases layer
 *
 * Task FIX-OHLCV-CORP-ACTION-CONTINUITY
 *
 * SSOT choke-point for serving a "clean" (never discontinuous) daily_ohlcv
 * series to any downstream consumer (TA indicators, alerts, dashboards).
 * Wraps the domain ohlcvContinuityGuard: fetches the raw chronological
 * series for a ticker, scans it for corp-action boundary discontinuities
 * (bar-to-bar move beyond the instrument's real per-exchange board limit),
 * and either reconciles the pre-boundary bars (when a known adjustment
 * factor is supplied) or excludes the suspect boundary bar entirely — the
 * `bars` field returned here is always safe to serve downstream as-is.
 *
 * DDD layer: application/usecases
 *   - MAY import from: domain/services, infrastructure/db (via injected Database)
 *   - MUST NOT be imported by: domain/
 */

import type { Database } from "bun:sqlite";
import {
  scanOhlcvContinuity,
  reconcileOrFlagBoundary,
  type OhlcvBar,
  type BoundaryDiscontinuity,
  type ReconcileOptions,
} from "../../domain/services/market-data/ohlcvContinuityGuard.js";

export interface ContinuityCheckedOhlcvResult {
  /** Clean series — safe to serve downstream (suspect bars excluded, or the series reconciled) */
  bars: OhlcvBar[];
  /** Dates excluded as suspect corp-action boundary bars (flag+exclude path only) */
  excludedDates: string[];
  /** All flagged discontinuities detected in the window (for logging/telemetry) */
  flags: BoundaryDiscontinuity[];
}

/**
 * Fetches `code`'s daily_ohlcv rows (last `days` rows with close > 0, oldest
 * first) plus its watchlist exchange, runs the continuity guard, and returns
 * a series guaranteed never to contain a raw corp-action-discontinuous bar.
 *
 * @param db                     Injected Database (production singleton or test in-memory)
 * @param code                   Ticker symbol
 * @param days                   Look-back window (row count, not calendar days)
 * @param reconcileOptionsPerBar Optional map of boundary-date -> ReconcileOptions
 *                                (extension point: a future corp-action calendar
 *                                source can supply a known adjustment factor keyed
 *                                by the boundary date; absent = always flag+exclude,
 *                                the live default today)
 */
export function getContinuityCheckedOhlcvSeries(
  db: Database,
  code: string,
  days: number,
  reconcileOptionsPerBar?: Map<string, ReconcileOptions>,
): ContinuityCheckedOhlcvResult {
  // Resolved defensively: an unresolvable exchange (missing watchlist row, or
  // even a missing watchlist table in a degraded/partial DB) must never
  // prevent the raw series from being served — resolveBoardLimitPct(null)
  // already falls back to the widest real VN board limit (15%, UPCOM) in that
  // case, so continuity checking still runs, just less sensitively.
  let exchange: string | null = null;
  try {
    const watchlistRow = db
      .query<{ exchange: string }, [string]>(`SELECT exchange FROM watchlist WHERE code = ?`)
      .get(code);
    exchange = watchlistRow?.exchange ?? null;
  } catch {
    exchange = null;
  }

  const rawRows = db
    .query<OhlcvBar, [string, number]>(
      `SELECT code, date, open, high, low, close, volume
         FROM (SELECT code, date, open, high, low, close, volume
                 FROM daily_ohlcv
                WHERE code = ? AND close > 0
                ORDER BY date DESC
                LIMIT ?)
        ORDER BY date ASC`,
    )
    .all(code, days);

  if (rawRows.length < 2) {
    return { bars: rawRows, excludedDates: [], flags: [] };
  }

  const allResults = scanOhlcvContinuity(rawRows, exchange);
  const flags = allResults.filter((r) => r.flagged);

  if (flags.length === 0) {
    return { bars: rawRows, excludedDates: [], flags: [] };
  }

  let series: OhlcvBar[] = rawRows;
  const excludedDates = new Set<string>();

  for (const flag of flags) {
    const options = reconcileOptionsPerBar?.get(flag.date);
    const result = reconcileOrFlagBoundary(series, flag, options);

    if (result.action === "reconciled" && result.adjustedBars) {
      series = result.adjustedBars;
    } else if (result.action === "flagged" && result.suspectBar) {
      excludedDates.add(result.suspectBar.date);
    }
  }

  const bars = series.filter((b) => !excludedDates.has(b.date));

  return { bars, excludedDates: [...excludedDates], flags };
}
