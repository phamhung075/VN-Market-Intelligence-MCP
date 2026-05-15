/**
 * Unit tests — BloombergStealth: PerimeterX + lifecycle + error handling (1899a-bloomberg)
 *
 * Playwright mocked via mock.module() — no real browser launched.
 *
 * Coverage:
 *   - PerimeterX detection: px-block in content → error="perimeterx-challenge"
 *   - browser.close() called in all paths (success, perimeterx, goto-throw)
 *   - error handling: page.goto throws → error string returned, articles=[]
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
const PX_CONTENT = '<html><body class="px-block">Challenge</body></html>';

describe('1899a-bloomberg — PerimeterX + lifecycle', () => {
  beforeEach(() => {
    mockClose.mockClear();
  });

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
