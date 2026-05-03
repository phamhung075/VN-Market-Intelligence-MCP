/**
 * backtestSignalRepo.ts — Task 1842b
 *
 * SQLite implementation of IBacktestSignalRepository.
 * Queries kinhdich_readings, applies VI→EN signal normalization,
 * and filters to return only BUY and SELL signals.
 *
 * No getDb() calls — Database is injected via constructor (U-4 pattern).
 *
 * Layer: infrastructure/db — may import domain interfaces + domain services.
 */

import type { Database } from "bun:sqlite";
import type {
  IBacktestSignalRepository,
  BacktestSignal,
} from "../../domain/repositories/IBacktestSignalRepository.js";
import { normalizeSignal } from "../../domain/backtesting/signalNormalizer.js";

export class SqliteBacktestSignalRepository implements IBacktestSignalRepository {
  constructor(private readonly db: Database) {}

  /**
   * Fetch all signals for a given strategy within [startDate, endDate] (inclusive).
   * Applies Vietnamese → English signal normalization.
   * Returns only BUY and SELL signals — HOLD and WAIT are filtered at this layer.
   * Returns signals sorted by timestamp ASC.
   *
   * Note: strategy is recorded on each BacktestSignal for consumers — the query
   * reads from kinhdich_readings which contains signals from the kinhdich cycle.
   * The strategy parameter is passed through to the result objects for downstream use.
   */
  getSignals(strategy: string, startDate: string, endDate: string): BacktestSignal[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT stock_code, timestamp, trading_signal, confidence
           FROM kinhdich_readings
           WHERE trading_signal IS NOT NULL
             AND DATE(timestamp) >= ? AND DATE(timestamp) <= ?
           ORDER BY timestamp ASC`,
        )
        .all(startDate, endDate) as Array<{
          stock_code: string;
          timestamp: string;
          trading_signal: string | null;
          confidence: number | null;
        }>;

      const signals: BacktestSignal[] = [];
      for (const row of rows) {
        if (!row.trading_signal) continue;
        const direction = normalizeSignal(row.trading_signal);
        // Filter: only BUY and SELL generate trades
        if (direction !== "BUY" && direction !== "SELL") continue;

        signals.push({
          stockCode: row.stock_code,
          timestamp: row.timestamp,
          direction,
          confidence: row.confidence ?? 0,
          strategy,
        });
      }

      return signals;
    } catch {
      return [];
    }
  }
}
