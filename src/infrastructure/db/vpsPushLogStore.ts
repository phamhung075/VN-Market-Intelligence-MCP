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

export type VpsService = "prices" | "news" | "sbv" | "bctc";

export interface VpsPushLogEntry {
  service: VpsService;
  itemsCount: number;
  status: "ok" | "error";
  errorMsg?: string;
  durationMs?: number;
}

/**
 * Insert a push log entry.
 */
export function logVpsPush(entry: VpsPushLogEntry, db?: Database): void {
  const d = db ?? getDb();
  d.prepare(
    `INSERT INTO vps_push_log (service, items_count, status, error_msg, duration_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    entry.service,
    entry.itemsCount,
    entry.status,
    entry.errorMsg ?? null,
    entry.durationMs ?? null,
  );
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
 */
export function getVpsProxyHealth(db?: Database): VpsServiceHealth[] {
  const d = db ?? getDb();
  const services: VpsService[] = ["prices", "news", "sbv", "bctc"];
  const results: VpsServiceHealth[] = [];

  for (const service of services) {
    // Last push
    const last = d.prepare(
      `SELECT pushed_at, items_count, status FROM vps_push_log
       WHERE service = ? ORDER BY pushed_at DESC LIMIT 1`,
    ).get(service) as { pushed_at: string; items_count: number; status: string } | null;

    // 24h stats
    const stats = d.prepare(
      `SELECT
         COUNT(*) as total_pushes,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
         SUM(items_count) as total_items,
         AVG(duration_ms) as avg_duration
       FROM vps_push_log
       WHERE service = ? AND pushed_at >= datetime('now', '-24 hours')`,
    ).get(service) as {
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
