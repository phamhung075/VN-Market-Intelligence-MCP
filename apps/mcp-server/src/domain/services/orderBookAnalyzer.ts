/**
 * Order Book Analyzer — domain service
 *
 * Pure function that interprets a VnstockOrderBook snapshot and classifies
 * the current market micro-structure.
 *
 * Classification logic (first match wins):
 *   1. thin_liquidity  — bidTotal + askTotal < 10 000 shares   → MEDIUM
 *   2. strong_buy_pressure  — imbalanceRatio >= 2.0            → HIGH
 *   3. strong_sell_pressure — imbalanceRatio <= 0.5            → HIGH
 *   4. balanced             — otherwise                        → LOW
 *
 * Wall detection:
 *   bidWallPrice = price of the bid level with the highest single-level volume
 *   askWallPrice = price of the ask level with the highest single-level volume
 *
 * Layer: domain/services — ZERO imports from infrastructure/
 */

import type { VnstockOrderBook } from "../models/shared-types.js";
import type { Severity } from "./signalDetector.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OrderBookInterpretation =
  | "strong_buy_pressure"
  | "strong_sell_pressure"
  | "balanced"
  | "thin_liquidity";

export interface OrderBookSignal {
  code: string;
  imbalanceRatio: number;
  interpretation: OrderBookInterpretation;
  severity: Severity;
  /** Price level with the single largest bid volume, or null if no bids */
  bidWallPrice: number | null;
  /** Price level with the single largest ask volume, or null if no asks */
  askWallPrice: number | null;
  /** 0.0–1.0 confidence score */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum combined depth for a liquid market (shares) */
const THIN_LIQUIDITY_THRESHOLD = 10_000;
/** Bid/ask ratio threshold for strong buy-side pressure */
const STRONG_BUY_RATIO = 2.0;
/** Bid/ask ratio threshold for strong sell-side pressure */
const STRONG_SELL_RATIO = 0.5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findWallPrice(
  levels: Array<{ price: number; volume: number }>,
): number | null {
  if (levels.length === 0) return null;
  const wall = levels.reduce((best, cur) =>
    cur.volume > best.volume ? cur : best,
  );
  return wall.price;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Analyze an order book snapshot and return a classified signal.
 *
 * @param book - VnstockOrderBook snapshot
 * @returns OrderBookSignal — always returns a signal (never null)
 */
export function analyzeOrderBook(book: VnstockOrderBook): OrderBookSignal {
  const { code, imbalanceRatio, bids, asks, bidTotal, askTotal } = book;

  const bidWallPrice = findWallPrice(bids);
  const askWallPrice = findWallPrice(asks);

  const totalDepth = bidTotal + askTotal;

  let interpretation: OrderBookInterpretation;
  let severity: Severity;
  let confidence: number;

  // Rule 1: thin liquidity — checked first regardless of imbalance
  if (totalDepth < THIN_LIQUIDITY_THRESHOLD) {
    interpretation = "thin_liquidity";
    severity = "medium";
    confidence = 0.5;
  } else if (imbalanceRatio >= STRONG_BUY_RATIO) {
    interpretation = "strong_buy_pressure";
    severity = "high";
    // Confidence scales with how extreme the ratio is (capped at 1.0)
    confidence = Math.min(1, (imbalanceRatio - STRONG_BUY_RATIO) / 3 + 0.6);
  } else if (imbalanceRatio <= STRONG_SELL_RATIO) {
    interpretation = "strong_sell_pressure";
    severity = "high";
    // Confidence scales with how far below 0.5 the ratio is
    confidence = Math.min(1, (STRONG_SELL_RATIO - imbalanceRatio) / 0.5 * 0.4 + 0.6);
  } else {
    interpretation = "balanced";
    severity = "low";
    confidence = 0.3;
  }

  return {
    code,
    imbalanceRatio,
    interpretation,
    severity,
    bidWallPrice,
    askWallPrice,
    confidence,
  };
}
