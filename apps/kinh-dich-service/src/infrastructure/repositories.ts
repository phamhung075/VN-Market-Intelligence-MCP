/**
 * Kinh Dich Service — Infrastructure Repositories
 *
 * Concrete implementations of domain ports.
 * SQLite reads + price score computation from price history.
 */

import type { Database } from 'bun:sqlite';
import type {
  KinhDichRepositoryPort,
  PriceScorePort,
  KinhDichHistoryRow,
  KinhDichTransitionRow,
  KinhDichPriceRow,
} from '../domain/repositories.js';
import type { KinhDichStoredRow, MarkovData } from '../domain/models.js';

interface PriceRow {
  close: number;
  volume: number;
}

interface MarkovRow {
  next_hexagram: number;
  next_name: string;
  probability: number;
}

/** Read kinhdich_readings and markov data from SQLite. */
export class SQLiteKinhDichRepository implements KinhDichRepositoryPort {
  constructor(private readonly db: Database) {}

  getLatestReading(stockCode: string): KinhDichStoredRow | null {
    try {
      return this.db
        .prepare<KinhDichStoredRow, [string]>(`
          SELECT hexagram_number, bien_que_number, trading_signal, confidence
          FROM kinhdich_readings
          WHERE stock_code = ?
          ORDER BY timestamp DESC
          LIMIT 1
        `)
        .get(stockCode) ?? null;
    } catch {
      return null;
    }
  }

  getMarkovData(hexagramNumber: number): MarkovData | null {
    if (hexagramNumber <= 0) return null;
    try {
      const row = this.db
        .prepare<MarkovRow, [number]>(`
          SELECT next_hexagram, next_name, probability
          FROM hexagram_markov
          WHERE from_hexagram = ?
          ORDER BY probability DESC
          LIMIT 1
        `)
        .get(hexagramNumber);

      if (!row) return null;
      return {
        nextMostLikely: row.next_hexagram,
        nextName: row.next_name,
        probability: row.probability,
      };
    } catch {
      return null;
    }
  }

  getReadingsHistory(stockCode: string, days: number): KinhDichHistoryRow[] {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      return this.db
        .prepare<KinhDichHistoryRow, [string, string]>(`
          SELECT timestamp, hexagram_number, trading_signal, confidence
          FROM kinhdich_readings
          WHERE stock_code = ? AND timestamp >= ?
          ORDER BY timestamp DESC
        `)
        .all(stockCode, since);
    } catch {
      return [];
    }
  }

  getTopTransitions(fromHexagram: number, stockCode: string, topN: number): KinhDichTransitionRow[] {
    try {
      // hexagram_transitions table: from_hexagram, to_hexagram, stock_code, count, probability
      // stock_code filter: if 'VNINDEX' treat as all-stocks aggregation
      const rows = this.db
        .prepare<KinhDichTransitionRow, [number, number]>(`
          SELECT to_hexagram, SUM(count) as count,
                 CAST(SUM(count) AS REAL) / (SELECT SUM(count) FROM hexagram_transitions WHERE from_hexagram = ?) AS probability
          FROM hexagram_transitions
          WHERE from_hexagram = ?
          GROUP BY to_hexagram
          ORDER BY count DESC
          LIMIT ${Math.max(1, Math.min(topN, 64))}
        `)
        .all(fromHexagram, fromHexagram);
      return rows;
    } catch {
      // Table may not exist yet — return empty
      return [];
    }
  }

  getPriceHistory(stockCode: string, days: number): KinhDichPriceRow[] {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const rows = this.db
        .prepare<{ price: number; fetched_at: string }, [string, string]>(`
          SELECT price, fetched_at
          FROM market_prices_history
          WHERE code = ? AND fetched_at >= ?
          ORDER BY fetched_at ASC
        `)
        .all(stockCode, since);
      return rows.map((r) => ({ price: r.price, timestamp: r.fetched_at }));
    } catch {
      return [];
    }
  }
}

/**
 * Compute 6 dimension scores from price history.
 * Uses the same 6-dimension approach as the original mcp-server kinhDich engine.
 */
export class SQLitePriceScoreRepository implements PriceScorePort {
  constructor(private readonly db: Database) {}

  computeScores(stockCode: string, days: number): number[] | null {
    try {
      const rows = this.db
        .prepare<PriceRow, [string, number]>(`
          SELECT close, volume
          FROM daily_ohlcv
          WHERE code = ?
          ORDER BY date DESC
          LIMIT ?
        `)
        .all(stockCode, days);

      if (rows.length < 6) return null;

      const closes = rows.map((r) => r.close).reverse();
      const volumes = rows.map((r) => r.volume).reverse();
      const n = closes.length;

      // Dimension 1: short-term momentum (last 5 days vs prev 5)
      const recentAvg = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const prevAvg = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / Math.min(5, n - 5);
      const d1 = prevAvg > 0 ? Math.max(-1, Math.min(1, (recentAvg - prevAvg) / prevAvg * 10)) : 0;

      // Dimension 2: price vs 30d average (fundamentals proxy)
      const avg30 = closes.reduce((a, b) => a + b, 0) / n;
      const last = closes[n - 1] ?? 0;
      const d2 = avg30 > 0 ? Math.max(-1, Math.min(1, (last - avg30) / avg30 * 5)) : 0;

      // Dimension 3: price change last session (technical)
      const prev = closes[n - 2] ?? last;
      const d3 = prev > 0 ? Math.max(-1, Math.min(1, (last - prev) / prev * 20)) : 0;

      // Dimension 4: volume trend (foreign flow proxy)
      const volRecent = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const volPrev = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / Math.min(5, n - 5);
      const d4 = volPrev > 0 ? Math.max(-1, Math.min(1, (volRecent - volPrev) / volPrev * 2)) : 0;

      // Dimension 5: medium-term trend (sector proxy)
      const mid = Math.floor(n / 2);
      const firstHalfAvg = closes.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const d5 = firstHalfAvg > 0 ? Math.max(-1, Math.min(1, (last - firstHalfAvg) / firstHalfAvg * 3)) : 0;

      // Dimension 6: long-term vs short-term (macro proxy)
      const d6 = d2 * 0.5 + d1 * 0.5;

      return [d1, d2, d3, d4, d5, d6];
    } catch {
      return null;
    }
  }
}
