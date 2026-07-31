/**
 * VPS Proxy Health — isStale() staleness rule
 *
 * Pure decision helper for get_vps_proxy_health (see vpsProxyTools.ts for
 * the MCP tool registration, vpsProxyHealthFormat.ts for the table
 * formatter that consumes isStale()). Threshold/service-set constants live
 * in ./vpsProxyStalenessConfig.ts (FIX-CI-SIZELINT-VPSPROXYSTALENESS-
 * REGRESSION-123L split — same shape as freshnessSlaChecker.ts ->
 * freshnessSlaConfig.ts, commit 9930ee008) and are re-exported below
 * unchanged so every existing import path (vpsProxyHealthFormat.ts, the
 * FIX-VPS-NEWS-STALE-FALSEPOS calibration test) keeps working with zero
 * call-site changes.
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
import {
  EXPECTED_INTERVALS,
  MARKET_HOURS_ONLY_SERVICES,
  NEWS_QUIET_HOURS_SERVICES,
  SBV_BUSINESS_DAY_SERVICES,
} from "./vpsProxyStalenessConfig.js";

export {
  EXPECTED_INTERVALS,
  MARKET_HOURS_ONLY_SERVICES,
  NEWS_QUIET_HOURS_SERVICES,
  SBV_BUSINESS_DAY_SERVICES,
};

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
