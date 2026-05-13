/**
 * Infrastructure Adapter — world-bank-macro
 *
 * Source: World Bank Open Data API v2
 * Technique: header-rotation (~5MB RAM — plain fetch, no bot protection)
 * Recon: docs/mainserver-sources/world-bank-macro/recon.md
 *
 * Fetches VN annual macro indicators: GDP, CPI, FDI, trade, unemployment.
 * Data is annual, latest ~18 months lag. No API key required.
 */

import type { WorldBankMacroPort, WorldBankDataPoint } from '../../domain/repositories.js';

const BASE_URL = 'https://api.worldbank.org/v2/country/VN/indicator';

/** VN indicators tracked for market intelligence context. */
export const VN_INDICATORS: Record<string, string> = {
  gdp_usd:          'NY.GDP.MKTP.CD',   // GDP (current US$)
  gdp_growth:       'NY.GDP.MKTP.KD.ZG', // GDP growth (annual %)
  cpi_inflation:    'FP.CPI.TOTL.ZG',   // Inflation, consumer prices (annual %)
  fdi_inflows:      'BX.KLT.DINV.CD.WD', // FDI net inflows (BoP, current US$)
  exports_usd:      'NE.EXP.GNFS.CD',   // Exports of goods and services (US$)
  imports_usd:      'NE.IMP.GNFS.CD',   // Imports of goods and services (US$)
  unemployment:     'SL.UEM.TOTL.ZS',   // Unemployment, total (% of labor force)
};

/** UA pool for header rotation — rotate per request to avoid soft heuristics. */
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function randomUa(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]!;
}

function browserHeaders(): HeadersInit {
  return {
    'User-Agent': randomUa(),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  };
}

/** Parsed shape returned by World Bank API v2. */
interface WbApiMeta {
  page: number;
  pages: number;
  per_page: number;
  total: number;
  lastupdated: string;
}

interface WbDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  date: string;
  value: number | null;
}

type WbApiResponse = [WbApiMeta, WbDataPoint[]];

export class WorldBankMacroAdapter implements WorldBankMacroPort {
  private readonly mostRecentDefault = 10;
  private readonly timeoutMs = 10_000;

  async fetchVnIndicator(
    indicatorCode: string,
    mostRecentN = this.mostRecentDefault,
  ): Promise<WorldBankDataPoint[]> {
    const url =
      `${BASE_URL}/${indicatorCode}?format=json` +
      `&per_page=${mostRecentN}&mrv=${mostRecentN}`;

    try {
      const resp = await fetch(url, {
        headers: browserHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(`[world-bank-macro] HTTP ${resp.status} for ${indicatorCode}`);
        return [];
      }

      const raw = (await resp.json()) as WbApiResponse;
      const dataPoints: WbDataPoint[] = Array.isArray(raw[1]) ? raw[1] : [];

      return dataPoints.map((dp) => ({
        indicator: dp.indicator.id,
        indicatorName: dp.indicator.value,
        date: dp.date,
        value: dp.value,
      }));
    } catch (err) {
      console.error(`[world-bank-macro] fetch error for ${indicatorCode}:`, err);
      return [];
    }
  }

  async fetchVnMacroBatch(): Promise<Record<string, WorldBankDataPoint[]>> {
    const entries = Object.entries(VN_INDICATORS);

    // Fan out all 7 indicators concurrently — World Bank public API limit is 10 req/10s;
    // 7 parallel calls is well within budget. Sequential loop + sleeps caused 10-17s total
    // latency, exceeding the 8s per-source budget in fetch-external-macro.ts.
    // Parallel dispatch brings latency to ~2-3s.
    const results = await Promise.all(
      entries.map(([, code]) => this.fetchVnIndicator(code)),
    );

    return Object.fromEntries(
      entries.map(([name], i) => [name, results[i] ?? []]),
    );
  }
}
