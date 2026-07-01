/**
 * Infrastructure — Money Radar Store (MONEY-RADAR-P0-T2-COMPOSITE)
 *
 * Read-side queries backing get_money_radar_composite:
 *   - watchlist codes (reused pattern from correlationTools.ts)
 *   - VNINDEX daily closes (from market_prices_history, one sample per day —
 *     same dedup pattern as correlationTools.ts loadPriceHistory())
 *   - per-ticker close+volume bars from daily_ohlcv (C1: close+volume only)
 *   - "new high" flag across the watchlist (D4 axis)
 * Write-side: money_radar_score_history INSERT OR IGNORE (forward-accruing,
 * same discipline as breadthHistoryStore.upsertBreadthRow — first write per
 * session_date wins).
 *
 * DDD layer: infrastructure/db — may use Database, no domain logic beyond
 * simple row shaping.
 *
 * @module infrastructure/db/moneyRadarStore
 */

import type { Database } from "bun:sqlite";
import type { OhlcvBar } from "../../domain/services/market-data/moneyRadarCalculator.js";
import { sqlInClause } from "../../domain/utils/sqlHelpers.js";

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

/** Reads all watchlist codes. Returns [] if table doesn't exist or is empty. */
export function getWatchlistCodes(db: Database): string[] {
  try {
    const rows = db.query<{ code: string }, []>("SELECT code FROM watchlist").all();
    return rows.map((r) => r.code);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// VNINDEX daily closes (D1/D2 index axis)
// ---------------------------------------------------------------------------

/**
 * Returns up to `days` most-recent distinct-day VNINDEX closes, ASC order
 * (oldest first). One sample per calendar day (last record of that day),
 * same dedup approach as correlationTools.ts loadPriceHistory().
 * Source: market_prices_history (code='VNINDEX'), written by vnIndexRefreshJob.
 */
export function getVnIndexDailyCloses(db: Database, days = 30): number[] {
  interface Row {
    price: number;
    fetched_at: string;
  }
  let rows: Row[];
  try {
    rows = db
      .query<Row, []>(
        `SELECT price, fetched_at FROM market_prices_history
         WHERE code = 'VNINDEX'
         ORDER BY fetched_at ASC`,
      )
      .all();
  } catch {
    return [];
  }
  return dedupToDailyCloses(rows, days);
}

interface FetchedRow {
  price: number;
  fetched_at: string;
}

function dedupToDailyCloses(rows: FetchedRow[], days: number): number[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const day = row.fetched_at.slice(0, 10);
    byDay.set(day, row.price); // last record of the day wins (rows are ASC)
  }
  const closes = Array.from(byDay.values());
  return closes.slice(-days);
}

// ---------------------------------------------------------------------------
// Watchlist close+volume bars (C1: daily_ohlcv exposes close+volume only)
// ---------------------------------------------------------------------------

interface OhlcvRow {
  code: string;
  date: string;
  close: number;
  volume: number;
}

/**
 * Returns per-ticker close+volume bars (ASC by date) for the given codes,
 * capped at `maxBarsPerTicker` most-recent bars per ticker.
 * Codes with zero rows are simply absent from the returned map (caller
 * treats missing keys as "no history" — honest-NULL, never fabricated).
 */
export function getWatchlistOhlcvBars(
  db: Database,
  codes: string[],
  maxBarsPerTicker = 30,
): Record<string, OhlcvBar[]> {
  if (codes.length === 0) return {};
  const placeholders = sqlInClause(codes.length);
  let rows: OhlcvRow[];
  try {
    rows = db
      .query<OhlcvRow, string[]>(
        `SELECT code, date, close, volume
           FROM (
             SELECT code, date, close, volume,
                    ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) AS rn
               FROM daily_ohlcv
              WHERE code IN (${placeholders})
                AND close > 0
           ) ranked
          WHERE rn <= ${maxBarsPerTicker}
          ORDER BY code ASC, date ASC`,
      )
      .all(...codes);
  } catch {
    return {};
  }

  const byCode: Record<string, OhlcvBar[]> = {};
  for (const r of rows) {
    (byCode[r.code] ??= []).push({ date: r.date, close: r.close, volume: r.volume });
  }
  return byCode;
}

/**
 * D4 axis: whether ANY ticker in the watchlist made a new high (latest close
 * equals the max close over its available window) today.
 * Returns null when no ticker has enough bars to evaluate (honest-NULL).
 */
export function computeAnyNewHigh(
  perTickerBars: Record<string, OhlcvBar[]>,
  minBars = 5,
): boolean | null {
  let resolved = 0;
  let anyHigh = false;
  for (const bars of Object.values(perTickerBars)) {
    if (bars.length < minBars) continue;
    resolved++;
    const latest = bars[bars.length - 1]!.close;
    const maxClose = Math.max(...bars.map((b) => b.close));
    if (latest >= maxClose) anyHigh = true;
  }
  if (resolved === 0) return null;
  return anyHigh;
}

// ---------------------------------------------------------------------------
// Money Radar score history (forward-accruing; delta_5d support)
// ---------------------------------------------------------------------------

export interface ScoreHistoryPoint {
  session_date: string;
  score: number | null;
}

/**
 * Insert today's composite score into the forward-accruing history table.
 * INSERT OR IGNORE — idempotent, first write per session_date wins (same
 * pattern as breadthHistoryStore.upsertBreadthRow). Best-effort: swallows
 * errors so a history-table hiccup never blocks the composite response.
 */
export function recordDailyScore(db: Database, sessionDate: string, score: number | null): void {
  try {
    db.prepare(
      `INSERT OR IGNORE INTO money_radar_score_history (session_date, score) VALUES (?, ?)`,
    ).run(sessionDate, score);
  } catch {
    // best-effort — history persistence is additive, never blocks the live response
  }
}

/**
 * Returns the last `limit` recorded score-history rows, ASC order (oldest
 * first). Returns [] when the table is empty or missing.
 */
export function getScoreHistory(db: Database, limit = 10): ScoreHistoryPoint[] {
  try {
    const rows = db
      .query<ScoreHistoryPoint, [number]>(
        `SELECT session_date, score FROM money_radar_score_history
         ORDER BY session_date DESC
         LIMIT ?`,
      )
      .all(limit);
    return rows.reverse();
  } catch {
    return [];
  }
}
