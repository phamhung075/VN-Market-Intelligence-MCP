/**
 * Unit tests — BloombergStealth: DOM extraction + maxItems (1899a-bloomberg)
 *
 * Coverage: happy path DOM extraction, url prefix, publishedAt, confidence=HIGH,
 * source=BLOOMBERG, fetchedAt ISO string, maxItems cap.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { NewsSource } from '../src/domain/models.js';

const mockClose = mock(async () => {});

function buildMockPage(opts: {
  content: string;
  containers?: Array<{ text: string; href: string | null; datetime: string | null }>;
  nextDataScript?: string | null;
}) {
  function buildContainerLocator(
    containers: Array<{ text: string; href: string | null; datetime: string | null }>,
  ) {
    return {
      all: mock(async () =>
        containers.map((c) => ({
          textContent: mock(async () => c.text),
          locator: (sel: string) => {
            if (sel.startsWith('a[href')) {
              return { first: () => ({ getAttribute: mock(async () => c.href) }) };
            }
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

  const page = {
    goto: mock(async () => {}),
    content: mock(async () => opts.content),
    evaluate: mock(async () => {}),
    locator: mock((sel: string) => {
      if (sel === '[data-component="headline"]') return buildContainerLocator(opts.containers ?? []);
      if (sel === 'script#__NEXT_DATA__') return { textContent: mock(async () => opts.nextDataScript ?? null) };
      return { all: mock(async () => []), textContent: mock(async () => null) };
    }),
  };
  return page;
}

let activeMockPage = buildMockPage({ content: '' });

mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => ({
        newContext: mock(async () => ({
          addInitScript: mock(async () => {}),
          newPage: mock(async () => activeMockPage),
        })),
        close: mockClose,
      })),
    },
  },
}));

const { BloombergStealth } = await import(
  '../src/infrastructure/scrapers/bloomberg-stealth.js'
);

const CLEAN_CONTENT = '<html><body>Bloomberg</body></html>';

describe('1899a-bloomberg — DOM extraction', () => {
  beforeEach(() => { mockClose.mockClear(); });

  describe('happy path — DOM extraction', () => {
    it('returns FetchResult with method=playwright-stealth, source=BLOOMBERG, error=null', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Fed holds rates', href: '/news/articles/abc', datetime: '2026-05-13T10:00:00Z' }],
      });
      const result = await new BloombergStealth().fetchHeadlines();
      expect(result.method).toBe('playwright-stealth');
      expect(result.source).toBe(NewsSource.BLOOMBERG);
      expect(result.error).toBeNull();
    });

    it('returns correct headline from DOM container', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Vietnam GDP beats forecast', href: '/news/articles/vnm', datetime: null }],
      });
      const { articles } = await new BloombergStealth().fetchHeadlines();
      expect(articles[0]?.headline).toBe('Vietnam GDP beats forecast');
    });

    it('prefixes relative href with https://www.bloomberg.com', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Oil drops', href: '/news/articles/oil-123', datetime: null }],
      });
      const { articles } = await new BloombergStealth().fetchHeadlines();
      expect(articles[0]?.url).toBe('https://www.bloomberg.com/news/articles/oil-123');
    });

    it('sets url=null when container has no matching link', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'No-link headline', href: null, datetime: null }],
      });
      const { articles } = await new BloombergStealth().fetchHeadlines();
      expect(articles[0]?.url).toBeNull();
    });

    it('normalises datetime to ISO 8601', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Rate cut signal', href: null, datetime: '2026-05-13T14:30:00Z' }],
      });
      const { articles } = await new BloombergStealth().fetchHeadlines();
      expect(articles[0]?.publishedAt).toBe('2026-05-13T14:30:00.000Z');
    });

    it('sets publishedAt=null when datetime is missing', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'No date article', href: null, datetime: null }],
      });
      const { articles } = await new BloombergStealth().fetchHeadlines();
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
      const { articles } = await new BloombergStealth().fetchHeadlines(10);
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
      const { articles } = await new BloombergStealth().fetchHeadlines(10);
      expect(articles.every((a) => a.source === NewsSource.BLOOMBERG)).toBe(true);
    });

    it('result.fetchedAt is a valid ISO 8601 string', async () => {
      activeMockPage = buildMockPage({
        content: CLEAN_CONTENT,
        containers: [{ text: 'Article', href: null, datetime: null }],
      });
      const result = await new BloombergStealth().fetchHeadlines();
      expect(new Date(result.fetchedAt).getTime()).not.toBeNaN();
    });
  });

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
      const result = await new BloombergStealth().fetchHeadlines(3);
      expect(result.articles).toHaveLength(3);
    });
  });
});
