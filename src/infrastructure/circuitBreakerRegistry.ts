/**
 * Infrastructure — Circuit Breaker Registry
 *
 * Central registry of per-source circuit breakers.
 * Import `breakers.cafef` etc. to wrap fetcher calls.
 *
 * SSC breaker is configured with a lower failure threshold (3) and
 * a longer reset timeout (5 min) because the SSC portal is slow and
 * unreliable — we want to back off faster and wait longer.
 *
 * @module infrastructure/circuitBreakerRegistry
 */

import { CircuitBreaker, type CircuitState } from "./circuitBreaker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Named breakers — one per external data source
// ─────────────────────────────────────────────────────────────────────────────

export const breakers = {
  cafef: new CircuitBreaker("cafef"),
  vnexpress: new CircuitBreaker("vnexpress"),
  reuters: new CircuitBreaker("reuters"),
  vneconomy: new CircuitBreaker("vneconomy"),
  hose: new CircuitBreaker("hose"),
  hnx: new CircuitBreaker("hnx"),
  /** SSC portal is slow — fail faster, wait longer before retry */
  ssc: new CircuitBreaker("ssc", {
    failureThreshold: 3,
    resetTimeoutMs: 300_000, // 5 minutes
  }),
  tradingEconomics: new CircuitBreaker("tradingEconomics"),
  yahooFinance: new CircuitBreaker("yahooFinance"),
  sbv: new CircuitBreaker("sbv"),
  /** Polymarket CLOB — back off after 5 failures, wait 10 min before retry */
  polymarket: new CircuitBreaker("polymarket", {
    failureThreshold: 5,
    resetTimeoutMs: 600_000, // 10 minutes
  }),
} as const;

export type BreakerName = keyof typeof breakers;

// ─────────────────────────────────────────────────────────────────────────────
// Registry helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a snapshot of state + failure count for every registered breaker.
 *
 * Example:
 *   { cafef: { state: 'closed', failures: 0 }, ssc: { state: 'open', failures: 3 } }
 */
export function getAllBreakerStats(): Record<string, { state: CircuitState; failures: number }> {
  const result: Record<string, { state: CircuitState; failures: number }> = {};
  for (const [name, breaker] of Object.entries(breakers)) {
    const s = breaker.stats;
    result[name] = { state: s.state, failures: s.failures };
  }
  return result;
}

/**
 * Reset all breakers to closed state with zero counters.
 * Useful for testing or after a known system-wide recovery.
 */
export function resetAllBreakers(): void {
  for (const breaker of Object.values(breakers)) {
    breaker.reset();
  }
}
