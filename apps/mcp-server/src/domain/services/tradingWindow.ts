/**
 * VN Trading Window — shared domain helper.
 *
 * The Vietnamese stock market (HOSE / HNX / UPCOM) has a fixed daily trading
 * window. The VPS price proxy on Vultr only pushes price updates during this
 * window, so `market_prices.updated_at` is EXPECTED to be empty/stale outside
 * of it. Any tool that reports price freshness to users or to analysis agents
 * must distinguish "outside trading window — expected empty" from "inside
 * trading window — data feed broken", otherwise agents raise false-positive
 * HIGH reports during normal overnight hours.
 *
 * Trading window: Mon–Fri, 02:00–08:59 UTC
 *   = 09:00–15:59 Vietnam time (GMT+7)
 *   covers morning session (09:00–11:30), lunch break, afternoon session
 *   (13:00–15:00), and the ATC close (15:00–15:15) with a small tail buffer.
 *
 * This matches the window used by `vpsProxyWatchdogJob` when deciding whether
 * stale `market_prices` should page the operator.
 *
 * @module domain/services/tradingWindow
 */

/**
 * Returns true if the given instant is inside the VN market trading window
 * (Mon–Fri 02:00–08:59 UTC).
 *
 * @param now - Instant to test (default: current time).
 */
export function isVnTradingWindow(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours();
  return h >= 2 && h <= 8;
}

/**
 * Human-readable short label for the current trading-window state.
 * Used as a banner in user-facing tools so downstream consumers (including
 * analysis agents) can tell "expected empty" from "data feed broken".
 *
 * @param now - Instant to test (default: current time).
 */
export function tradingWindowLabel(now: Date = new Date()): string {
  return isVnTradingWindow(now)
    ? "VN market OPEN (02:00–08:59 UTC)"
    : "VN market CLOSED (outside 02:00–08:59 UTC, Mon–Fri) — empty prices are expected";
}
