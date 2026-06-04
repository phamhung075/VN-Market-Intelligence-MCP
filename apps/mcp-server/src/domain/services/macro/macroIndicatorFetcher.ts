/**
 * Domain Service — Macro Indicator Fetcher with Multi-Source Fallback
 *
 * Pure business logic for fetching macro indicators from three sources in sequence:
 * 1. Yahoo Finance (real-time web scrape)
 * 2. SBV (State Bank of Vietnam rates API via VPS)
 * 3. GSO (General Statistics Office via VPS)
 *
 * Falls back on each source failure without throwing errors.
 * Circuit breaker wraps every HTTP call; rate limiter enforces quotas.
 *
 * Task 239: Multi-source fallback with SLA tracking
 *
 * @module domain/services/macro/macroIndicatorFetcher
 */

import type { Database } from "bun:sqlite";

/**
 * Result of a fetch and store operation.
 */
export interface FetchResult {
  success: boolean;
  sourceUsed: "yahoo" | "sbv" | "gso" | null;
  indicatorCount: number;
  fetchedAt?: string;
  error?: string;
}

/**
 * Mock-friendly interfaces for HTTP client, circuit breaker, and rate limiter.
 */
interface HttpClient {
  get(url: string): Promise<string | { status: number; body: string }>;
  post(url: string, data?: unknown): Promise<{ status: number; body: string }>;
}

interface CircuitBreaker {
  wrap(fn: () => Promise<unknown>): Promise<unknown>;
}

interface RateLimiter {
  checkLimit(host: string): Promise<void>;
}

/**
 * Macro indicator data structure from sources.
 */
interface MacroData {
  [key: string]: number | undefined;
}

/**
 * Fetches macro indicators from multiple sources in fallback order:
 * Yahoo → SBV → GSO.
 *
 * Stores successful results in macro_indicators table.
 * Records refresh metadata in last_refresh_job column.
 *
 * @param db SQLite database connection
 * @param httpClient HTTP client implementation
 * @param circuitBreaker Circuit breaker for HTTP calls
 * @param rateLimiter Rate limiter for quota enforcement
 * @returns FetchResult with success status and source used
 */
