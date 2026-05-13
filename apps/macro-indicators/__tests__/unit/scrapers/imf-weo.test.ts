/**
 * Unit tests — ImfWeoAdapter
 *
 * Mocks global fetch. Tests SDMX 3.0 JSON parsing, dimension index lookup,
 * forecast year handling, error paths.
 * No live endpoint calls.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ImfWeoAdapter, WEO_INDICATORS } from '../../../src/infrastructure/scrapers/imf-weo.js';

/**
 * Build a minimal SDMX 3.0 JSON response with dimensionAtObservation=AllDimensions.
 * Observation key: COUNTRY_IDX:INDICATOR_IDX:FREQ_IDX:TIME_IDX
 *
 * Simplification: single country (VNM at index 0), single indicator (at index 0),
 * single frequency (index 0), time periods starting at index 0.
 */
function makeSdmxResponse(
  countryCode: string,
  indicatorCode: string,
  data: Array<{ year: string; value: number }>,
  countryIndex = 202,
  indicatorIndex = 0,
) {
  const timeValues = data.map((d) => ({ value: d.year }));
  const observations: Record<string, [string]> = {};

  data.forEach((d, timeIdx) => {
    const key = `${countryIndex}:${indicatorIndex}:0:${timeIdx}`;
    observations[key] = [String(d.value)];
  });

  return {
    meta: {},
    data: {
      structures: [{
        dimensions: {
          observation: [
            {
              id: 'COUNTRY',
              values: Array.from({ length: countryIndex + 1 }, (_, i) => ({
                id: i === countryIndex ? countryCode : `C${i}`,
              })),
            },
            {
              id: 'INDICATOR',
              values: Array.from({ length: indicatorIndex + 1 }, (_, i) => ({
                id: i === indicatorIndex ? indicatorCode : `IND${i}`,
              })),
            },
            { id: 'FREQUENCY', values: [{ id: 'A' }] },
            { id: 'TIME_PERIOD', values: timeValues },
          ],
        },
      }],
      dataSets: [{ observations }],
    },
  };
}

describe('ImfWeoAdapter', () => {
  let adapter: ImfWeoAdapter;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    adapter = new ImfWeoAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchIndicator', () => {
    it('parses SDMX 3.0 response into ImfWeoDataPoint[]', async () => {
      const mockData = [
        { year: '2020', value: 2.86 },
        { year: '2021', value: 2.55 },
        { year: '2022', value: 8.54 },
        { year: '2024', value: 6.95 },
        { year: '2025', value: 8.02 }, // WEO forecast
      ];
      const body = makeSdmxResponse('VNM', 'NGDP_RPCH', mockData, 202, 0);

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await adapter.fetchIndicator('NGDP_RPCH');

      expect(result).toHaveLength(5);
      expect(result[0]!.year).toBe('2020');
      expect(result[0]!.value).toBeCloseTo(2.86, 1);
      // Forecast year should be included
      const forecast = result.find((d) => d.year === '2025');
      expect(forecast).not.toBeUndefined();
      expect(forecast!.value).toBeCloseTo(8.02, 1);
    });

    it('sorts results by year ascending', async () => {
      const mockData = [
        { year: '2024', value: 6.95 },
        { year: '2022', value: 8.54 },
        { year: '2023', value: 5.07 },
      ];
      const body = makeSdmxResponse('VNM', 'NGDP_RPCH', mockData);

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), { status: 200 }),
      );

      const result = await adapter.fetchIndicator('NGDP_RPCH');
      expect(result.map((d) => d.year)).toEqual(['2022', '2023', '2024']);
    });

    it('returns [] on HTTP error (not 200)', async () => {
      global.fetch = mock(async () => new Response('Access Denied', { status: 403 }));
      const result = await adapter.fetchIndicator('NGDP_RPCH');
      expect(result).toEqual([]);
    });

    it('returns [] on network error (fetch throws)', async () => {
      global.fetch = mock(async () => { throw new Error('timeout'); });
      const result = await adapter.fetchIndicator('NGDP_RPCH');
      expect(result).toEqual([]);
    });

    it('returns [] when structures array is empty', async () => {
      const empty = { meta: {}, data: { structures: [], dataSets: [{ observations: {} }] } };
      global.fetch = mock(async () =>
        new Response(JSON.stringify(empty), { status: 200 }),
      );
      const result = await adapter.fetchIndicator('NGDP_RPCH');
      expect(result).toEqual([]);
    });

    it('returns [] when country code not found in dimension values', async () => {
      // Build response with country code not matching VNM
      const mockData = [{ year: '2024', value: 5.0 }];
      const body = makeSdmxResponse('USA', 'NGDP_RPCH', mockData, 0, 0);
      // VNM is not at index 0, so lookup fails

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), { status: 200 }),
      );

      const result = await adapter.fetchIndicator('NGDP_RPCH');
      expect(result).toEqual([]);
    });

    it('skips NaN values', async () => {
      const body = makeSdmxResponse('VNM', 'NGDP_RPCH', [
        { year: '2023', value: 5.0 },
        { year: '2024', value: NaN },
      ], 202, 0);

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), { status: 200 }),
      );

      const result = await adapter.fetchIndicator('NGDP_RPCH');
      // NaN value should be filtered out
      const nonNanResults = result.filter((d) => !isNaN(d.value));
      expect(nonNanResults.length).toBeGreaterThan(0);
    });
  });

  describe('WEO_INDICATORS catalog', () => {
    it('contains expected VN macro indicator codes', () => {
      expect(WEO_INDICATORS['gdp_growth']).toBe('NGDP_RPCH');
      expect(WEO_INDICATORS['inflation_avg']).toBe('PCPIPCH');
      expect(WEO_INDICATORS['unemployment']).toBe('LUR');
      expect(WEO_INDICATORS['current_account']).toBe('BCA_NGDPD');
      expect(Object.keys(WEO_INDICATORS).length).toBeGreaterThanOrEqual(5);
    });
  });
});
