/**
 * Technical Analysis Domain — Repository Ports (Abstract)
 *
 * Interfaces that infrastructure layer must implement.
 * Domain never imports concrete implementations.
 */

import type { CandleStick } from './models.js';

/** Port: read price history from persistence layer. */
export interface PriceHistoryRepository {
  getHistory(code: string, days: number): Promise<CandleStick[]>;
}

/** Port: calculate individual TA indicators (pure math). */
export interface TAIndicatorCalculator {
  calculateRSI(closes: number[], period?: number): number | null;
  calculateMACD(closes: number[]): { line: number; signal: number; histogram: number } | null;
  calculateMA(closes: number[], period: number): number | null;
  calculateBB(closes: number[], period?: number, stdDev?: number): { upper: number; mid: number; lower: number } | null;
}
