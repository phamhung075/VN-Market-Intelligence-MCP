/**
 * Evening Summary — Step 4: TA signals for all watchlist tickers + RSI-14
 * threading into watchlistMovers.
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Unlike morning briefing's computeTaSummary (which filters to non-neutral
 * signals only), this step keeps ALL signals — the display filter is applied
 * downstream in eveningSummaryJob.ts.
 *
 * Layer: application/usecases/eveningSummary — may import from infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { defaultComputeTa } from "../assembleBriefing.js";
import type { TaSignal } from "../assembleBriefing.js";
import type { TaDiag, WatchlistMover } from "./types.js";

interface WatchlistCodeRow {
  code: string;
}

/**
 * Default production implementation: COUNT(*) of daily_ohlcv rows for a ticker.
 * Returns 0 if the table does not exist yet (graceful degradation during DB migrations).
 */
function defaultGetOhlcvRowCount(code: string, db: Database): number {
  try {
    const row = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?",
      )
      .get(code);
    return row?.cnt ?? 0;
  } catch {
    // Table may not exist in older DB schemas — treat as 0 rows
    return 0;
  }
}

/**
 * Runs `computeTaFn` (defaultComputeTa unless overridden for tests) over every
 * watchlist ticker, collects TaDiag observability counts, then threads each
 * signal's rsi14 into the matching `watchlistMovers` entry by code (mutates
 * the array in place — movers default to rsi14=null from queryWatchlistMovers).
 */
export async function computeTaSummaryStep(
  db: Database,
  watchlistMovers: WatchlistMover[],
  computeTaFn?: (code: string, db: Database) => TaSignal | null | Promise<TaSignal | null>,
  getOhlcvRowCountFn?: (code: string, db: Database) => number,
): Promise<{ taSummary: TaSignal[]; taDiag: TaDiag }> {
  const taFn = computeTaFn ?? defaultComputeTa;
  const rowCountFn = getOhlcvRowCountFn ?? defaultGetOhlcvRowCount;
  let taSummary: TaSignal[] = [];
  let taDiag: TaDiag = { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 };
  try {
    const watchlistRows = db
      .prepare<WatchlistCodeRow, []>("SELECT code FROM watchlist")
      .all();
    const signals: TaSignal[] = [];
    const rowCounts: number[] = [];
    let withSignal = 0;
    let belowThreshold = 0;
    for (const { code } of watchlistRows) {
      try {
        const cnt = rowCountFn(code, db);
        rowCounts.push(cnt);
        if (cnt < 8) belowThreshold++;
        const sig = await Promise.resolve(taFn(code, db));
        if (sig !== null) { signals.push(sig); withSignal++; }
      } catch {
        rowCounts.push(0);
        /* per-ticker: swallow, continue */
      }
    }
    taSummary = signals;
    taDiag = {
      tickersWithSignal: withSignal,
      tickersBelowThreshold: belowThreshold,
      ohlcvRowsMin: rowCounts.length > 0 ? Math.min(...rowCounts) : 0,
      ohlcvRowsMax: rowCounts.length > 0 ? Math.max(...rowCounts) : 0,
    };

    // ── Thread RSI-14 from taSummary into watchlistMovers ────────────────
    // taSummary is keyed by code; movers default to rsi14=null (set by queryWatchlistMovers).
    // When a signal exists for a mover's code, copy its rsi14 value.
    if (signals.length > 0) {
      const rsiMap = new Map<string, number | null>(
        signals.map((s) => [s.code, s.rsi14]),
      );
      for (const mover of watchlistMovers) {
        if (rsiMap.has(mover.code)) {
          mover.rsi14 = rsiMap.get(mover.code) ?? null;
        }
      }
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] TA step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // taDiag stays at zero-default — no crash
  }

  return { taSummary, taDiag };
}
