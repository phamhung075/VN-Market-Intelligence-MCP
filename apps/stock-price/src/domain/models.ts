/**
 * Stock Price Domain — Models
 *
 * Value Objects for price quotes and history.
 */

export type PriceSource = 'hose' | 'hnx' | 'upcom' | 'vndirect' | 'cache';

/** A single price quote from any tier. */
export interface PriceQuote {
  code: string;
  price: number;        // VND
  volume: number;
  change: number;       // absolute VND change
  changePercent: number;
  source: PriceSource;
  latencyMs: number;
  fetchedAt: string;    // ISO timestamp
}

/** Daily OHLCV candle for history endpoint. */
export interface DailyOHLCV {
  date: string;   // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Result of a tier attempt. */
export interface TierResult {
  success: boolean;
  quote: PriceQuote | null;
  error?: string;
}
