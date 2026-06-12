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
 * Purge old push log entries beyond retention period.
 */
export function purgeOldVpsPushLogs(retentionDays = 30, db?: Database): number {
  const d = db ?? getDb();
  const result = d.prepare(
    `DELETE FROM vps_push_log WHERE pushed_at < datetime('now', '-' || ? || ' days')`,
  ).run(retentionDays);
  return result.changes;
}
