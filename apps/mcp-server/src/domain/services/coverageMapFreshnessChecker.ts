/**
 * Domain Service — Coverage-Map Freshness Checker (TASK-FFT-L4)
 *
 * Self-policing SLA layer: reads pre-parsed frontend-data-coverage-map.json rows
 * and detects when any frontend page's data surface breaches its SLA threshold.
 *
 * ARCH-RATIFY-FFT-3 (load-bearing DDD):
 *   This service does ZERO filesystem I/O. It receives already-parsed rows from the
 *   scheduler layer (the caller reads docs/data/frontend-data-coverage-map.json and
 *   passes the `.rows` array). The only infrastructure import is `bun:sqlite` for
 *   the DB parameter type — no `fs`, no `node:fs`, no `Bun.file`.
 *
 * Pattern: mirrors freshnessSlaChecker.ts — pure domain checker, injectable for tests.
 *
 * DDD Layer: domain/services — may import from domain; must NOT import from infra or interface.
 *
 * @module domain/services/coverageMapFreshnessChecker
 */

import type { Database } from "bun:sqlite";
import { isVnMarketHours } from "./freshnessSlaChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status values from docs/data/frontend-data-coverage-map.json status_legend.
 * LIVE  — fully operational with known writer and data_asof
 * L2    — missing data_asof field (fixed by TASK-FFT-L2)
 * DEPTH_THIN — writer ok but data is shallow (e.g. only 1–2 days of history)
 * STALE_RISK — market-hours-only by design; staleness expected off-hours
 * STATIC — hardcoded/static content; no freshness check possible
 * GAP   — no writer yet; out of scope for SLA monitoring
 */
export type CoverageMapRowStatus =
  | "LIVE"
  | "L2"
  | "DEPTH_THIN"
  | "STALE_RISK"
  | "STATIC"
  | "GAP";

/** SLA tier keys from frontend-data-coverage-map.json sla_tiers. */
export type SlaTierKey =
  | "realtime"
  | "intraday"
  | "daily"
  | "weekly"
  | "event"
  | "static";

/**
 * A row from docs/data/frontend-data-coverage-map.json .rows array.
 * Index signature allows extra JSON fields without TS errors.
 */
export interface CoverageMapRow {
  page: string;
  elem?: string;
  endpoint: string | null;
  status: CoverageMapRowStatus;
  sla: SlaTierKey;
  asof?: string | null;
  [key: string]: unknown;
}

/**
 * Describes a single frontend SLA breach detected by the coverage-map checker.
 * Returned in the array from checkCoverageMapFreshness().
 */
