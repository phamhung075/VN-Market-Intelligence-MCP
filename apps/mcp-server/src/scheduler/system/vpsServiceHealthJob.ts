/**
 * VPS Service Health Polling Job — Task 234 (fixed)
 *
 * Scheduler layer: checks all 5 VPS services every 5 minutes.
 * Stores results in vps_service_health table with timestamps.
 *
 * FIX BUG 1: Replaced localhost:5001-5005 HTTP health checks with
 *            data-freshness queries against local SQLite tables.
 *
 * FIX BUG 2: Removed reuse of breakers.polymarket for VPS health checks.
 *            Health checks are fail-open — no circuit breaker is needed.
 *            A failing health check should record "unreachable", not be
 *            silently blocked by an unrelated polymarket circuit breaker.
 *
 * DDD Layer: interface/scheduler — may import from domain + infrastructure.
 *
 * @module scheduler/system/vpsServiceHealthJob
 */

import type { Database } from "bun:sqlite";
import {
  checkAllVpsServiceFreshness,
  type FreshnessConfig,
  DEFAULT_FRESHNESS_CONFIGS,
} from "../../domain/services/vpsHealthPoller.js";

/**
 * Runs VPS health freshness checks and records results to database.
 *
 * No circuit breaker wraps this — health checks must always run and
 * record their result (fail-open).  A stuck polymarket breaker must
 * never block VPS health reporting.
 *
 * @param db       Database instance (injectable for testing)
 * @param configs  Freshness configurations (defaults to DEFAULT_FRESHNESS_CONFIGS)
 * @returns        Count of health records polled and stored
 */
export async function runVpsServiceHealthJob(
  db: Database,
  configs: FreshnessConfig[] = DEFAULT_FRESHNESS_CONFIGS,
): Promise<{ polled: number; stored: number }> {
  const nowIso = new Date().toISOString();

  // Data-freshness checks — synchronous, no external HTTP calls
  const results = checkAllVpsServiceFreshness(db, configs, nowIso);

  // Insert results into vps_service_health table
  let stored = 0;
  const stmt = db.prepare(`
    INSERT INTO vps_service_health (
      service_name,
      polled_at,
      health_status,
      response_time_ms,
      last_successful_run,
      uptime_seconds,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of results) {
    try {
      stmt.run(
        result.serviceName,
        result.polledAt,
        result.healthStatus,
        result.responseTimeMs,
        result.lastSuccessfulRun ?? null,
        result.uptimeSeconds ?? null,
        result.errorMessage ?? null,
      );
      stored++;
    } catch (err) {
      console.error(
        `[vps-health-job] Failed to insert ${result.serviceName}:`,
        err,
      );
    }
  }

  return { polled: results.length, stored };
}

/**
 * Public entry point for cron scheduler.
 *
 * Defaults to production database + default freshness configs.
 */
export async function runVpsHealthPolling(): Promise<void> {
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const db = getDb();

    const result = await runVpsServiceHealthJob(db);
    console.log(
      `[vps-health] polled=${result.polled} stored=${result.stored}`,
    );
  } catch (err) {
    console.error(
      "[vps-health] Uncaught error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
