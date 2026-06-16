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
 * "passive" services have no reliable DB table to query;
 * they always return healthy.
 *
 * "marketHoursOnly" services (vn-price-fetch, vn-foreign-flow) only push
 * data during VN market hours (Mon-Fri 09:00-15:30 ICT = 02:00-08:30 UTC).
 * Outside that window the service is expected to be silent — staleness is not
 * a fault, so we return "idle" instead of "unhealthy"/"unreachable".
 *
 * FIX-BCTC-FRESHNESS-GATE (2026-06-16): "queueGuardSql" is an additive,
 * non-breaking field.  When present, the SQL must return { active_count: number }.
 * If active_count == 0 AND there are no recent "done" rows in the last 7 days
 * (which latestTimestampSql will surface as null or very stale), the check
 * returns "idle" rather than "unhealthy" — an honest quiet period (off-season
 * or empty queue) is not a false alarm.
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
  /**
   * FIX-BCTC-FRESHNESS-GATE: optional earnings-window guard SQL.
   * Must return { active_count: number } — count of "actionable" queue rows
   * (e.g. status IN ('pending','url_not_found','enrich_failed')).
   *
   * Semantics: if active_count == 0 AND latestTimestampSql returns null or a
   * timestamp older than 7 days (no recent "done" row), the check returns "idle"
   * rather than "unhealthy".  This lets a genuinely empty queue (off-season)
   * report honest quiet state without a false-alarm.
   *
   * If active_count > 0 (queue has work), the normal freshness check applies
   * regardless of this field.
   *
   * Generic invariant: the SQL uses only status predicates — no ticker/date/exchange
   * literal.  Works for any ticker fleet.
   */
  queueGuardSql?: string;
  /**
   * FIX-BCTC-FRESHNESS-GATE: time window for "recent done rows" used in
   * conjunction with queueGuardSql to distinguish off-season from wiped-queue.
   * Defaults to 7 days (in ms) when queueGuardSql is set.
   */
  queueGuardRecentMs?: number;
}

// ─── default freshness configs ────────────────────────────────────────────────

/**
 * Data-freshness thresholds per VPS service.
 *
 *  vn-price-fetch   — market_prices.updated_at                            stale > 5 min  (market hours only)
 *  vn-news-fetch    — market_messages.sent_at                             stale > 20 min
 *  vn-foreign-flow  — daily_ohlcv WHERE foreign_buy_vol IS NOT NULL       stale > 5 min  (market hours only)
 *  vn-sbv-fetch     — sbv_rates.fetched_at                                stale > 35 min
 *  vn-bctc-fetch    — MAX(last_attempt) WHERE status='done' in bctc_vps_queue  stale > 24h
 *                     (FIX-BCTC-FRESHNESS-GATE: was passive:true — now active freshness)
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
    // FIX-BCTC-FRESHNESS-GATE (2026-06-16): replaced passive: true with an
    // active freshness check.  The old passive config caused the health gate
    // to always report "healthy" even during 34h+ data-push outages.
    //
    // Active check: MAX(last_attempt) WHERE status='done' in bctc_vps_queue.
    // Threshold: 24h (4 missed VPS push cycles of 6h each = definitively broken).
    //
    // Earnings-window guard (queueGuardSql): if the queue has NO active rows
    // (pending / url_not_found / enrich_failed) AND no recent done rows in the
    // last 7 days, return "idle" (off-season honest quiet state, not a false alarm).
    // If active rows exist, the normal 24h freshness check applies.
    //
    // Generic invariant: all SQL uses only status predicates — no ticker/date/
    // exchange literal.  Works for any ticker fleet size.
    serviceName: "vn-bctc-fetch",
    description: "BCTC financial reports — active freshness (last_success_age on bctc_vps_queue)",
    latestTimestampSql: `
      SELECT MAX(last_attempt) AS latest_at
      FROM bctc_vps_queue
      WHERE status = 'done'
    `,
    maxAgeMs: 24 * 60 * 60_000, // 24 hours
    queueGuardSql: `
      SELECT COUNT(*) AS active_count
      FROM bctc_vps_queue
      WHERE status IN ('pending', 'url_not_found', 'enrich_failed')
    `,
    queueGuardRecentMs: 7 * 24 * 60 * 60_000, // 7 days
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

    const latestAt = row?.latest_at ?? null;
    const nowMs = new Date(nowIso).getTime();

    // FIX-BCTC-FRESHNESS-GATE: earnings-window guard.
    //
    // When queueGuardSql is configured, check whether there are active queue
    // rows (pending / url_not_found / enrich_failed).  If there are NONE, and
    // there is also no recent "done" row within queueGuardRecentMs, return
    // "idle" — the queue is genuinely empty (off-season or all tickers resolved)
    // and an "unhealthy" verdict would be a false alarm.
    //
    // Guard reads BOTH:
    //   - active_count (pending/url_not_found/enrich_failed rows) — tells us
    //     whether there is ongoing work that should produce fresh data.
    //   - latestTimestampSql result (done rows, which latestAt captures above) —
    //     distinguishes "queue empty = off-season" from "queue wiped mid-season".
    //
    // If active_count == 0 AND no recent done row → "idle" (off-season).
    // If active_count == 0 AND recent done row exists → normal freshness check
    //   (all tickers resolved, but last done is fresh — healthy).
    // If active_count > 0 → normal freshness check (work in progress).
    //
    // RF-1 guard: we read BOTH status planes to prevent the "wiped queue"
    // scenario from silently returning idle.
    if (config.queueGuardSql) {
      const guardRow = db
        .query<{ active_count: number }, []>(config.queueGuardSql)
        .get();
      const activeCount = guardRow?.active_count ?? 0;

      if (activeCount === 0) {
        // No active queue rows.  Check whether there is a recent done row.
        const recentWindowMs = config.queueGuardRecentMs ?? 7 * 24 * 60 * 60_000;
        const hasRecentDone =
          latestAt !== null && nowMs - new Date(latestAt).getTime() <= recentWindowMs;

        if (!hasRecentDone) {
          // Neither active rows nor recent done rows → genuine off-season idle.
          return {
            serviceName: config.serviceName,
            healthStatus: "idle",
            responseTimeMs: 0,
            polledAt,
            errorMessage: "Queue empty and no recent done rows — off-season idle (not a fault)",
          };
        }
        // activeCount == 0 but a recent done row exists → fall through to
        // normal freshness check (will likely be "healthy").
      }
      // activeCount > 0 → fall through to normal freshness check.
    }

    if (latestAt === null) {
      return {
        serviceName: config.serviceName,
        healthStatus: "unreachable",
        responseTimeMs: 0,
        polledAt,
        errorMessage: "No data rows found — VPS has not pushed yet",
      };
    }

    const latestMs = new Date(latestAt).getTime();
    const ageMs = nowMs - latestMs;

    if (ageMs > config.maxAgeMs!) {
      const ageSec = Math.round(ageMs / 1000);
      const thresholdSec = Math.round(config.maxAgeMs! / 1000);
      return {
        serviceName: config.serviceName,
        healthStatus: "unhealthy",
        responseTimeMs: 0,
        polledAt,
        lastSuccessfulRun: latestAt,
        uptimeSeconds: ageSec,
        errorMessage: `Data stale: last push ${ageSec}s ago (threshold ${thresholdSec}s)`,
      };
    }

    return {
      serviceName: config.serviceName,
      healthStatus: "healthy",
      responseTimeMs: 0,
      polledAt,
      lastSuccessfulRun: latestAt,
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
