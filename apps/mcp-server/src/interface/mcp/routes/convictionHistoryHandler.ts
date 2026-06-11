/**
 * convictionHistoryHandler.ts — GET /api/conviction-history
 *
 * TASK17-CONVICTION endpoint wave:
 * Serve the AI conviction tracker ("Niềm tin AI theo cổ phiếu" page).
 * Shows each stock's current AI conviction score + dominant signal, and its
 * trend over ~2.5 months.
 *
 * Source table: conviction_history.
 * Read path: getConvictionHistoryRows() from convictionHistoryStore (infrastructure).
 * This handler ONLY maps + aggregates — no SQL here.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   766 rows, 52 symbols, span 2026-04-01→2026-06-09
 *   peak_score 0.4–0.73
 *   signal distribution: bearish=291 / neutral=286 / bullish=189
 *   dominant_signal may be NULL — maps to "unknown" (do NOT coerce to neutral)
 *
 * Signal mapping:
 *   'bullish' → "bullish"
 *   'bearish' → "bearish"
 *   'neutral' → "neutral"
 *   NULL or anything else → "unknown"
 *   NOTE: NULL is preserved as "unknown" — not coerced to neutral.
 *
 * Query params:
 *   ?limit=N   — default 2000, clamped [1, 2000]
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:  string,         // ISO 8601 server clock
 *     tradingDate:  string,         // MAX(date) across rows, "" when empty
 *     snapshot: [                   // latest-date, ONE row per symbol, peakScore DESC
 *       { symbol, date, peakScore, signal: "bullish"|"bearish"|"neutral"|"unknown" }
 *     ],
 *     series: {                     // symbol → full history ASC (for sparklines)
 *       "ACB": [ { date, peakScore, signal }, ... ], ...
 *     },
 *     summary: {
 *       symbols:      number,       // distinct symbols in snapshot
 *       bullish:      number,       // count in snapshot
 *       bearish:      number,
 *       neutral:      number,
 *       unknown:      number,
 *       avgPeakScore: number|null,  // mean peakScore over snapshot; null when empty
 *       topBullish:   [ up to 5 snapshot items, signal=bullish, peakScore DESC ],
 *       topBearish:   [ up to 5 snapshot items, signal=bearish, peakScore DESC ]
 *     },
 *     count: number                 // snapshot.length
 *   }
 *
 * 200 + empty snapshot/series/summary(zeroed, avgPeakScore null) when table empty (NO error).
 * 500 on DB error (mirrors predictionClaims catch block).
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from convictionHistoryStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getConvictionHistoryRows,
  type ConvictionRow,
} from "../../../infrastructure/db/convictionHistoryStore.js";
import { computeStaleness } from "./_staleness.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Signal value in the response. NULL → "unknown". */
export type ConvictionSignal = "bullish" | "bearish" | "neutral" | "unknown";

/** One item in the snapshot array (latest date, one per symbol). */
export interface ConvictionSnapshotItem {
  symbol: string;
  date: string;
  peakScore: number;
  signal: ConvictionSignal;
}

/** One data point in a symbol's sparkline series. */
export interface ConvictionSeriesPoint {
  date: string;
  peakScore: number;
  signal: ConvictionSignal;
}

/** Summary block. */
export interface ConvictionSummary {
  symbols: number;
  bullish: number;
  bearish: number;
  neutral: number;
  unknown: number;
  /** Mean peakScore over snapshot rows; null when snapshot is empty. */
  avgPeakScore: number | null;
  /** Up to 5 snapshot items with signal=bullish, sorted peakScore DESC. */
  topBullish: ConvictionSnapshotItem[];
  /** Up to 5 snapshot items with signal=bearish, sorted peakScore DESC. */
  topBearish: ConvictionSnapshotItem[];
}

/** Staleness threshold for conviction-history data: 2 calendar days. */
export const CONVICTION_STALENESS_THRESHOLD_DAYS = 2;

