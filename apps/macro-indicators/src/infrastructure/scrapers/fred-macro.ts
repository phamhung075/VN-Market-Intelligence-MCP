/**
 * Infrastructure Adapter — fred-macro
 *
 * Source: FRED API (api.stlouisfed.org) — St. Louis Federal Reserve
 * Technique: open-api-key (~5MB RAM — plain fetch, no bot protection on API subdomain)
 * Recon: docs/mainserver-sources/fred-macro/recon.md
 *
 * DEPENDENCY: FRED_API_KEY env var must be set.
 * If missing: isAvailable() returns false. All fetch methods return null.
 * Module is wired unconditionally — activates automatically when key lands.
 *
 * Web pages (fred.stlouisfed.org) are blocked by Akamai TLS fingerprint — NOT used.
 * API subdomain (api.stlouisfed.org) has NO bot protection — only key validation.
 */

import type { FredMacroPort, FredSeriesResult, FredObservation } from '../../domain/repositories.js';

const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';

/** US macro series relevant to VN market context. */
export const FRED_SERIES: Record<string, string> = {
  fed_funds_rate:          'FEDFUNDS',    // Federal Funds Rate (monthly)
  us_cpi:                  'CPIAUCSL',    // US CPI (monthly)
  vix:                     'VIXCLS',      // CBOE VIX (daily)
  us_10y_yield:            'GS10',        // 10-Year Treasury Yield
  yield_spread_10y2y:      'T10Y2Y',      // 10Y-2Y yield spread (recession signal)
  usd_broad_index:         'DTWEXBGS',    // USD Broad Goods Index (USD strength)
  us_unemployment:         'UNRATE',      // US Unemployment Rate
  us_10y_breakeven_infl:   'T10YIE',      // 10-Year Breakeven Inflation Rate
};

interface FredApiResponse {
  observations?: Array<{ date: string; value: string }>;
  error_code?: number;
  error_message?: string;
}

export class FredMacroAdapter implements FredMacroPort {
  private readonly apiKey: string | undefined;
  private readonly timeoutMs = 10_000;

  constructor() {
    this.apiKey = process.env['FRED_API_KEY'];
  }

  /** Returns true when FRED_API_KEY is present in environment. */
  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length === 32;
  }

  async fetchSeries(seriesId: string, limit = 10): Promise<FredSeriesResult | null> {
    if (!this.isAvailable()) {
      console.warn('[fred-macro] FRED_API_KEY not set — skipping fetch. Ops: add key to .env');
      return null;
    }

    const params = new URLSearchParams({
      series_id: seriesId,
      limit: String(limit),
      sort_order: 'desc',
      file_type: 'json',
      api_key: this.apiKey!,
    });
    const url = `${FRED_API_BASE}?${params.toString()}`;

    try {
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(`[fred-macro] HTTP ${resp.status} for ${seriesId}`);
        return null;
      }

      const raw = (await resp.json()) as FredApiResponse;

      if (raw.error_code) {
        console.error(`[fred-macro] API error ${raw.error_code}: ${raw.error_message}`);
        return null;
      }

      const observations: FredObservation[] = (raw.observations ?? []).map((o) => ({
        date: o.date,
        value: o.value,
      }));

      return {
        seriesId,
        observations,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[fred-macro] fetch error for ${seriesId}:`, err);
      return null;
    }
  }

  async fetchAllMacro(): Promise<Record<string, FredSeriesResult | null>> {
    if (!this.isAvailable()) {
      console.warn('[fred-macro] FRED_API_KEY missing — returning empty results');
      return Object.fromEntries(Object.keys(FRED_SERIES).map((k) => [k, null]));
    }

    const entries = Object.entries(FRED_SERIES);

    // Fan out all 8 series concurrently — FRED public limit is 120 req/min;
    // 8 parallel calls is well within budget. Sequential loop + sleeps caused
    // ~8-12s total latency, exceeding the 8s per-source budget in
    // fetch-external-macro.ts. Parallel dispatch brings latency to ~1s.
    const results = await Promise.all(
      entries.map(([, seriesId]) => this.fetchSeries(seriesId)),
    );

    return Object.fromEntries(
      entries.map(([name], i) => [name, results[i] ?? null]),
    );
  }
}
