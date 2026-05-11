/**
 * VNSignalAdapter.ts — Task 1842c
 *
 * Domain adapter class that wraps normalizeSignal() to convert raw
 * Vietnamese Kinh Dich signal objects into normalised English-direction
 * signal objects ready for the backtesting engine.
 *
 * Layer: domain/backtesting — zero imports from infrastructure.
 */

import { normalizeSignal } from "./signalNormalizer.js";
import type { TradingSignalDirection } from "./signalNormalizer.js";

export type { TradingSignalDirection };

/** Raw signal as produced by the Kinh Dich reading pipeline. */
export interface RawKinhDichSignal {
  /** Stock ticker, e.g. "VCB" */
  stockCode: string;
  /** Vietnamese or English direction string, e.g. "MUA (tich cuc)" */
  rawDirection: string;
  /** Confidence in [0, 1] */
  confidence: number;
  /** ISO datetime string */
  timestamp: string;
}

/** Signal with direction normalised to canonical English. */
export interface NormalisedSignal {
  /** Stock ticker */
  stockCode: string;
  /** Canonical English direction: "BUY" | "SELL" | "HOLD" | "WAIT" */
  direction: TradingSignalDirection;
  /** Confidence in [0, 1] */
  confidence: number;
  /** ISO datetime string */
  timestamp: string;
  /** Original raw direction string preserved for debugging */
  originalRaw: string;
}

/**
 * Adapter that converts raw Vietnamese Kinh Dich signals to normalised
 * English-direction signals for downstream consumption by the backtesting
 * engine.
 *
 * Depends only on domain/backtesting/signalNormalizer — zero infra imports.
 */
export class VNSignalAdapter {
  /**
   * Normalise a single raw Kinh Dich signal from Vietnamese to English.
   */
  normalize(raw: RawKinhDichSignal): NormalisedSignal {
    return {
      stockCode: raw.stockCode,
      direction: normalizeSignal(raw.rawDirection),
      confidence: raw.confidence,
      timestamp: raw.timestamp,
      originalRaw: raw.rawDirection,
    };
  }

  /**
   * Batch normalise an array of raw signals.
   * Filters out signals that normalise to "WAIT" if filterWait = true (default false).
   */
  normalizeAll(
    signals: RawKinhDichSignal[],
    options?: { filterWait?: boolean },
  ): NormalisedSignal[] {
    const normalised = signals.map((s) => this.normalize(s));
    if (options?.filterWait) {
      return normalised.filter((s) => s.direction !== "WAIT");
    }
    return normalised;
  }

  /**
   * Returns true if the raw signal string maps to a tradeable direction (BUY or SELL).
   * Convenience method for filtering at the producer side.
   */
  isTradeable(rawDirection: string): boolean {
    const dir = normalizeSignal(rawDirection);
    return dir === "BUY" || dir === "SELL";
  }
}
