/**
 * Unit tests — CnbcWorldMarketsAdapter
 *
 * Mocks global fetch. Tests quote API parsing and error paths.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { CnbcWorldMarketsAdapter, DEFAULT_CNBC_SYMBOLS } from '../../../src/infrastructure/scrapers/cnbc-world-markets.js';

function makeCnbcResponse(symbol: string, last: string) {
  return {
    FormattedQuoteResult: {
      FormattedQuote: [
        {
          symbol,
          code: 1,
          last,
          change: '-12.45',
          change_pct: '-0.23',
          open: '5400.00',
          volume: '3200000000',
        },
      ],
    },
  };
}

describe('CnbcWorldMarketsAdapter', () => {
  let adapter: CnbcWorldMarketsAdapter;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    adapter = new CnbcWorldMarketsAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchQuote', () => {
    it('parses CNBC quote API response into CnbcQuote', async () => {
      global.fetch = mock(async () =>
        new Response(JSON.stringify(makeCnbcResponse('SP500', '5388.55')), {
          status: 200,
        }),
      );

      const result = await adapter.fetchQuote('SP500');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('SP500');
      expect(result!.last).toBe('5388.55');
      expect(result!.change).toBe('-12.45');
      expect(result!.changePct).toBe('-0.23');
      expect(result!.fetchedAt).toBeTruthy();
    });

    it('returns null when code is not 1 (symbol not found)', async () => {
      const notFound = {
        FormattedQuoteResult: {
          FormattedQuote: [{ symbol: 'MXAP', code: 3 }],
        },
      };
      global.fetch = mock(async () =>
        new Response(JSON.stringify(notFound), { status: 200 }),
      );
      const result = await adapter.fetchQuote('MXAP');
      expect(result).toBeNull();
    });

    it('returns null when last price is missing', async () => {
      const noPrice = {
        FormattedQuoteResult: {
          FormattedQuote: [{ symbol: 'SP500', code: 1 }],
        },
      };
      global.fetch = mock(async () =>
        new Response(JSON.stringify(noPrice), { status: 200 }),
      );
      const result = await adapter.fetchQuote('SP500');
      expect(result).toBeNull();
    });

    it('returns null on HTTP error', async () => {
      global.fetch = mock(async () => new Response('error', { status: 503 }));
      const result = await adapter.fetchQuote('SP500');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      global.fetch = mock(async () => { throw new Error('timeout'); });
      const result = await adapter.fetchQuote('SP500');
      expect(result).toBeNull();
    });
  });

  describe('DEFAULT_CNBC_SYMBOLS', () => {
    it('includes major global indices', () => {
      expect(DEFAULT_CNBC_SYMBOLS).toContain('SP500');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('DJ30');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('NASDAQ');
      expect(DEFAULT_CNBC_SYMBOLS).toContain('NIKKEI225');
    });
  });
});
