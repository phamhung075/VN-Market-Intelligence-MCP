/**
 * IBacktestResultRepository.ts — Task 1842b
 *
 * Port (interface) for persisting and querying completed backtest run records.
 * Stores results in the dedicated backtest_runs table — never touches live data tables.
 *
 * Implementations live in infrastructure/db/ — never import infrastructure from here.
 *
 * Layer: domain/repositories — zero imports from infrastructure.
 */

export interface BacktestRunRecord {
  /** UUID */
  id: string;
  strategy: string;
  startDate: string;
  endDate: string;
  /** ISO datetime this run was executed */
  runAt: string;
  /** Total portfolio return as a fraction, e.g. 0.15 = +15% */
  totalReturn: number;
  benchmarkReturn: number | null;
  /** Max drawdown as a fraction, e.g. -0.12 = -12% */
  maxDrawdown: number;
  sharpeRatio: number | null;
  /** Fraction of closed trades with positive return (0–1) */
  winRate: number;
  tradeCount: number;
  /** Full BacktestReport serialised as JSON */
  resultJson: string;
}

export interface IBacktestResultRepository {
  /** Persist a completed backtest run. */
  saveRun(record: BacktestRunRecord): void;

  /** Retrieve runs for a given strategy, most-recent-first. */
  getRunsByStrategy(strategy: string, limit: number): BacktestRunRecord[];

  /** Retrieve a single run by ID. */
  getRunById(id: string): BacktestRunRecord | null;

  /** Retrieve all runs across all strategies, most-recent-first. */
  getAllRuns(limit: number): BacktestRunRecord[];

  /** Delete a run by ID. Returns true if a row was deleted, false if not found or on error. */
  deleteRun(id: string): boolean;
}
