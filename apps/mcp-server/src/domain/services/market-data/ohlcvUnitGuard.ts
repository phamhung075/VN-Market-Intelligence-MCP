/**
 * OHLCV Unit Guard — domain service
 *
 * Task CONTAM-1 / Sprint OHLCV-UNIT-CONTAM
 *
 * Validates that OHLCV values conform to the canonical full-VND unit invariant.
 * Provides a pure normalizer that converts thousand-scale rows to full-VND by
 * scaling the WHOLE row (never per-field) — preserving all intra-row relationships.
 *
 * Canonical unit: full VND (e.g. VNM = 80,000, FPT = 140,000).
 * Stock floor: 100 VND. Any value < 100 for a stock indicates thousand-VND leakage.
 *
 * Pure functions — no I/O, no logging, no external dependencies.
 * Callers (Writers A–E) are responsible for logging rejected rows.
 *
 * DDD layer: domain/services (no infrastructure imports allowed)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum valid full-VND price for any Vietnamese stock (catches thousand-VND leakage) */
export const STOCK_MIN_VND = 100;

/** Maximum valid full-VND price for any Vietnamese stock (above all known VN stocks) */
export const STOCK_MAX_VND = 10_000_000;

/** Maximum H/L ratio for a single OHLCV row (sanity guard against extreme swings) */
export const HILO_RATIO_MAX = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OhlcvValidationResult {
  valid: boolean;
  /** Populated when valid=false; describes the specific rule that failed */
  reason?: string;
}

/** Minimal OHLCV row shape used by normalizeOhlcvToVnd */
export interface Ohlcv {
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateOhlcvUnit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that open/high/low/close conform to the full-VND unit invariant.
 *
 * Rules (in application order — first failure wins):
 *  1. Zero guard — any zero value is invalid market data.
 *  2. Stock range guard — for stocks: all four fields must be in [STOCK_MIN_VND, STOCK_MAX_VND].
 *     (Index type is exempt — VNINDEX ~1200 is valid.)
 *  3. High/Low ratio sanity — high / low must be ≤ HILO_RATIO_MAX.
 *  4. Plausibility — low ≤ open ≤ high  AND  low ≤ close ≤ high.
 *
 * @param code   Ticker symbol (used in reason string for caller logging)
 * @param type   "stock" | "index"
 * @param open   Open price (full VND expected)
 * @param high   High price
 * @param low    Low price
 * @param close  Close price
 *
 * @returns OhlcvValidationResult — { valid: true } or { valid: false, reason }
 */
export function validateOhlcvUnit(
  code: string,
  type: "stock" | "index",
  open: number,
  high: number,
  low: number,
  close: number,
): OhlcvValidationResult {
  // Rule 1 — Zero guard
  const fields: [string, number][] = [
    ["open", open],
    ["high", high],
    ["low", low],
    ["close", close],
  ];
  for (const [field, value] of fields) {
    if (value === 0) {
      return { valid: false, reason: `zero_ohlc: ${code} field=${field}` };
    }
  }

  // Rule 2 — Stock range guard (index exempt)
  if (type === "stock") {
    for (const [field, value] of fields) {
      if (value < STOCK_MIN_VND) {
        return {
          valid: false,
          reason: `unit contamination: ${code} ${field}=${value} below_100 (thousand-VND leakage)`,
        };
      }
      if (value > STOCK_MAX_VND) {
        return {
          valid: false,
          reason: `unit contamination: ${code} ${field}=${value} above_10m out of range`,
        };
      }
    }
  }

  // Rule 3 — High/Low ratio sanity
  if (low > 0 && high / low > HILO_RATIO_MAX) {
    const ratio = (high / low).toFixed(2);
    return {
      valid: false,
      reason: `hilo_ratio_too_wide: ${code} ${ratio} (max=${HILO_RATIO_MAX})`,
    };
  }

  // Rule 4 — Plausibility: low ≤ open ≤ high AND low ≤ close ≤ high
  if (open < low || open > high || close < low || close > high) {
    return {
      valid: false,
      reason: `implausible ohlc: ${code} low=${low} open=${open} high=${high} close=${close}`,
    };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeOhlcvToVnd
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes an OHLCV row to canonical full-VND unit.
 *
 * Rules:
 *  1. type="index" → return v unchanged (no range guard applies to indices).
 *  2. type="stock":
 *     - If the row is thousand-scale (max(open,high,low,close) > 0 AND < STOCK_MIN_VND):
 *       multiply ALL four fields by 1000 — WHOLE-ROW scaling only, never per-field.
 *       This preserves all intra-row relationships (low ≤ open/close ≤ high ratio unchanged).
 *     - Otherwise: return v unchanged (already full-VND).
 *  3. Zero/empty row (all zeros or representative ≤ 0) → return unchanged.
 *     Let validateOhlcvUnit reject it.
 *
 * IMPORTANT: Per-field scaling (scaling only some fields) is the original contamination bug.
 * This function NEVER scales individual fields independently.
 *
 * @param type  "stock" | "index"
 * @param v     OHLCV row (four numeric fields)
 * @returns     Normalized Ohlcv (same object shape)
 */
export function normalizeOhlcvToVnd(type: "stock" | "index", v: Ohlcv): Ohlcv {
  // Rule 1 — index: return unchanged
  if (type === "index") {
    return v;
  }

  // Rule 3 — zero/empty guard (representative magnitude = max of four fields)
  const mag = Math.max(v.open, v.high, v.low, v.close);
  if (mag <= 0) {
    return v;
  }

  // Rule 2 — thousand-scale detection and WHOLE-ROW normalization
  if (mag < STOCK_MIN_VND) {
    return {
      open: v.open * 1000,
      high: v.high * 1000,
      low: v.low * 1000,
      close: v.close * 1000,
    };
  }

  // Already full-VND — no-op
  return v;
}
