/**
 * Infrastructure — Circuit Breaker
 *
 * A per-source circuit breaker that disables flaky data sources temporarily.
 *
 * State machine:
 *   closed   → normal operation; failures increment counter
 *   open     → rejects immediately; after resetTimeoutMs transitions to half-open
 *   half-open → allows limited attempts; success closes, failure re-opens
 *
 * Usage:
 *   const cb = new CircuitBreaker('cafef', { failureThreshold: 5 });
 *   const data = await cb.execute(() => fetchCafef());
 *
 * @module infrastructure/circuitBreaker
 */

import { logger } from "./logger.js";
import { logCircuitBreakerTransition } from "./observability/circuitBreakerLogger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Milliseconds before transitioning from open → half-open (default: 60000) */
  resetTimeoutMs: number;
  /** Successful attempts in half-open required to close the circuit (default: 2) */
  halfOpenMaxAttempts: number;
  /**
   * Exponential backoff multiplier applied to resetTimeoutMs on each re-open
   * from HALF_OPEN state (default: 1 = no backoff). A value of 2 doubles the
   * timeout on every failed half-open probe, preventing rapid CB thrash for
   * persistently failing sources (e.g. Reuters, TradingEconomics geo-blocks).
   * Task 1862f.
   */
  backoffMultiplier: number;
  /**
   * Maximum resetTimeoutMs after backoff (default: same as resetTimeoutMs = no cap).
   * Prevents infinite growth — backoff stops multiplying once this ceiling is reached.
   * Task 1862f.
   */
  maxResetTimeoutMs: number;
}

