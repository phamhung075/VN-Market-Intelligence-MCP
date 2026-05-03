/**
 * strategyRegistry.ts — Task 1842d / 1843a
 *
 * Strategy definition interface + registry.
 * Each entry maps a strategy ID to its filter rules and hold parameters.
 *
 * Layer: domain/backtesting — zero imports from infrastructure.
 */

import type { BacktestSignal } from "../repositories/IBacktestSignalRepository.js";

// ---------------------------------------------------------------------------
// TA Direction type (Task 1843a)
// ---------------------------------------------------------------------------

/**
 * TA directional bias derived from EMA-12/EMA-26 cross and RSI-14.
 * Produced by deriveTADirection() in taComputation.ts.
 */
export type TADirection = "BULLISH" | "BEARISH" | "NEUTRAL";

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

// ---------------------------------------------------------------------------
// Factory: combined-high-confidence with live TA map (Task 1843a)
// ---------------------------------------------------------------------------

/**
 * Build the combined-high-confidence strategy with a pre-computed TA direction
 * map injected via closure.
 *
 * The signalFilter is SYNCHRONOUS — TA data enters via the taMap closure,
 * not via the signalFilter signature.
 *
 * Filter logic:
 *   - BUY  signal passes only when taMap.get(stockCode) === "BULLISH"
 *   - SELL signal passes only when taMap.get(stockCode) === "BEARISH"
 *   - NEUTRAL, missing, or mismatched direction → null (blocked)
 *   - confidence < 0.7 → null (blocked)
 *
 * @param taMap  Pre-computed TA directions, keyed by ticker (e.g. "VCB").
 */
export function buildCombinedHighConfidenceStrategy(
  taMap: Map<string, TADirection>,
): StrategyDefinition {
  return {
    id: "combined-high-confidence",
    description:
      "Kinh Dich BUY/SELL signals with confidence >= 0.7, " +
      "confirmed by TA direction (EMA-12/26 cross + RSI-14). " +
      "BUY passes only when TA is BULLISH; SELL passes only when TA is BEARISH.",
    minConfidence: 0.7,
    holdDays: 5,
    signalFilter(row: RawSignalRow): BacktestSignal | null {
      if (row.direction !== "BUY" && row.direction !== "SELL") return null;
      if (row.confidence < 0.7) return null;

      const taDirection = taMap.get(row.stockCode);

      if (row.direction === "BUY" && taDirection === "BULLISH") return row;
      if (row.direction === "SELL" && taDirection === "BEARISH") return row;

      // NEUTRAL, missing, or direction mismatch — block the signal
      return null;
    },
  };
}
