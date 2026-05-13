/**
 * Unit tests — WorldBankMacroAdapter
 *
 * Mocks global fetch. Tests JSON parsing, error handling, batch logic.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { WorldBankMacroAdapter, VN_INDICATORS } from '../../../src/infrastructure/scrapers/world-bank-macro.js';

function makeWbResponse(indicatorId: string, indicatorName: string) {
  return [
    { page: 1, pages: 1, per_page: 10, total: 2, lastupdated: '2026-04-08' },
    [
      {
        indicator: { id: indicatorId, value: indicatorName },
        country: { id: 'VN', value: 'Viet Nam' },
        date: '2024',
        value: 476388230307.175,
      },
      {
        indicator: { id: indicatorId, value: indicatorName },
        country: { id: 'VN', value: 'Viet Nam' },
        date: '2023',
        value: 433857681378.291,
      },
    ],
  ];
}

describe('WorldBankMacroAdapter', () => {
  let adapter: WorldBankMacroAdapter;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    adapter = new WorldBankMacroAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchVnIndicator', () => {
    it('parses World Bank API response into WorldBankDataPoint[]', async () => {
      const mockBody = makeWbResponse('NY.GDP.MKTP.CD', 'GDP (current US$)');

      global.fetch = mock(async () =>
        new Response(JSON.stringify(mockBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD', 5);

      expect(result).toHaveLength(2);
      expect(result[0]!.indicator).toBe('NY.GDP.MKTP.CD');
      expect(result[0]!.indicatorName).toBe('GDP (current US$)');
      expect(result[0]!.date).toBe('2024');
      expect(result[0]!.value).toBeCloseTo(476388230307.175);
    });

    it('returns [] on HTTP error', async () => {
      global.fetch = mock(async () => new Response('Not Found', { status: 404 }));
      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD');
      expect(result).toEqual([]);
    });

    it('returns [] on network error (fetch throws)', async () => {
      global.fetch = mock(async () => { throw new Error('network down'); });
      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD');
      expect(result).toEqual([]);
    });

    it('returns [] when API returns empty data array', async () => {
      const emptyResponse = [
        { page: 1, pages: 0, per_page: 10, total: 0, lastupdated: '2026-04-08' },
        [],
      ];
      global.fetch = mock(async () =>
        new Response(JSON.stringify(emptyResponse), { status: 200 }),
      );
      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD');
      expect(result).toEqual([]);
    });

    it('handles null value field (data not yet published)', async () => {
      const nullValueResponse = [
        { page: 1, pages: 1, per_page: 10, total: 1, lastupdated: '2026-04-08' },
        [
          {
            indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
            country: { id: 'VN', value: 'Viet Nam' },
            date: '2025',
            value: null,
          },
        ],
      ];
      global.fetch = mock(async () =>
        new Response(JSON.stringify(nullValueResponse), { status: 200 }),
      );
      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD');
      expect(result).toHaveLength(1);
      expect(result[0]!.value).toBeNull();
    });
  });

  describe('fetchVnMacroBatch — parallel execution', () => {
    it('returns results for all indicators when all succeed', async () => {
      global.fetch = mock(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        // Extract indicator code from URL path segment
        const match = urlStr.match(/\/indicator\/([^?]+)/);
        const code = match ? decodeURIComponent(match[1]!) : 'UNKNOWN';
        const indicatorName = Object.entries(VN_INDICATORS).find(([, c]) => c === code)?.[0] ?? code;
        const body = makeWbResponse(code, indicatorName);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      const result = await adapter.fetchVnMacroBatch();

      expect(Object.keys(result)).toHaveLength(Object.keys(VN_INDICATORS).length);
      for (const key of Object.keys(VN_INDICATORS)) {
        expect(result[key]).toBeDefined();
        expect(result[key]!.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array for a failed indicator but succeeds for all others', async () => {
      const failCode = VN_INDICATORS['fdi_inflows']!; // BX.KLT.DINV.CD.WD
      global.fetch = mock(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes(encodeURIComponent(failCode)) || urlStr.includes(failCode)) {
          return new Response('server error', { status: 500 });
        }
        const match = urlStr.match(/\/indicator\/([^?]+)/);
        const code = match ? decodeURIComponent(match[1]!) : 'UNKNOWN';
        const indicatorName = Object.entries(VN_INDICATORS).find(([, c]) => c === code)?.[0] ?? code;
        const body = makeWbResponse(code, indicatorName);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      const result = await adapter.fetchVnMacroBatch();

      expect(Object.keys(result)).toHaveLength(Object.keys(VN_INDICATORS).length);
      // failed indicator returns empty array (graceful degradation)
      expect(result['fdi_inflows']).toEqual([]);
      // all others succeeded
      const otherKeys = Object.keys(VN_INDICATORS).filter((k) => k !== 'fdi_inflows');
      for (const k of otherKeys) {
        expect(result[k]!.length).toBeGreaterThan(0);
      }
    });

    it('dispatches all indicator fetches concurrently, not sequentially', async () => {
      const callStartTimes: number[] = [];
      const indicatorCount = Object.keys(VN_INDICATORS).length;

      global.fetch = mock(async (url: RequestInfo | URL) => {
        callStartTimes.push(Date.now());
        // Simulate non-trivial latency — sequential would take indicatorCount * 50ms+
        await new Promise((r) => setTimeout(r, 50));
        const urlStr = String(url);
        const match = urlStr.match(/\/indicator\/([^?]+)/);
        const code = match ? decodeURIComponent(match[1]!) : 'UNKNOWN';
        const indicatorName = Object.entries(VN_INDICATORS).find(([, c]) => c === code)?.[0] ?? code;
        const body = makeWbResponse(code, indicatorName);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      const before = Date.now();
      await adapter.fetchVnMacroBatch();
      const elapsed = Date.now() - before;

      // All calls must have been dispatched before any completes (within first 50ms window)
      expect(callStartTimes).toHaveLength(indicatorCount);
      const firstCall = callStartTimes[0]!;
      const lastCall = callStartTimes[callStartTimes.length - 1]!;
      // Sequential: lastCall >= firstCall + (indicatorCount-1)*50; Parallel: all within <30ms
      expect(lastCall - firstCall).toBeLessThan(30);
      // Total elapsed well under sequential time (indicatorCount * 50ms = 350ms); parallel: ~50-100ms
      expect(elapsed).toBeLessThan(indicatorCount * 50);
    });
  });

  describe('VN_INDICATORS catalog', () => {
    it('contains expected indicator codes', () => {
      expect(VN_INDICATORS['gdp_usd']).toBe('NY.GDP.MKTP.CD');
      expect(VN_INDICATORS['cpi_inflation']).toBe('FP.CPI.TOTL.ZG');
      expect(VN_INDICATORS['fdi_inflows']).toBe('BX.KLT.DINV.CD.WD');
      expect(Object.keys(VN_INDICATORS)).toHaveLength(7);
    });
  });
});
