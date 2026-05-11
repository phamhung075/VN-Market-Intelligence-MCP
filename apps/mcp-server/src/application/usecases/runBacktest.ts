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

import type { IBacktestSignalRepository, BacktestSignal } from "../../domain/repositories/IBacktestSignalRepository.js";
import type { IBacktestPriceRepository } from "../../domain/repositories/IBacktestPriceRepository.js";
import type { IBacktestResultRepository } from "../../domain/repositories/IBacktestResultRepository.js";
import type { BacktestParams, BacktestReport } from "../../domain/backtesting/models.js";
import { runBacktestEngine } from "../../domain/backtesting/backtestEngine.js";
import {
  strategyRegistry,
  BacktestStrategyNotFoundError,
  buildCombinedHighConfidenceStrategy,
  type TADirection,
} from "../../domain/backtesting/strategyRegistry.js";
import { deriveTADirection } from "../../domain/backtesting/taComputation.js";

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
// TA Direction map helper (Task 1843a)
// ---------------------------------------------------------------------------

/**
 * Compute a TA direction for every unique ticker in the raw signal set.
 *
 * - Extended start date = addCalendarDays(params.startDate, -40) for EMA-26 warmup.
 * - Ticker set is derived from rawSignals unique stockCode values (NOT params.tickers).
 * - Tickers that resolve to NEUTRAL because of < 26 candles append a warning to the
 *   report.warnings array (handled at call site).
 *
 * Returns { taMap, neutralTickers } — caller appends warnings per neutral ticker.
 */
async function computeTADirectionMap(
  priceRepo: IBacktestPriceRepository,
  params: BacktestParams,
  rawSignals: BacktestSignal[],
): Promise<{ taMap: Map<string, TADirection>; neutralTickers: string[] }> {
  const tickers = [...new Set(rawSignals.map((s) => s.stockCode))];

  // Extend start date 40 calendar days back for EMA-26 warmup
  const extStart = addCalendarDays(params.startDate, -40);

  const taMap = new Map<string, TADirection>();
  const neutralTickers: string[] = [];

  for (const ticker of tickers) {
    const candles = priceRepo.getCandles(ticker, extStart, params.endDate);
    const direction = deriveTADirection(candles);
    taMap.set(ticker, direction);
    if (direction === "NEUTRAL") {
      neutralTickers.push(ticker);
    }
  }

  return { taMap, neutralTickers };
}

/**
 * Add `days` calendar days to a YYYY-MM-DD date string.
 * Does not account for trading-day gaps — pure calendar arithmetic.
 */
function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
    // ── Load raw signals first (needed for TA ticker set) ─────────────────
    // Repo already filters to BUY/SELL and normalises VI→EN.
    const rawSignals = deps.signalRepo.getSignals(
      params.strategy,
      params.startDate,
      params.endDate,
    );

    // ── Strategy resolution ────────────────────────────────────────────────
    let strategy = strategyRegistry[params.strategy];

    if (params.strategy === "combined-high-confidence") {
      // Build TA direction map from actual price data, then construct the
      // TA-aware strategy via factory (synchronous signalFilter, async data fetch).
      const { taMap, neutralTickers } = await computeTADirectionMap(
        deps.priceRepo,
        params,
        rawSignals,
      );
      strategy = buildCombinedHighConfidenceStrategy(taMap);

      // Warnings for tickers that fell back to NEUTRAL due to sparse data
      // are collected here; they will be appended to report.warnings below.
      const neutralWarnings = neutralTickers.map(
        (ticker) =>
          `combined-high-confidence: ${ticker} resolved to NEUTRAL TA direction (< 26 OHLCV candles available) — signal blocked`,
      );

      // Apply strategy filter (TA-aware)
      const signals = rawSignals
        .map((row) => strategy!.signalFilter(row))
        .filter((s): s is NonNullable<typeof s> => s !== null);

      const benchmarkCandles = deps.priceRepo.getCandles("VNINDEX", params.startDate, params.endDate);

      const report = runBacktestEngine({
        params,
        signals,
        priceRepo: deps.priceRepo,
        benchmarkCandles,
        minConfidence: strategy.minConfidence,
      });

      // Append NEUTRAL warnings
      for (const w of neutralWarnings) {
        report.warnings.push(w);
      }

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
        report.warnings.push("Warning: result could not be persisted to backtest_runs table.");
      }

      return report;
    }

    if (!strategy) {
      throw new BacktestStrategyNotFoundError(params.strategy);
    }

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
