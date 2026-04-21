/**
 * VPS Service Health Polling Job — Task 234
 *
 * Scheduler layer: polls all 5 VPS services every 5 minutes.
 * Stores results in vps_service_health table with timestamps.
 *
 * Circuit breaker wraps each poll to prevent cascading failures.
 *
 * DDD Layer: interface/scheduler — may import from domain + infrastructure.
 *
 * @module scheduler/system/vpsServiceHealthJob
 */

import type { Database } from "bun:sqlite";
import {
  pollVpsServiceHealth,
  type VpsServiceConfig,
  DEFAULT_VPS_SERVICES,
} from "../../domain/services/vpsHealthPoller.js";
import { breakers } from "../../infrastructure/circuitBreakerRegistry.js";

/**
 * Runs VPS health polling and records results to database.
 *
 * @param db Database instance (injectable for testing)
 * @param services Service configurations (defaults to DEFAULT_VPS_SERVICES)
 * @returns Count of health records inserted
 */
export async function runVpsServiceHealthJob(
  db: Database,
  services: VpsServiceConfig[] = DEFAULT_VPS_SERVICES,
): Promise<{ polled: number; stored: number }> {
  let fetchCount = 0;

  // Injectable fetch function with circuit breaker protection
  const protectedFetch = async (
    url: string,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<Response> => {
    // Use a generic circuit breaker for VPS endpoint polling
    const breaker = breakers.polymarket; // Reuse existing breaker for now
    fetchCount++;

    return breaker.execute(async () => {
      const fetchOptions: any = {};
      if (options?.signal) {
        fetchOptions.signal = options.signal;
      }
      if (options?.timeout) {
        fetchOptions.timeout = options.timeout;
      }
      return fetch(url, fetchOptions);
    });
  };

  // Poll all services
  const results = await pollVpsServiceHealth(protectedFetch, services);

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
 * Defaults to production database + default service configs.
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
