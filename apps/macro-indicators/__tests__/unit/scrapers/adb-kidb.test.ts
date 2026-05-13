/**
 * Unit tests — AdbKidbAdapter
 *
 * Mocks global fetch. Tests SDMX-JSON v4 parsing, error handling, batch logic.
 * No live endpoint calls. Phase 1 discovery complete — testing Phase 2 direct API.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AdbKidbAdapter, ADB_INDICATORS } from '../../../src/infrastructure/scrapers/adb-kidb.js';

/** Build a minimal valid SDMX-JSON v4 response for testing. */
function makeAdbSdmxResponse(
  indicator: string,
  economy: string,
  data: Array<{ year: string; value: number }>,
) {
  return {
    meta: { id: 'test', prepared: '2026-05-13T00:00:00Z' },
    data: {
      structures: [
        {
          dimensions: {
            series: [
              { id: 'FREQ', values: [{ id: 'A' }] },
              { id: 'INDICATOR', values: [{ id: indicator }] },
              { id: 'ECONOMY_CODE', values: [{ id: economy }] },
            ],
            observation: [
              {
                id: 'TIME_PERIOD',
                values: data.map((d) => ({ value: d.year })),
              },
            ],
          },
        },
      ],
      datasets: [
        {
          structure: 0,
          series: {
            '0.0.0': {
              observations: Object.fromEntries(
                data.map((d, i) => [String(i), [String(d.value)]]),
              ),
            },
          },
        },
      ],
    },
  };
}

describe('AdbKidbAdapter', () => {
  let adapter: AdbKidbAdapter;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    adapter = new AdbKidbAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchIndicator', () => {
    it('parses SDMX-JSON response into AdbKidbDataPoint[]', async () => {
      const mockData = [
        { year: '2022', value: 8.5375 },
        { year: '2023', value: 5.065 },
        { year: '2024', value: 7.091 },
      ];
      const body = makeAdbSdmxResponse('NGDP_R_PTX_PS', 'VIE', mockData);

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await adapter.fetchIndicator('EO_NA_CONST_GOO', 'NGDP_R_PTX_PS');

      expect(result).toHaveLength(3);
      expect(result[0]!.year).toBe('2022');
      expect(result[0]!.value).toBeCloseTo(8.5375);
      expect(result[2]!.year).toBe('2024');
      expect(result[2]!.value).toBeCloseTo(7.091);
    });

    it('sorts results by year ascending', async () => {
      // Deliberately reversed order to test sorting
      const mockData = [
        { year: '2024', value: 7.091 },
        { year: '2022', value: 8.5375 },
        { year: '2023', value: 5.065 },
      ];
      const body = makeAdbSdmxResponse('NGDP_R_PTX_PS', 'VIE', mockData);

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), { status: 200 }),
      );

      const result = await adapter.fetchIndicator('EO_NA_CONST_GOO', 'NGDP_R_PTX_PS');
      const years = result.map((d) => d.year);
      expect(years).toEqual(['2022', '2023', '2024']);
    });

    it('returns [] on HTTP 404', async () => {
      global.fetch = mock(async () => new Response('Not found', { status: 404 }));
      const result = await adapter.fetchIndicator('EO_NA', 'NGDP_XDC');
      expect(result).toEqual([]);
    });

    it('returns [] on network error', async () => {
      global.fetch = mock(async () => { throw new Error('network down'); });
      const result = await adapter.fetchIndicator('EO_NA', 'NGDP_XDC');
      expect(result).toEqual([]);
    });

    it('returns [] when datasets array is empty', async () => {
      const emptyBody = {
        meta: {},
        data: { structures: [], datasets: [] },
      };
      global.fetch = mock(async () =>
        new Response(JSON.stringify(emptyBody), { status: 200 }),
      );
      const result = await adapter.fetchIndicator('EO_NA', 'NGDP_XDC');
      expect(result).toEqual([]);
    });

    it('skips non-numeric values gracefully', async () => {
      const body = {
        meta: {},
        data: {
          structures: [{
            dimensions: {
              series: [
                { id: 'FREQ', values: [{ id: 'A' }] },
                { id: 'INDICATOR', values: [{ id: 'NGDP_XDC' }] },
                { id: 'ECONOMY_CODE', values: [{ id: 'VIE' }] },
              ],
              observation: [{
                id: 'TIME_PERIOD',
                values: [{ value: '2023' }, { value: '2024' }],
              }],
            },
          }],
          datasets: [{
            series: {
              '0.0.0': {
                observations: {
                  '0': ['N/A'],      // invalid — should be skipped
                  '1': ['7653421'],  // valid
                },
              },
            },
          }],
        },
      };

      global.fetch = mock(async () =>
        new Response(JSON.stringify(body), { status: 200 }),
      );

      const result = await adapter.fetchIndicator('EO_NA', 'NGDP_XDC');
      // 'N/A' → parseFloat → NaN → skipped
      expect(result).toHaveLength(1);
      expect(result[0]!.year).toBe('2024');
      expect(result[0]!.value).toBeCloseTo(7653421);
    });
  });

  describe('ADB_INDICATORS catalog', () => {
    it('contains expected indicator entries', () => {
      expect(ADB_INDICATORS.length).toBeGreaterThanOrEqual(4);

      const names = ADB_INDICATORS.map((i) => i.name);
      expect(names).toContain('gdp_growth_pct');
      expect(names).toContain('cpi_pct_change');
      expect(names).toContain('cpi_index');
      expect(names).toContain('gdp_current_vnd');
    });

    it('all entries have required fields', () => {
      for (const entry of ADB_INDICATORS) {
        expect(entry.dataflow).toBeTruthy();
        expect(entry.indicator).toBeTruthy();
        expect(entry.name).toBeTruthy();
        expect(entry.description).toBeTruthy();
      }
    });
  });
});
