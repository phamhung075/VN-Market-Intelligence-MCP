/**
 * strategyRegistry.ts — Task 1842d
 *
 * Strategy definition interface + registry.
 * Each entry maps a strategy ID to its filter rules and hold parameters.
 *
 * Layer: domain/backtesting — zero imports from infrastructure.
 */

import type { BacktestSignal } from "../repositories/IBacktestSignalRepository.js";

/** A raw signal row as input to the strategy filter — same shape as BacktestSignal */
export type RawSignalRow = BacktestSignal;

export interface StrategyDefinition {
  id: string;
  description: string;
  /**
   * Maps a raw signal row to a BacktestSignal.
   * Returns null to exclude the row from this strategy's signal set.
   */
  signalFilter(row: RawSignalRow): BacktestSignal | null;
  /** Minimum confidence required to include the signal. Applied after signalFilter. */
  minConfidence: number;
  /** Hold period in trading days (default 5). */
  holdDays: number;
}

/** Thrown when an unknown strategy ID is requested. Zero I/O. */
export class BacktestStrategyNotFoundError extends Error {
  constructor(strategyId: string) {
    super(`Unknown strategy: "${strategyId}". Available strategies: ${Object.keys(strategyRegistry).join(", ")}`);
    this.name = "BacktestStrategyNotFoundError";
  }
}

/**
 * Strategy registry.
 * Key = strategy ID (matches the run_backtest tool's enum values).
 */
export const strategyRegistry: Record<string, StrategyDefinition> = {
  "kinh-dich-high-confidence": {
    id: "kinh-dich-high-confidence",
    description:
      "Kinh Dich BUY and SELL signals with confidence >= 0.7. " +
      "Highest-conviction signals only — excludes speculative readings.",
    minConfidence: 0.7,
    holdDays: 5,
    signalFilter(row: RawSignalRow): BacktestSignal | null {
      // Only BUY and SELL signals; confidence filter applied post-filter by engine
      if (row.direction !== "BUY" && row.direction !== "SELL") return null;
      if (row.confidence < 0.7) return null;
      return row;
    },
  },

  "kinh-dich-all": {
    id: "kinh-dich-all",
    description:
      "All Kinh Dich BUY and SELL signals regardless of confidence. " +
      "Includes low-confidence signals — useful for statistical comparison against kinh-dich-high-confidence.",
    minConfidence: 0,
    holdDays: 5,
    signalFilter(row: RawSignalRow): BacktestSignal | null {
      // All BUY and SELL — HOLD and WAIT are no-ops
      if (row.direction !== "BUY" && row.direction !== "SELL") return null;
      return row;
    },
  },

  "combined-high-confidence": {
    id: "combined-high-confidence",
    description:
      "Kinh Dich BUY/SELL signals with confidence >= 0.7 " +
      "(combined strategy stub — full TA confirmation logic is out of scope for Sprint 1842).",
    minConfidence: 0.7,
    holdDays: 5,
    signalFilter(row: RawSignalRow): BacktestSignal | null {
      // Same filter logic as kinh-dich-high-confidence.
      // Full TA-combined signal logic (TA confirmation required) is a future sprint item.
      if (row.direction !== "BUY" && row.direction !== "SELL") return null;
      if (row.confidence < 0.7) return null;
      return row;
    },
  },
};