export interface FreshnessBreachReport {
  /** Coverage-map row page identifier (e.g. "_index", "alerts"). */
  pageId: string;
  /** Coverage-map row element identifier (e.g. "market digest", "TA/BB price alerts"). */
  elementId: string;
  /** Data age in minutes at the time of detection. */
  ageMinutes: number;
  /** SLA tier max_staleness_min threshold that was exceeded. */
  maxStalenessMin: number;
  /** The API endpoint that was checked (e.g. "/api/market-digest"). */
  endpoint: string;
  /** ISO 8601 timestamp of when this breach was detected. */
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA tier constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Max staleness thresholds per SLA tier (minutes).
 * Source: frontend-data-coverage-map.json .sla_tiers [max_staleness_min, client_refresh_ms].
 *   realtime: 15 min
 *   intraday: 60 min
 *   daily: 1560 min (= 26h)
 *   weekly: 11520 min (= 8 days)
 *   event: 1560 min (= 26h)
 *   static: null (no threshold — never breaches)
 */
export const SLA_MAX_STALENESS_MIN: Readonly<Record<SlaTierKey, number | null>> = {
  realtime: 15,
  intraday: 60,
  daily: 1560,
  weekly: 11520,
  event: 1560,
  static: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint → DB query mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CHEF synthesis agents whose market_messages.sent_at reflects frontend market digest freshness.
 * Mirrors the CHEF_SYNTHESIS_AGENTS constant in marketDigestHandler.ts (interface layer).
 * Defined here as a domain constant to avoid cross-layer import.
 */
const COVERAGE_CHEF_AGENTS: readonly string[] = [
  "morning-briefing",
  "evening-summary",
  "france-summary",
];

type DbQuerySpec =
  | { kind: "query"; sql: string }
  | { kind: "always_fresh" }; // computed-on-read: age is always ~0

/**
 * Maps endpoint strings (from coverage-map rows) to DB MAX() queries.
 *
 * Only the 5 endpoints fixed by TASK-FFT-L2 are mapped here — rows with
 * unmapped endpoints are silently skipped (they are covered by the existing
 * 12-signal SLA path or have no queryable DB column).
 *
 * Column sources match the TASK-FFT-L2 handler implementations:
 *   marketDigest → market_messages.sent_at (CHEF agents only)
 *   alerts       → alerts.triggered_at
 *   qualityChecklist → computed-on-read (always fresh)
 *   priceHistory → daily_ohlcv.updated_at (global max, not per-ticker)
 *   vpsProxyHealth → vps_push_log.pushed_at
 */
const ENDPOINT_DB_QUERY: Readonly<Record<string, DbQuerySpec>> = {
  "/api/market-digest": {
    kind: "query",
    sql: `SELECT MAX(sent_at) AS max_ts FROM market_messages WHERE from_agent IN (${COVERAGE_CHEF_AGENTS.map(() => "?").join(", ")})`,
  },
  "/api/alerts": {
    kind: "query",
    sql: "SELECT MAX(triggered_at) AS max_ts FROM alerts",
  },
  "/api/quality-checklist": {
    kind: "always_fresh",
  },
  "/api/price-history/:ticker": {
    kind: "query",
    sql: "SELECT MAX(updated_at) AS max_ts FROM daily_ohlcv",
  },
  "/api/vps-proxy-health": {
    kind: "query",
    sql: "SELECT MAX(pushed_at) AS max_ts FROM vps_push_log",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main checker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks all active coverage-map rows against their SLA thresholds.
 *
 * Behavior:
 *  1. Uses injectedRows if provided (test isolation); else uses rows parameter.
 *  2. Filters for LIVE/L2/DEPTH_THIN/STALE_RISK rows; skips STATIC and GAP.
 *  3. For each row, looks up endpoint in ENDPOINT_DB_QUERY map. Skips unmapped endpoints.
 *  4. Queries MAX(column) from the DB. If null (empty table): EC-7 sentinel — skips row.
 *  5. Computes age in minutes: floor((now - MAX_timestamp) / 60000).
 *  6. Compares age to SLA_MAX_STALENESS_MIN[row.sla].
 *  7. If age > threshold AND row.status != STALE_RISK → adds breach to output.
 *  8. If age > threshold AND row.status == STALE_RISK AND !isVnMarketHours() → SUPPRESSES
 *     (off-hours amber is expected by design; no escalation).
 *  9. If age > threshold AND row.status == STALE_RISK AND isVnMarketHours() → adds breach.
 *
 * @param rows Coverage-map rows from docs/data/frontend-data-coverage-map.json .rows
 *             (used when injectedRows is not provided)
 * @param db SQLite Database instance for MAX() timestamp queries
 * @param now Current timestamp (injectable for deterministic tests; defaults to new Date())
 * @param injectedRows Pre-parsed mock rows for test isolation (overrides rows param)
 * @returns Array of SLA breach reports; empty array means no breaches detected
 */
export async function checkCoverageMapFreshness(
  rows: CoverageMapRow[],
  db: Database,
  now: Date = new Date(),
  injectedRows?: CoverageMapRow[]
): Promise<FreshnessBreachReport[]> {
  const effectiveRows = injectedRows ?? rows;
  const breaches: FreshnessBreachReport[] = [];

  // Filter: monitor LIVE, L2, DEPTH_THIN, STALE_RISK only — skip STATIC and GAP
  const activeRows = effectiveRows.filter(
    (r) => r.status !== "STATIC" && r.status !== "GAP"
  );

  for (const row of activeRows) {
    const endpoint = row.endpoint;

    // Rows with no endpoint cannot be queried
    if (!endpoint) continue;

    // Look up DB query spec — skip if endpoint not in known mapping
    const querySpec = ENDPOINT_DB_QUERY[endpoint];
    if (!querySpec) continue;

    // Get max staleness for this row's SLA tier (null = static, never breaches)
    const maxStalenessMin = SLA_MAX_STALENESS_MIN[row.sla];
    if (maxStalenessMin === null) continue;

    let ageMinutes: number;

    if (querySpec.kind === "always_fresh") {
      // Computed-on-read — data freshness equals request time; age ≈ 0
      ageMinutes = 0;
    } else {
      // Query DB for the most recent timestamp
      interface MaxRow {
        max_ts: string | null;
      }

      // Market-digest query uses parameterized agent list to avoid SQL injection
      const result =
        endpoint === "/api/market-digest"
          ? (db
              .query<MaxRow, string[]>(querySpec.sql)
              .get(...(COVERAGE_CHEF_AGENTS as string[])) as MaxRow | undefined)
          : (db.query<MaxRow, []>(querySpec.sql).get() as MaxRow | undefined);

      const maxTs = result?.max_ts;

      // EC-7: Empty-table sentinel — table not yet seeded; skip this row
      if (!maxTs) continue;

      // Parse timestamp and compute age
      const maxTsMs = new Date(maxTs).getTime();
      if (isNaN(maxTsMs)) continue; // guard against malformed timestamps

      ageMinutes = Math.floor((now.getTime() - maxTsMs) / 60_000);
      // Clock skew guard: negative age = data appears to be from the future
      if (ageMinutes < 0) ageMinutes = 0;
    }

    // Within SLA threshold — no breach
    if (ageMinutes <= maxStalenessMin) continue;

    // STALE_RISK suppression:
    //   STALE_RISK rows (alerts, foreign-flow) are market-hours-only by design.
    //   Outside VN market hours (02:00-08:59 UTC Mon-Fri), staleness is expected
    //   and should NOT trigger an escalation signal.
    if (row.status === "STALE_RISK" && !isVnMarketHours(now)) {
      // Off-hours amber — suppress (expected by design; no escalation)
      continue;
    }

    breaches.push({
      pageId: row.page,
      elementId: typeof row.elem === "string" && row.elem ? row.elem : row.page,
      ageMinutes,
      maxStalenessMin,
      endpoint,
      timestamp: now.toISOString(),
    });
  }

  return breaches;
}
