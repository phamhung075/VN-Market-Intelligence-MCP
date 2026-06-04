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

const FETCH_TIMEOUT_MS = 30_000;

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
// Fetch function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch AGM plan + actuals for a batch of tickers from the VPS proxy.
 *
 * @param tickers - Array of stock codes (e.g. ["FPT", "ACB"])
 * @param fetchFn - Injectable fetch for unit testing (defaults to global fetch)
 * @returns Parsed rows or null on error
 */
export async function fetchAgmPlan(
  tickers: string[],
  fetchFn: typeof fetch = fetch,
): Promise<AgmPlanFetchResult | null> {
  if (tickers.length === 0) return null;

  const batch = tickers.map((t) => t.toUpperCase().trim()).join(",");
  const url = `${VPS_AGM_URL}?batch=${encodeURIComponent(batch)}`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (!resp.ok) {
      console.error(`[agmPlanFetcher] VPS returned ${resp.status}`);
      return null;
    }

    const json = (await resp.json()) as VpsResponse;

    if (!json.data || typeof json.data !== "object") {
      console.error("[agmPlanFetcher] VPS response missing .data");
      return null;
    }

    const fetchedAt = json.fetched_at ?? new Date().toISOString();
    const planRows: AgmPlanRow[] = [];
    const actualRows: AgmActualRow[] = [];

    for (const [ticker, tickerData] of Object.entries(json.data)) {
      // Parse planned targets
      for (const item of tickerData.planned ?? []) {
        if (
          typeof item.ptid !== "number" ||
          typeof item.year !== "number"
        ) {
          continue;
        }
        planRows.push({
          stock_code: ticker.toUpperCase(),
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
          stock_code: ticker.toUpperCase(),
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

    return {
      plan_rows: planRows,
      actual_rows: actualRows,
      tickers_ok: (json.tickers_ok ?? []).map((t) => t.toUpperCase()),
      tickers_error: (json.tickers_error ?? []).map((t) => t.toUpperCase()),
      fetched_at: fetchedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agmPlanFetcher] fetch error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
