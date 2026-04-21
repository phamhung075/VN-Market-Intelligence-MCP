/**
 * Price Staleness Watchdog (TASK-229)
 *
 * Detects when market price data goes stale >6h during VN market hours (Mon-Fri 02:00-08:59 UTC).
 * Fires alerts via dual channels (WORK + MARKET) with 30-min cooldown and recovery messaging.
 *
 * Design: Pure domain functions with dependency injection for all I/O.
 */

// ── Constants ──────────────────────────────────────────────────────────────
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;      // 6 hours
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;           // 30 minutes
const MARKET_HOURS_START = 2;                        // UTC 02:00
const MARKET_HOURS_END = 8;                          // UTC 08:59 (inclusive)

// ── Module State (for cooldown + recovery tracking) ────────────────────────
let lastAlertAt: Date | null = null;
let lastWasStale = false;

// ── Exported Functions (stubs for RED phase) ──────────────────────────────

/**
 * Detects when market price data goes stale >6h during VN market hours.
 *
 * Return values:
 *   "ok"            — prices fresh, nothing to do
 *   "off-hours"     — outside VN market hours (Mon-Fri 02:00-08:59 UTC)
 *   "alert-sent"    — stale detected + alert sent to WORK + MARKET
 *   "cooldown"      — stale but cooldown in effect (no new alert)
 *   "restored"      — data just recovered after prior alert (recovery message sent)
 *   "notify-failed" — alert send attempt failed
 */
export async function priceUpdateWatchdog(
  options?: {
    now?: Date;
    notify?: (message: string) => Promise<unknown>;
    notifyUser?: (message: string) => Promise<unknown>;
    readPrice?: () => Date | null;
  },
): Promise<string> {
  // TDD RED: stub implementation
  return "ok";
}

/**
 * Returns true if current UTC instant is inside VN market hours
 * (Mon-Fri 02:00-08:59 UTC).
 */
export function isVnMarketHoursUtc(now?: Date): boolean {
  // TDD RED: stub implementation
  return false;
}

/**
 * Reads MAX(market_prices.updated_at) or null if table empty.
 * Filters out TEST/PROBE test rows.
 */
export function readLatestPriceTimestamp(): Date | null {
  // TDD RED: stub implementation
  return null;
}

/**
 * Test-only: Reset cooldown timer for test isolation.
 */
export function _resetWatchdogCooldown(): void {
  lastAlertAt = null;
}

/**
 * Test-only: Reset staleness flag for test isolation.
 */
export function _resetWatchdogStaleFlag(): void {
  lastWasStale = false;
}
