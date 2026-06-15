/**
 * Application Service — IMF Data Fetcher (Task 1296b)
 *
 * Fetches IMF economic indicators from the public IMF REST API.
 * All HTTP calls wrapped in circuit breaker + rate limiter (per CLAUDE.md).
 *
 * Data source: IMF REST API (primary)
 *   https://www.imf.org/external/datamapper/api/v1/
 *
 * Fallback: cached DB data with confidence penalty on HTTP failure.
 *
 * Rate limit: 10 requests/minute (IMF public API limit; 6s interval).
 * Circuit breaker: fail after 3 consecutive failures, 5-min reset.
 *
 * @module application/services/imfDataFetcher
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import {
  calculateConfidenceDecay,
  IMF_INDICATORS,
  type ImfIndicator,
} from "../../domain/models/imfIndicators.js";
import { CircuitBreaker } from "../../infrastructure/circuitBreaker.js";
import { failLoud } from "../../domain/utils/safeQuery.js";

// ── IMF API breaker (registered at module level) ──────────────────────────────

/**
 * Dedicated circuit breaker for the IMF public API.
 * 3 failures → open; 5-min reset (IMF is slow / occasionally throttles).
 */
export const imfBreaker = new CircuitBreaker("imf_api", {
  failureThreshold: 3,
  resetTimeoutMs: 300_000, // 5 minutes
});

const IMF_HOST = "www.imf.org";
/** 10 req/min → 6s interval */
const IMF_RATE_INTERVAL_MS = 6_000;

// ── IMF API URL builder ───────────────────────────────────────────────────────

/**
 * Build IMF DataMapper API URL for a given indicator across all countries.
 * Endpoint: GET /external/datamapper/api/v1/{indicator}
 * Returns JSON with indicator values per country per year.
 */
function buildImfApiUrl(indicatorCode: string): string {
  return `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(indicatorCode)}`;
}

// ── Response parsing ──────────────────────────────────────────────────────────

interface ImfApiResponse {
  values?: Record<string, Record<string, Record<string, number>>>;
}

/**
 * Parse IMF DataMapper API JSON for global/world average value.
 * The API returns { values: { INDICATOR: { COUNTRY: { YEAR: VALUE } } } }
 * We extract the most recent year for "APSP" (All Countries) or fall back to
 * a numeric average of all available countries for the most recent year.
 *
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: bare catch→null replaced with failLoud.
 * A parse error is logged as degraded: so stale-served-as-fresh is visible.
 */