/** Full response body for GET /api/conviction-history. */
export interface ConvictionHistoryResponse {
  generatedAt: string;
  tradingDate: string;
  /** true when tradingDate is more than 2 calendar days old */
  stale: boolean;
  /** Calendar days past the 2-day staleness threshold (0 when not stale) */
  staleByDays: number;
  snapshot: ConvictionSnapshotItem[];
  series: Record<string, ConvictionSeriesPoint[]>;
  summary: ConvictionSummary;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a raw dominant_signal DB value to a typed ConvictionSignal.
 * Only 'bullish', 'bearish', 'neutral' are passed through; everything else
 * (including NULL) maps to "unknown" — preserves honest uncertainty.
 * Exported for unit testing.
 */
export function mapSignal(dominant_signal: string | null): ConvictionSignal {
  if (dominant_signal === "bullish") return "bullish";
  if (dominant_signal === "bearish") return "bearish";
  if (dominant_signal === "neutral") return "neutral";
  return "unknown";
}

/**
 * Build the snapshot: latest-date row per symbol, sorted peakScore DESC.
 *
 * Algorithm:
 *   1. rows are already sorted ASC by (date, symbol) from the store — iterate
 *      forward; last write to symbolMap[symbol] wins (= MAX(date) per symbol).
 *   2. Sort the resulting entries peakScore DESC.
 *
 * Exported for unit testing.
 */
export function buildSnapshot(rows: ConvictionRow[]): ConvictionSnapshotItem[] {
  const symbolMap = new Map<string, ConvictionSnapshotItem>();

  for (const row of rows) {
    // Since rows are ASC by date, the last row written per symbol is MAX(date).
    symbolMap.set(row.symbol, {
      symbol: row.symbol,
      date: row.date,
      peakScore: row.peak_score,
      signal: mapSignal(row.dominant_signal),
    });
  }

  // Sort snapshot by peakScore DESC (highest conviction first)
  return Array.from(symbolMap.values()).sort((a, b) => b.peakScore - a.peakScore);
}

/**
 * Build the series map: symbol → full history ASC (for sparklines).
 *
 * All rows (including non-latest) are included; order comes from the store
 * (date ASC, symbol ASC).
 *
 * Exported for unit testing.
 */
export function buildSeries(
  rows: ConvictionRow[],
): Record<string, ConvictionSeriesPoint[]> {
  const series: Record<string, ConvictionSeriesPoint[]> = {};

  for (const row of rows) {
    const pts = series[row.symbol];
    const point: ConvictionSeriesPoint = {
      date: row.date,
      peakScore: row.peak_score,
      signal: mapSignal(row.dominant_signal),
    };
    if (pts) {
      pts.push(point);
    } else {
      series[row.symbol] = [point];
    }
  }

  return series;
}

/**
 * Compute average peakScore over a list of snapshot items.
 * Returns null when items is empty (guards divide-by-zero).
 * Exported for unit testing.
 */
export function computeAvg(items: ConvictionSnapshotItem[]): number | null {
  if (items.length === 0) return null;
  const sum = items.reduce((acc, item) => acc + item.peakScore, 0);
  return sum / items.length;
}

/**
 * Build summary block from the snapshot.
 * Signal counts are over snapshot rows (latest date per symbol, not all rows).
 * topBullish / topBearish: up to 5, peakScore DESC, pre-filtered by signal.
 * Exported for unit testing.
 */
export function buildSummary(snapshot: ConvictionSnapshotItem[]): ConvictionSummary {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  let unknown = 0;

  for (const item of snapshot) {
    if (item.signal === "bullish") bullish++;
    else if (item.signal === "bearish") bearish++;
    else if (item.signal === "neutral") neutral++;
    else unknown++;
  }

  const avgPeakScore = computeAvg(snapshot);

  // topBullish: snapshot items already DESC by peakScore; filter + take 5
  const topBullish = snapshot
    .filter((i) => i.signal === "bullish")
    .slice(0, 5);

  // topBearish: same filter; snapshot is already peakScore DESC
  const topBearish = snapshot
    .filter((i) => i.signal === "bearish")
    .slice(0, 5);

  return {
    symbols: snapshot.length,
    bullish,
    bearish,
    neutral,
    unknown,
    avgPeakScore,
    topBullish,
    topBearish,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/conviction-history.
 *
 * @param req  - Incoming HTTP request (reads ?limit= query param)
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetConvictionHistory(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Parse ?limit= param — default 2000, clamp [1, 2000]
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const rows = getConvictionHistoryRows(db, limit);

    // tradingDate = MAX(date) across all rows; "" when empty
    const tradingDate = rows.length > 0
      ? rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0]!.date)
      : "";

    const snapshot = buildSnapshot(rows);
    const series = buildSeries(rows);
    const summary = buildSummary(snapshot);

    // Staleness — threshold 2 calendar days (conviction data fetched daily)
    const { stale, staleByDays } = computeStaleness(
      tradingDate || null,
      CONVICTION_STALENESS_THRESHOLD_DAYS,
      now,
    );

    const body: ConvictionHistoryResponse = {
      generatedAt: now.toISOString(),
      tradingDate,
      stale,
      staleByDays,
      snapshot,
      series,
      summary,
      count: snapshot.length,
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
