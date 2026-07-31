/**
 * VPS Proxy Health — staleness thresholds + isStale() rule
 *
 * Pure decision helper for get_vps_proxy_health (see vpsProxyTools.ts for
 * the MCP tool registration, vpsProxyHealthFormat.ts for the table
 * formatter that consumes isStale()). Split out (task FIX-CI-SIZELINT-
 * MCPSERVER-SIX-UNCOVERED-OFFENDERS AC-4) to keep every file in this zone
 * under the 120L size-lint threshold.
 *
 * @module interface/mcp/tools/system/vpsProxyStaleness
 */

import type { VpsServiceHealth } from "../../../../infrastructure/db/vpsPushLogStore.js";
import {
  isVnMarketHours,
  isVnNewsPublishHours,
  isVnSbvBusinessDay,
  minutesSinceLastWindowEnd,
  minutesSinceLastNewsWindowEnd,
  minutesSinceLastSbvWindowEnd,
} from "../../../../domain/services/freshnessSlaChecker.js";

// Expected push intervals per service (minutes) — used during the active fetch window.
// Prices and foreign_flow are market-hours-only (Mon–Fri 02:00–08:59 UTC).
// Outside their window the stale check uses time-since-last-window-end logic.
export const EXPECTED_INTERVALS: Record<string, number> = {
  prices: 5,    // every 60s during market hours, allow 5min slack
  // FIX-VPS-NEWS-STALE-FALSEPOS (2026-07-31): was 10 ("every 5min, allow
  // 10min slack") since this file's origin (VPT-1) — that 5-min cadence was
  // never real. The VPS cron (`vn-news-fetch.service` / fetch-vn-news.sh,
  // docs/standards/cron-jobs.md) runs every 15min. Live push-log evidence
  // (7-day sample, 886 inter-push gaps measured during isVnNewsPublishHours):
  // p50=7.5min, p90=16.1min, p99=16.2min, hard cliff — only 1/886 (0.11%)
  // gaps exceeded 17min, and that one was a genuine outage, not cadence.
  // 20min = cadence(15) + slack, ~4min above the observed p99 ceiling —
  // resolves the routine false-STALE (was flagging ~42% of healthy checks)
  // while still well below the SLA/analysis-layer's 30min news threshold
  // (freshnessSlaChecker.ts DEFAULT_SLA_CONFIG) so real outages are still
  // caught fast by this fetch-layer check.
  news: 20,
  sbv: 60,      // every 30min, allow 60min slack
  bctc: 720,    // every 6h, allow 12h slack
};

// Services whose data is ONLY pushed during VN market hours.
// Outside Mon–Fri 02:00–08:59 UTC the VPS loops sleep by design.
export const MARKET_HOURS_ONLY_SERVICES = new Set(["prices", "foreign_flow"]);

// VPS service "news": publisher quiet hours overnight VN (UTC 15:00–00:00).
// Active window: 00:00–14:59 UTC (07:00–21:59 VN time). No market-hours gate.
export const NEWS_QUIET_HOURS_SERVICES = new Set(["news"]);

// VPS service "sbv": SBV FX rates published on business days only.
export const SBV_BUSINESS_DAY_SERVICES = new Set(["sbv"]);

/**
 * Determines whether a VPS service's last push is stale.
 *
 * For market-hours-only services (prices, foreign_flow):
 *   - During market hours (Mon–Fri 02:00–08:59 UTC): applies the tight 5-min interval.
 *   - Outside market hours: data is expected stale by design; not considered stale
 *     as long as data is no older than (minutesSinceLastWindowEnd + 30 min grace).
 *     This prevents weekend false-CRITICAL alerts on healthy services.
 *
 * For news (quiet hours overnight VN):
 *   - During publish hours (UTC 00:00–14:59): tight 10-min interval.
 *   - During quiet hours (UTC 15:00–23:59): threshold = time since last publish window + grace.
 *
 * For sbv (business days only):
 *   - On a VN business day: tight 60-min interval (SBV updates once daily).
 *   - On weekends/holidays: threshold = time since last SBV publish + grace.
 *
 * @param s VPS service health record
 * @param now Injectable current time for testing (default: Date.now())
 */
export function isStale(s: VpsServiceHealth, now: Date = new Date()): boolean {
  if (!s.lastPushAt) return true;

  // SQLite timestamps may lack the trailing 'Z'; append it only if missing.
  const rawTs = s.lastPushAt.endsWith("Z") ? s.lastPushAt : s.lastPushAt + "Z";
  const lastPushMs = new Date(rawTs).getTime();
  if (isNaN(lastPushMs)) return true;

  const ageMs = now.getTime() - lastPushMs;

  if (MARKET_HOURS_ONLY_SERVICES.has(s.service)) {
    if (isVnMarketHours(now)) {
      // Tight real-time SLA during active window
      const expectedMin = EXPECTED_INTERVALS[s.service] ?? 5;
      return ageMs > expectedMin * 60 * 1000;
    }
    // Off-hours: expected stale by design.
    // Only flag as stale if data is older than last window end + 30 min grace.
    const sinceWindowEndMin = minutesSinceLastWindowEnd(now);
    const offHoursThresholdMs = (sinceWindowEndMin + 30) * 60 * 1000;
    return ageMs > offHoursThresholdMs;
  }

  if (NEWS_QUIET_HOURS_SERVICES.has(s.service)) {
    if (isVnNewsPublishHours(now)) {
      // During publish window: tight interval
      const expectedMin = EXPECTED_INTERVALS[s.service] ?? 10;
      return ageMs > expectedMin * 60 * 1000;
    }
    // Quiet hours: threshold = time since last publish window end + grace
    const sinceNewsMin = minutesSinceLastNewsWindowEnd(now);
    return ageMs > (sinceNewsMin + 30) * 60 * 1000;
  }

  if (SBV_BUSINESS_DAY_SERVICES.has(s.service)) {
    if (isVnSbvBusinessDay(now)) {
      // Business day: tight interval
      const expectedMin = EXPECTED_INTERVALS[s.service] ?? 60;
      return ageMs > expectedMin * 60 * 1000;
    }
    // Weekend/holiday: threshold = time since last SBV publish + grace
    const sinceSbvMin = minutesSinceLastSbvWindowEnd(now);
    return ageMs > (sinceSbvMin + 30) * 60 * 1000;
  }

  const expectedMin = EXPECTED_INTERVALS[s.service] ?? 60;
  return ageMs > expectedMin * 60 * 1000;
}
