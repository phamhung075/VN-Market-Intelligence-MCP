/**
 * Evening Summary — shared public output types.
 *
 * Extracted from assembleEveningSummary.ts (FACTORY-APP-split-assembleEveningSummary),
 * mirroring the sibling split's usecases/briefing/types.ts pattern.
 *
 * These shapes are consumed by multiple step modules under usecases/eveningSummary/
 * AND re-assembled into EveningSummary by assembleEveningSummary.ts. The EveningSummary
 * container type itself stays in assembleEveningSummary.ts (same convention as
 * DailyBriefing staying in assembleBriefing.ts) — only its field-level sub-types live here.
 * Per-query internal SQLite row types (RagRow, AlertRow, WatchlistMoverRow, ...) are NOT
 * here — they live alongside the one query module that owns them.
 *
 * Re-exported verbatim from assembleEveningSummary.ts for backward compatibility —
 * every existing `import type { X } from ".../assembleEveningSummary.js"` call
 * site continues to resolve unchanged.
 *
 * Layer: application/usecases/eveningSummary — pure types, no imports.
 */

/** VN-Index snapshot captured at market close. */
export interface VnIndexSnapshot {
  /** Closing price (MarketPrice.price) */
  close: number;
  /** Signed integer change: Math.round(price - previousPrice) */
  change: number;
  /** Percentage change rounded to 2 dp (MarketPrice.changePct) */
  changePct: number;
  /** ISO 8601 timestamp from MarketPrice.fetchedAt */
  fetchedAt: string;
}

/** Diagnostic counts for prediction pipeline observability — JSON report only, NOT sent to Telegram */
export interface PredictionDiag {
  /** Total prediction_signals rows fetched in last 24h, any severity */
  stored: number;
}

/** Diagnostic counts for TA pipeline observability — JSON report only, NOT sent to Telegram */
export interface TaDiag {
  /** Watchlist tickers where computeTaFn returned a non-null TaSignal */
  tickersWithSignal: number;
  /** Watchlist tickers where daily_ohlcv row count < 8 (defaultComputeTa guard threshold) */
  tickersBelowThreshold: number;
  /** Minimum daily_ohlcv row count across all watchlist tickers (0 if empty watchlist) */
  ohlcvRowsMin: number;
  /** Maximum daily_ohlcv row count across all watchlist tickers (0 if empty watchlist) */
  ohlcvRowsMax: number;
}

/** A stock with notable foreign investor net flow at market close (Task 1503). */
export interface ForeignFlowMover {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** Net foreign volume (buy - sell), positive = net buy, negative = net sell */
  foreignNetVol: number;
  /** Raw foreign buy volume */
  foreignBuyVol: number;
  /** Raw foreign sell volume */
  foreignSellVol: number;
}

/** A watchlist stock that moved >= 1% during the day. */
export interface WatchlistMover {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** Signed percentage change from previous close */
  changePct: number;
  /** Current price in VND */
  price: number;
  /** Exchange: HOSE | HNX | UPCOM */
  exchange: string;
  /** Trading volume for the day — from market_prices.volume or daily_ohlcv.volume. undefined when unavailable. */
  volume?: number;
  /** RSI(14) value — threaded from taSummary after TA computation. null when insufficient candles, undefined when not yet computed. */
  rsi14?: number | null;
}
