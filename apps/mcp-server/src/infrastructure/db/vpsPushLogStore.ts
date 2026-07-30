/**
 * Infrastructure — VPS Push Log Store
 *
 * Records every incoming VPS push for observability.
 * Used by get_vps_proxy_health MCP tool and system-auditor.
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import type { Database } from "bun:sqlite";

export type VpsService = "prices" | "news" | "sbv" | "bctc" | "foreign-flow";

export interface VpsPushLogEntry {
  service: VpsService;
  itemsCount: number;
  status: "ok" | "error";
  errorMsg?: string;
  durationMs?: number;
  // Task 1566: extended observability for foreign-flow
  truncationDetected?: boolean;
  schemaErrorsCount?: number;
  failedItemIndices?: string; // JSON-stringified array of indices with errors
  parseTimeMs?: number;
  validationTimeMs?: number;
  dbTimeMs?: number;
  vpsResponseSizeBytes?: number;
  circuitBreakerState?: "closed" | "open" | "half-open";
}

/**
 * Insert a push log entry.
 */
export function logVpsPush(entry: VpsPushLogEntry, db?: Database): void {
  const d = db ?? getDb();
  d.prepare(
    `INSERT INTO vps_push_log (
       service, items_count, status, error_msg, duration_ms,
       truncation_detected, schema_errors_count, failed_item_indices,
       parse_time_ms, validation_time_ms, db_time_ms,
       vps_response_size_bytes, circuit_breaker_state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.service,
    entry.itemsCount,
    entry.status,
    entry.errorMsg ?? null,
    entry.durationMs ?? null,
    entry.truncationDetected ?? null,
    entry.schemaErrorsCount ?? null,
    entry.failedItemIndices ?? null,
    entry.parseTimeMs ?? null,
    entry.validationTimeMs ?? null,
    entry.dbTimeMs ?? null,
    entry.vpsResponseSizeBytes ?? null,
    entry.circuitBreakerState ?? null,
  );
}

/**
 * Insert a push log entry — never throws.
 *
 * Drop-in replacement for logVpsPush in HTTP route handlers where a DB write
 * failure must not propagate to the caller or pollute the outer try-catch.
 * Errors are logged to stderr for visibility without crashing the request.
 */
export function safeLogVpsPush(entry: VpsPushLogEntry, db?: Database): void {
  try {
    logVpsPush(entry, db);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[vpsPushLogStore] safeLogVpsPush failed — entry dropped:", err);
  }
}

export interface VpsServiceHealth {
  service: string;
  lastPushAt: string | null;
  lastItemsCount: number;
  lastStatus: string;
  pushes24h: number;
  errors24h: number;
  totalItems24h: number;
  avgDurationMs: number | null;
}

/**
 * Get health summary for all VPS proxy services.
 *
 * @param db   Optional database instance (defaults to global getDb())
 * @param now  Optional current time for 24h window calculation (defaults to new Date()).
 *             Injectable for deterministic testing with fixed timestamps.
 */
export function getVpsProxyHealth(db?: Database, now: Date = new Date()): VpsServiceHealth[] {
  const d = db ?? getDb();
  const services: VpsService[] = ["prices", "news", "sbv", "bctc"];
  const results: VpsServiceHealth[] = [];

  // Compute 24h cutoff as an ISO string so the SQL comparison uses the injected 'now'
  // rather than SQLite's wall-clock datetime('now'). This makes the function testable
  // with fixed timestamps (e.g. VPT-1 test (c) injects a historical 'now').
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  for (const service of services) {
    // Last push
    const last = d.prepare(
      `SELECT pushed_at, items_count, status FROM vps_push_log
       WHERE service = ? ORDER BY pushed_at DESC LIMIT 1`,
    ).get(service) as { pushed_at: string; items_count: number; status: string } | null;

    // 24h stats relative to injected 'now'
    const stats = d.prepare(
      `SELECT
         COUNT(*) as total_pushes,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
         SUM(items_count) as total_items,
         AVG(duration_ms) as avg_duration
       FROM vps_push_log
       WHERE service = ? AND pushed_at >= ?`,
    ).get(service, cutoff24h) as {
      total_pushes: number;
      error_count: number;
      total_items: number;
      avg_duration: number | null;
    };

    results.push({
      service,
      lastPushAt: last?.pushed_at ?? null,
      lastItemsCount: last?.items_count ?? 0,
      lastStatus: last?.status ?? "no_data",
      pushes24h: stats.total_pushes,
      errors24h: stats.error_count,
      totalItems24h: stats.total_items ?? 0,
      avgDurationMs: stats.avg_duration ? Math.round(stats.avg_duration) : null,
    });
  }

  return results;
}

/**
 * FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE (2026-07-30)
 *
 * Some VPS proxy routes are DEMAND-DRIVEN: they push only when their own
 * work queue holds actionable rows, not on a fixed wall-clock cadence (e.g.
 * "bctc" pushes only when bctc_vps_queue has a report awaiting fetch). For
 * those routes a large last-push AGE is completely normal whenever the queue
 * is genuinely empty — that is an observation about the SOURCE queue, not
 * evidence the proxy/VPS itself is unreachable.
 *
 * Root-cause probe (2026-07-29, live): bctc_vps_queue held 0 `pending` rows
 * (328 deferred_infra, 85 done, 128 enrich_failed, 39 url_not_found) while
 * prices/news/sbv were all pushing normally on the SAME proxy in the same
 * window — proving the proxy was up and only the bctc route's own queue was
 * drained. The pre-fix staleness narration blamed the proxy anyway because it
 * derived its verdict from last-push age alone.
 *
 * Generic registry (no route-name/date literal beyond the map's own keys) of
 * demand-driven routes → the SQL used to count "actionable" rows in that
 * route's own queue. A route absent from this map is cadence-driven
 * (unchanged pre-fix behavior — no queue gate applies to it).
 *
 * "Actionable" mirrors the established `pending`-only convention already used
 * by the C-16 auditor check (queryBctcCounts, interface/mcp/routes/
 * fetchStatusHandler.ts): status values that represent live work still
 * awaiting a fresh VPS push. Terminal/parked states (done, deferred_infra,
 * enrich_failed, url_not_found) are deliberately NOT counted here — they are
 * rows the pipeline has already finished or given up on pending a separate
 * policy/gate decision (e.g. ALPHA-S6-OPTIONB-DECISION-GATE), not work the
 * proxy itself could push right now.
 */
export const DEMAND_QUEUE_SQL: Readonly<Record<string, string>> = {
  bctc: `SELECT COUNT(*) AS actionable FROM bctc_vps_queue WHERE status = 'pending'`,
};

/**
 * Returns the count of actionable (still-awaiting-push) rows in a
 * demand-driven route's own work queue.
 *
 * @param db      Database instance
 * @param service VPS proxy service name (e.g. "bctc", "prices")
 * @returns
 *   - a number >= 0 when the route is demand-driven (has an entry in
 *     DEMAND_QUEUE_SQL) and the query succeeds
 *   - `null` when the route is NOT demand-driven (cadence-driven routes are
 *     unaffected by design), or when the underlying table is absent
 *     (fail-open — older schema / minimal test fixture — never fabricate a
 *     verdict from a missing table)
 */
export function getDemandQueueDepth(db: Database, service: string): number | null {
  const sql = DEMAND_QUEUE_SQL[service];
  if (!sql) return null;
  try {
    const row = db.prepare(sql).get() as { actionable: number } | undefined;
    return row?.actionable ?? 0;
  } catch {
    return null;
  }
}

/**
 * Purge old push log entries beyond retention period.
 */
export function purgeOldVpsPushLogs(retentionDays = 30, db?: Database): number {
  const d = db ?? getDb();
  const result = d.prepare(
    `DELETE FROM vps_push_log WHERE pushed_at < datetime('now', '-' || ? || ' days')`,
  ).run(retentionDays);
  return result.changes;
}
