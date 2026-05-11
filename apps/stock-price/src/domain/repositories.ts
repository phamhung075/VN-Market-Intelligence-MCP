/**
 * Stock Price Domain — Repository Ports (Abstract)
 */

import type { PriceQuote, DailyOHLCV } from './models.js';

/** Port: single-tier price fetcher (abstract). */
export interface PriceFetcherPort {
  fetchPrice(code: string): Promise<PriceQuote | null>;
}

/** Port: historical price storage. */
export interface PriceHistoryPort {
  getHistory(code: string, days: number): Promise<DailyOHLCV[]>;
  saveQuote(quote: PriceQuote): Promise<void>;
}
