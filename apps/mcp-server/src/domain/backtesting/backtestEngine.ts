/**
 * backtestEngine.ts — Task 1842d / 1842e
 *
 * Pure domain computation service — ZERO I/O, ZERO DB imports.
 * Takes injected data (signals, price lookup function) and computes metrics.
 *
 * Entry rule: T+1 open after signal date (avoids look-ahead bias).
 * Exit rule:  5 trading days after entry, OR an opposing signal — whichever first.
 *
 * Phase 3 (1842e):
 * - Sharpe ratio from equity curve (population stddev, annualised sqrt(252))
 * - Confidence-weighted position sizing:
 *     weight[ticker] = confidence[ticker] / sum(all open confidences on entry date)
 *     Fallback: equal-weight (1/N) when all confidences are 0.
 *     Single position: weight = 1.0.
 *
 * Layer: domain/backtesting — depends only on domain interfaces, never on infrastructure.
 */

import type { BacktestSignal } from "../repositories/IBacktestSignalRepository.js";
import type { IBacktestPriceRepository, DailyCandle } from "../repositories/IBacktestPriceRepository.js";
import type { BacktestParams, BacktestReport, TradeRecord } from "./models.js";

// ---------------------------------------------------------------------------
// Input contract (pure — accepts pre-fetched data)
// ---------------------------------------------------------------------------

