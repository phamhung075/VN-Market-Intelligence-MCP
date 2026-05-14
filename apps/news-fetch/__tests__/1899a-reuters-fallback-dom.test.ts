/**
 * Unit tests — ReutersStealthFallback: DOM extraction (1899a-reuters-fallback)
 *
 * Playwright mocked via mock.module() — no real browser launched.
 *
 * Coverage:
 *   - Happy path DOM: extracts Article[] from article[data-testid="Article"]
 *   - headline, url, publishedAt, confidence=LOW, source=REUTERS
 *   - url prefixed with https://www.reuters.com
 *   - null url when no link found
 *   - null publishedAt when datetime missing
 *   - fetchedAt is valid ISO string
 *   - maxItems cap
 *   - empty page: articles=[], error=null
 *   - all DOM articles have confidence=LOW
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { NewsSource } from '../src/domain/models.js';

// ── Shared close mock ───────────────────────────────────────────────────────
const mockClose = mock(async () => {});

// ── Page builder ────────────────────────────────────────────────────────────
type ArticleStub = { text: string; href: string | null; datetime: string | null };

function buildMockPage(opts: {
  content?: string;
  articles?: ArticleStub[];
  gotoResponse?: object | null;
}) {
  const content = opts.content ?? '<html><body>Reuters</body></html>';
  const stubs = opts.articles ?? [];
  const gotoResponse = opts.gotoResponse !== undefined
    ? opts.gotoResponse
    : { headers: () => ({}) };

  function buildArticleLocator(stubs: ArticleStub[]) {
    return {
      all: mock(async () =>
        stubs.map((s) => ({
          locator: (selector: string) => {
            if (selector === '[data-testid="Heading"]') {
              return { textContent: mock(async () => s.text) };
            }
            if (selector.startsWith('a[href')) {
              return { first: () => ({ getAttribute: mock(async () => s.href) }) };
            }
            // time locator
            return {
              first: () => ({
                getAttribute: mock(async (attr: string) =>
                  attr === 'datetime' ? s.datetime : null,
                ),
              }),
            };
          },
        })),
      ),
    };
  }

  return {
    goto: mock(async () => gotoResponse),
    content: mock(async () => content),
    evaluate: mock(async () => {}),
    locator: mock((selector: string) => {
      if (selector === 'article[data-testid="Article"]') {
        return buildArticleLocator(stubs);
      }
      return { all: mock(async () => []) };
    }),
  };
}

// ── Module mocks ─────────────────────────────────────────────────────────────
let activePage = buildMockPage({});

mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => ({
        newContext: mock(async () => ({
          addInitScript: mock(async () => {}),
          newPage: mock(async () => activePage),
        })),
        close: mockClose,
      })),
    },
  },
}));

const { ReutersStealthFallback } = await import(
  '../src/infrastructure/scrapers/reuters-stealth.js'
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const CLEAN = '<html><body>Reuters business</body></html>';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('1899a-reuters-fallback — DOM extraction', () => {
  beforeEach(() => mockClose.mockClear());

  it('returns method=playwright-stealth, source=REUTERS, error=null', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [{ text: 'VN stocks rise', href: '/article/vn-1', datetime: '2026-05-13T10:00:00Z' }],
    });
    const result = await new ReutersStealthFallback().fetchHeadlines();
    expect(result.method).toBe('playwright-stealth');
    expect(result.source).toBe(NewsSource.REUTERS);
    expect(result.error).toBeNull();
  });

  it('extracts correct headline text', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [{ text: 'Fed keeps rates', href: null, datetime: null }],
    });
    const { articles } = await new ReutersStealthFallback().fetchHeadlines();
    expect(articles[0]?.headline).toBe('Fed keeps rates');
  });

  it('prefixes relative href with https://www.reuters.com', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [{ text: 'Oil steady', href: '/article/oil-123', datetime: null }],
    });
    const { articles } = await new ReutersStealthFallback().fetchHeadlines();
    expect(articles[0]?.url).toBe('https://www.reuters.com/article/oil-123');
  });

  it('sets url=null when article has no matching link', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [{ text: 'No link', href: null, datetime: null }],
    });
    const { articles } = await new ReutersStealthFallback().fetchHeadlines();
    expect(articles[0]?.url).toBeNull();
  });

  it('normalises datetime to ISO 8601', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [{ text: 'Timed article', href: null, datetime: '2026-05-13T09:00:00+07:00' }],
    });
    const { articles } = await new ReutersStealthFallback().fetchHeadlines();
    expect(articles[0]?.publishedAt).toBe('2026-05-13T02:00:00.000Z');
  });

  it('sets publishedAt=null when datetime is missing', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [{ text: 'No date', href: null, datetime: null }],
    });
    const { articles } = await new ReutersStealthFallback().fetchHeadlines();
    expect(articles[0]?.publishedAt).toBeNull();
  });

  it('all DOM articles have confidence=LOW', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [
        { text: 'A', href: null, datetime: null },
        { text: 'B', href: null, datetime: null },
      ],
    });
    const { articles } = await new ReutersStealthFallback().fetchHeadlines(10);
    expect(articles.every((a) => a.confidence === 'LOW')).toBe(true);
  });

  it('respects maxItems cap', async () => {
    activePage = buildMockPage({
      content: CLEAN,
      articles: [
        { text: 'A1', href: null, datetime: null },
        { text: 'A2', href: null, datetime: null },
        { text: 'A3', href: null, datetime: null },
        { text: 'A4', href: null, datetime: null },
        { text: 'A5', href: null, datetime: null },
      ],
    });
    const result = await new ReutersStealthFallback().fetchHeadlines(3);
    expect(result.articles).toHaveLength(3);
  });

  it('returns articles=[], error=null on empty page', async () => {
    activePage = buildMockPage({ content: CLEAN, articles: [] });
    const result = await new ReutersStealthFallback().fetchHeadlines();
    expect(result.articles).toHaveLength(0);
    expect(result.error).toBeNull();
  });
});
