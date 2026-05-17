/**
 * Unit tests — BloombergRssScraper
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
 *   - DDD contract: method=rss, source=BLOOMBERG, confidence=HIGH
 *   - RSS URL is not bloomberg.com direct (anti-bot regression guard)
 *   - RSS URL contains news.google.com (anti-bot regression guard)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { NewsSource } from '../src/domain/models.js';
import {
  BloombergRssScraper,
  normalizeRfcDate,
} from '../src/infrastructure/scrapers/bloomberg-rss.js';

// ---------------------------------------------------------------------------
// RSS fixture — Bloomberg articles via Google News RSS 2.0
// ---------------------------------------------------------------------------

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bloomberg Markets Finance - Google News</title>
    <link>https://news.google.com</link>
    <description>Bloomberg markets news via Google News RSS</description>

    <item>
      <title><![CDATA[Fed holds rates as inflation data surprise to upside]]></title>
      <link>https://news.google.com/rss/articles/abc123?oc=5</link>
      <pubDate>Mon, 17 May 2026 09:00:00 GMT</pubDate>
    </item>

    <item>
      <title><![CDATA[Vietnam GDP beats forecast on manufacturing rebound]]></title>
      <link>https://news.google.com/rss/articles/def456?oc=5</link>
      <pubDate>Mon, 17 May 2026 08:30:00 GMT</pubDate>
    </item>

    <item>
      <title>Oil drops after OPEC output surge signals</title>
      <link>https://news.google.com/rss/articles/ghi789?oc=5</link>
      <pubDate>Mon, 17 May 2026 07:45:00 GMT</pubDate>
    </item>

    <item>
      <title>Article with no link element</title>
      <pubDate>Mon, 17 May 2026 06:00:00 GMT</pubDate>
    </item>

    <item>
      <title>Article with bad date</title>
      <link>https://news.google.com/rss/articles/bad-date?oc=5</link>
      <pubDate>not-a-date-at-all</pubDate>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bloomberg Markets Finance - Google News</title>
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

describe('BloombergRssScraper — happy path', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns FetchResult with method=rss, source=BLOOMBERG, error=null', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const result = await new BloombergRssScraper().fetchHeadlines();
    expect(result.method).toBe('rss');
    expect(result.source).toBe(NewsSource.BLOOMBERG);
    expect(result.error).toBeNull();
  });

  it('returns 5 articles from the fixture (all items)', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const result = await new BloombergRssScraper().fetchHeadlines(15);
    expect(result.articles).toHaveLength(5);
  });

  it('first article has correct headline', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines();
    expect(articles[0]!.headline).toBe('Fed holds rates as inflation data surprise to upside');
  });

  it('first article has correct url', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines();
    expect(articles[0]!.url).toBe('https://news.google.com/rss/articles/abc123?oc=5');
  });

  it('first article has publishedAt as ISO 8601', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines();
    expect(articles[0]!.publishedAt).toBe('2026-05-17T09:00:00.000Z');
  });

  it('all articles have confidence=HIGH', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines();
    expect(articles.every((a) => a.confidence === 'HIGH')).toBe(true);
  });

  it('all articles have source=BLOOMBERG', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines();
    expect(articles.every((a) => a.source === NewsSource.BLOOMBERG)).toBe(true);
  });

  it('result.fetchedAt is a valid ISO 8601 string', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const result = await new BloombergRssScraper().fetchHeadlines();
    expect(new Date(result.fetchedAt).getTime()).not.toBeNaN();
  });
});

describe('BloombergRssScraper — maxItems cap', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns at most maxItems articles', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    expect((await new BloombergRssScraper().fetchHeadlines(2)).articles).toHaveLength(2);
  });

  it('defaults to 10 items when maxItems not provided (fixture has 5)', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const result = await new BloombergRssScraper().fetchHeadlines();
    expect(result.articles.length).toBeLessThanOrEqual(10);
    expect(result.articles).toHaveLength(5);
  });
});

describe('BloombergRssScraper — missing link + bad date', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('url is null when <link> element is absent', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines(15);
    const noLink = articles.find((a) => a.headline === 'Article with no link element');
    expect(noLink).toBeDefined();
    expect(noLink!.url).toBeNull();
  });

  it('publishedAt is null when pubDate is unparseable', async () => {
    globalThis.fetch = mockFetchOk(RSS_FIXTURE);
    const { articles } = await new BloombergRssScraper().fetchHeadlines(15);
    const badDate = articles.find((a) => a.headline === 'Article with bad date');
    expect(badDate).toBeDefined();
    expect(badDate!.publishedAt).toBeNull();
  });
});

describe('BloombergRssScraper — HTTP errors', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it.each([403, 404, 429, 500, 503])(
    'HTTP %d → error="http-%d", articles=[]',
    async (status) => {
      globalThis.fetch = mockFetchStatus(status);
      const result = await new BloombergRssScraper().fetchHeadlines();
      expect(result.error).toBe(`http-${status}`);
      expect(result.articles).toHaveLength(0);
      expect(result.source).toBe(NewsSource.BLOOMBERG);
      expect(result.method).toBe('rss');
    },
  );
});

describe('BloombergRssScraper — network errors + empty feed', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns error FetchResult when fetch throws', async () => {
    globalThis.fetch = mockFetchThrows('ECONNREFUSED');
    const result = await new BloombergRssScraper().fetchHeadlines();
    expect(result.error).toBe('ECONNREFUSED');
    expect(result.articles).toHaveLength(0);
    expect(result.method).toBe('rss');
  });

  it('returns articles=[] with error=null for empty feed (not an error)', async () => {
    globalThis.fetch = mockFetchOk(EMPTY_RSS_FIXTURE);
    const result = await new BloombergRssScraper().fetchHeadlines();
    expect(result.articles).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(result.method).toBe('rss');
  });
});

// ---------------------------------------------------------------------------
// Anti-bot regression guards — RSS URL must NOT be bloomberg.com direct
// ---------------------------------------------------------------------------

describe('BloombergRssScraper — RSS URL regression guards', () => {
  let capturedUrl: string | null = null;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    capturedUrl = null;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      return new Response(EMPTY_RSS_FIXTURE, { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('RSS URL is NOT www.bloomberg.com (anti-bot: direct fetch returns 403)', async () => {
    await new BloombergRssScraper().fetchHeadlines();
    expect(capturedUrl).not.toContain('www.bloomberg.com');
  });

  it('RSS URL uses news.google.com (Google News RSS)', async () => {
    await new BloombergRssScraper().fetchHeadlines();
    expect(capturedUrl).toContain('news.google.com');
  });

  it('RSS URL contains bloomberg in query param', async () => {
    await new BloombergRssScraper().fetchHeadlines();
    expect(capturedUrl).toContain('bloomberg');
  });
});

// ---------------------------------------------------------------------------
// normalizeRfcDate — exported helper
// ---------------------------------------------------------------------------

describe('normalizeRfcDate (bloomberg-rss)', () => {
  it('converts RFC 2822 to ISO 8601', () => {
    expect(normalizeRfcDate('Mon, 17 May 2026 09:00:00 GMT')).toBe('2026-05-17T09:00:00.000Z');
  });

  it('returns null for non-date strings', () => {
    expect(normalizeRfcDate('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeRfcDate('')).toBeNull();
  });

  it('result ends in Z (UTC normalised)', () => {
    expect(normalizeRfcDate('Mon, 17 May 2026 09:00:00 GMT')).toMatch(/Z$/);
  });
});