export interface CircuitBreakerStats {
  failures: number;
  successes: number;
  state: CircuitState;
  /** ISO timestamp of last failure, or null if no failure recorded */
  lastFailure: string | null;
  /** ISO timestamp when the circuit was opened, or null if not open */
  openedAt: string | null;
  /** Configured reset timeout in milliseconds (open → half-open) */
  resetTimeoutMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when execute() is called on an open circuit.
 * The function is never invoked — no network call is made.
 */
export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — call rejected to protect the system`);
    this.name = "CircuitOpenError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker implementation
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
  backoffMultiplier: 1,   // no backoff by default
  maxResetTimeoutMs: 60_000,
};

export class CircuitBreaker {
  private readonly name: string;
  private readonly config: CircuitBreakerConfig;

  // Internal state
  private _state: CircuitState = "closed";
  private _failures = 0;           // consecutive failures (closed) or total failures
  private _successes = 0;          // total successes (all time)
  private _consecutiveFailures = 0; // streak used to trip the breaker
  private _halfOpenSuccesses = 0;   // successes accumulated in half-open
  private _lastFailureAt: Date | null = null;
  private _openedAt: Date | null = null;
  /**
   * Current effective reset timeout — starts at config.resetTimeoutMs, doubles
   * on each HALF_OPEN re-open when backoffMultiplier > 1, resets on close.
   * Task 1862f.
   */
  private _currentResetTimeoutMs: number;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Ensure maxResetTimeoutMs is at least as large as the base timeout
    if (this.config.maxResetTimeoutMs < this.config.resetTimeoutMs) {
      this.config.maxResetTimeoutMs = this.config.resetTimeoutMs;
    }
    this._currentResetTimeoutMs = this.config.resetTimeoutMs;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Current circuit state (may transition open→half-open based on elapsed time). */
  get state(): CircuitState {
    this._checkTimeout();
    return this._state;
  }

  /**
   * Wrap an async function with circuit breaker protection.
   *
   * Behaviour per state:
   *   - closed:    calls fn; on failure increments counter; on Nth failure opens
   *   - open:      throws CircuitOpenError immediately
   *   - half-open: calls fn; success increments half-open counter; failure re-opens
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check for timeout before acting on state
    this._checkTimeout();

    if (this._state === "open") {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  /** Reset the circuit breaker to initial closed state (mainly for testing). */
  reset(): void {
    this._state = "closed";
    this._failures = 0;
    this._successes = 0;
    this._consecutiveFailures = 0;
    this._halfOpenSuccesses = 0;
    this._lastFailureAt = null;
    this._openedAt = null;
    this._currentResetTimeoutMs = this.config.resetTimeoutMs;
  }

  /** Snapshot of current statistics. */
  get stats(): CircuitBreakerStats {
    this._checkTimeout();
    return {
      failures: this._failures,
      successes: this._successes,
      state: this._state,
      lastFailure: this._lastFailureAt ? this._lastFailureAt.toISOString() : null,
      openedAt: this._state === "open" && this._openedAt ? this._openedAt.toISOString() : null,
      // Task 1862f: expose current (possibly backed-off) timeout, not the base config value
      resetTimeoutMs: this._currentResetTimeoutMs,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** If open and _currentResetTimeoutMs has elapsed, transition to half-open. */
  private _checkTimeout(): void {
    if (this._state !== "open") return;
    if (!this._openedAt) return;
    const elapsed = Date.now() - this._openedAt.getTime();
    if (elapsed >= this._currentResetTimeoutMs) {
      this._state = "half-open";
      this._halfOpenSuccesses = 0;
      this._openedAt = null;
      logger.info("[circuitBreaker] state changed OPEN→HALF_OPEN", {
        name: this.name,
        resetTimeoutMs: this._currentResetTimeoutMs,
        elapsed,
      });
      logCircuitBreakerTransition({
        timestamp: new Date().toISOString(),
        job: this.name,
        state_old: "open",
        state_new: "half-open",
        reason: "reset_timeout_elapsed",
        reset_timeout_ms: this._currentResetTimeoutMs,
        metrics: { elapsed },
      });
    }
  }

  private _onSuccess(): void {
    this._successes++;

    if (this._state === "half-open") {
      this._halfOpenSuccesses++;
      if (this._halfOpenSuccesses >= this.config.halfOpenMaxAttempts) {
        // Enough successful probes — close the circuit and reset backoff
        this._state = "closed";
        this._consecutiveFailures = 0;
        this._halfOpenSuccesses = 0;
        this._openedAt = null;
        // Task 1862f: reset backed-off timeout to base value on successful recovery
        this._currentResetTimeoutMs = this.config.resetTimeoutMs;
        logger.info("[circuitBreaker] state changed HALF_OPEN→CLOSED", {
          name: this.name,
          halfOpenMaxAttempts: this.config.halfOpenMaxAttempts,
        });
        logCircuitBreakerTransition({
          timestamp: new Date().toISOString(),
          job: this.name,
          state_old: "half-open",
          state_new: "closed",
          reason: "half_open_probes_passed",
          metrics: { halfOpenMaxAttempts: this.config.halfOpenMaxAttempts },
        });
      }
    } else {
      // closed — reset consecutive failure streak
      this._consecutiveFailures = 0;
    }
  }

  private _onFailure(): void {
    this._failures++;
    this._lastFailureAt = new Date();

    if (this._state === "half-open") {
      // Any failure in half-open → re-open
      this._openCircuit();
      return;
    }

    // closed state
    this._consecutiveFailures++;
    if (this._consecutiveFailures >= this.config.failureThreshold) {
      this._openCircuit();
    }
  }

  private _openCircuit(): void {
    const prevState: "closed" | "half-open" =
      this._state === "half-open" ? "half-open" : "closed";

    // Task 1862f: apply exponential backoff when re-opening from HALF_OPEN.
    // On the first trip (from CLOSED) the base timeout is used unchanged.
    // On each HALF_OPEN probe failure the timeout is multiplied by backoffMultiplier,
    // capped at maxResetTimeoutMs, preventing rapid re-open thrash for persistent failures.
    if (prevState === "half-open" && this.config.backoffMultiplier > 1) {
      this._currentResetTimeoutMs = Math.min(
        Math.round(this._currentResetTimeoutMs * this.config.backoffMultiplier),
        this.config.maxResetTimeoutMs,
      );
    }

    this._state = "open";
    this._openedAt = new Date();
    this._halfOpenSuccesses = 0;
    logger.warn("[circuitBreaker] state changed CLOSED→OPEN", {
      name: this.name,
      failureThreshold: this.config.failureThreshold,
      consecutiveFailures: this._consecutiveFailures,
      resetTimeoutMs: this._currentResetTimeoutMs,
    });
    logCircuitBreakerTransition({
      timestamp: this._openedAt.toISOString(),
      job: this.name,
      state_old: prevState,
      state_new: "open",
      reason: "error_threshold_exceeded",
      error_count: this._consecutiveFailures,
      reset_timeout_ms: this._currentResetTimeoutMs,
      metrics: {
        failureThreshold: this.config.failureThreshold,
        totalFailures: this._failures,
      },
    });
  }
}
