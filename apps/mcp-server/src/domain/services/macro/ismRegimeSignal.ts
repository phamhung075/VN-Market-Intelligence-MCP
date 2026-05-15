/**
 * Domain Service — ISM Manufacturing Regime Signal (Task 1910a)
 *
 * Pure function: classifies the ISM Manufacturing PMI regime based on
 * sub-component readings fetched from FRED.
 *
 * Thresholds (from architect brief ARCH_REVIEW_1910.md § SD-1):
 *   EXPANDING:   new_orders > 50  AND new_orders > prices_paid
 *   CONTRACTING: new_orders < 50  AND employment < 50
 *   MIXED:       all other cases + any null input
 *
 * DDD: PURE domain function — zero infrastructure imports, zero DB access,
 * zero Date.now() calls. Caller supplies pre-loaded sub-component values.
 *
 * @module domain/services/macro/ismRegimeSignal
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Regime classification for ISM Manufacturing sub-components. */
export type IsmRegime = "EXPANDING" | "CONTRACTING" | "MIXED";

/**
 * Input sub-component readings for ISM Manufacturing regime classification.
 * Any null value triggers MIXED classification.
 */
export interface IsmSubcomponentInput {
  /** NAPMNO — ISM New Orders index (0–100, >50 = expanding) */
  new_orders: number | null;
  /** NAPMEMP — ISM Employment index (0–100, >50 = expanding) */
  employment: number | null;
  /** NAPMPI — ISM Prices Paid index (0–100) */
  prices_paid: number | null;
  /** NAPMBI — ISM Backlog of Orders index (0–100) */
  backlog: number | null;
}

/** Output regime classification result. */
export interface IsmRegimeResult {
  /** Regime signal. */
  regime_signal: IsmRegime;
  /** Latest new_orders reading (null if unavailable). */
  new_orders: number | null;
  /** Latest employment reading (null if unavailable). */
  employment: number | null;
  /** Latest prices_paid reading (null if unavailable). */
  prices_paid: number | null;
  /** Latest backlog reading (null if unavailable). */
  backlog: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core domain function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify the ISM Manufacturing PMI regime from sub-component readings.
 *
 * Classification rules:
 *   - If any required input (new_orders, employment, prices_paid) is null → MIXED
 *   - EXPANDING:   new_orders > 50 AND new_orders > prices_paid
 *   - CONTRACTING: new_orders < 50 AND employment < 50
 *   - MIXED:       all other cases (boundary conditions, ambiguous readings)
 *
 * Note: backlog is included in the output for context but does not affect
 * regime classification per the architect spec.
 *
 * @param input  Sub-component readings (new_orders, employment, prices_paid, backlog).
 * @returns      IsmRegimeResult with regime_signal and all sub-component values.
 */
export function computeIsmRegimeSignal(
  input: IsmSubcomponentInput,
): IsmRegimeResult {
  const { new_orders, employment, prices_paid, backlog } = input;

  // Any null input → MIXED (cannot classify without data)
  if (new_orders === null || employment === null || prices_paid === null) {
    return {
      regime_signal: "MIXED",
      new_orders,
      employment,
      prices_paid,
      backlog,
    };
  }

  // EXPANDING: new orders above 50 threshold AND demand exceeds cost pressure
  if (new_orders > 50 && new_orders > prices_paid) {
    return {
      regime_signal: "EXPANDING",
      new_orders,
      employment,
      prices_paid,
      backlog,
    };
  }

  // CONTRACTING: new orders in contraction zone AND employment confirming weakness
  if (new_orders < 50 && employment < 50) {
    return {
      regime_signal: "CONTRACTING",
      new_orders,
      employment,
      prices_paid,
      backlog,
    };
  }

  // MIXED: boundary conditions (new_orders == 50, or conflicting signals)
  return {
    regime_signal: "MIXED",
    new_orders,
    employment,
    prices_paid,
    backlog,
  };
}
