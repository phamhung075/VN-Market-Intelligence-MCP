/**
 * IBacktestSignalRepository.ts — Task 1842b
 *
 * Port (interface) for querying trading signals for backtesting.
 * Replaces the direct getReadingsForBacktest() call in hexagramStore.ts.
 *
 * Implementations live in infrastructure/db/ — never import infrastructure from here.
 *
 * Layer: domain/repositories — zero imports from infrastructure.
 */

export type TradingSignalDirection = "BUY" | "SELL" | "HOLD" | "WAIT";

export interface BacktestSignal {
  /** Stock ticker, e.g. "VCB" */
  stockCode: string;
  /** ISO datetime string, e.g. "2026-04-05T18:20:22" */
  timestamp: string;
  /** Normalised English direction */
  direction: TradingSignalDirection;
  /** 0–1, Kinh Dich confidence or TA signal strength */
  confidence: number;
  /** Source strategy that produced this signal */
  strategy: string;
}

export interface IBacktestSignalRepository {
  /**
   * Fetch all signals for a given strategy within [startDate, endDate] (inclusive).
   * Returns only BUY and SELL signals — HOLD and WAIT are filtered at the repo layer.
   * Returns signals sorted by timestamp ASC.
   */
  getSignals(
    strategy: string,
    startDate: string,
    endDate: string,
  ): BacktestSignal[];
}