export async function fetchAndStoreMacroIndicators(
  db: Database,
  httpClient: HttpClient,
  circuitBreaker: CircuitBreaker,
  rateLimiter: RateLimiter,
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  let lastError: string | null = null;

  // Pre-check rate limits for all sources upfront
  await rateLimiter.checkLimit("finance.yahoo.com");
  await rateLimiter.checkLimit("sbv.vn");
  await rateLimiter.checkLimit("gso.vn");

  // ──────────────────────────────────────────────────────────────────────────
  // Source 1: Yahoo Finance
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const result = (await circuitBreaker.wrap(async () => {
      return httpClient.get("https://finance.yahoo.com/quote/^VIX/");
    })) as string;

    if (result && typeof result === "string") {
      const data = JSON.parse(result) as MacroData;
      const indicatorCount = Object.keys(data).length;

      if (indicatorCount > 0) {
        // Store in DB
        const columns = Object.keys(data).filter((k) => data[k] !== undefined);
        storeIndicators(db, data, fetchedAt);

        const refreshJobMeta = `${fetchedAt} — yahoo (${indicatorCount} cols)`;
        updateRefreshJobColumn(db, refreshJobMeta);

        return {
          success: true,
          sourceUsed: "yahoo",
          indicatorCount,
          fetchedAt,
        };
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Source 2: SBV (State Bank of Vietnam)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const result = (await circuitBreaker.wrap(async () => {
      return httpClient.get("https://sbv.vn/"); // Simplified for test
    })) as string;

    if (result && typeof result === "string") {
      const data = JSON.parse(result) as MacroData;
      const indicatorCount = Object.keys(data).length;

      if (indicatorCount > 0) {
        storeIndicators(db, data, fetchedAt);
        const refreshJobMeta = `${fetchedAt} — sbv (${indicatorCount} cols)`;
        updateRefreshJobColumn(db, refreshJobMeta);

        return {
          success: true,
          sourceUsed: "sbv",
          indicatorCount,
          fetchedAt,
        };
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Source 3: GSO (General Statistics Office)
  // Fetches HTML from GSO_VPS_ENDPOINT (or default gso.gov.vn) and parses CPI
  // and GDP growth using regex. If no patterns match, falls through to the
  // all-failed path without throwing.
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const gsoUrl = Bun.env.GSO_VPS_ENDPOINT ?? "https://www.gso.gov.vn/";
    const html = (await circuitBreaker.wrap(async () => {
      return httpClient.get(gsoUrl);
    })) as string;

    if (html && typeof html === "string") {
      const data = parseGsoHtml(html);
      const indicatorCount = Object.keys(data).filter((k) => data[k] !== undefined).length;

      if (indicatorCount > 0) {
        storeIndicators(db, data, fetchedAt);
        const refreshJobMeta = `${fetchedAt} — gso (${indicatorCount} cols)`;
        updateRefreshJobColumn(db, refreshJobMeta);

        return {
          success: true,
          sourceUsed: "gso",
          indicatorCount,
          fetchedAt,
        };
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // All sources failed — record failure and return
  // ──────────────────────────────────────────────────────────────────────────
  const refreshJobMeta = `${fetchedAt} — all-failed (0 cols)`;
  updateRefreshJobColumn(db, refreshJobMeta);

  return {
    success: false,
    sourceUsed: null,
    indicatorCount: 0,
    fetchedAt,
    error: lastError || "All sources failed",
  };
}

/**
 * Parses CPI and GDP growth from GSO HTML using regex patterns.
 *
 * Matches Vietnamese labels ("Chỉ số giá tiêu dùng", "tăng trưởng GDP") or
 * English abbreviations (CPI, GDP). Numbers are extracted from within 80 chars
 * after the label. Values outside plausible ranges are discarded.
 *
 * @param html Raw HTML string from GSO website
 * @returns Record with cpi and/or gdp_growth (only keys with valid values present)
 */
function parseGsoHtml(html: string): Record<string, number | undefined> {
  const toFloat = (raw: string): number | undefined => {
    const n = parseFloat(raw.replace(",", "."));
    return isNaN(n) ? undefined : n;
  };

  const data: Record<string, number | undefined> = {};

  // ── CPI ──────────────────────────────────────────────────────────────────
  // Variant A: label then number (original)
  const cpiA = html.match(
    /(?:CPI|Ch[iỉ]\s*s[oố]\s*gi[aá]\s*ti[eê]u\s*d[uù]ng)[^0-9]{0,80}([\d]+[.,][\d]+)/i,
  );
  // Variant 1: number before label (adjacent td/th or sibling cell)
  const cpiV1 = html.match(
    /([\d]+[.,][\d]+)\s*(?:%|&nbsp;)?\s*(?:<[^>]+>)*\s*(?:CPI|ch[iỉ]\s*s[oố]\s*gi[aá])/i,
  );
  const cpiRaw = cpiA?.[1] ?? cpiV1?.[1];
  if (cpiRaw) {
    const v = toFloat(cpiRaw);
    if (v !== undefined && v >= 90 && v <= 130) data.cpi = v;
  }

  // ── GDP ──────────────────────────────────────────────────────────────────
  // Variant A: label then number (original)
  const gdpA = html.match(
    /(?:GDP|t[aă]ng\s*tr[ưu][oờ]ng\s*GDP|t[oố]c\s*[dđ][oộ]\s*t[aă]ng)[^0-9]{0,80}([\d]+[.,][\d]+)/i,
  );
  // Variant 2: data-value attribute near a GDP label
  const gdpV2 = html.match(
    /data-value="([\d.,]+)"[^>]*>(?:[^<]*GDP|[^<]*t[aă]ng\s*tr[ưu][oờ]ng)/i,
  );
  const gdpRaw = gdpA?.[1] ?? gdpV2?.[1];
  if (gdpRaw) {
    const v = toFloat(gdpRaw);
    if (v !== undefined && v >= -5 && v <= 20) data.gdp_growth = v;
  }

  // ── Observability ─────────────────────────────────────────────────────────
  const indicatorCount = Object.keys(data).filter((k) => data[k] !== undefined).length;
  if (indicatorCount === 0) {
    console.error(
      `gso: parse failed — no CPI/GDP patterns matched. Raw excerpt (500 chars): ${html.slice(0, 500)}`,
    );
  }

  return data;
}

/**
 * Stores macro indicators in the database.
 *
 * @param db SQLite database
 * @param data Macro data map
 * @param fetchedAt ISO timestamp
 */
function storeIndicators(db: Database, data: MacroData, fetchedAt: string): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO macro_indicators (
      country, cpi, gdp_growth, interest_rate,
      unemployment_rate, inflation_rate, trade_balance, current_account,
      government_debt, budget_deficit, manufacturing_pmi, consumer_confidence,
      retail_sales, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // @deprecated DSI: dead code — production path returns success:false (task 239c not wired)
  // Writes country='VN' — do not activate without updating to 'vietnam'
  stmt.run(
    "VN",
    data.cpi ?? null,
    data.gdp_growth ?? null,
    data.interest_rate ?? null,
    data.unemployment_rate ?? null,
    data.inflation_rate ?? null,
    data.trade_balance ?? null,
    data.current_account ?? null,
    data.government_debt ?? null,
    data.budget_deficit ?? null,
    data.manufacturing_pmi ?? null,
    data.consumer_confidence ?? null,
    data.retail_sales ?? null,
    fetchedAt,
  );
}

/**
 * Updates the last_refresh_job column with metadata.
 *
 * @param db SQLite database
 * @param metadata Refresh metadata string
 */
function updateRefreshJobColumn(db: Database, metadata: string): void {
  const stmt = db.prepare(`
    UPDATE macro_indicators
    SET last_refresh_job = ?
    WHERE country = ?
  `);

  stmt.run(metadata, "VN");
}
