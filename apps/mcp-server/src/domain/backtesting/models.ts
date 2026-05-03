/**
 * models.ts — Task 1842d
 *
 * Domain types for the backtesting module.
 * Zero imports from infrastructure.
 *
 * Layer: domain/backtesting — pure types, no I/O.
 */

export interface BacktestParams {
  /** Strategy ID to backtest, e.g. "kinh-dich-high-confidence" */
  strategy: string;
  /** Start date inclusive, YYYY-MM-DD */
  startDate: string;
  /** End date inclusive, YYYY-MM-DD */
  endDate: string;
  /** Optional subset of tickers — undefined = all available signals */
  tickers?: string[];
}

export interface TradeRecord {
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: "BUY" | "SELL";
  /** Return as fraction, e.g. 0.05 = +5% */
  returnPct: number;
  confidence: number;
}

export type TradeLog = TradeRecord[];

export interface BacktestReport {
  /** Strategy that was tested */
  strategy: string;
  startDate: string;
  endDate: string;
  /** ISO datetime this run was executed */
  runAt: string;
  /** Total portfolio return as a fraction, e.g. 0.15 = +15% */
  totalReturnPct: number;
  /** VNI benchmark return over same period (null if VNI data absent) */
  benchmarkReturnPct: number | null;
  /** Max drawdown as a fraction, e.g. -0.12 = -12% */
  maxDrawdown: number;
  /** Annualised Sharpe ratio (risk-free = 0). Null when stddev = 0. */
  sharpeRatio: number | null;
  /** Fraction of closed trades with positive return (0–1) */
  winRate: number;
  /** Number of completed round-trip trades */
  tradeCount: number;
  /** Summary per ticker */
  byTicker: Array<{
    code: string;
    tradeCount: number;
    winRate: number;
    totalReturnPct: number;
  }>;
  /** Full trade log — capped at 200 rows in MCP response */
  trades: TradeRecord[];
  /** Human-readable warnings when data is insufficient or degenerate */
  warnings: string[];
}
