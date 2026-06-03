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

// Expected push intervals per service (minutes) — mirrors vpsProxyTools.ts
const EXPECTED_INTERVALS: Record<string, number> = {
  prices: 5,
  news: 10,
  sbv: 60,
  bctc: 720,
};

/** Determine staleness from last push timestamp.
 *
 * NOTE: SQLite pushed_at values are stored as UTC strings without a trailing Z
 * (e.g. "2026-06-03 19:00:00"), while test fixtures may insert full ISO strings
 * ending in Z.  Using `new Date(lastPushAt)` handles both formats safely;
 * appending "+Z" would double the suffix and produce NaN for ISO inputs.
 */
function computeStale(lastPushAt: string | null, service: string): boolean {
  if (!lastPushAt) return true;
  const expectedMin = EXPECTED_INTERVALS[service] ?? 60;
  const parsed = new Date(lastPushAt);
  if (isNaN(parsed.getTime())) return true;
  const ageMs = Date.now() - parsed.getTime();
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
): void {
  try {
    const rawServices = getVpsProxyHealth(db);

    const services = rawServices.map((s) => ({
      name: s.service,
      last_push: s.lastPushAt,
      items: s.lastItemsCount,
      status: s.lastStatus,
      pushes_24h: s.pushes24h,
      // SQLite SUM() returns null when no rows match; coerce to 0 for clean JSON.
      errors_24h: s.errors24h ?? 0,
      stale: computeStale(s.lastPushAt, s.service),
    }));

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
