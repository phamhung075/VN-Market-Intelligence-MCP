/**
 * Kinh Dich Service — Repository Ports (domain interfaces)
 *
 * Pure interfaces. Implementations live in infrastructure/.
 */

import type { KinhDichStoredRow, MarkovData } from './models.js';

/** Port for reading Kinh Dich stored readings from a data store. */
export interface KinhDichRepositoryPort {
  /** Get the most recent stored reading for a given stock code. */
  getLatestReading(stockCode: string): KinhDichStoredRow | null;

  /** Get Markov transition data for a hexagram number. */
  getMarkovData(hexagramNumber: number): MarkovData | null;
}

/** Port for computing hexagram scores from price history. */
export interface PriceScorePort {
  /** Compute 6 normalised scores from price history for a stock. Returns null if insufficient data. */
  computeScores(stockCode: string, days: number): number[] | null;
}
