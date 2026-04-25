/**
 * Domain Service — VPS Health Poller (data-freshness edition)
 *
 * Pure business logic for measuring VPS service health via data freshness.
 * The VPS at $VINAHOST_IP pushes data (prices, news, foreign flow, SBV rates)
 * on fixed schedules but does NOT expose HTTP health endpoints.
 *
 * Health = data freshness: "did the VPS push recently?"
 *
 * FIX: Replaced localhost:5001-5005 HTTP health checks (BUG 1) with
 *      per-service DB freshness queries.  No fetch function is needed.
 *
 * Accepts an injectable Database so it remains a pure domain service
 * (no direct infrastructure imports from domain layer).
 *
 * @module domain/services/vpsHealthPoller
 */

import type { Database } from "bun:sqlite";

// ─── types ────────────────────────────────────────────────────────────────────

/**
 * VPS service names — exactly 5 services.
 */
export type ServiceName =
  | "vn-price-fetch"
  | "vn-bctc-fetch"
  | "vn-news-fetch"
  | "vn-sbv-fetch"
  | "vn-foreign-flow";

/**
 * Health status classification.
 */
export type HealthStatus = "healthy" | "unhealthy" | "unreachable";

/**
 * Result of checking a single VPS service's data freshness.
 */
export interface HealthPollResult {
  serviceName: ServiceName;
  healthStatus: HealthStatus;
  /** Always 0 for freshness checks — retained for schema compatibility. */
  responseTimeMs: number;
  polledAt: string; // ISO 8601 timestamp
  errorMessage?: string;
  lastSuccessfulRun?: string; // ISO 8601 timestamp of last fresh row
  uptimeSeconds?: number;
}

/**
 * Configuration for a single VPS service freshness check.
 *
 * "passive" services (vn-bctc-fetch) have no reliable DB table to query;
 * they always return healthy.
 */
export interface FreshnessConfig {
  serviceName: ServiceName;
  description: string;
  /** SQL that returns { latest_at: string | null } — the most-recent push timestamp. */
  latestTimestampSql?: string;
  /** How stale (ms) before the service is considered unhealthy. */
  maxAgeMs?: number;
  /** When true, no DB check is performed — always returns "healthy". */
  passive?: boolean;
}

// ─── default freshness configs ────────────────────────────────────────────────

/**
 * Data-freshness thresholds per VPS service.
 *
 *  vn-price-fetch   — market_prices.updated_at        stale > 5 min
 *  vn-news-fetch    — market_messages.sent_at          stale > 20 min
 *  vn-foreign-flow  — vnstock_trading_stats.fetched_at stale > 5 min
 *  vn-sbv-fetch     — sbv_rates.fetched_at             stale > 35 min
 *  vn-bctc-fetch    — passive (6 h cadence, no realtime table)
 */
export const DEFAULT_FRESHNESS_CONFIGS: FreshnessConfig[] = [
  {
    serviceName: "vn-price-fetch",
    description: "Market prices (HOSE/HNX/UPCOM)",
    latestTimestampSql: `SELECT MAX(updated_at) AS latest_at FROM market_prices`,
    maxAgeMs: 5 * 60_000, // 5 minutes
  },
  {
    serviceName: "vn-news-fetch",
    description: "News and events",
    latestTimestampSql: `SELECT MAX(sent_at) AS latest_at FROM market_messages`,
    maxAgeMs: 20 * 60_000, // 20 minutes
  },
  {
    serviceName: "vn-foreign-flow",
    description: "Foreign buy/sell flows",
    latestTimestampSql: `SELECT MAX(fetched_at) AS latest_at FROM vnstock_trading_stats`,
    maxAgeMs: 5 * 60_000, // 5 minutes
  },
  {
    serviceName: "vn-sbv-fetch",
    description: "SBV FX rates",
    latestTimestampSql: `SELECT MAX(fetched_at) AS latest_at FROM sbv_rates`,
    maxAgeMs: 35 * 60_000, // 35 minutes
  },
  {
    serviceName: "vn-bctc-fetch",
    description: "BCTC financial reports (passive — 6 h cadence)",
    passive: true,
  },
];

// ─── core check ───────────────────────────────────────────────────────────────

/**
 * Checks data freshness for a single VPS service.
 *
 * Pure function — no side effects beyond a single read-only DB query.
 * Never throws; returns "unreachable" on DB errors (fail-open).
 *
 * @param db       Injected database (domain service never imports infra directly)
 * @param config   Freshness configuration for this service
 * @param nowIso   Current time as ISO string (injectable for deterministic tests)
 * @returns        HealthPollResult with freshness-based status
 */
