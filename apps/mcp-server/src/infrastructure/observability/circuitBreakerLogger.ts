/**
 * Infrastructure — Circuit Breaker Observability Logger
 *
 * Middleware logger for circuit breaker state transitions.
 * Emits structured JSON to stdout at INFO level so ops can parse/alert.
 *
 * Design: log-only, no logic changes. Zero impact on CB state machine.
 *
 * Usage:
 *   logCircuitBreakerTransition({
 *     timestamp: new Date().toISOString(),
 *     job: 'foreignFlow',
 *     state_old: 'closed',
 *     state_new: 'open',
 *     reason: 'error_threshold_exceeded',
 *     error_count: 5,
 *     reset_timeout_ms: 300_000,
 *   });
 *
 * Output (stdout):
 *   {"level":"INFO","type":"CB_TRANSITION","timestamp":"...","job":"...","state_old":"...","state_new":"...","reason":"..."}
 *
 * @module infrastructure/observability/circuitBreakerLogger
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CBTransition {
  /** ISO 8601 timestamp of the transition */
  timestamp: string;
  /** Breaker/job name (e.g. 'foreignFlow', 'reuters', 'pdfDownload') */
  job: string;
  /** State before transition */
  state_old: "closed" | "open" | "half-open";
  /** State after transition */
  state_new: "closed" | "open" | "half-open";
  /** Human-readable reason for the transition */
  reason: string;
  /** Consecutive failure count at transition time (optional) */
  error_count?: number;
  /** Configured reset timeout in ms (optional) */
  reset_timeout_ms?: number;
  /** Additional numeric metrics (optional) */
  metrics?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a circuit breaker state transition to stdout as structured JSON.
 *
 * Always emits — no silent failures. Safe to call from any CB transition point.
 */
export function logCircuitBreakerTransition(transition: CBTransition): void {
  console.log(
    JSON.stringify({
      level: "INFO",
      type: "CB_TRANSITION",
      ...transition,
    }),
  );
}
