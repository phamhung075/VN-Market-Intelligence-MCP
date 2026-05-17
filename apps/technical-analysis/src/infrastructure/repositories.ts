/**
 * Technical Analysis Infrastructure — SQLite Price Repository
 *
 * Queries market_prices table (shared SQLite DB) to return candle history.
 * Implements PriceHistoryRepository port.
 */

import type { Database } from 'bun:sqlite';
import type { CandleStick } from '../domain/models.js';
import type { PriceHistoryRepository } from '../domain/repositories.js';

interface PriceRow {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class SQLitePriceRepository implements PriceHistoryRepository {
  constructor(private readonly db: Database) {}

  async getHistory(code: string, days: number): Promise<CandleStick[]> {
    const rows = this.db.query<PriceRow, [string, number]>(
      `SELECT
         date      AS day,
         open,
         high,
         low,
         close,
         volume
       FROM daily_ohlcv
       WHERE code = ?
         AND date >= date('now', ? || ' days')
       ORDER BY day ASC`,
    ).all(code, -days);

    return rows.map((r) => ({
      date: r.day,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
  }
}
