/**
 * AGM Plan Fetcher — RAPID-DATA-LAYER FIX-G
 *
 * Fetches planned AGM targets + actuals from the Vinahost VPS proxy.
 * Endpoint: GET http://<VPS>:8765/proxy/agm-plan?batch=T1,T2,...
 *
 * VPS scraper source: /root/vietstock-agm-plan.py (aspnet-csrf-double-submit technique).
 * PTID semantics: 5=planned revenue, 8=planned PBT, 9=planned PAT.
 * report_term_id: 1=full-year, 2=Q1, 3=Q2, 4=Q3/Q4, 5=H1.
 * report_norm_id: 2206=revenue, 2211=PBT, 2212=PAT (bank norms differ).
 *
 * Chunking: VPS max batch = 30 tickers; watchlist (33) is split automatically.
 * Auth: VPS_PUSH_API_KEY sent as X-API-Key header (same pattern as sscInsider).
 *
 * Never throws — returns null on network/parse errors.
 *
 * @module infrastructure/fetchers/agmPlanFetcher
 */

import type { AgmPlanRow, AgmActualRow } from "../db/agmPlanStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// VPS config
// ─────────────────────────────────────────────────────────────────────────────

const VPS_AGM_URL =
  Bun.env["AGM_PLAN_VPS_URL"] ??
  "http://125.212.251.27:8765/proxy/agm-plan";

// Timeout per chunk request — 30 tickers via Vietstock CSRF scraping takes ~60-90s
const FETCH_TIMEOUT_MS = 120_000;

// Chunk size: smaller chunks complete faster and avoid per-request timeouts.
// VPS max batch = 30; we use 10 to keep each chunk under 30s.
const VPS_MAX_BATCH = 10;

// ─────────────────────────────────────────────────────────────────────────────
// VPS response types
// ─────────────────────────────────────────────────────────────────────────────

interface VpsPlannedItem {
  stock_code: string;
  ptid: number;
  pt_name?: string;
  year?: number;
  value_raw?: number;
  value_ty?: number;
}

interface VpsActualItem {
  stock_code: string;
  year?: number;
  report_term_id?: number;
  report_norm_id?: number;
  ptid?: number;
  value_raw?: number;
  value_ty?: number;
}

interface VpsTickerData {
  planned: VpsPlannedItem[];
  actuals: VpsActualItem[];
}

interface VpsResponse {
  status: string;
  tickers_ok?: string[];
  tickers_fallback?: string[];
  tickers_error?: string[];
  data?: Record<string, VpsTickerData>;
  fetched_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch result type (exported for job consumers)
// ─────────────────────────────────────────────────────────────────────────────

export interface AgmPlanFetchResult {
  plan_rows: AgmPlanRow[];
  actual_rows: AgmActualRow[];
  tickers_ok: string[];
  tickers_error: string[];
  fetched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge a single VPS JSON response into accumulated output arrays.
 */
function parseVpsResponse(
  json: VpsResponse,
  planRows: AgmPlanRow[],
  actualRows: AgmActualRow[],
  tickersOk: string[],
  tickersError: string[],
): void {
  const fetchedAt = json.fetched_at ?? new Date().toISOString();

  for (const [ticker, tickerData] of Object.entries(json.data ?? {})) {
    const code = ticker.toUpperCase();

    // Parse planned targets
    for (const item of tickerData.planned ?? []) {
      if (typeof item.ptid !== "number" || typeof item.year !== "number") {
        continue;
      }
      planRows.push({
        stock_code: code,
        ptid: item.ptid,
        pt_name: item.pt_name ?? "",
        year: item.year,
        value_raw: item.value_raw ?? 0,
        value_ty: item.value_ty ?? (item.value_raw ?? 0) / 1e9,
        fetched_at: fetchedAt,
      });
    }

    // Parse actuals
    for (const item of tickerData.actuals ?? []) {
      if (
        typeof item.year !== "number" ||
        typeof item.report_term_id !== "number" ||
        typeof item.report_norm_id !== "number"
      ) {
        continue;
      }
      actualRows.push({
        stock_code: code,
        year: item.year,
        report_term_id: item.report_term_id,
        report_norm_id: item.report_norm_id,
        ptid: item.ptid ?? 0,
        value_raw: item.value_raw ?? 0,
        value_ty: item.value_ty ?? (item.value_raw ?? 0) / 1e9,
        fetched_at: fetchedAt,
      });
    }
  }

  for (const t of json.tickers_ok ?? []) tickersOk.push(t.toUpperCase());
  for (const t of json.tickers_error ?? []) tickersError.push(t.toUpperCase());
}

/**
 * Fetch a single chunk of up to VPS_MAX_BATCH tickers.
 * Returns null on network/HTTP error.
 */
async function fetchChunk(
  chunk: string[],
  fetchFn: typeof fetch,
): Promise<VpsResponse | null> {
  // Do NOT encodeURIComponent — VPS expects raw comma-separated codes in ?batch=
  const url = `${VPS_AGM_URL}?batch=${chunk.join(",")}`;

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
  };
  // VPS API key — same env var / header as all other VPS proxy consumers
  const apiKey = Bun.env["VPS_PUSH_API_KEY"];
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetchFn(url, {
      signal: controller.signal,
      headers,
    });

    if (!resp.ok) {
      console.error(
        `[agmPlanFetcher] VPS returned ${resp.status} for chunk [${chunk.join(",")}]`,
      );
      return null;
    }

    return (await resp.json()) as VpsResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agmPlanFetcher] fetch error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch AGM plan + actuals for a batch of tickers from the VPS proxy.
 *
 * Automatically chunks requests when the batch exceeds VPS_MAX_BATCH (30),
 * since the VPS endpoint returns 400 for oversized batches.
 *
 * @param tickers - Array of stock codes (e.g. ["FPT", "ACB"])
 * @param fetchFn - Injectable fetch for unit testing (defaults to global fetch)
 * @returns Aggregated rows across all chunks, or null if all chunks fail
 */
export async function fetchAgmPlan(
  tickers: string[],
  fetchFn: typeof fetch = fetch,
): Promise<AgmPlanFetchResult | null> {
  if (tickers.length === 0) return null;

  const normalized = tickers.map((t) => t.toUpperCase().trim());
  const planRows: AgmPlanRow[] = [];
  const actualRows: AgmActualRow[] = [];
  const tickersOk: string[] = [];
  const tickersError: string[] = [];
  let anySuccess = false;
  let latestFetchedAt = new Date().toISOString();

  // Split into chunks of VPS_MAX_BATCH and fetch each
  for (let i = 0; i < normalized.length; i += VPS_MAX_BATCH) {
    const chunk = normalized.slice(i, i + VPS_MAX_BATCH);
    const json = await fetchChunk(chunk, fetchFn);

    if (json === null) {
      // Mark all tickers in this failed chunk as errors
      for (const t of chunk) tickersError.push(t);
      continue;
    }

    if (json.fetched_at) latestFetchedAt = json.fetched_at;
    parseVpsResponse(json, planRows, actualRows, tickersOk, tickersError);
    anySuccess = true;
  }

  // Return null only if every chunk failed and we have no data at all
  if (!anySuccess && planRows.length === 0) {
    return null;
  }

  return {
    plan_rows: planRows,
    actual_rows: actualRows,
    tickers_ok: tickersOk,
    tickers_error: tickersError,
    fetched_at: latestFetchedAt,
  };
}