function parseImfApiResponse(
  code: string,
  json: unknown,
  name: string,
): ImfIndicator | null {
  try {
    const resp = json as ImfApiResponse;
    const indicatorData = resp.values?.[code];
    if (!indicatorData) return null;

    // Try to get global/world aggregate — use "WEO" or first available country
    // IMF codes vary; pick the most recent year available from any entry
    const countryEntries = Object.values(indicatorData);
    if (countryEntries.length === 0) return null;

    // Find most recent year with data
    const allYears = new Set<string>();
    for (const entry of countryEntries) {
      for (const year of Object.keys(entry)) {
        allYears.add(year);
      }
    }
    const sortedYears = Array.from(allYears).sort().reverse();
    const latestYear = sortedYears[0];
    const prevYear = sortedYears[1] ?? null;
    if (!latestYear) return null;

    // Average across all countries for the latest year
    const latestValues: number[] = [];
    for (const entry of countryEntries) {
      const v = entry[latestYear];
      if (typeof v === "number" && isFinite(v)) latestValues.push(v);
    }
    if (latestValues.length === 0) return null;
    const value = latestValues.reduce((s, v) => s + v, 0) / latestValues.length;

    // Previous year average
    let previousValue: number | null = null;
    if (prevYear) {
      const prevValues: number[] = [];
      for (const entry of countryEntries) {
        const v = entry[prevYear];
        if (typeof v === "number" && isFinite(v)) prevValues.push(v);
      }
      if (prevValues.length > 0) {
        previousValue = prevValues.reduce((s, v) => s + v, 0) / prevValues.length;
      }
    }

    const yoyChange =
      previousValue !== null && previousValue !== 0
        ? (value - previousValue) / Math.abs(previousValue)
        : null;

    // Estimate age: IMF publishes annually (April WEO) — assume ~14 days since latest
    const ageInDays = 14;
    const publishedAt = new Date(
      Date.now() - ageInDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    return {
      code,
      name,
      value,
      publishedAt,
      ageInDays,
      previousValue,
      yoyChange,
      source: "imf_api",
      confidence: calculateConfidenceDecay(ageInDays),
    };
  } catch (err) {
    // FIX-ERRAUDIT-W2-MCP-DATALAYER: was bare catch→null with NO log.
    // A corrupt/unexpected API payload is now logged via failLoud so
    // stale-cached data served-as-fresh is visible in container logs.
    failLoud(err, `imfDataFetcher.parseImfApiResponse[${code}]`);
    return null;
  }
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

/**
 * Fetch latest IMF indicators from the public DataMapper API.
 *
 * Fetches 3 key indicators (WORLD_GROWTH, GLOBAL_INFLATION, OIL_FORECAST).
 * Each request is rate-limited and circuit-breaker protected.
 * On complete failure, falls back to cached DB data with confidence penalty.
 *
 * @returns Array of ImfIndicator (from API or cache)
 */
export async function fetchLatestImfIndicators(): Promise<ImfIndicator[]> {
  const indicatorsToFetch = [
    { key: "WORLD_GROWTH", name: "Global GDP Growth (%)" },
    { key: "GLOBAL_INFLATION", name: "Global Inflation, Average Consumer Prices (%)" },
    { key: "OIL_FORECAST", name: "Current Account Balance (% of GDP)" },
  ] as const;

  const results: ImfIndicator[] = [];

  for (const { key, name } of indicatorsToFetch) {
    const code = IMF_INDICATORS[key];
    try {
      // Rate limit
      if (!globalRateLimiter.canCall(IMF_HOST)) {
        // Skip this indicator — wait for next cycle
        continue;
      }
      globalRateLimiter.recordCall(IMF_HOST);

      // Circuit breaker + fetch
      const raw = await imfBreaker.execute(async () => {
        const url = buildImfApiUrl(code);
        // NOTE: IMF DataMapper WAF blocks requests with a browser User-Agent
        // (Chrome UA → HTTP 403). Send no User-Agent or Accept override so the
        // API treats the request as a plain API client and returns 200 JSON.
        // Task 1922h root-cause fix.
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          throw new Error(`IMF API HTTP ${response.status}: ${code}`);
        }
        return response.json() as Promise<unknown>;
      });

      const indicator = parseImfApiResponse(code, raw, name);
      if (indicator) results.push(indicator);
    } catch (err) {
      // Circuit breaker open or HTTP error — skip this indicator
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[IMF Fetcher] Skipping ${key}: ${msg}`);
    }
  }

  // If we got some results, return them
  if (results.length > 0) return results;

  // Fallback: return cached DB data with confidence penalty
  return getLatestImfIndicators(0.8);
}

// ── DB storage ────────────────────────────────────────────────────────────────

/**
 * Upsert IMF indicators into the imf_indicators table.
 * Uses parameterized statements (SQL injection prevention per CLAUDE.md).
 */
export async function storeImfIndicators(indicators: ImfIndicator[]): Promise<void> {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO imf_indicators
      (code, name, value, published_at, age_in_days, prev_value, yoy_change, source, confidence, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const ind of indicators) {
    stmt.run(
      ind.code,
      ind.name,
      ind.value,
      ind.publishedAt,
      ind.ageInDays,
      ind.previousValue ?? null,
      ind.yoyChange ?? null,
      ind.source,
      ind.confidence,
    );
  }
}

/**
 * Retrieve latest IMF indicators from DB cache.
 * Used by chainSynthesizer and MCP tool (no live fetch).
 *
 * @param confidencePenaltyFactor - Multiply confidence by this factor (default 1.0; use 0.8 for fallback)
 */
export async function getLatestImfIndicators(
  confidencePenaltyFactor: number = 1.0,
): Promise<ImfIndicator[]> {
  const db = getDb();

  type ImfRow = {
    code: string;
    name: string;
    value: number;
    published_at: string;
    age_in_days: number;
    prev_value: number | null;
    yoy_change: number | null;
    source: "imf_api" | "imf_scrape";
    confidence: number;
  };

  const rows = db
    .prepare<ImfRow, []>(
      `SELECT code, name, value, published_at, age_in_days, prev_value, yoy_change, source, confidence
       FROM imf_indicators
       ORDER BY fetched_at DESC`,
    )
    .all();

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    value: row.value,
    publishedAt: row.published_at,
    ageInDays: row.age_in_days,
    previousValue: row.prev_value,
    yoyChange: row.yoy_change,
    source: row.source,
    confidence: Math.min(1, Math.max(0, row.confidence * confidencePenaltyFactor)),
  }));
}