export interface BacktestEngineInput {
  params: BacktestParams;
  /** Pre-filtered, already BUY/SELL only. Confidence filter applied inside engine. */
  signals: BacktestSignal[];
  /** Read-only price repository — injected, never instantiated inside engine. */
  priceRepo: Pick<IBacktestPriceRepository, "getCandles" | "getClosePriceOnOrAfter">;
  /** VNINDEX candles for benchmark — empty array if unavailable (not an error). */
  benchmarkCandles: DailyCandle[];
  /** Minimum confidence to include — from StrategyDefinition.minConfidence. */
  minConfidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract YYYY-MM-DD date part from an ISO timestamp or date string. */
function toDateStr(ts: string): string {
  return ts.slice(0, 10);
}

/** Add N calendar days to a YYYY-MM-DD string (approximate — for exit date horizon). */
function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Get the trading day open on or after targetDate from a sorted candle array. */
function openOnOrAfter(
  candles: DailyCandle[],
  targetDate: string,
): { date: string; open: number } | null {
  const found = candles.find((c) => c.date >= targetDate);
  return found ? { date: found.date, open: found.open } : null;
}

/**
 * Get the close price on the first available date >= targetDate.
 * Uses sorted candles array.
 */
function closeOnOrAfter(
  candles: DailyCandle[],
  targetDate: string,
): { date: string; close: number } | null {
  const found = candles.find((c) => c.date >= targetDate);
  return found ? { date: found.date, close: found.close } : null;
}

/**
 * Compute population standard deviation of a number array.
 * Returns 0 when the array has fewer than 2 elements.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

/**
 * Run the backtest computation over the provided data.
 * Returns a complete BacktestReport.
 *
 * This function is pure — it performs no I/O and has no side effects.
 * The priceRepo parameter is an interface, not a concrete class — it receives
 * only read methods (getCandles, getClosePriceOnOrAfter).
 */
export function runBacktestEngine(input: BacktestEngineInput): BacktestReport {
  const { params, signals, priceRepo, benchmarkCandles, minConfidence } = input;
  const warnings: string[] = [];
  const trades: TradeRecord[] = [];

  // ── Date range warning ────────────────────────────────────────────────────
  const startTs = new Date(params.startDate + "T00:00:00Z").getTime();
  const endTs = new Date(params.endDate + "T00:00:00Z").getTime();
  const daySpan = (endTs - startTs) / (1000 * 60 * 60 * 24);
  if (daySpan < 10) {
    warnings.push("Short date range — results may not be statistically meaningful");
  }

  // ── Filter signals ─────────────────────────────────────────────────────────
  // Apply: confidence filter + optional ticker filter
  const tickerSet = params.tickers ? new Set(params.tickers.map((t) => t.toUpperCase())) : null;
  const filteredSignals = signals.filter((s) => {
    if (s.confidence < minConfidence) return false;
    if (tickerSet && !tickerSet.has(s.stockCode.toUpperCase())) return false;
    return true;
  });

  // ── Simulate trades ───────────────────────────────────────────────────────
  // For each ticker, fetch its candles once and simulate the trade sequence.
  const tickerSignals = new Map<string, BacktestSignal[]>();
  for (const sig of filteredSignals) {
    const key = sig.stockCode.toUpperCase();
    const existing = tickerSignals.get(key) ?? [];
    existing.push(sig);
    tickerSignals.set(key, existing);
  }

  // ── Pending trade type (before positionWeight is assigned) ──────────────────
  type PendingTrade = Omit<TradeRecord, "positionWeight">;
  const pendingTrades: PendingTrade[] = [];

  for (const [ticker, sigs] of tickerSignals) {
    const candles = priceRepo.getCandles(ticker, params.startDate, addCalendarDays(params.endDate, 14));

    if (candles.length < 5) {
      warnings.push(`${ticker}: fewer than 5 price points — skipped`);
      continue;
    }

    // Sort signals by timestamp ASC
    const sorted = [...sigs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Track open positions to detect opposing signals
    let openPosition: { entryDate: string; entryPrice: number; direction: "BUY" | "SELL"; confidence: number } | null =
      null;

    const holdDays = 5; // configurable via StrategyDefinition.holdDays in future

    for (const sig of sorted) {
      const signalDate = toDateStr(sig.timestamp);
      // Entry: T+1 open (next trading day after signal date)
      const entryDayTarget = addCalendarDays(signalDate, 1);
      const entryCandle = openOnOrAfter(candles, entryDayTarget);

      if (!entryCandle) {
        warnings.push(`${ticker}: no entry price found on or after ${entryDayTarget} — trade skipped`);
        continue;
      }

      // If there's an open position, check for opposing signal exit first
      if (openPosition) {
        const isOpposing =
          (openPosition.direction === "BUY" && sig.direction === "SELL") ||
          (openPosition.direction === "SELL" && sig.direction === "BUY");

        if (isOpposing) {
          // Exit at entry price of opposing signal (the open on entryCandle.date)
          const exitPrice = entryCandle.open;
          const returnPct =
            openPosition.direction === "BUY"
              ? (exitPrice - openPosition.entryPrice) / openPosition.entryPrice
              : (openPosition.entryPrice - exitPrice) / openPosition.entryPrice;

          pendingTrades.push({
            ticker,
            entryDate: openPosition.entryDate,
            exitDate: entryCandle.date,
            entryPrice: openPosition.entryPrice,
            exitPrice,
            direction: openPosition.direction,
            returnPct,
            confidence: openPosition.confidence,
          });

          openPosition = null;
        }
      }

      // If no open position, open a new one
      if (!openPosition) {
        // Signal direction is already filtered to BUY or SELL by strategy.signalFilter
        const tradeDirection = sig.direction as "BUY" | "SELL";

        openPosition = {
          entryDate: entryCandle.date,
          entryPrice: entryCandle.open,
          direction: tradeDirection,
          confidence: sig.confidence,
        };

        // Capture local ref so TypeScript knows it's non-null inside the if-block
        const pos = openPosition;

        // Compute exit date: 5 trading days after entry (using calendar days to approximate)
        const exitDayTarget = addCalendarDays(entryCandle.date, holdDays + 2);
        const exitCandle = closeOnOrAfter(candles, exitDayTarget);

        // Only close the position if we can find an exit price before end of data
        if (exitCandle) {
          const exitPrice = exitCandle.close;
          const returnPct =
            pos.direction === "BUY"
              ? (exitPrice - pos.entryPrice) / pos.entryPrice
              : (pos.entryPrice - exitPrice) / pos.entryPrice;

          pendingTrades.push({
            ticker,
            entryDate: pos.entryDate,
            exitDate: exitCandle.date,
            entryPrice: pos.entryPrice,
            exitPrice,
            direction: pos.direction,
            returnPct,
            confidence: pos.confidence,
          });

          openPosition = null;
        }
        // If no exit found, position remains "open" — not counted as completed trade
      }
    }
  }

  // ── Confidence-weighted position sizing ───────────────────────────────────
  // Group trades by entryDate, compute weight per trade within each group.
  // weight[ticker] = confidence[ticker] / sum(all confidences on that date)
  // Fallback: equal-weight (1/N) when all confidences on that date are 0.
  // Single position: weight = 1.0.
  const entryDateGroups = new Map<string, PendingTrade[]>();
  for (const t of pendingTrades) {
    const group = entryDateGroups.get(t.entryDate) ?? [];
    group.push(t);
    entryDateGroups.set(t.entryDate, group);
  }

  for (const [, group] of entryDateGroups) {
    const sumConf = group.reduce((s, t) => s + t.confidence, 0);
    const n = group.length;
    for (const t of group) {
      (t as TradeRecord).positionWeight =
        n === 1
          ? 1.0
          : sumConf === 0
            ? 1 / n
            : t.confidence / sumConf;
    }
  }

  // All pending trades now have positionWeight assigned — cast to full TradeRecord
  for (const t of pendingTrades) {
    trades.push(t as TradeRecord);
  }

  // ── No trades warning ─────────────────────────────────────────────────────
  if (trades.length === 0) {
    warnings.push(
      "No trades executed — insufficient data for requested date range. Run OHLCV backfill first.",
    );
    return buildEmptyReport(params, benchmarkCandles, warnings);
  }

  // ── Compute portfolio metrics ─────────────────────────────────────────────
  // Confidence-weighted portfolio return: each trade contributes positionWeight * returnPct.
  // positionWeight is assigned above — sums to 1.0 within each entry date group.
  // totalReturnPct = sum over all exit events of (positionWeight * returnPct).
  // When all trades have equal weight (kinh-dich-all), this reduces to the simple average.
  const totalReturnPct =
    trades.reduce((sum, t) => sum + t.positionWeight * t.returnPct, 0);

  const winCount = trades.filter((t) => t.returnPct > 0).length;
  const winRate = trades.length > 0 ? winCount / trades.length : 0;

  // ── Equity curve + drawdown ───────────────────────────────────────────────
  // Build a daily equity curve across all trade return dates.
  // Sort trades by exit date, accumulate confidence-weighted returns.
  const sortedByExit = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  let equity = 1.0;
  const equityCurve: number[] = [equity];
  for (const t of sortedByExit) {
    equity *= 1 + t.positionWeight * t.returnPct; // confidence-weighted contribution
    equityCurve.push(equity);
  }

  // Max drawdown
  let runningMax = equityCurve[0] ?? 1.0;
  let maxDrawdown = 0;
  for (const val of equityCurve) {
    if (val > runningMax) runningMax = val;
    const dd = (val - runningMax) / runningMax;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // ── Sharpe ratio ─────────────────────────────────────────────────────────
  // Compute from daily returns of the equity curve.
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!;
    const curr = equityCurve[i]!;
    dailyReturns.push((curr - prev) / prev);
  }

  let sharpeRatio: number | null = null;
  const sd = stddev(dailyReturns);
  if (sd > 0 && dailyReturns.length > 0) {
    const meanReturn = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
    sharpeRatio = (meanReturn / sd) * Math.sqrt(252);
  }

  // ── Benchmark return ──────────────────────────────────────────────────────
  let benchmarkReturnPct: number | null = null;
  if (benchmarkCandles.length >= 2) {
    const first = benchmarkCandles[0]!.close;
    const last = benchmarkCandles[benchmarkCandles.length - 1]!.close;
    benchmarkReturnPct = (last - first) / first;
  }

  // ── byTicker summary ──────────────────────────────────────────────────────
  const tickerMap = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const existing = tickerMap.get(t.ticker) ?? [];
    existing.push(t);
    tickerMap.set(t.ticker, existing);
  }

  const byTicker = Array.from(tickerMap.entries()).map(([code, ts]) => ({
    code,
    tradeCount: ts.length,
    winRate: ts.filter((t) => t.returnPct > 0).length / ts.length,
    totalReturnPct: ts.reduce((s, t) => s + t.returnPct, 0) / ts.length,
  }));

  return {
    strategy: params.strategy,
    startDate: params.startDate,
    endDate: params.endDate,
    runAt: new Date().toISOString(),
    totalReturnPct,
    benchmarkReturnPct,
    maxDrawdown,
    sharpeRatio,
    winRate,
    tradeCount: trades.length,
    byTicker,
    trades: trades.slice(0, 200), // cap at 200 rows in MCP response
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helper: empty report (zero trades)
// ---------------------------------------------------------------------------

function buildEmptyReport(
  params: BacktestParams,
  benchmarkCandles: DailyCandle[],
  warnings: string[],
): BacktestReport {
  let benchmarkReturnPct: number | null = null;
  if (benchmarkCandles.length >= 2) {
    const first = benchmarkCandles[0]!.close;
    const last = benchmarkCandles[benchmarkCandles.length - 1]!.close;
    benchmarkReturnPct = (last - first) / first;
  }

  return {
    strategy: params.strategy,
    startDate: params.startDate,
    endDate: params.endDate,
    runAt: new Date().toISOString(),
    totalReturnPct: 0,
    benchmarkReturnPct,
    maxDrawdown: 0,
    sharpeRatio: null,
    winRate: 0,
    tradeCount: 0,
    byTicker: [],
    trades: [],
    warnings,
  };
}
