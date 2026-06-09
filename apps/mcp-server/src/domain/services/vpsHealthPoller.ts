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
 *
 * idle — market is closed (outside Mon-Fri 02:00-08:30 UTC); staleness check
 *        is suppressed for price + foreign-flow services.  Not an alert condition.
 */
export type HealthStatus = "healthy" | "unhealthy" | "unreachable" | "idle";

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
 *
 * "marketHoursOnly" services (vn-price-fetch, vn-foreign-flow) only push
 * data during VN market hours (Mon-Fri 09:00-15:30 ICT = 02:00-08:30 UTC).
 * Outside that window the service is expected to be silent — staleness is not
 * a fault, so we return "idle" instead of "unhealthy"/"unreachable".
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
  /**
   * When true, staleness is only evaluated during VN market hours
   * (Mon-Fri 02:00-08:30 UTC).  Outside that window the check returns "idle".
   */
  marketHoursOnly?: boolean;
}

// ─── default freshness configs ────────────────────────────────────────────────

/**
 * Data-freshness thresholds per VPS service.
 *
 *  vn-price-fetch   — market_prices.updated_at                            stale > 5 min  (market hours only)
 *  vn-news-fetch    — market_messages.sent_at                             stale > 20 min
 *  vn-foreign-flow  — daily_ohlcv WHERE foreign_buy_vol IS NOT NULL       stale > 5 min  (market hours only)
 *  vn-sbv-fetch     — sbv_rates.fetched_at                                stale > 35 min
 *  vn-bctc-fetch    — passive (6 h cadence, no realtime table)
 *
 * BUG FIX (Bug 1): vn-foreign-flow was incorrectly querying
 *   vnstock_trading_stats.fetched_at.  Foreign-flow VPS push writes to
 *   daily_ohlcv (columns: foreign_buy_vol, updated_at).
 *
 * BUG FIX (Bug 2): vn-price-fetch and vn-foreign-flow are market-hours-only
 *   services.  Outside Mon-Fri 02:00-08:30 UTC the staleness check is
 *   suppressed and the status is reported as "idle".
 */
export const DEFAULT_FRESHNESS_CONFIGS: FreshnessConfig[] = [
  {
    serviceName: "vn-price-fetch",
    description: "Market prices (HOSE/HNX/UPCOM)",
    latestTimestampSql: `SELECT MAX(updated_at) AS latest_at FROM market_prices`,
    maxAgeMs: 5 * 60_000, // 5 minutes
    marketHoursOnly: true,
  },
  {
    serviceName: "vn-news-fetch",
    description: "News and events",
    // FIX-1833f: Heartbeat uses MAX of vps_push_log.pushed_at and rag_analyses.created_at.
    //
    // Root cause: the previous query (rag_analyses.created_at only) caused
    // false-unhealthy when the VPS pushed 90+ times/day but all articles were
    // duplicates: no new rows were inserted into rag_analyses, so the freshness
    // check returned "unhealthy" even though vn-news-fetch was actively pushing.
    //
    // Fix: take MAX across both tables.
    //   - vps_push_log.pushed_at updates on every successful HTTP push,
    //     regardless of deduplication — this is the true heartbeat.
    //   - rag_analyses.created_at is retained as a fallback so existing
    //     observability tests (which only seed rag_analyses) still pass.
    //
    // Result: healthy = either a recent push OR a recent rag insert,
    //         unhealthy = both sources stale beyond 30-min SLA.
    // FIX-NEWS-VPS-HEALTH-SQL: outer MAX must use unixepoch() to normalise both
    // timestamp formats before comparing.
    //
    // Root cause: vps_push_log.pushed_at uses "YYYY-MM-DD HH:MM:SS" (space, no TZ)
    // while rag_analyses.created_at uses ISO 8601 "YYYY-MM-DDTHH:MM:SS.mmmZ" ('T'+'Z').
    // SQLite MAX() is lexicographic: ASCII 'T'(84) > ' '(32), so rag_analyses always
    // wins regardless of true wall-clock order.  During heartbeat-only windows (no new
    // articles → no rag_analyses rows) the health check would age off a stale rag
    // timestamp and ignore fresher vps_push_log heartbeats → FALSE-UNHEALTHY.
    //
    // Fix: unixepoch() normalises both formats to epoch before MAX(); datetime()
    // converts the winner back to a parseable string.  Inner UNION ALL unchanged.
    latestTimestampSql: `
      SELECT datetime(MAX(unixepoch(latest_at)), 'unixepoch') AS latest_at FROM (
        SELECT MAX(pushed_at) AS latest_at
          FROM vps_push_log
         WHERE service = 'news' AND status = 'ok'
        UNION ALL
        SELECT MAX(created_at) AS latest_at
          FROM rag_analyses
      )
    `,
    maxAgeMs: 30 * 60_000, // 30 minutes — matches SLA
  },
  {
    serviceName: "vn-foreign-flow",
    description: "Foreign buy/sell flows",
    // BUG 1 FIX: was vnstock_trading_stats.fetched_at — wrong table.
    // VPS foreign-flow push writes to daily_ohlcv (foreign_buy_vol / updated_at).
    latestTimestampSql: `SELECT MAX(updated_at) AS latest_at FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL`,
    maxAgeMs: 5 * 60_000, // 5 minutes
    marketHoursOnly: true,
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

// ─── market-hours helper ──────────────────────────────────────────────────────

/**
 * Returns true when the given ISO timestamp falls within VN market hours:
 * Monday-Friday, 02:00-08:30 UTC (= 09:00-15:30 ICT).
 *
 * Accepts an ISO string so it is deterministically testable without mocking
 * the global clock.
 *
 * @param nowIso  ISO 8601 timestamp string representing "now"
 */
export function isVnMarketHoursAt(nowIso: string): boolean {
  const d = new Date(nowIso);
  const utcDay = d.getUTCDay(); // 0=Sun … 6=Sat
  const utcHour = d.getUTCHours();
  const utcMinute = d.getUTCMinutes();

  const isWeekday = utcDay >= 1 && utcDay <= 5;
  // Open: 02:00 UTC (inclusive), close: 08:30 UTC (exclusive)
  const afterOpen = utcHour >= 2;
  const beforeClose = utcHour < 8 || (utcHour === 8 && utcMinute < 30);

  return isWeekday && afterOpen && beforeClose;
}

// ─── core check ───────────────────────────────────────────────────────────────

/**
 * Checks data freshness for a single VPS service.
 *
 * Pure function — no side effects beyond a single read-only DB query.
 * Never throws; returns "unreachable" on DB errors (fail-open).
 *
 * Market-hours guard (Bug 2 fix):
 *   Services with marketHoursOnly=true return "idle" when nowIso falls
 *   outside Mon-Fri 02:00-08:30 UTC.  "idle" is NOT an alert condition.
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

  // Market-hours guard — return idle when market is closed (Bug 2 fix)
  if (config.marketHoursOnly && !isVnMarketHoursAt(nowIso)) {
    return {
      serviceName: config.serviceName,
      healthStatus: "idle",
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
