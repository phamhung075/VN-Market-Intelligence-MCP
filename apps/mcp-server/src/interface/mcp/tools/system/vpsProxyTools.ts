/**
 * VPS Proxy Health MCP Tool
 *
 * Provides observability into the 4 VPS proxy services:
 * prices, news, sbv, bctc — showing last push time, item counts,
 * error rates, and staleness warnings.
 *
 * @module interface/mcp/tools/vpsProxyTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getVpsProxyHealth, type VpsServiceHealth } from "../../../../infrastructure/db/vpsPushLogStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { isVnMarketHours, minutesSinceLastWindowEnd } from "../../../../domain/services/freshnessSlaChecker.js";
import type { Database } from "bun:sqlite";

// Expected push intervals per service (minutes) — used during the active fetch window.
// Prices and foreign_flow are market-hours-only (Mon–Fri 02:00–08:59 UTC).
// Outside their window the stale check uses time-since-last-window-end logic.
const EXPECTED_INTERVALS: Record<string, number> = {
  prices: 5,    // every 60s during market hours, allow 5min slack
  news: 10,     // every 5min, allow 10min slack
  sbv: 60,      // every 30min, allow 60min slack
  bctc: 720,    // every 6h, allow 12h slack
};

// Services whose data is ONLY pushed during VN market hours.
// Outside Mon–Fri 02:00–08:59 UTC the VPS loops sleep by design.
const MARKET_HOURS_ONLY_SERVICES = new Set(["prices", "foreign_flow"]);

function formatHealth(services: VpsServiceHealth[], now: Date = new Date()): string {
  const lines: string[] = [
    "=== VPS PROXY HEALTH ===",
    "",
    "Service     | Last Push           | Items | Status  | 24h Pushes | 24h Errors | Stale?",
    "------------|---------------------|-------|---------|------------|------------|-------",
  ];

  for (const s of services) {
    const lastPush = s.lastPushAt ?? "never";
    const stale = isStale(s, now);
    // Market-hours-only services show "off-hours" instead of "YES" outside window
    const isOffHours = MARKET_HOURS_ONLY_SERVICES.has(s.service) && !isVnMarketHours(now);
    const staleFlag = stale
      ? (isOffHours ? "off-hours" : "YES")
      : "no";

    lines.push(
      `${s.service.padEnd(12)}| ${lastPush.padEnd(20)}| ${String(s.lastItemsCount).padEnd(6)}| ${s.lastStatus.padEnd(8)}| ${String(s.pushes24h).padEnd(11)}| ${String(s.errors24h).padEnd(11)}| ${staleFlag}`,
    );
  }

  // Summary — off-hours stale services excluded from the "STALE" warning
  const trueStaleServices = services.filter((s) => {
    if (!isStale(s, now)) return false;
    // Market-hours-only services outside active window are expected stale — suppress warning
    if (MARKET_HOURS_ONLY_SERVICES.has(s.service) && !isVnMarketHours(now)) return false;
    return true;
  });
  const offHoursServices = services.filter(
    (s) => MARKET_HOURS_ONLY_SERVICES.has(s.service) && !isVnMarketHours(now) && !isStale(s, now) === false
      && isStale(s, now)
  );
  const errorServices = services.filter((s) => s.errors24h > 0);

  lines.push("");
  if (trueStaleServices.length > 0) {
    lines.push(`STALE: ${trueStaleServices.map((s) => s.service).join(", ")} — VPS may be down or unreachable`);
  }
  if (offHoursServices.length > 0) {
    lines.push(`OFF-HOURS (by design): ${offHoursServices.map((s) => s.service).join(", ")} — market-hours-only; VPS fetch loop sleeps outside Mon-Fri 02:00-08:59 UTC`);
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

/**
 * Determines whether a VPS service's last push is stale.
 *
 * For market-hours-only services (prices, foreign_flow):
 *   - During market hours (Mon–Fri 02:00–08:59 UTC): applies the tight 5-min interval.
 *   - Outside market hours: data is expected stale by design; not considered stale
 *     as long as data is no older than (minutesSinceLastWindowEnd + 30 min grace).
 *     This prevents weekend false-CRITICAL alerts on healthy services.
 *
 * @param s VPS service health record
 * @param now Injectable current time for testing (default: Date.now())
 */
function isStale(s: VpsServiceHealth, now: Date = new Date()): boolean {
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

  const expectedMin = EXPECTED_INTERVALS[s.service] ?? 60;
  return ageMs > expectedMin * 60 * 1000;
}

export function registerVpsProxyTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_vps_proxy_health",
    "Shows health status of all 4 VPS proxy services (prices, news, sbv, bctc). " +
    "Displays last push timestamp, item counts, error rates, and staleness warnings. " +
    "Use to debug VPS connectivity, geo-block bypass, and data freshness issues.",
    {
      service: z
        .enum(["all", "prices", "news", "sbv", "bctc"])
        .optional()
        .default("all")
        .describe("Filter to a specific service, or 'all' (default)"),
    },
    async ({ service }) => {
      const db = _testDb ?? getDb();
      let services = getVpsProxyHealth(db);

      if (service !== "all") {
        services = services.filter((s) => s.service === service);
      }

      let output = formatHealth(services);

      // Append recent log entries
      const logRows = db.prepare(
        `SELECT service, items_count, status, error_msg, duration_ms, pushed_at
         FROM vps_push_log
         ORDER BY pushed_at DESC LIMIT 10`,
      ).all() as Array<{
        service: string;
        items_count: number;
        status: string;
        error_msg: string | null;
        duration_ms: number | null;
        pushed_at: string;
      }>;

      if (logRows.length > 0) {
        for (const row of logRows) {
          const dur = row.duration_ms ? `${row.duration_ms}ms` : "-";
          const err = row.error_msg ? ` [${row.error_msg.slice(0, 60)}]` : "";
          output += `\n  ${row.pushed_at} | ${row.service.padEnd(8)} | ${row.status.padEnd(5)} | ${String(row.items_count).padEnd(5)} items | ${dur}${err}`;
        }
      } else {
        output += "\n  (no push logs yet — VPS services may not have run)";
      }

      return {
        content: [{ type: "text" as const, text: output }],
      };
    },
  );
}
