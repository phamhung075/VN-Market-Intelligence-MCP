/**
 * Unit tests — FredMacroAdapter
 *
 * Tests key-absent guard, API response parsing, error paths.
 * Does NOT require a real FRED_API_KEY — all fetch calls are mocked.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { FredMacroAdapter, FRED_SERIES } from '../../../src/infrastructure/scrapers/fred-macro.js';

function makeFredResponse(seriesId: string) {
  return {
    realtime_start: '2026-01-01',
    realtime_end: '2026-12-31',
    observation_start: '2020-01-01',
    observation_end: '2026-01-01',
    units: 'Percent',
    output_type: 1,
    file_type: 'json',
    order_by: 'observation_date',
    sort_order: 'desc',
    count: 3,
    offset: 0,
    limit: 10,
    observations: [
      { realtime_start: '2026-01-01', realtime_end: '2026-12-31', date: '2026-01-01', value: '5.33' },
      { realtime_start: '2026-01-01', realtime_end: '2026-12-31', date: '2025-12-01', value: '5.33' },
      { realtime_start: '2026-01-01', realtime_end: '2026-12-31', date: '2025-11-01', value: '4.64' },
    ],
  };
}

describe('FredMacroAdapter', () => {
  let adapter: FredMacroAdapter;
  let originalFetch: typeof global.fetch;
  const originalEnv = process.env['FRED_API_KEY'];

  beforeEach(() => {
    adapter = new FredMacroAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Restore env
    if (originalEnv === undefined) delete process.env['FRED_API_KEY'];
    else process.env['FRED_API_KEY'] = originalEnv;
  });

  describe('isAvailable', () => {
    it('returns false when FRED_API_KEY is not set', () => {
      delete process.env['FRED_API_KEY'];
      const a = new FredMacroAdapter();
      expect(a.isAvailable()).toBe(false);
    });

    it('returns false when FRED_API_KEY is not 32 chars', () => {
      process.env['FRED_API_KEY'] = 'shortkey';
      const a = new FredMacroAdapter();
      expect(a.isAvailable()).toBe(false);
    });

    it('returns true when FRED_API_KEY is 32 chars', () => {
      process.env['FRED_API_KEY'] = 'a'.repeat(32);
      const a = new FredMacroAdapter();
      expect(a.isAvailable()).toBe(true);
    });
  });

  describe('fetchSeries (key absent)', () => {
    it('returns null and logs warning when key not set', async () => {
      delete process.env['FRED_API_KEY'];
      const a = new FredMacroAdapter();
      const result = await a.fetchSeries('FEDFUNDS');
      expect(result).toBeNull();
    });
  });

  describe('fetchSeries (key present, mocked)', () => {
    beforeEach(() => {
      process.env['FRED_API_KEY'] = 'a'.repeat(32);
      adapter = new FredMacroAdapter();
    });

    it('parses FRED API observations response', async () => {
      global.fetch = mock(async () =>
        new Response(JSON.stringify(makeFredResponse('FEDFUNDS')), {
          status: 200,
        }),
      );

      const result = await adapter.fetchSeries('FEDFUNDS', 3);

      expect(result).not.toBeNull();
      expect(result!.seriesId).toBe('FEDFUNDS');
      expect(result!.observations).toHaveLength(3);
      expect(result!.observations[0]!.date).toBe('2026-01-01');
      expect(result!.observations[0]!.value).toBe('5.33');
      expect(result!.fetchedAt).toBeTruthy();
    });

    it('returns null on API error response', async () => {
      global.fetch = mock(async () =>
        new Response(
          JSON.stringify({ error_code: 400, error_message: 'Bad Request. api_key not registered.' }),
          { status: 200 }, // FRED returns 200 with error in body
        ),
      );
      const result = await adapter.fetchSeries('FEDFUNDS');
      expect(result).toBeNull();
    });

    it('returns null on HTTP error', async () => {
      global.fetch = mock(async () => new Response('error', { status: 500 }));
      const result = await adapter.fetchSeries('FEDFUNDS');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      global.fetch = mock(async () => { throw new Error('network'); });
      const result = await adapter.fetchSeries('FEDFUNDS');
      expect(result).toBeNull();
    });
  });

  describe('fetchAllMacro (key absent)', () => {
    it('returns null-filled record for all series when key missing', async () => {
      delete process.env['FRED_API_KEY'];
      const a = new FredMacroAdapter();
      const result = await a.fetchAllMacro();

      expect(Object.keys(result)).toHaveLength(Object.keys(FRED_SERIES).length);
      for (const v of Object.values(result)) {
        expect(v).toBeNull();
      }
    });
  });

  describe('fetchAllMacro — parallel execution (key present, mocked)', () => {
    beforeEach(() => {
      process.env['FRED_API_KEY'] = 'a'.repeat(32);
      adapter = new FredMacroAdapter();
    });

    it('returns results for all series when all succeed', async () => {
      global.fetch = mock(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        const match = urlStr.match(/series_id=([^&]+)/);
        const seriesId = match ? match[1]! : 'UNKNOWN';
        return new Response(JSON.stringify(makeFredResponse(seriesId)), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await adapter.fetchAllMacro();

      expect(Object.keys(result)).toHaveLength(Object.keys(FRED_SERIES).length);
      for (const v of Object.values(result)) {
        expect(v).not.toBeNull();
        expect(v!.observations).toHaveLength(3);
      }
    });

    it('returns null for a failed series but succeeds for all others', async () => {
      const failSeriesId = 'VIXCLS'; // vix
      global.fetch = mock(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes(`series_id=${failSeriesId}`)) {
          return new Response('server error', { status: 500 });
        }
        const match = urlStr.match(/series_id=([^&]+)/);
        const seriesId = match ? match[1]! : 'UNKNOWN';
        return new Response(JSON.stringify(makeFredResponse(seriesId)), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await adapter.fetchAllMacro();

      expect(Object.keys(result)).toHaveLength(Object.keys(FRED_SERIES).length);
      // vix failed — should be null
      expect(result['vix']).toBeNull();
      // all others succeeded
      const otherKeys = Object.keys(FRED_SERIES).filter((k) => k !== 'vix');
      for (const k of otherKeys) {
        expect(result[k]).not.toBeNull();
      }
    });

    it('dispatches all series fetches concurrently, not sequentially', async () => {
      // Track fetch call timestamps to verify overlap (parallel calls start before
      // any single slow fetch completes).
      const callStartTimes: number[] = [];
      const seriesCount = Object.keys(FRED_SERIES).length;

      global.fetch = mock(async (url: RequestInfo | URL) => {
        callStartTimes.push(Date.now());
        // Simulate non-trivial latency — sequential would take seriesCount * 50ms+
        await new Promise((r) => setTimeout(r, 50));
        const urlStr = String(url);
        const match = urlStr.match(/series_id=([^&]+)/);
        const seriesId = match ? match[1]! : 'UNKNOWN';
        return new Response(JSON.stringify(makeFredResponse(seriesId)), { status: 200 });
      }) as unknown as typeof fetch;

      const before = Date.now();
      await adapter.fetchAllMacro();
      const elapsed = Date.now() - before;

      // All calls must have been dispatched before any completes (i.e. within first 50ms window)
      expect(callStartTimes).toHaveLength(seriesCount);
      const firstCall = callStartTimes[0]!;
      const lastCall = callStartTimes[callStartTimes.length - 1]!;
      // If sequential with 50ms each: lastCall >= firstCall + (seriesCount-1)*50
      // If parallel: all calls dispatched within a small window (<30ms)
      expect(lastCall - firstCall).toBeLessThan(30);

      // Total elapsed must be well under sequential time (seriesCount * 50ms = 400ms)
      // Parallel: ~50-100ms for all 8 fetches together
      expect(elapsed).toBeLessThan(seriesCount * 50);
    });
  });

  describe('FRED_SERIES catalog', () => {
    it('contains expected series IDs', () => {
      expect(FRED_SERIES['fed_funds_rate']).toBe('FEDFUNDS');
      expect(FRED_SERIES['vix']).toBe('VIXCLS');
      expect(FRED_SERIES['us_10y_yield']).toBe('GS10');
      expect(FRED_SERIES['yield_spread_10y2y']).toBe('T10Y2Y');
      expect(Object.keys(FRED_SERIES)).toHaveLength(8);
    });
  });
});
