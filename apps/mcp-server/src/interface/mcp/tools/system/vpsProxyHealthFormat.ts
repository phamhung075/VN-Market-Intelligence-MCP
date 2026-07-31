/**
 * VPS Proxy Health — text-table formatting
 *
 * Pure formatter for get_vps_proxy_health (see vpsProxyTools.ts for the MCP
 * tool registration, vpsProxyStaleness.ts for the isStale() rule this
 * consumes). Split out (task FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-
 * OFFENDERS AC-4) to keep every file in this zone under the 120L size-lint
 * threshold.
 *
 * @module interface/mcp/tools/system/vpsProxyHealthFormat
 */

import type { VpsServiceHealth } from "../../../../infrastructure/db/vpsPushLogStore.js";
import {
  isVnMarketHours,
  isVnNewsPublishHours,
  isVnSbvBusinessDay,
} from "../../../../domain/services/freshnessSlaChecker.js";
import {
  isStale,
  MARKET_HOURS_ONLY_SERVICES,
  NEWS_QUIET_HOURS_SERVICES,
  SBV_BUSINESS_DAY_SERVICES,
} from "./vpsProxyStaleness.js";

/**
 * FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE:
 * `demandQueueDepths` separates OBSERVATION (isStale — raw push-age vs.
 * expected interval, unchanged) from INFERENCE (the narration composed
 * below). A service present in this map with a resolved depth of exactly 0
 * is a demand-driven route whose own work queue is confirmed empty right
 * now — a large push-age there is IDLE-NO-WORK, never proxy-down evidence.
 * Generic: keyed by service name, works for any current or future
 * demand-driven route (see DEMAND_QUEUE_SQL in vpsDemandQueue.ts), not just
 * "bctc". A service absent from the map (or with a null/nonzero depth) is
 * unaffected — falls through to the pre-fix behavior unchanged.
 */
export function formatHealth(
  services: VpsServiceHealth[],
  now: Date = new Date(),
  demandQueueDepths: Partial<Record<string, number | null>> = {},
): string {
  const lines: string[] = [
    "=== VPS PROXY HEALTH ===",
    "",
    "Service     | Last Push           | Items | Status  | 24h Pushes | 24h Errors | Stale?",
    "------------|---------------------|-------|---------|------------|------------|-------",
  ];

  const isIdleNoWork = (s: VpsServiceHealth): boolean =>
    demandQueueDepths[s.service] === 0;

  for (const s of services) {
    const lastPush = s.lastPushAt ?? "never";
    const stale = isStale(s, now);
    // Services with time-gated publishing show "off-hours" instead of "YES" outside window
    const isOffHours =
      (MARKET_HOURS_ONLY_SERVICES.has(s.service) && !isVnMarketHours(now)) ||
      (NEWS_QUIET_HOURS_SERVICES.has(s.service) && !isVnNewsPublishHours(now)) ||
      (SBV_BUSINESS_DAY_SERVICES.has(s.service) && !isVnSbvBusinessDay(now));
    const staleFlag = stale
      ? (isOffHours ? "off-hours" : (isIdleNoWork(s) ? "idle-no-work" : "YES"))
      : "no";

    lines.push(
      `${s.service.padEnd(12)}| ${lastPush.padEnd(20)}| ${String(s.lastItemsCount).padEnd(6)}| ${s.lastStatus.padEnd(8)}| ${String(s.pushes24h).padEnd(11)}| ${String(s.errors24h).padEnd(11)}| ${staleFlag}`,
    );
  }

  // Summary — off-hours AND idle-no-work stale services excluded from the "STALE" warning
  const isServiceOffHours = (s: VpsServiceHealth) =>
    (MARKET_HOURS_ONLY_SERVICES.has(s.service) && !isVnMarketHours(now)) ||
    (NEWS_QUIET_HOURS_SERVICES.has(s.service) && !isVnNewsPublishHours(now)) ||
    (SBV_BUSINESS_DAY_SERVICES.has(s.service) && !isVnSbvBusinessDay(now));

  const trueStaleServices = services.filter((s) => {
    if (!isStale(s, now)) return false;
    // Services outside their active window are expected stale — suppress warning
    if (isServiceOffHours(s)) return false;
    // Demand-driven routes with a confirmed-empty own queue are idle by
    // design — a stale push-age here is NOT proxy-down evidence.
    if (isIdleNoWork(s)) return false;
    return true;
  });
  const offHoursServices = services.filter(
    (s) => isServiceOffHours(s) && isStale(s, now)
  );
  const idleNoWorkServices = services.filter(
    (s) => isIdleNoWork(s) && isStale(s, now) && !isServiceOffHours(s)
  );
  const errorServices = services.filter((s) => s.errors24h > 0);

  lines.push("");
  if (trueStaleServices.length > 0) {
    lines.push(`STALE: ${trueStaleServices.map((s) => s.service).join(", ")} — VPS may be down or unreachable`);
  }
  if (offHoursServices.length > 0) {
    lines.push(`OFF-HOURS (by design): ${offHoursServices.map((s) => s.service).join(", ")} — source sleeps outside its active publishing window`);
  }
  if (idleNoWorkServices.length > 0) {
    lines.push(`IDLE-NO-WORK (by design): ${idleNoWorkServices.map((s) => s.service).join(", ")} — demand-driven route(s) with an empty own work queue right now; large push-age reflects no work being due, not a proxy fault`);
  }
  if (errorServices.length > 0) {
    lines.push(`ERRORS: ${errorServices.map((s) => `${s.service}(${s.errors24h})`).join(", ")}`);
  }
  if (trueStaleServices.length === 0 && errorServices.length === 0) {
    lines.push("All VPS proxy services healthy.");
  }

  // Recent push log (last 10 across all services)
  lines.push("");
  lines.push("--- Recent Push Log (last 10) ---");

  return lines.join("\n");
}
