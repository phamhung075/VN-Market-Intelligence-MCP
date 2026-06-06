/**
 * Interface — GET /api/vps-proxy-health
 *
 * Exposes VPS proxy health as machine-readable JSON so the dashboard
 * can render UP/STALE/DOWN truthfully without going through the MCP tool plane.
 *
 * Data source: vpsPushLogStore.getVpsProxyHealth() — the SAME function used by
 * the get_vps_proxy_health MCP tool.  No logic is duplicated here.
 *
 * Stale determination mirrors the EXPECTED_INTERVALS thresholds used by the MCP
 * tool (prices 5 min, news 10 min, sbv 60 min, bctc 720 min).
 *
 * Response shape:
 *   {
 *     ok: true,
 *     services: [
 *       {
 *         name: string,         // "prices" | "news" | "sbv" | "bctc"
 *         last_push: string|null,  // ISO timestamp of last push, or null
 *         items: number,           // item count of last push
 *         status: string,          // last push status ("ok" | "error" | "no_data")
 *         pushes_24h: number,
 *         errors_24h: number,
 *         stale: boolean
 *       }
 *     ],
 *     recent_pushes: [
 *       { service, pushed_at, status, items_count, duration_ms, error_msg }
 *     ],
 *     fetchedAt: string            // ISO timestamp when this response was assembled
 *   }
 *
 * No authentication required — read-only, no sensitive data.
 * DI contract: db injected by caller (server.ts). No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { getVpsProxyHealth } from "../../../infrastructure/db/vpsPushLogStore.js";
import { isVnMarketHours, minutesSinceLastWindowEnd } from "../../../domain/services/freshnessSlaChecker.js";

// Expected push intervals per service (minutes) — used during the active fetch window.
const EXPECTED_INTERVALS: Record<string, number> = {
  prices: 5,
  news: 10,
  sbv: 60,
  bctc: 720,
};

// Services whose data is ONLY pushed during VN market hours (Mon–Fri 02:00–08:59 UTC).
const MARKET_HOURS_ONLY_SERVICES = new Set(["prices", "foreign_flow"]);

/**
 * Determine staleness from last push timestamp, with calendar awareness.
 *
 * For market-hours-only services (prices, foreign_flow):
 *   - During market hours: tight interval applies (5 min for prices).
 *   - Outside market hours: not stale as long as data was pushed before/during
 *     the last active window (within minutesSinceLastWindowEnd + 30 min grace).
 *     This prevents weekend false-CRITICAL on services that sleep by design.
 *
 * NOTE: SQLite pushed_at values are stored as UTC strings without a trailing Z.
 * Using `new Date(lastPushAt)` handles both formats; the Z-append guard is safe
 * because appending "Z" to an already-ISO string (ending in Z) would double it.
 *
 * @param lastPushAt ISO or SQLite-UTC timestamp, or null
 * @param service    Service name key
 * @param now        Injectable current time for testing (default: new Date())
 */
function computeStale(lastPushAt: string | null, service: string, now: Date = new Date()): boolean {
  if (!lastPushAt) return true;
  const parsed = new Date(lastPushAt);
  if (isNaN(parsed.getTime())) return true;
  const ageMs = now.getTime() - parsed.getTime();

  if (MARKET_HOURS_ONLY_SERVICES.has(service)) {
    if (isVnMarketHours(now)) {
      // Tight real-time SLA during active window
      const expectedMin = EXPECTED_INTERVALS[service] ?? 5;
      return ageMs > expectedMin * 60 * 1000;
    }
    // Off-hours: only stale if older than last window end + 30 min grace
    const sinceWindowEndMin = minutesSinceLastWindowEnd(now);
    return ageMs > (sinceWindowEndMin + 30) * 60 * 1000;
  }

  const expectedMin = EXPECTED_INTERVALS[service] ?? 60;
  return ageMs > expectedMin * 60 * 1000;
}

interface RecentPushRow {
  service: string;
  items_count: number;
  status: string;
  error_msg: string | null;
  duration_ms: number | null;
  pushed_at: string;
}

export function handleVpsProxyHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const rawServices = getVpsProxyHealth(db);
    const marketHoursActive = isVnMarketHours(now);

    const services = rawServices.map((s) => {
      const stale = computeStale(s.lastPushAt, s.service, now);
      const offHours = MARKET_HOURS_ONLY_SERVICES.has(s.service) && !marketHoursActive;
      return {
        name: s.service,
        last_push: s.lastPushAt,
        items: s.lastItemsCount,
        status: s.lastStatus,
        pushes_24h: s.pushes24h,
        // SQLite SUM() returns null when no rows match; coerce to 0 for clean JSON.
        errors_24h: s.errors24h ?? 0,
        stale,
        // off_hours=true means this service sleeps by design outside market hours.
        // A stale=true + off_hours=true combination is NOT an incident.
        off_hours: offHours,
      };
    });

    const recentPushes = db
      .prepare(
        `SELECT service, items_count, status, error_msg, duration_ms, pushed_at
         FROM vps_push_log
         ORDER BY pushed_at DESC LIMIT 10`,
      )
      .all() as RecentPushRow[];

    const body = {
      ok: true,
      services,
      recent_pushes: recentPushes,
      fetchedAt: new Date().toISOString(),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
