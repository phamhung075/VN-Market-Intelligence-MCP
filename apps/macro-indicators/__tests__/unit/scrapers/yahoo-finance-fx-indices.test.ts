/**
 * Unit tests — YahooFxIndicesAdapter
 *
 * Mocks global fetch. Tests v8 chart API parsing, error paths.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { YahooFxIndicesAdapter, DEFAULT_SYMBOLS } from '../../../src/infrastructure/scrapers/yahoo-finance-fx-indices.js';

function makeYahooResponse(symbol: string, price: number) {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            currency: 'USD',
            exchangeName: 'CCY',
            regularMarketPrice: price,
            regularMarketTime: 1778648482,
            regularMarketDayHigh: price + 0.01,
            regularMarketDayLow: price - 0.01,
            fiftyTwoWeekHigh: price + 0.05,
            fiftyTwoWeekLow: price - 0.05,
          },
        },
      ],
    },
  };
}

describe('YahooFxIndicesAdapter', () => {
  let adapter: YahooFxIndicesAdapter;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    adapter = new YahooFxIndicesAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchSymbol', () => {
    it('parses v8 chart API response into YahooQuote', async () => {
      global.fetch = mock(async () =>
        new Response(JSON.stringify(makeYahooResponse('EURUSD=X', 1.1738)), {
          status: 200,
        }),
      );

      const result = await adapter.fetchSymbol('EURUSD=X');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('EURUSD=X');
      expect(result!.price).toBeCloseTo(1.1738);
      expect(result!.currency).toBe('USD');
      expect(result!.exchangeName).toBe('CCY');
      expect(result!.lastUpdated).toBeTruthy();
    });

    it('returns null on HTTP error', async () => {
      global.fetch = mock(async () => new Response('error', { status: 429 }));
      const result = await adapter.fetchSymbol('EURUSD=X');
      expect(result).toBeNull();
    });

    it('returns null when meta has no regularMarketPrice', async () => {
      const noPrice = {
        chart: { result: [{ meta: { symbol: 'MXAP', currency: 'USD', exchangeName: 'UNKNOWN' } }] },
      };
      global.fetch = mock(async () =>
        new Response(JSON.stringify(noPrice), { status: 200 }),
      );
      const result = await adapter.fetchSymbol('MXAP');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      global.fetch = mock(async () => { throw new Error('timeout'); });
      const result = await adapter.fetchSymbol('EURUSD=X');
      expect(result).toBeNull();
    });

    it('returns null when chart.result is missing', async () => {
      global.fetch = mock(async () =>
        new Response(JSON.stringify({ chart: { result: null } }), { status: 200 }),
      );
      const result = await adapter.fetchSymbol('EURUSD=X');
      expect(result).toBeNull();
    });
  });

  describe('DEFAULT_SYMBOLS', () => {
    it('includes key FX and index symbols', () => {
      expect(DEFAULT_SYMBOLS).toContain('EURUSD=X');
      expect(DEFAULT_SYMBOLS).toContain('USDVND=X');
      expect(DEFAULT_SYMBOLS).toContain('^GSPC');
      expect(DEFAULT_SYMBOLS).toContain('^N225');
      expect(DEFAULT_SYMBOLS).toContain('^HSI');
    });
  });
});
