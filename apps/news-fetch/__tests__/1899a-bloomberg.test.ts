/**
 * Unit tests — BloombergStealth scraper (1899a-bloomberg)
 *
 * Playwright is mocked via mock.module() — no real browser launched.
 * Page mock returns controllable HTML/content strings.
 *
 * Coverage:
 *   - Happy path DOM: extracts Article[] from [data-component="headline"] containers
 *   - Happy path JSON fallback: uses __NEXT_DATA__ when DOM yields 0 articles
 *   - PerimeterX detection: px-block in page content → error="perimeterx-challenge"
 *   - maxItems cap: returns at most N articles
 *   - Playwright error (page.goto throws): returns error FetchResult, articles: []
 *   - browser.close() called in all paths (happy, perimeterx, error)
 *   - DDD: method="playwright-stealth", source=BLOOMBERG
 *   - normalizeDate: ISO roundtrip, invalid → null
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { NewsSource } from '../src/domain/models.js';

// ---------------------------------------------------------------------------
// Shared close mock — lets us assert browser.close() across tests
// ---------------------------------------------------------------------------
const mockClose = mock(async () => {});

// ---------------------------------------------------------------------------
// Page builder — returns a controllable mock page
// ---------------------------------------------------------------------------
function buildMockPage(opts: {
  content: string;
  containers?: Array<{ text: string; href: string | null; datetime: string | null }>;
  nextDataScript?: string | null;
}) {
  // Locator mock builder — returns chainable locator with .all(), .first(), etc.
  function buildContainerLocator(
    containers: Array<{ text: string; href: string | null; datetime: string | null }>,
  ) {
    return {
      all: mock(async () =>
        containers.map((c) => ({
          textContent: mock(async () => c.text),
          locator: (selector: string) => {
            if (selector.startsWith('a[href')) {
              return {
                first: () => ({
                  getAttribute: mock(async () => c.href),
                }),
              };
            }
            // time locator
            return {
              first: () => ({
                getAttribute: mock(async (attr: string) => {
                  if (attr === 'data-value') return c.datetime;
                  if (attr === 'datetime') return c.datetime;
                  return null;
                }),
              }),
            };
          },
        })),
      ),
    };
  }

  function buildScriptLocator(scriptText: string | null) {
    return {
      textContent: mock(async () => scriptText),
    };
  }

  const page = {
    goto: mock(async () => {}),
    content: mock(async () => opts.content),
    evaluate: mock(async () => {}),
    locator: mock((selector: string) => {
      if (selector === '[data-component="headline"]') {
        return buildContainerLocator(opts.containers ?? []);
      }
      if (selector === 'script#__NEXT_DATA__') {
        return buildScriptLocator(opts.nextDataScript ?? null);
      }
      return { all: mock(async () => []), textContent: mock(async () => null) };
    }),
  };

  return page;
}

// ---------------------------------------------------------------------------
// Module mocks — must be registered before factory import
// ---------------------------------------------------------------------------

let activeMockPage = buildMockPage({ content: '' });

mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => ({
        newContext: mock(async () => ({
          newPage: mock(async () => activeMockPage),
        })),
        close: mockClose,
      })),
    },
  },
}));

mock.module('playwright-stealth', () => ({
  default: mock(async () => {}),
}));

// Import scraper AFTER mocks are registered
const { BloombergStealth, normalizeDate } = await import(
  '../src/infrastructure/scrapers/bloomberg-stealth.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLEAN_CONTENT = '<html><body>Bloomberg</body></html>';
const PX_CONTENT = '<html><body class="px-block">Challenge</body></html>';

function makeNextData(stories: Array<{ headline: string; url?: string; publishedAt?: string }>) {
  return JSON.stringify({
    props: { pageProps: { stories } },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('1899a-bloomberg — BloombergStealth', () => {
  beforeEach(() => {
    mockClose.mockClear();
  });

  // ── Happy path DOM ─────────────────────────────────────────────────────────

  describe('happy path — DOM extraction', () => {
    it('returns FetchResult with method=playwright-stealth, source=BLOOMBERG, error=null', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Fed holds rates', href: '/news/articles/abc', datetime: '2026-05-13T10:00:00Z' }],
      });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.method).toBe('playwright-stealth');
      expect(result.source).toBe(NewsSource.BLOOMBERG);
      expect(result.error).toBeNull();
    });

    it('returns correct headline from DOM container', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Vietnam GDP beats forecast', href: '/news/articles/vnm', datetime: null }],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]?.headline).toBe('Vietnam GDP beats forecast');
    });

    it('prefixes relative href with https://www.bloomberg.com', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Oil drops', href: '/news/articles/oil-123', datetime: null }],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]?.url).toBe('https://www.bloomberg.com/news/articles/oil-123');
    });

    it('sets url=null when container has no matching link', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'No-link headline', href: null, datetime: null }],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]?.url).toBeNull();
    });

    it('normalises datetime to ISO 8601', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Rate cut signal', href: null, datetime: '2026-05-13T14:30:00Z' }],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]?.publishedAt).toBe('2026-05-13T14:30:00.000Z');
    });

    it('sets publishedAt=null when datetime is missing', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'No date article', href: null, datetime: null }],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]?.publishedAt).toBeNull();
    });

    it('all DOM articles have confidence=HIGH', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [
          { text: 'Article A', href: null, datetime: null },
          { text: 'Article B', href: null, datetime: null },
        ],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines(10);

      expect(articles.every((a) => a.confidence === 'HIGH')).toBe(true);
    });

    it('all DOM articles have source=BLOOMBERG', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [
          { text: 'Article A', href: null, datetime: null },
          { text: 'Article B', href: null, datetime: null },
        ],
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines(10);

      expect(articles.every((a) => a.source === NewsSource.BLOOMBERG)).toBe(true);
    });

    it('result.fetchedAt is a valid ISO 8601 string', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Article', href: null, datetime: null }],
      });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(new Date(result.fetchedAt).getTime()).not.toBeNaN();
    });
  });

  // ── maxItems cap ───────────────────────────────────────────────────────────

  describe('maxItems cap', () => {
    it('returns at most maxItems articles from DOM', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [
          { text: 'A1', href: null, datetime: null },
          { text: 'A2', href: null, datetime: null },
          { text: 'A3', href: null, datetime: null },
          { text: 'A4', href: null, datetime: null },
          { text: 'A5', href: null, datetime: null },
        ],
      });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines(3);

      expect(result.articles).toHaveLength(3);
    });
  });

  // ── JSON fallback ──────────────────────────────────────────────────────────

  describe('JSON fallback (__NEXT_DATA__)', () => {
    it('uses __NEXT_DATA__ when DOM yields 0 articles', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [],
        nextDataScript: makeNextData([
          { headline: 'Fallback headline', url: 'https://bloomberg.com/f', publishedAt: '2026-05-13T09:00:00Z' },
        ]),
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles).toHaveLength(1);
      expect(articles[0]?.headline).toBe('Fallback headline');
    });

    it('fallback articles have confidence=LOW', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [],
        nextDataScript: makeNextData([
          { headline: 'Low-conf article', publishedAt: undefined },
        ]),
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines();

      expect(articles[0]?.confidence).toBe('LOW');
    });

    it('fallback respects maxItems', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [],
        nextDataScript: makeNextData([
          { headline: 'F1' },
          { headline: 'F2' },
          { headline: 'F3' },
          { headline: 'F4' },
        ]),
      });

      const scraper = new BloombergStealth();
      const { articles } = await scraper.fetchHeadlines(2);

      expect(articles).toHaveLength(2);
    });

    it('returns articles=[], error=null when both DOM and __NEXT_DATA__ yield nothing', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [],
        nextDataScript: null,
      });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.articles).toHaveLength(0);
      expect(result.error).toBeNull();
    });

    it('handles malformed JSON in __NEXT_DATA__ without throwing', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [],
        nextDataScript: '{ not valid json :::',
      });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.error).toBeNull();
      expect(result.articles).toHaveLength(0);
    });
  });

  // ── PerimeterX detection ───────────────────────────────────────────────────

  describe('PerimeterX challenge', () => {
    it('returns error="perimeterx-challenge" when px-block present', async () => {
      activeMockPage = buildMockPage({ content: PX_CONTENT });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.error).toBe('perimeterx-challenge');
      expect(result.articles).toHaveLength(0);
    });

    it('returns source=BLOOMBERG and method=playwright-stealth on px-block', async () => {
      activeMockPage = buildMockPage({ content: PX_CONTENT });

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.source).toBe(NewsSource.BLOOMBERG);
      expect(result.method).toBe('playwright-stealth');
    });
  });

  // ── browser.close() lifecycle ──────────────────────────────────────────────

  describe('browser lifecycle — close() called in all paths', () => {
    it('calls browser.close() on successful scrape', async () => {
      mockClose.mockClear();
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Article', href: null, datetime: null }],
      });

      const scraper = new BloombergStealth();
      await scraper.fetchHeadlines();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('calls browser.close() on PerimeterX detection', async () => {
      mockClose.mockClear();
      activeMockPage = buildMockPage({ content: PX_CONTENT });

      const scraper = new BloombergStealth();
      await scraper.fetchHeadlines();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('calls browser.close() when page.goto throws', async () => {
      mockClose.mockClear();
      activeMockPage = {
        ...buildMockPage({ content: '' }),
        goto: mock(async () => { throw new Error('Navigation timeout'); }),
      } as ReturnType<typeof buildMockPage>;

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(result.articles).toHaveLength(0);
      expect(result.error).toContain('Navigation timeout');
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns error string and articles=[] when page.goto throws', async () => {
      activeMockPage = {
        ...buildMockPage({ content: '' }),
        goto: mock(async () => { throw new Error('net::ERR_CONNECTION_REFUSED'); }),
      } as ReturnType<typeof buildMockPage>;

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.error).toContain('ERR_CONNECTION_REFUSED');
      expect(result.articles).toHaveLength(0);
      expect(result.method).toBe('playwright-stealth');
    });

    it('returns error=timeout message and articles=[] on timeout', async () => {
      activeMockPage = {
        ...buildMockPage({ content: '' }),
        goto: mock(async () => { throw new Error('Timeout 30000ms exceeded'); }),
      } as ReturnType<typeof buildMockPage>;

      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines();

      expect(result.error).toContain('Timeout');
      expect(result.articles).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeDate — exported helper
// ---------------------------------------------------------------------------

describe('normalizeDate', () => {
  it('converts ISO 8601 string to UTC ISO', () => {
    expect(normalizeDate('2026-05-13T14:30:00Z')).toBe('2026-05-13T14:30:00.000Z');
  });

  it('returns null for null input', () => {
    expect(normalizeDate(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeDate('')).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(normalizeDate('not-a-date')).toBeNull();
  });

  it('result always ends in Z (UTC normalised)', () => {
    const result = normalizeDate('2026-05-13T09:00:00+07:00');
    expect(result).toMatch(/Z$/);
  });

  it('correctly converts +07:00 offset to UTC', () => {
    expect(normalizeDate('2026-05-13T09:00:00+07:00')).toBe('2026-05-13T02:00:00.000Z');
  });
});
