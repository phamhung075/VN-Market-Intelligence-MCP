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

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
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
      resetTimeoutMs: this.config.resetTimeoutMs,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** If open and resetTimeoutMs has elapsed, transition to half-open. */
  private _checkTimeout(): void {
    if (this._state !== "open") return;
    if (!this._openedAt) return;
    const elapsed = Date.now() - this._openedAt.getTime();
    if (elapsed >= this.config.resetTimeoutMs) {
      this._state = "half-open";
      this._halfOpenSuccesses = 0;
      this._openedAt = null;
    }
  }

  private _onSuccess(): void {
    this._successes++;

    if (this._state === "half-open") {
      this._halfOpenSuccesses++;
      if (this._halfOpenSuccesses >= this.config.halfOpenMaxAttempts) {
        // Enough successful probes — close the circuit
        this._state = "closed";
        this._consecutiveFailures = 0;
        this._halfOpenSuccesses = 0;
        this._openedAt = null;
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
    this._state = "open";
    this._openedAt = new Date();
    this._halfOpenSuccesses = 0;
  }
}
