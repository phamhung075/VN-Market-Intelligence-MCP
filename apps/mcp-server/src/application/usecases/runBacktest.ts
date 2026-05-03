/**
 * runBacktest.ts — Task 1842d
 *
 * Application use case: orchestrates the full backtest pipeline.
 * - Validates params
 * - Resolves strategy definition
 * - Fetches signals + prices via injected repos
 * - Delegates computation to backtestEngine (pure domain)
 * - Persists result via IBacktestResultRepository
 * - Enforces 1-concurrent mutex (in-memory flag)
 *
 * Layer: application/usecases — may import domain + infrastructure interfaces.
 * Must NOT import infrastructure implementations directly; they are injected.
 */

import type { IBacktestSignalRepository } from "../../domain/repositories/IBacktestSignalRepository.js";
import type { IBacktestPriceRepository } from "../../domain/repositories/IBacktestPriceRepository.js";
import type { IBacktestResultRepository } from "../../domain/repositories/IBacktestResultRepository.js";
import type { BacktestParams, BacktestReport } from "../../domain/backtesting/models.js";
import { runBacktestEngine } from "../../domain/backtesting/backtestEngine.js";
import {
  strategyRegistry,
  BacktestStrategyNotFoundError,
} from "../../domain/backtesting/strategyRegistry.js";

// ---------------------------------------------------------------------------
// Mutex — 1 concurrent backtest per server instance
// ---------------------------------------------------------------------------

let _busy = false;

/** Reset the mutex flag (used in tests to ensure clean state). */
export function resetMutex(): void {
  _busy = false;
}

/** Directly set the busy flag (used in tests to simulate in-progress state). */
export function setBusy(value: boolean): void {
  _busy = value;
}

// ---------------------------------------------------------------------------
// Dependencies interface (injected — no getDb() here)
// ---------------------------------------------------------------------------

export interface RunBacktestDeps {
  signalRepo: IBacktestSignalRepository;
  priceRepo: IBacktestPriceRepository;
  resultRepo: IBacktestResultRepository;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Orchestrate a full backtest run.
 *
 * Returns either a BacktestReport (success) or a string error message (mutex busy).
 * String return is intentional — MCP tool converts it to a user-readable error content block.
 *
 * @throws BacktestStrategyNotFoundError if the strategy ID is unknown.
 */
export async function runBacktest(
  params: BacktestParams,
  deps: RunBacktestDeps,
): Promise<BacktestReport | string> {
  // ── Mutex check ────────────────────────────────────────────────────────────
  if (_busy) {
    return "Backtest already in progress. Retry in a few seconds.";
  }
  _busy = true;

  try {
    // ── Strategy resolution ────────────────────────────────────────────────
    const strategy = strategyRegistry[params.strategy];
    if (!strategy) {
      throw new BacktestStrategyNotFoundError(params.strategy);
    }

    // ── Load signals ───────────────────────────────────────────────────────
    // Repo already filters to BUY/SELL and normalises VI→EN.
    const rawSignals = deps.signalRepo.getSignals(
      params.strategy,
      params.startDate,
      params.endDate,
    );

    // Apply strategy filter (confidence threshold + direction filter)
    const signals = rawSignals
      .map((row) => strategy.signalFilter(row))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // ── Load benchmark (VNINDEX) ───────────────────────────────────────────
    const benchmarkCandles = deps.priceRepo.getCandles("VNINDEX", params.startDate, params.endDate);

    // ── Run pure computation ───────────────────────────────────────────────
    const report = runBacktestEngine({
      params,
      signals,
      priceRepo: deps.priceRepo,
      benchmarkCandles,
      minConfidence: strategy.minConfidence,
    });

    // ── Persist result ─────────────────────────────────────────────────────
    try {
      deps.resultRepo.saveRun({
        id: crypto.randomUUID(),
        strategy: params.strategy,
        startDate: params.startDate,
        endDate: params.endDate,
        runAt: report.runAt,
        totalReturn: report.totalReturnPct,
        benchmarkReturn: report.benchmarkReturnPct,
        maxDrawdown: report.maxDrawdown,
        sharpeRatio: report.sharpeRatio,
        winRate: report.winRate,
        tradeCount: report.tradeCount,
        resultJson: JSON.stringify(report),
      });
    } catch {
      // Persistence failure should not fail the use case — report is still returned
      report.warnings.push("Warning: result could not be persisted to backtest_runs table.");
    }

    return report;
  } finally {
    _busy = false;
  }
}
