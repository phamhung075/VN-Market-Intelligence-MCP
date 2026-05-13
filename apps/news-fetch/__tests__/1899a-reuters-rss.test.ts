/**
 * Unit tests — ReutersRssScraper (1899a-reuters-rss)
 *
 * All HTTP is mocked via Bun's global `fetch` override.
 * No live network calls — safe for CI.
 *
 * Coverage:
 *   - Happy path: parse RSS fixture → correct Article[]
 *   - maxItems cap: returns at most N articles
 *   - HTTP error (4xx/5xx): returns error FetchResult, articles: []
 *   - Network error (fetch throws): returns error FetchResult, articles: []
 *   - Empty feed (no <item> elements): returns articles: [], error: null
 *   - Missing link element: url is null
 *   - Unparseable pubDate: publishedAt is null
 *   - Date normalisation: RFC 2822 → ISO 8601
 *   - DDD contract: method is 'rss', source is NewsSource.REUTERS, confidence is 'HIGH'
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { NewsSource } from '../src/domain/models.js';
import {
  ReutersRssScraper,
  normalizeRfcDate,
} from '../src/infrastructure/scrapers/reuters-rss.js';

// ---------------------------------------------------------------------------
// RSS fixture — minimal but structurally faithful Reuters RSS 2.0 feed
// ---------------------------------------------------------------------------

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Reuters Business News</title>
    <link>https://www.reuters.com</link>
    <description>Business news from Reuters</description>

    <item>
      <title><![CDATA[Vietnam GDP growth beats forecast at 6.9%]]></title>
      <link>https://feeds.reuters.com/~r/reuters/businessNews/~3/abc123</link>
      <pubDate>Mon, 13 May 2026 08:00:00 GMT</pubDate>
    </item>

    <item>
      <title><![CDATA[Fed holds rates; signals one cut in 2026]]></title>
      <link>https://feeds.reuters.com/~r/reuters/businessNews/~3/def456</link>
      <pubDate>Mon, 13 May 2026 07:30:00 GMT</pubDate>
    </item>

    <item>
      <title>Oil prices fall on OPEC supply increase</title>
      <link>https://feeds.reuters.com/~r/reuters/businessNews/~3/ghi789</link>
      <pubDate>Mon, 13 May 2026 06:45:00 GMT</pubDate>
    </item>

    <item>
      <title>Article with no link element</title>
      <pubDate>Mon, 13 May 2026 05:00:00 GMT</pubDate>
    </item>

    <item>
      <title>Article with bad date</title>
      <link>https://feeds.reuters.com/~r/reuters/businessNews/~3/bad-date</link>
      <pubDate>not-a-date-at-all</pubDate>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Reuters Business News</title>
  </channel>
</rss>`;

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' },
    })) as unknown as typeof fetch;
}

function mockFetchStatus(status: number): typeof fetch {
  return (async () => new Response('', { status })) as unknown as typeof fetch;
}

function mockFetchThrows(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('1899a-reuters-rss — ReutersRssScraper', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  describe('happy path — valid RSS fixture', () => {
    it('returns FetchResult with method=rss, source=REUTERS, error=null', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines();

      expect(result.method).toBe('rss');
      expect(result.source).toBe(NewsSource.REUTERS);
      expect(result.error).toBeNull();
    });

    it('returns 5 articles from the fixture (all items)', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines(15);

      expect(result.articles).toHaveLength(5);
    });

    it('first article has correct headline', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]!.headline).toBe('Vietnam GDP growth beats forecast at 6.9%');
    });

    it('first article has correct url', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]!.url).toBe(
        'https://feeds.reuters.com/~r/reuters/businessNews/~3/abc123',
      );
    });

    it('first article has publishedAt as ISO 8601', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]!.publishedAt).toBe('2026-05-13T08:00:00.000Z');
    });

    it('all articles have confidence=HIGH', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles.every((a) => a.confidence === 'HIGH')).toBe(true);
    });

    it('all articles have source=REUTERS', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles.every((a) => a.source === NewsSource.REUTERS)).toBe(true);
    });

    it('all articles have non-empty fetchedAt string', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines();

      expect(
        articles.every((a) => typeof a.fetchedAt === 'string' && a.fetchedAt.length > 0),
      ).toBe(true);
    });
  });

  // ── maxItems cap ────────────────────────────────────────────────────────────

  describe('maxItems cap', () => {
    it('returns at most maxItems articles', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines(2);

      expect(result.articles).toHaveLength(2);
    });

    it('defaults to 15 items when maxItems not provided (fixture has 5)', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines();

      expect(result.articles.length).toBeLessThanOrEqual(15);
      expect(result.articles).toHaveLength(5);
    });
  });

  // ── Missing link element ────────────────────────────────────────────────────

  describe('missing link element', () => {
    it('url is null when <link> element is absent', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines(15);

      const noLinkArticle = articles.find((a) => a.headline === 'Article with no link element');
      expect(noLinkArticle).toBeDefined();
      expect(noLinkArticle!.url).toBeNull();
    });
  });

  // ── Unparseable pubDate ─────────────────────────────────────────────────────

  describe('unparseable pubDate', () => {
    it('publishedAt is null when pubDate is not a valid date', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const { articles } = await scraper.fetchHeadlines(15);

      const badDateArticle = articles.find((a) => a.headline === 'Article with bad date');
      expect(badDateArticle).toBeDefined();
      expect(badDateArticle!.publishedAt).toBeNull();
    });
  });

  // ── HTTP errors ─────────────────────────────────────────────────────────────

  describe('HTTP error responses', () => {
    it.each([403, 404, 429, 500, 503])(
      'HTTP %d → error="http-%d", articles=[]',
      async (status) => {
        globalThis.fetch = mockFetchStatus(status);
        const scraper = new ReutersRssScraper();
        const result = await scraper.fetchHeadlines();

        expect(result.error).toBe(`http-${status}`);
        expect(result.articles).toHaveLength(0);
        expect(result.source).toBe(NewsSource.REUTERS);
        expect(result.method).toBe('rss');
      },
    );
  });

  // ── Network error ───────────────────────────────────────────────────────────

  describe('network error (fetch throws)', () => {
    it('returns error FetchResult when fetch throws', async () => {
      globalThis.fetch = mockFetchThrows('ECONNREFUSED');
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines();

      expect(result.error).toBe('ECONNREFUSED');
      expect(result.articles).toHaveLength(0);
      expect(result.method).toBe('rss');
    });

    it('returns error FetchResult on AbortSignal timeout', async () => {
      globalThis.fetch = mockFetchThrows('The operation was aborted due to timeout');
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines();

      expect(result.error).toContain('aborted');
      expect(result.articles).toHaveLength(0);
    });
  });

  // ── Empty feed ──────────────────────────────────────────────────────────────

  describe('empty feed (no <item> elements)', () => {
    it('returns articles=[] with error=null (not an error condition)', async () => {
      globalThis.fetch = mockFetchOk(EMPTY_RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines();

      expect(result.articles).toHaveLength(0);
      expect(result.error).toBeNull();
      expect(result.method).toBe('rss');
    });
  });

  // ── fetchedAt field ─────────────────────────────────────────────────────────

  describe('fetchedAt field', () => {
    it('result.fetchedAt is a valid ISO 8601 string', async () => {
      globalThis.fetch = mockFetchOk(RSS_FIXTURE);
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines();

      expect(() => new Date(result.fetchedAt)).not.toThrow();
      expect(new Date(result.fetchedAt).getTime()).not.toBeNaN();
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeRfcDate — exported helper unit tests
// ---------------------------------------------------------------------------

describe('normalizeRfcDate', () => {
  it('converts RFC 2822 to ISO 8601', () => {
    expect(normalizeRfcDate('Mon, 13 May 2026 14:30:00 GMT')).toBe(
      '2026-05-13T14:30:00.000Z',
    );
  });

  it('returns null for non-date strings', () => {
    expect(normalizeRfcDate('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeRfcDate('')).toBeNull();
  });

  it('handles timestamps with timezone offset', () => {
    const result = normalizeRfcDate('Mon, 13 May 2026 09:30:00 +0700');
    expect(result).toBe('2026-05-13T02:30:00.000Z');
  });

  it('returns a string ending in Z (UTC normalized)', () => {
    const result = normalizeRfcDate('Mon, 13 May 2026 14:30:00 GMT');
    expect(result).toMatch(/Z$/);
  });
});
