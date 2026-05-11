/**
 * IBacktestPriceRepository.ts — Task 1842b
 *
 * Port (interface) for querying daily OHLCV price candles for backtesting.
 * Deliberately separate from IMarketPriceRepository which handles rolling alert data.
 *
 * Implementations live in infrastructure/db/ — never import infrastructure from here.
 *
 * Layer: domain/repositories — zero imports from infrastructure.
 */

export interface DailyCandle {
  /** "YYYY-MM-DD" */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IBacktestPriceRepository {
  /**
   * Fetch daily OHLCV candles for a ticker within [startDate, endDate] inclusive.
   * Returns candles sorted by date ASC.
   * Returns [] when no data exists — caller must handle the sparse-data case.
   */
  getCandles(code: string, startDate: string, endDate: string): DailyCandle[];

  /**
   * Fetch the close price on the first available date >= targetDate.
   * Returns null when no data exists at or after targetDate.
   */
  getClosePriceOnOrAfter(code: string, targetDate: string): { date: string; close: number } | null;
}
