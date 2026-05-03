/**
 * backtestPriceRepo.ts — Task 1842b
 *
 * SQLite implementation of IBacktestPriceRepository.
 * Reads daily OHLCV candles from the daily_ohlcv table for backtesting use cases.
 *
 * No getDb() calls — Database is injected via constructor (U-4 pattern).
 *
 * Layer: infrastructure/db — may import domain interfaces, must not export to domain.
 */

import type { Database } from "bun:sqlite";
import type {
  IBacktestPriceRepository,
  DailyCandle,
} from "../../domain/repositories/IBacktestPriceRepository.js";

export class SqliteBacktestPriceRepository implements IBacktestPriceRepository {
  constructor(private readonly db: Database) {}

  /**
   * Fetch daily OHLCV candles for a ticker within [startDate, endDate] inclusive.
   * Returns candles sorted by date ASC. Returns [] when no data exists.
   */
  getCandles(code: string, startDate: string, endDate: string): DailyCandle[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT date, open, high, low, close, volume
           FROM daily_ohlcv
           WHERE code = ? AND date >= ? AND date <= ?
           ORDER BY date ASC`,
        )
        .all(code, startDate, endDate) as Array<{
          date: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;

      return rows.map((r) => ({
        date: r.date,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch the close price on the first available date >= targetDate.
   * Returns null when no data exists at or after targetDate.
   */
  getClosePriceOnOrAfter(code: string, targetDate: string): { date: string; close: number } | null {
    try {
      const row = this.db
        .prepare(
          `SELECT date, close
           FROM daily_ohlcv
           WHERE code = ? AND date >= ?
           ORDER BY date ASC
           LIMIT 1`,
        )
        .get(code, targetDate) as { date: string; close: number } | null;

      if (!row) return null;
      return { date: row.date, close: row.close };
    } catch {
      return null;
    }
  }
}
