/**
 * Kinh Dich Service — Repository Ports (domain interfaces)
 *
 * Pure interfaces. Implementations live in infrastructure/.
 */

import type { KinhDichStoredRow, MarkovData } from './models.js';

// ─── History row returned from kinhdich_readings ───────────────────────────────
export interface KinhDichHistoryRow {
  timestamp: string;
  hexagram_number: number;
  trading_signal: string | null;
  confidence: number | null;
}

// ─── Transition row returned from hexagram_transitions or similar table ────────
export interface KinhDichTransitionRow {
  to_hexagram: number;
  count: number;
  probability: number;
}

// ─── Price row for backtest ────────────────────────────────────────────────────
export interface KinhDichPriceRow {
  price: number;
  timestamp: string;
}

/** Port for reading Kinh Dich stored readings from a data store. */
export interface KinhDichRepositoryPort {
  /** Get the most recent stored reading for a given stock code. */
  getLatestReading(stockCode: string): KinhDichStoredRow | null;

  /** Get Markov transition data for a hexagram number. */
  getMarkovData(hexagramNumber: number): MarkovData | null;

  /** Get all readings for a stock within the past N days (for history + backtest). */
  getReadingsHistory(stockCode: string, days: number): KinhDichHistoryRow[];

  /** Get top-N transitions from a given hexagram for a stock (or all stocks). */
  getTopTransitions(fromHexagram: number, stockCode: string, topN: number): KinhDichTransitionRow[];

  /** Get price rows for a stock within the past N days (for backtest). */
  getPriceHistory(stockCode: string, days: number): KinhDichPriceRow[];
}

/** Port for computing hexagram scores from price history. */
export interface PriceScorePort {
  /** Compute 6 normalised scores from price history for a stock. Returns null if insufficient data. */
  computeScores(stockCode: string, days: number): number[] | null;
}
