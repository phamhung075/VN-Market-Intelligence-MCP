/**
 * Unit tests — ReutersRssScraper + normalizeRfcDate
 *
 * All HTTP mocked via globalThis.fetch override.
 * No live network. Safe for CI.
 *
 * Coverage (AC 1899a-tests):
 *   1. fetchHeadlines() with mock fixture XML → parses to Article array
 *   2. Empty feed → articles: [], error: null
 *   3. HTTP error (404) → error: "http-404", articles: []
 *   4. Date normalization: RFC 2822 → ISO 8601
 *   5. URL extraction (null when missing link)
 *   6. maxItems limit respected (feed has 20, get 15)
 *   7. confidence: 'HIGH' set correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ReutersRssScraper, normalizeRfcDate } from '../../infrastructure/scrapers/reuters-rss.js';
import { NewsSource } from '../../domain/models.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function buildRssItem(title: string, link: string | null, pubDate: string | null): string {
  return `<item>
    <title><![CDATA[${title}]]></title>
    ${link ? `<link>${link}</link>` : ''}
    ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
  </item>`;
}

function buildRss(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Reuters Business News</title>
    ${items.join('\n')}
  </channel>
</rss>`;
}

const FIXTURE_ITEMS = Array.from({ length: 20 }, (_, i) =>
  buildRssItem(
    `Headline ${i + 1}`,
    `https://reuters.com/${i + 1}`,
    'Mon, 13 May 2026 10:00:00 GMT',
  ),
);

const RSS_20_ITEMS = buildRss(FIXTURE_ITEMS);

const RSS_SINGLE = buildRss([
  buildRssItem('Vietnam GDP up 6.9%', 'https://reuters.com/vn-gdp', 'Mon, 13 May 2026 14:30:00 GMT'),
]);

const RSS_NO_LINK = buildRss([
  buildRssItem('No link article', null, 'Mon, 13 May 2026 10:00:00 GMT'),
]);

const RSS_EMPTY = buildRss([]);

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockOk(body: string): typeof fetch {
  return (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
}

function mockStatus(status: number): typeof fetch {
  return (async () => new Response('', { status })) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReutersRssScraper — unit', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  // AC 1: parse fixture XML → Article array
  it('AC1: parses XML fixture to Article array', async () => {
    globalThis.fetch = mockOk(RSS_SINGLE);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.headline).toBe('Vietnam GDP up 6.9%');
    expect(result.source).toBe(NewsSource.REUTERS);
    expect(result.method).toBe('rss');
    expect(result.error).toBeNull();
  });

  // AC 2: empty feed → articles: [], error: null
  it('AC2: empty feed returns articles=[], error=null', async () => {
    globalThis.fetch = mockOk(RSS_EMPTY);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.articles).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  // AC 3: HTTP 404 → error field contains "404"
  it('AC3: HTTP 404 → error contains 404, articles=[]', async () => {
    globalThis.fetch = mockStatus(404);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.error).toContain('404');
    expect(result.articles).toHaveLength(0);
  });

  // AC 4: date normalization RFC 2822 → ISO 8601
  it('AC4: pubDate RFC 2822 normalized to ISO 8601', async () => {
    globalThis.fetch = mockOk(RSS_SINGLE);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.articles[0]!.publishedAt).toBe('2026-05-13T14:30:00.000Z');
  });

  // AC 5: url is null when link element absent
  it('AC5: url is null when link element is missing', async () => {
    globalThis.fetch = mockOk(RSS_NO_LINK);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.articles[0]!.url).toBeNull();
  });

  // AC 6: maxItems respected (feed has 20, request 15)
  it('AC6: maxItems=15 limits 20-item feed to 15 articles', async () => {
    globalThis.fetch = mockOk(RSS_20_ITEMS);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.articles).toHaveLength(15);
  });

  // AC 7: confidence is always HIGH
  it('AC7: all articles have confidence=HIGH', async () => {
    globalThis.fetch = mockOk(RSS_SINGLE);
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.articles.every((a) => a.confidence === 'HIGH')).toBe(true);
  });

  // Extra: network throw → error result
  it('network error: fetch throws → error in result', async () => {
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const result = await new ReutersRssScraper().fetchHeadlines(15);

    expect(result.error).toBe('ECONNREFUSED');
    expect(result.articles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeRfcDate helper
// ---------------------------------------------------------------------------

describe('normalizeRfcDate', () => {
  it('converts RFC 2822 to ISO 8601 UTC', () => {
    expect(normalizeRfcDate('Mon, 13 May 2026 14:30:00 GMT')).toBe('2026-05-13T14:30:00.000Z');
  });

  it('handles timezone offset +0700', () => {
    expect(normalizeRfcDate('Mon, 13 May 2026 09:30:00 +0700')).toBe('2026-05-13T02:30:00.000Z');
  });

  it('returns null for invalid date string', () => {
    expect(normalizeRfcDate('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeRfcDate('')).toBeNull();
  });
});
