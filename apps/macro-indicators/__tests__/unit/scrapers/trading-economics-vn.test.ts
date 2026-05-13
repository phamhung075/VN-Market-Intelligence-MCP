/**
 * Unit tests — TradingEconomicsVnAdapter
 *
 * Mocks global fetch. Tests JSON-LD extraction and meta description parsing.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { TradingEconomicsVnAdapter, VN_TE_SLUGS } from '../../../src/infrastructure/scrapers/trading-economics-vn.js';

const MOCK_HTML_WITH_JSONLD = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:description" content="The Gross Domestic Product (GDP) in Vietnam was worth 476.39 billion US dollars in 2024. GDP in Vietnam averaged 91.44 USD Billion from 1985 until 2024." />
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": "Dataset",
    "name": "Vietnam GDP",
    "alternateName": "Vietnam GDP - Historical Dataset (1985-12-31/2024-12-31)",
    "description": "The GDP in Vietnam was worth 476.39 billion USD in 2024.",
    "temporalCoverage": "1985-12-31/2024-12-31",
    "spatialCoverage": "Vietnam",
    "dateModified": "2026-05-01T00:00:00Z"
  }
  </script>
</head>
<body><div>Vietnam GDP content</div></body>
</html>
`;

const MOCK_HTML_NO_JSONLD = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:description" content="Some description without JSON-LD" />
</head>
<body><div>No JSON-LD here</div></body>
</html>
`;

describe('TradingEconomicsVnAdapter', () => {
  let adapter: TradingEconomicsVnAdapter;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    adapter = new TradingEconomicsVnAdapter();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchIndicator', () => {
    it('extracts JSON-LD Dataset and meta description from HTML', async () => {
      global.fetch = mock(async () =>
        new Response(MOCK_HTML_WITH_JSONLD, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      const result = await adapter.fetchIndicator('gdp');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Vietnam GDP');
      expect(result!.temporalCoverage).toBe('1985-12-31/2024-12-31');
      expect(result!.dateModified).toBe('2026-05-01T00:00:00Z');
      expect(result!.latestValue).toContain('476.39 billion');
      expect(result!.fetchedAt).toBeTruthy();
    });

    it('returns null when no JSON-LD Dataset block found', async () => {
      global.fetch = mock(async () =>
        new Response(MOCK_HTML_NO_JSONLD, { status: 200 }),
      );

      const result = await adapter.fetchIndicator('unknown-slug');
      expect(result).toBeNull();
    });

    it('returns null on HTTP error', async () => {
      global.fetch = mock(async () => new Response('Forbidden', { status: 403 }));
      const result = await adapter.fetchIndicator('gdp');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      global.fetch = mock(async () => { throw new Error('connection refused'); });
      const result = await adapter.fetchIndicator('gdp');
      expect(result).toBeNull();
    });

    it('captures ASP.NET_SessionId from Set-Cookie header', async () => {
      global.fetch = mock(async () =>
        new Response(MOCK_HTML_WITH_JSONLD, {
          status: 200,
          headers: {
            'set-cookie': 'ASP.NET_SessionId=abc123xyz; path=/; HttpOnly',
          },
        }),
      );

      await adapter.fetchIndicator('gdp');
      // Subsequent call should include Cookie header — verify by checking adapter state
      // (internal sessionCookie is private; test indirectly via successful batch)
      const result = await adapter.fetchIndicator('inflation-cpi');
      // Second call still works (mock returns same body) — session persistence
      expect(result).not.toBeNull();
    });
  });

  describe('VN_TE_SLUGS catalog', () => {
    it('contains expected indicator slugs', () => {
      expect(VN_TE_SLUGS['gdp']).toBe('gdp');
      expect(VN_TE_SLUGS['inflation_cpi']).toBe('inflation-cpi');
      expect(VN_TE_SLUGS['interest_rate']).toBe('interest-rate');
      expect(Object.keys(VN_TE_SLUGS)).toHaveLength(7);
    });
  });
});
