/**
 * Infrastructure Adapter — adb-kidb
 *
 * Source: ADB Key Indicators Database (kidb.adb.org)
 * Technique: spa-xhr-intercept — Phase 2 direct API (~15MB RAM)
 * Recon: docs/mainserver-sources/adb-kidb/recon.md
 * XHR Contract: docs/mainserver-sources/adb-kidb/xhr-contract.md
 *
 * Phase 1 (Playwright discovery) revealed the SDMX v4 API used by the Vue SPA.
 * Phase 2 calls it directly — no headless browser needed in production.
 *
 * API: https://kidb.adb.org/api/v4/sdmx/data/ADB,{DATAFLOW}/A.{INDICATOR}.{ECONOMY}
 *   ?format=sdmx-json
 * Economy code for Vietnam: VIE (not VNM — ADB-specific code)
 * No authentication. Azure CDN only — no Akamai/CF bot protection.
 *
 * Fetches key VN macro indicators: GDP growth, CPI, GDP current prices.
 */

import type { AdbKidbPort, AdbKidbDataPoint } from '../../domain/repositories.js';

const BASE_URL = 'https://kidb.adb.org/api/v4/sdmx/data/ADB';
const ECONOMY = 'VIE'; // ADB code for Vietnam

/** ADB KIDB dataflows and indicators for VN macro intelligence. */
export const ADB_INDICATORS: Array<{
  dataflow: string;
  indicator: string;
  name: string;
  description: string;
}> = [
  {
    dataflow: 'EO_NA_CONST_GOO',
    indicator: 'NGDP_R_PTX_PS',
    name: 'gdp_growth_pct',
    description: 'GDP growth rate (% annual change, constant prices)',
  },
  {
    dataflow: 'MFP_PR',
    indicator: 'PCPI_PC_PP_PT',
    name: 'cpi_pct_change',
    description: 'CPI inflation rate (% annual change, national)',
  },
  {
    dataflow: 'MFP_PR',
    indicator: 'PCPI_IX',
    name: 'cpi_index',
    description: 'Consumer price index (national, all items)',
  },
  {
    dataflow: 'EO_NA',
    indicator: 'NGDP_XDC',
    name: 'gdp_current_vnd',
    description: 'GDP at current market prices (VND billions)',
  },
];

/** SDMX-JSON structure returned by ADB KIDB v4 API. */
interface SdmxDimension {
  id: string;
  values: Array<{ id?: string; value?: string; name?: string }>;
}

interface SdmxStructure {
  dimensions: {
    series: SdmxDimension[];
    observation: SdmxDimension[];
  };
}

interface SdmxObservations {
  [index: string]: [string, ...unknown[]];
}

interface SdmxSeries {
  [seriesKey: string]: { observations: SdmxObservations };
}

interface SdmxDataset {
  structure: number;
  series?: SdmxSeries;
}

interface SdmxJsonResponse {
  data: {
    structures: SdmxStructure[];
    datasets: SdmxDataset[];
  };
}

/** Extract year-to-value mapping from a SDMX-JSON response. */
function extractTimeSeries(raw: SdmxJsonResponse): AdbKidbDataPoint[] {
  const structures = raw.data.structures;
  const datasets = raw.data.datasets;

  if (!structures.length || !datasets.length) return [];

  const struct = structures[0]!;
  const dataset = datasets[0]!;

  // Build TIME_PERIOD index → year string map
  const timeDims = struct.dimensions.observation ?? [];
  const timeDim = timeDims.find((d) => d.id === 'TIME_PERIOD');
  if (!timeDim) return [];

  const years: string[] = timeDim.values.map(
    (v) => (v.value ?? v.id ?? ''),
  );

  // Walk series (for a single INDICATOR+ECONOMY query, there is one series: "0.0.0")
  const series = dataset.series ?? {};
  const points: AdbKidbDataPoint[] = [];

  for (const [, sv] of Object.entries(series)) {
    const obs = sv.observations;
    for (const [obsIdx, obsVal] of Object.entries(obs)) {
      const yearIdx = parseInt(obsIdx, 10);
      const year = years[yearIdx];
      const raw = obsVal[0];

      if (!year || raw == null) continue;

      const value = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
      if (!isNaN(value)) {
        points.push({ year, value });
      }
    }
  }

  return points.sort((a, b) => a.year.localeCompare(b.year));
}

/** Pause between requests for polite rate-limiting. */
function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class AdbKidbAdapter implements AdbKidbPort {
  // ADB KIDB API is slow (~15-20s response time) — 30s timeout required
  private readonly timeoutMs = 30_000;

  /** Fetch a single indicator for Vietnam from ADB KIDB SDMX v4 API. */
  async fetchIndicator(
    dataflow: string,
    indicator: string,
  ): Promise<AdbKidbDataPoint[]> {
    const url =
      `${BASE_URL},${dataflow}/A.${indicator}.${ECONOMY}?format=sdmx-json`;

    try {
      const resp = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://kidb.adb.org/',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(
          `[adb-kidb] HTTP ${resp.status} for ${dataflow}/${indicator}`,
        );
        return [];
      }

      const raw = (await resp.json()) as SdmxJsonResponse;
      return extractTimeSeries(raw);
    } catch (err) {
      console.error(`[adb-kidb] fetch error for ${dataflow}/${indicator}:`, err);
      return [];
    }
  }

  /** Fetch all tracked VN macro indicators as a named batch. */
  async fetchVnMacroBatch(): Promise<Record<string, AdbKidbDataPoint[]>> {
    const result: Record<string, AdbKidbDataPoint[]> = {};

    for (const { dataflow, indicator, name } of ADB_INDICATORS) {
      result[name] = await this.fetchIndicator(dataflow, indicator);
      // 1.5-2.5s gap — ADB KIDB is publicly hosted; be polite
      await sleepMs(1_500 + Math.random() * 1_000);
    }

    return result;
  }
}
