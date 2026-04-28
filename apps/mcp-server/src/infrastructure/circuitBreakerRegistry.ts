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
  /**
   * Công Báo Chính Phủ — VN government site; geo-blocked from France.
   * Lower reset timeout (5 min) to retry promptly once VPS routing is added.
   * Task 1225.
   */
  congbao: new CircuitBreaker("congbao", {
    failureThreshold: 5,
    resetTimeoutMs: 300_000, // 5 minutes
  }),
  /**
   * SBV (State Bank of Vietnam) circular portal.
   * Slow and occasionally times out; 5 min reset timeout.
   * Task 1225.
   */
  sbvCircular: new CircuitBreaker("sbvCircular", {
    failureThreshold: 5,
    resetTimeoutMs: 300_000, // 5 minutes
  }),
  /**
   * Foreign Flow VPS push endpoint.
   * Task 1566: Detect sustained database write failures; back off after 5 failures.
   * Task 1337: Increased resetTimeoutMs from 30s to 5 minutes to prevent half-open
   * probe thrash caused by repeated 422 failures flooding the log.
   * Task 1388: halfOpenMaxAttempts=1 — single successful probe closes circuit.
   * After the underlying DB error is fixed, the very next half-open probe auto-closes
   * without needing a second success (avoids overnight "stuck OPEN" requiring manual reset).
   */
  foreignFlow: new CircuitBreaker("foreignFlow", {
    failureThreshold: 5,
    resetTimeoutMs: 300_000, // 5 minutes
    halfOpenMaxAttempts: 1,  // 1 probe sufficient — faster auto-recovery
  }),
  /**
   * NewsAPI.org fallback fetcher.
   * Task 1345a: Activated when VPS Reuters push is absent >90 min.
   * Back off after 5 failures, 5 min reset to avoid burning free-tier quota.
   */
  newsapi: new CircuitBreaker("newsapi", {
    failureThreshold: 5,
    resetTimeoutMs: 300_000, // 5 minutes
  }),
  /**
   * MarketWatch RSS fallback fetcher.
   * Task 1345a: Independent of Reuters and NewsAPI breakers.
   */
  marketwatch: new CircuitBreaker("marketwatch"),
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
