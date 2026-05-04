/**
 * backtestResultRepo.ts — Task 1842b
 *
 * SQLite implementation of IBacktestResultRepository.
 * Persists and retrieves completed backtest run records from backtest_runs table.
 *
 * No getDb() calls — Database is injected via constructor (U-4 pattern).
 *
 * Layer: infrastructure/db — may import domain interfaces, must not export to domain.
 */

import type { Database } from "bun:sqlite";
import type {
  IBacktestResultRepository,
  BacktestRunRecord,
} from "../../domain/repositories/IBacktestResultRepository.js";

/** Raw row shape from SQLite (snake_case columns). */
interface BacktestRunRow {
  id: string;
  strategy: string;
  start_date: string;
  end_date: string;
  run_at: string;
  total_return: number;
  benchmark_return: number | null;
  max_drawdown: number;
  sharpe_ratio: number | null;
  win_rate: number;
  trade_count: number;
  result_json: string;
}

function rowToRecord(row: BacktestRunRow): BacktestRunRecord {
  return {
    id: row.id,
    strategy: row.strategy,
    startDate: row.start_date,
    endDate: row.end_date,
    runAt: row.run_at,
    totalReturn: row.total_return,
    benchmarkReturn: row.benchmark_return,
    maxDrawdown: row.max_drawdown,
    sharpeRatio: row.sharpe_ratio,
    winRate: row.win_rate,
    tradeCount: row.trade_count,
    resultJson: row.result_json,
  };
}

export class SqliteBacktestResultRepository implements IBacktestResultRepository {
  constructor(private readonly db: Database) {}

  /** Persist a completed backtest run. */
  saveRun(record: BacktestRunRecord): void {
    this.db
      .prepare(
        `INSERT INTO backtest_runs
           (id, strategy, start_date, end_date, run_at,
            total_return, benchmark_return, max_drawdown, sharpe_ratio,
            win_rate, trade_count, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.strategy,
        record.startDate,
        record.endDate,
        record.runAt,
        record.totalReturn,
        record.benchmarkReturn ?? null,
        record.maxDrawdown,
        record.sharpeRatio ?? null,
        record.winRate,
        record.tradeCount,
        record.resultJson,
      );
  }

  /** Retrieve runs for a given strategy, most-recent-first. */
  getRunsByStrategy(strategy: string, limit: number): BacktestRunRecord[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT id, strategy, start_date, end_date, run_at,
                  total_return, benchmark_return, max_drawdown, sharpe_ratio,
                  win_rate, trade_count, result_json
           FROM backtest_runs
           WHERE strategy = ?
           ORDER BY run_at DESC
           LIMIT ?`,
        )
        .all(strategy, limit) as BacktestRunRow[];

      return rows.map(rowToRecord);
    } catch {
      return [];
    }
  }

  /** Retrieve all runs across all strategies, most-recent-first. */
  getAllRuns(limit: number): BacktestRunRecord[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT * FROM backtest_runs ORDER BY run_at DESC LIMIT ?`,
        )
        .all(limit) as BacktestRunRow[];

      return rows.map(rowToRecord);
    } catch {
      return [];
    }
  }

  /** Retrieve a single run by ID. */
  getRunById(id: string): BacktestRunRecord | null {
    try {
      const row = this.db
        .prepare(
          `SELECT id, strategy, start_date, end_date, run_at,
                  total_return, benchmark_return, max_drawdown, sharpe_ratio,
                  win_rate, trade_count, result_json
           FROM backtest_runs
           WHERE id = ?`,
        )
        .get(id) as BacktestRunRow | null;

      if (!row) return null;
      return rowToRecord(row);
    } catch {
      return null;
    }
  }

  /** Delete a run by ID. Returns true if a row was deleted, false if not found or on error. */
  deleteRun(id: string): boolean {
    try {
      const result = this.db.prepare("DELETE FROM backtest_runs WHERE id = ?").run(id);
      return result.changes > 0;
    } catch {
      return false;
    }
  }
}