export function checkServiceFreshness(
  db: Database,
  config: FreshnessConfig,
  nowIso: string,
): HealthPollResult {
  const polledAt = nowIso;

  // Passive services — always healthy, no DB query needed
  if (config.passive) {
    return {
      serviceName: config.serviceName,
      healthStatus: "healthy",
      responseTimeMs: 0,
      polledAt,
    };
  }

  try {
    const row = db
      .query<{ latest_at: string | null }, []>(config.latestTimestampSql!)
      .get();

    if (!row || row.latest_at === null) {
      return {
        serviceName: config.serviceName,
        healthStatus: "unreachable",
        responseTimeMs: 0,
        polledAt,
        errorMessage: "No data rows found — VPS has not pushed yet",
      };
    }

    const latestMs = new Date(row.latest_at).getTime();
    const nowMs = new Date(nowIso).getTime();
    const ageMs = nowMs - latestMs;

    if (ageMs > config.maxAgeMs!) {
      const ageSec = Math.round(ageMs / 1000);
      const thresholdSec = Math.round(config.maxAgeMs! / 1000);
      return {
        serviceName: config.serviceName,
        healthStatus: "unhealthy",
        responseTimeMs: 0,
        polledAt,
        lastSuccessfulRun: row.latest_at,
        uptimeSeconds: ageSec,
        errorMessage: `Data stale: last push ${ageSec}s ago (threshold ${thresholdSec}s)`,
      };
    }

    return {
      serviceName: config.serviceName,
      healthStatus: "healthy",
      responseTimeMs: 0,
      polledAt,
      lastSuccessfulRun: row.latest_at,
    };
  } catch (err) {
    return {
      serviceName: config.serviceName,
      healthStatus: "unreachable",
      responseTimeMs: 0,
      polledAt,
      errorMessage:
        err instanceof Error ? err.message : "Unknown DB error",
    };
  }
}

// ─── all-services runner ──────────────────────────────────────────────────────

/**
 * Checks all 5 VPS services using data-freshness queries.
 *
 * Never throws — returns partial results even if individual checks fail.
 *
 * @param db       Injected database
 * @param configs  Freshness configurations (defaults to DEFAULT_FRESHNESS_CONFIGS)
 * @param nowIso   Current time as ISO string (defaults to Date.now())
 * @returns        Array of 5 HealthPollResult objects
 */
export function checkAllVpsServiceFreshness(
  db: Database,
  configs: FreshnessConfig[] = DEFAULT_FRESHNESS_CONFIGS,
  nowIso: string = new Date().toISOString(),
): HealthPollResult[] {
  return configs.map((cfg) => checkServiceFreshness(db, cfg, nowIso));
}

// ─── legacy compatibility exports ─────────────────────────────────────────────
// These retain the old names so any other callers still compile.

/**
 * @deprecated FetchFn was used by the old HTTP-polling design.
 * Kept as a type alias for backward compatibility with existing tests.
 */
export type FetchFn = (
  url: string,
  options?: { signal?: AbortSignal; timeout?: number },
) => Promise<Response>;

/**
 * @deprecated Use FreshnessConfig instead.
 */
export type VpsServiceConfig = FreshnessConfig;

/**
 * @deprecated Use DEFAULT_FRESHNESS_CONFIGS instead.
 * Kept to avoid breaking existing imports until callers are migrated.
 */
export const DEFAULT_VPS_SERVICES: FreshnessConfig[] = DEFAULT_FRESHNESS_CONFIGS;

/**
 * @deprecated Use checkAllVpsServiceFreshness instead.
 * Stub that delegates to the freshness-based runner.
 */
export async function pollVpsServiceHealth(
  _fetchFn: unknown,
  configs: FreshnessConfig[] = DEFAULT_FRESHNESS_CONFIGS,
  db?: Database,
): Promise<HealthPollResult[]> {
  if (!db) {
    // If no db provided return unreachable for all — can't do freshness without DB
    return configs.map((cfg) => ({
      serviceName: cfg.serviceName,
      healthStatus: "unreachable" as HealthStatus,
      responseTimeMs: 0,
      polledAt: new Date().toISOString(),
      errorMessage: "No database provided to legacy pollVpsServiceHealth",
    }));
  }
  return checkAllVpsServiceFreshness(db, configs);
}
