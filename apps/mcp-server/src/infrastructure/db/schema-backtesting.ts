/**
 * schema-backtesting.ts — Task 1842b
 *
 * DDL for the backtesting domain tables.
 *
 * Tables:
 *   - backtest_runs — one row per completed backtest execution (audit trail)
 *
 * All DDL uses CREATE TABLE IF NOT EXISTS — idempotent, safe to run on every startup.
 * Called from initDatabase() in schema.ts.
 *
 * Layer: infrastructure/db — pure DDL, no business logic.
 */

import type { Database } from "bun:sqlite";

export function initBacktestingTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id               TEXT PRIMARY KEY,
      strategy         TEXT NOT NULL,
      start_date       TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      run_at           TEXT NOT NULL,
      total_return     REAL NOT NULL,
      benchmark_return REAL,
      max_drawdown     REAL NOT NULL,
      sharpe_ratio     REAL,
      win_rate         REAL NOT NULL,
      trade_count      INTEGER NOT NULL,
      result_json      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy ON backtest_runs(strategy);
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_run_at ON backtest_runs(run_at DESC);
  `);
}
