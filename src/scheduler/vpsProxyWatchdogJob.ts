/**
 * VPS Proxy Freshness Watchdog — observe-only alert.
 *
 * Problem:
 *   The VPS price proxy (Vultr host) is the ONLY path for VN stock prices —
 *   the MCP host is geo-blocked from upstream feeds. On 2026-03-27 the VPS
 *   crontab silently disappeared and market_prices went stale for 10 days
 *   before anyone noticed.
 *
 * Design (chosen over an SSH self-healer):
 *   Liveness of the VPS is the VPS's own responsibility. On the Vultr host
 *   the fetcher runs as a systemd service (`vn-price-fetch.service`) with
 *   `Restart=always`, which survives reboot, process crash, and accidental
 *   `crontab -r`. This file is the MCP-side observer: it watches
 *   `market_prices.updated_at` freshness and raises a Telegram alert when
 *   pushes stop during VN market hours. It does NOT try to heal the VPS —
 *   no SSH credentials ever touch the Bun process.
 *
 * What this job does:
 *   Every 10 min during VN market hours (02:00-08:59 UTC, Mon-Fri):
 *     1. Read MAX(market_prices.updated_at)
 *     2. If newer than STALE_THRESHOLD_MS → nothing to do
 *     3. Otherwise send one Telegram Chat alert, with dedup cooldown so a
 *        long outage produces a single message rather than a flood
 *
 * Operator action on the alert:
 *   SSH into the VPS and run `systemctl status vn-price-fetch` — the
 *   Telegram message includes the exact command. If the service is truly
 *   broken, redeploy via `./deploy-vps-proxy.sh` from a developer machine.
 *
 * @module scheduler/vpsProxyWatchdogJob
 */

import { getDb } from "../infrastructure/db/schema.js";
import { sendTelegramMarket } from "../infrastructure/notifiers/telegram.js";
import { logger } from "../infrastructure/logger.js";

/** If the newest market_prices row is older than this, raise an alert. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Minimum wait between two stale-alerts during the same outage. */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

let lastAlertAt = 0;

/**
 * Test-only reset of the in-module cooldown timer.
 */
export function _resetWatchdogCooldown(): void {
  lastAlertAt = 0;
}

/**
 * Returns true if the current UTC instant is inside VN market hours
 * (Mon-Fri 02:00-08:59 UTC, matching the VPS systemd schedule window).
 */
export function isVnMarketHoursUtc(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours();
  return h >= 2 && h <= 8;
}

/**
 * Most recent `market_prices.updated_at` as a Date, or null if table empty.
 * Exported for tests.
 */
export function readLatestPriceTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(updated_at) AS ts FROM market_prices",
      )
      .get();
    if (!row?.ts) return null;
    const d = new Date(row.ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * One run of the watchdog. Exported for tests + manual invocation.
 *
 * Return values:
 *   "ok"                  — prices fresh, nothing to do
 *   "off-hours"           — outside VN market hours, skipped
 *   "alert-sent"          — stale detected, operator notified
 *   "cooldown"            — stale but a recent alert already went out
 *   "notify-failed"       — telegram send returned false / threw
 */
export async function runVpsProxyWatchdog(
  options: {
    now?: Date;
    notify?: (message: string) => Promise<unknown>;
  } = {},
): Promise<string> {
  const now = options.now ?? new Date();

  const latest = readLatestPriceTimestamp();
  const ageMs = latest ? now.getTime() - latest.getTime() : Number.POSITIVE_INFINITY;

  // "Never populated" (latest === null) is a permanent deploy/config problem,
  // not a transient market-hours gap — alert regardless of the hour so a dead
  // proxy at restart is caught immediately rather than at next market open.
  if (latest !== null && !isVnMarketHoursUtc(now)) {
    return "off-hours";
  }

  if (ageMs < STALE_THRESHOLD_MS) {
    return "ok";
  }

  if (now.getTime() - lastAlertAt < ALERT_COOLDOWN_MS) {
    return "cooldown";
  }

  const ageMinutes = isFinite(ageMs) ? Math.round(ageMs / 60000) : -1;
  const latestStr = latest ? latest.toISOString() : "never";

  logger.warn("[vps-watchdog] market_prices stale during VN market hours", {
    ageMinutes,
    latestUpdatedAt: latestStr,
  });

  const message =
    `[VPS watchdog] Vultr price pushes stopped.\n` +
    `Last market_prices update: ${latestStr}\n` +
    `Stale for: ${ageMinutes >= 0 ? `${ageMinutes} min` : "no data since boot"}\n` +
    `\n` +
    `Operator action:\n` +
    `  ssh root@<VULTR_IP>\n` +
    `  systemctl status vn-price-fetch\n` +
    `  journalctl -u vn-price-fetch -n 50\n` +
    `\n` +
    `If the unit is broken, redeploy: ./deploy-vps-proxy.sh`;

  const notify =
    options.notify ??
    ((msg: string) => sendTelegramMarket(msg, { parseMode: "" }));

  try {
    const ok = await notify(message);
    if (ok === false) {
      return "notify-failed";
    }
    lastAlertAt = now.getTime();
    return "alert-sent";
  } catch (err) {
    logger.error("[vps-watchdog] alert send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "notify-failed";
  }
}
