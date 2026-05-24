/**
 * reading_composer — Ports (dependency interfaces)
 *
 * Fence-B: this file imports ONLY from domain models or stdlib.
 * Zero imports from application, interface, or infrastructure layers.
 *
 * Decision: Option B (inline slim interface) chosen over Option A (re-export from
 * domain KinhDichRepositoryPort) because:
 *   - KinhDichRepositoryPort exposes getLatestReading() which the module does not need.
 *   - A slimmer MarkovPort with a module-scoped MarkovData shape (transitionProb +
 *     historicalConfidence) avoids leaking the infrastructure DB row schema into the
 *     module tier and is future-proof for Phase 2 when the real Markov adapter is wired.
 *   - TypeScript structural typing guarantees any concrete infra impl that satisfies
 *     this interface is usable at the composition root without modification.
 */

/**
 * Markov transition data for a hexagram — shape owned by the module tier.
 *
 * Note: domain/models.ts has its own MarkovData (nextMostLikely, nextName, probability)
 * used internally by domain/services.ts computeReading(). This module-tier MarkovData
 * carries the blending weights needed for confidence adjustment (transitionProb +
 * historicalConfidence), distinct from the domain's next-hexagram prediction data.
 */
export interface MarkovData {
  /** Markov transition probability for this hexagram (0–1). */
  transitionProb: number;
  /** Historical confidence derived from past readings (0–1). */
  historicalConfidence: number;
}

/**
 * Port for Markov data access — injected into composeReading().
 *
 * Implementations live in src/infrastructure/. This interface is the
 * inversion-of-control boundary: the module depends on the interface,
 * not the concrete adapter.
 */
export interface MarkovPort {
  /**
   * Return Markov blending data for a given hexagram number, or null if unavailable.
   *
   * @param hexagramNumber - Hexagram number (1–64)
   * @returns MarkovData or null if no historical data exists for this hexagram
   */
  getMarkovData(hexagramNumber: number): MarkovData | null;
}
