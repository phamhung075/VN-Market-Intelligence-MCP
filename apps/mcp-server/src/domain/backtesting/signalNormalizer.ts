/**
 * signalNormalizer.ts — Task 1842b / 1842c
 *
 * Pure domain function — zero imports from infrastructure.
 *
 * Maps Vietnamese Kinh Dich trading signal strings to canonical English
 * TradingSignalDirection values. Used by backtestSignalRepo to normalise
 * raw `trading_signal` column values before returning them to callers.
 *
 * Layer: domain/backtesting — no I/O, no side effects.
 */

/** Canonical English trading signal direction. */
export type TradingSignalDirection = "BUY" | "SELL" | "HOLD" | "WAIT";

/**
 * Normalise a raw signal string (Vietnamese or English) to a canonical
 * TradingSignalDirection.
 *
 * Vietnamese → English mapping:
 *   MUA (any suffix)         → BUY
 *   BAN (any suffix)         → SELL
 *   GIU (any suffix)         → HOLD
 *   THAN TRONG (any suffix)  → WAIT
 *   CHO (any suffix)         → WAIT
 *
 * Pass-through for already-English strings:
 *   BUY → BUY, SELL → SELL, HOLD → HOLD, WAIT → WAIT
 *
 * Unknown signals fall back to WAIT (no trade generated).
 */
export function normalizeSignal(raw: string): TradingSignalDirection {
  const upper = raw.toUpperCase().trim();
  if (upper.startsWith("MUA")) return "BUY";
  if (upper.startsWith("BAN")) return "SELL";
  if (upper.startsWith("GIU")) return "HOLD";
  if (upper.startsWith("THAN TRONG")) return "WAIT";
  if (upper.startsWith("CHO")) return "WAIT";
  // pass-through for already-English signals
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
  if (upper === "HOLD") return "HOLD";
  if (upper === "WAIT") return "WAIT";
  return "WAIT"; // fallback — unknown signals become WAIT (no trade generated)
}
