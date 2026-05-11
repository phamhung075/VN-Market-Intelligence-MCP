/**
 * Domain Service — Per-source API Rate Limiter (Task 207)
 *
 * Pure domain logic: tracks the last call time per host and enforces a minimum
 * interval between consecutive calls to the same external API endpoint.
 *
 * Design decisions:
 *   - Zero I/O: no imports from infrastructure or application layers.
 *   - Configurable: accepts a `RateLimitConfig` map at construction time.
 *     Falls back to `DEFAULT_INTERVALS` for any host not explicitly listed.
 *   - Testable: accepts an optional `nowFn` clock injector so tests can fast-
 *     forward time without real waits.
 *   - Thread-safe by design: Bun/Node.js is single-threaded; no locking needed.
 *
 * Usage in fetchers:
 *   ```typescript
 *   import { globalRateLimiter } from '../domain/services/rateLimiter.js';
 *
 *   export async function fetchCafeF(): Promise<RssItem[]> {
 *     if (!globalRateLimiter.canCall('cafef.vn')) {
 *       const wait = globalRateLimiter.getWaitMs('cafef.vn');
 *       logger.debug('[cafef] rate-limited', { waitMs: wait });
 *       return [];
 *     }
 *     globalRateLimiter.recordCall('cafef.vn');
 *     // … real fetch …
 *   }
 *   ```
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Maps hostname → minimum interval in milliseconds between consecutive calls.
 * A value of 0 means the host is unrestricted.
 */
export interface RateLimitConfig {
  [host: string]: number;
}

/** A single entry returned by `RateLimiter.getStatus()`. */
export interface RateLimitStatus {
  /** Hostname key (e.g. 'cafef.vn'). */
  host: string;
  /** Epoch ms when the last call was recorded. */
  lastCallMs: number;
  /** Milliseconds until the next allowed call; 0 when ready. */
  waitMs: number;
  /** True when `waitMs === 0` — i.e. a call is allowed right now. */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Default intervals (production configuration)
// ---------------------------------------------------------------------------

/**
 * Default minimum intervals (ms) between consecutive calls to each host.
 *
 * Values are chosen conservatively to stay well within free-tier limits and
 * avoid 429 / 503 responses from Vietnamese financial APIs.
 */
export const DEFAULT_INTERVALS: RateLimitConfig = {
  "cafef.vn": 8_000,
  "vnexpress.net": 8_000,
  "vneconomy.vn": 8_000,
  "news.google.com": 8_000,
  "api-finfo.vndirect.com.vn": 5_000,
  "api.hnx.vn": 5_000,
  "query1.finance.yahoo.com": 5_000,
  "tradingeconomics.com": 10_000,
  "portal.vietcombank.com.vn": 10_000,
  "clob.polymarket.com": 10_000,
  "gamma-api.polymarket.com": 10_000,
};

// ---------------------------------------------------------------------------
// RateLimiter class
// ---------------------------------------------------------------------------

/**
 * Tracks per-host last-call timestamps and enforces minimum intervals.
 *
 * Instantiate a single `globalRateLimiter` (exported below) for production.
 * In tests, inject a custom clock via the second constructor argument.
 */
export class RateLimiter {
  /** Combined config: defaults merged with (or replaced by) custom config. */
  private readonly config: RateLimitConfig;
  /** Last call timestamp (epoch ms) keyed by hostname. */
  private readonly lastCall: Map<string, number> = new Map();
  /** Clock function — returns current epoch ms. Injected for testing. */
  private readonly nowFn: () => number;

  /**
   * @param config - Optional custom config. Merged over DEFAULT_INTERVALS.
   *                 Pass `{}` to keep only defaults; pass `{ host: N }` to
   *                 override/add specific entries.
   * @param nowFn  - Optional clock override. Defaults to `Date.now`.
   */
  constructor(
    config?: RateLimitConfig,
    nowFn?: () => number,
  ) {
    this.config = config !== undefined
      ? { ...DEFAULT_INTERVALS, ...config }
      : { ...DEFAULT_INTERVALS };
    this.nowFn = nowFn ?? (() => Date.now());
  }

  // ── Core API ──────────────────────────────────────────────────────────────

  /**
   * Returns `true` when enough time has passed since the last recorded call
   * to `host`, or when the host has no configured minimum interval.
   *
   * @param host - Hostname to check (e.g. 'cafef.vn').
   */
  canCall(host: string): boolean {
    return this.getWaitMs(host) === 0;
  }

  /**
   * Records that a call to `host` was made right now.
   * Updates the internal last-call timestamp.
   *
   * @param host - Hostname of the API that was called.
   */
  recordCall(host: string): void {
    this.lastCall.set(host, this.nowFn());
  }

  /**
   * Returns the number of milliseconds until the next allowed call to `host`.
   * Returns 0 when the host is ready (no wait needed).
   *
   * @param host - Hostname to check.
   */
  getWaitMs(host: string): number {
    const interval = this.config[host];
    // Host not configured or interval is 0 → always allowed
    if (!interval) return 0;

    const last = this.lastCall.get(host);
    if (last === undefined) return 0; // never called → ready

    const elapsed = this.nowFn() - last;
    const remaining = interval - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  // ── Status / introspection ─────────────────────────────────────────────────

  /**
   * Returns a snapshot of rate-limit status for all hosts that have been
   * called at least once. Useful for the `get_rate_limit_status` MCP tool.
   *
   * @returns Array of `RateLimitStatus` entries, one per tracked host.
   */
  getStatus(): RateLimitStatus[] {
    const result: RateLimitStatus[] = [];
    for (const [host, lastCallMs] of this.lastCall.entries()) {
      const waitMs = this.getWaitMs(host);
      result.push({
        host,
        lastCallMs,
        waitMs,
        ready: waitMs === 0,
      });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Singleton — process-wide rate limiter for production fetchers
// ---------------------------------------------------------------------------

/**
 * Process-wide rate limiter instance.
 *
 * All infrastructure fetchers should import and use this singleton so that
 * rate-limit state is shared across the entire process (not reset per call).
 *
 * In tests, create a fresh `new RateLimiter(config, clockFn)` instead.
 */
export const globalRateLimiter = new RateLimiter();
