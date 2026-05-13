/**
 * Infrastructure Adapter — imf-weo
 *
 * Source: IMF World Economic Outlook via api.imf.org SDMX 3.0
 * Technique: open-api-key (~5MB RAM — plain fetch, no bot protection)
 * Recon: docs/mainserver-sources/imf-weo-api/recon.md
 *
 * REPLACES: imf-datamapper adapter (www.imf.org blocked by Akamai on main server)
 * NEW DOMAIN: api.imf.org — Azure/Istio CDN, no Akamai Bot Manager
 *
 * API: https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/{KEY}
 *   KEY format: {COUNTRY}.{INDICATOR} (e.g. VNM.NGDP_RPCH)
 *   No API key required.
 *
 * Returns WEO data: historical (back to 1980) + IMF forecasts (through ~2031).
 * Published twice yearly: April and October WEO releases.
 *
 * VNM indicators fetched: GDP growth, inflation, unemployment,
 *   current account balance, government fiscal balance.
 */

import type { ImfWeoPort, ImfWeoDataPoint } from '../../domain/repositories.js';

const BASE_URL =
  'https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~';

const COUNTRY_CODE = 'VNM';

/** WEO indicators tracked for VN market intelligence. */
export const WEO_INDICATORS: Record<string, string> = {
  gdp_growth:          'NGDP_RPCH',      // Real GDP growth (% change)
  gdp_usd_billions:    'NGDPD',          // GDP, current prices (billions USD)
  inflation_avg:       'PCPIPCH',        // Avg consumer price inflation (% change)
  unemployment:        'LUR',            // Unemployment rate (% of labor force)
  current_account:     'BCA_NGDPD',      // Current account balance (% of GDP)
  gov_net_lending:     'GGXCNL_NGDP',   // Govt net lending/borrowing (% of GDP)
};

/** SDMX 3.0 response with dimensionAtObservation=AllDimensions */
interface SdmxObsDim {
  id: string;
  values: Array<{ id?: string; value?: string; name?: string }>;
}

interface SdmxStructure {
  dimensions: {
    observation?: SdmxObsDim[];
    series?: SdmxObsDim[];
  };
}

interface SdmxDataset {
  observations?: Record<string, [string, ...unknown[]]>;
  series?: Record<string, { observations: Record<string, [string, ...unknown[]]> }>;
}

interface SdmxJsonResponse {
  data: {
    structures: SdmxStructure[];
    dataSets: SdmxDataset[];
  };
}

/** Shared index lookup: find position of a value in a dimension's values array. */
function findDimIndex(
  dims: SdmxObsDim[],
  dimId: string,
  valueId: string,
): number {
  const dim = dims.find((d) => d.id === dimId);
  if (!dim) return -1;
  return dim.values.findIndex(
    (v) => (v.id ?? v.value ?? '') === valueId,
  );
}

/** Build TIME_PERIOD index → year string map from SDMX structure. */
function buildYearMap(dims: SdmxObsDim[]): string[] {
  const timeDim = dims.find((d) => d.id === 'TIME_PERIOD');
  if (!timeDim) return [];
  return timeDim.values.map((v) => v.value ?? v.id ?? '');
}

/**
 * Parse SDMX-JSON response with dimensionAtObservation=AllDimensions.
 * Observation key: COUNTRY_IDX:INDICATOR_IDX:FREQ_IDX:TIME_IDX
 */
function parseSdmxResponse(
  raw: SdmxJsonResponse,
  countryCode: string,
  indicatorCode: string,
): ImfWeoDataPoint[] {
  const structures = raw.data.structures;
  const dataSets = raw.data.dataSets;

  if (!structures.length || !dataSets.length) return [];

  const dims: SdmxObsDim[] = structures[0]?.dimensions?.observation ?? [];
  const countryIdx = findDimIndex(dims, 'COUNTRY', countryCode);
  const indicatorIdx = findDimIndex(dims, 'INDICATOR', indicatorCode);
  const yearMap = buildYearMap(dims);

  if (countryIdx < 0 || indicatorIdx < 0 || !yearMap.length) return [];

  const observations = dataSets[0]?.observations ?? {};
  const points: ImfWeoDataPoint[] = [];

  for (const [obsKey, obsVal] of Object.entries(observations)) {
    const parts = obsKey.split(':');
    if (parts.length < 4) continue;

    if (
      parseInt(parts[0]!, 10) !== countryIdx ||
      parseInt(parts[1]!, 10) !== indicatorIdx
    ) {
      continue;
    }

    const timeIdx = parseInt(parts[3]!, 10);
    const year = yearMap[timeIdx];
    if (!year) continue;

    const raw = obsVal[0];
    const value = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (!isNaN(value)) {
      points.push({ year, value });
    }
  }

  return points.sort((a, b) => a.year.localeCompare(b.year));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class ImfWeoAdapter implements ImfWeoPort {
  private readonly timeoutMs = 15_000;

  /** Fetch a single WEO indicator for Vietnam. */
  async fetchIndicator(indicatorCode: string): Promise<ImfWeoDataPoint[]> {
    const url =
      `${BASE_URL}/${COUNTRY_CODE}.${indicatorCode}` +
      `?format=jsondata&dimensionAtObservation=AllDimensions`;

    try {
      const resp = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; VNMarketIntelligence/1.0; macro-data-fetch)',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(`[imf-weo] HTTP ${resp.status} for ${indicatorCode}`);
        return [];
      }

      const raw = (await resp.json()) as SdmxJsonResponse;
      return parseSdmxResponse(raw, COUNTRY_CODE, indicatorCode);
    } catch (err) {
      console.error(`[imf-weo] fetch error for ${indicatorCode}:`, err);
      return [];
    }
  }

  /** Fetch all tracked VN WEO indicators as a named batch. */
  async fetchVnWeoMacroBatch(): Promise<Record<string, ImfWeoDataPoint[]>> {
    const result: Record<string, ImfWeoDataPoint[]> = {};
    const entries = Object.entries(WEO_INDICATORS);

    for (const [name, code] of entries) {
      result[name] = await this.fetchIndicator(code);
      // 1-2s gap — api.imf.org is undocumented on rate limits; be courteous
      await sleepMs(1_000 + Math.random() * 1_000);
    }

    return result;
  }
}
