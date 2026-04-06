/**
 * Domain Service — Hexagram Backtest Engine (Task 283)
 *
 * Pure computation: takes historical readings + prices as plain data,
 * computes accuracy metrics for Kinh Dich trading signals.
 *
 * Rules:
 *   - BUY signal + price went UP   5 trading days later → WIN
 *   - SELL signal + price went DOWN 5 trading days later → WIN
 *   - HOLD / WAIT / missing price   → NEUTRAL (not counted as win or loss)
 *   - avgReturn5d is computed over ALL readings that have a matched price.
 *
 * Layer: domain/services — NO I/O, NO db imports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestRow {
  /** ISO timestamp of the reading */
  timestamp: string;
  /** 1–64 */
  hexagramNumber: number;
  /** "BUY" | "SELL" | "HOLD" | "WAIT" */
  tradingSignal: string;
  /** 0–1 */
  confidence: number;
}

export interface PriceRow {
  /** ISO timestamp or date string */
  timestamp: string;
  price: number;
}

export interface BacktestResult {
  totalReadings: number;
  /** Fraction of BUY/SELL signals that correctly predicted direction (0–1) */
  accuracy: number;
  /** Average 5-day return across all matched readings (fraction, e.g. 0.02 = +2%) */
  avgReturn5d: number;
  /** Hexagram with the highest win rate among those with ≥1 directional signal */
  bestHexagram: { number: number; winRate: number; count: number } | null;
  /** Hexagram with the lowest win rate among those with ≥1 directional signal */
  worstHexagram: { number: number; winRate: number; count: number } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an ISO/date string to a UTC ms epoch */
function toMs(ts: string): number {
  return new Date(ts).getTime();
}

/** Approximate number of milliseconds in 5 trading days (7 calendar days) */
const FIVE_TRADING_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerance window: accept price within ±2 calendar days of the target */
const TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Find the price closest to `targetMs` from a sorted price array.
 * Returns null if no price is within TOLERANCE_MS of the target.
 */
function findClosestPrice(
  prices: PriceRow[],
  targetMs: number,
): number | null {
  let best: PriceRow | null = null;
  let bestDiff = Infinity;

  for (const p of prices) {
    const diff = Math.abs(toMs(p.timestamp) - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }

  if (best === null || bestDiff > TOLERANCE_MS) return null;
  return best.price;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute backtest accuracy from historical readings and price data.
 *
 * @param readings  - Chronologically ordered reading rows.
 * @param prices    - Price snapshots; need not be sorted.
 */
export function computeBacktest(
  readings: BacktestRow[],
  prices: PriceRow[],
): BacktestResult {
  if (readings.length === 0) {
    return {
      totalReadings: 0,
      accuracy: 0,
      avgReturn5d: 0,
      bestHexagram: null,
      worstHexagram: null,
    };
  }

  // Sort prices by time once for efficient lookup
  const sortedPrices = [...prices].sort(
    (a, b) => toMs(a.timestamp) - toMs(b.timestamp),
  );

  // Per-hexagram stats
  const hexStats = new Map<
    number,
    { wins: number; losses: number; count: number }
  >();

  let wins = 0;
  let losses = 0;
  let totalReturn = 0;
  let returnCount = 0;

  for (const reading of readings) {
    const signal = reading.tradingSignal.toUpperCase();
    const isDirectional = signal === "BUY" || signal === "SELL";

    const readingMs = toMs(reading.timestamp);
    const targetMs = readingMs + FIVE_TRADING_DAYS_MS;

    // Entry price: closest price at or just before the reading timestamp
    const entryPrice = findClosestPrice(sortedPrices, readingMs);
    // Exit price: ~5 trading days later
    const exitPrice = findClosestPrice(sortedPrices, targetMs);

    if (entryPrice !== null && exitPrice !== null && entryPrice !== 0) {
      const ret = (exitPrice - entryPrice) / entryPrice;
      totalReturn += ret;
      returnCount++;

      if (isDirectional) {
        const hexNum = reading.hexagramNumber;
        if (!hexStats.has(hexNum)) {
          hexStats.set(hexNum, { wins: 0, losses: 0, count: 0 });
        }
        const stats = hexStats.get(hexNum)!;
        stats.count++;

        const priceWentUp = exitPrice > entryPrice;
        const correct =
          (signal === "BUY" && priceWentUp) ||
          (signal === "SELL" && !priceWentUp);

        if (correct) {
          wins++;
          stats.wins++;
        } else {
          losses++;
          stats.losses++;
        }
      }
    } else if (isDirectional) {
      // No price data — still count as directional but neutral outcome
      const hexNum = reading.hexagramNumber;
      if (!hexStats.has(hexNum)) {
        hexStats.set(hexNum, { wins: 0, losses: 0, count: 0 });
      }
      hexStats.get(hexNum)!.count++;
    }
  }

  const directional = wins + losses;
  const accuracy = directional > 0 ? wins / directional : 0;
  const avgReturn5d = returnCount > 0 ? totalReturn / returnCount : 0;

  // Best / worst hexagrams (only among those with ≥1 win or loss)
  let bestHexagram: BacktestResult["bestHexagram"] = null;
  let worstHexagram: BacktestResult["worstHexagram"] = null;

  for (const [num, stats] of hexStats) {
    const evaluated = stats.wins + stats.losses;
    if (evaluated === 0) continue;
    const winRate = stats.wins / evaluated;

    if (bestHexagram === null || winRate > bestHexagram.winRate) {
      bestHexagram = { number: num, winRate, count: stats.count };
    }
    if (worstHexagram === null || winRate < worstHexagram.winRate) {
      worstHexagram = { number: num, winRate, count: stats.count };
    }
  }

  return {
    totalReadings: readings.length,
    accuracy,
    avgReturn5d,
    bestHexagram,
    worstHexagram,
  };
}
