/**
 * Unit tests — BloombergStealth: JSON __NEXT_DATA__ fallback (1899a-bloomberg)
 *
 * Playwright mocked via mock.module() — no real browser launched.
 *
 * Coverage:
 *   - __NEXT_DATA__ fallback when DOM yields 0 articles
 *   - fallback article confidence=LOW
 *   - fallback respects maxItems
 *   - both DOM and __NEXT_DATA__ empty → articles=[], error=null
 *   - malformed JSON in __NEXT_DATA__ handled gracefully
 */

import { describe, it, expect, mock } from 'bun:test';

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
          locator: (selector: string) => {
            if (selector.startsWith('a[href')) {
              return {
                first: () => ({
                  getAttribute: mock(async () => c.href),
                }),
              };
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

  function buildScriptLocator(scriptText: string | null) {
    return { textContent: mock(async () => scriptText) };
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

function makeNextData(stories: Array<{ headline: string; url?: string; publishedAt?: string }>) {
  return JSON.stringify({
    props: { pageProps: { stories } },
  });
}

describe('1899a-bloomberg — JSON fallback', () => {
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
});
