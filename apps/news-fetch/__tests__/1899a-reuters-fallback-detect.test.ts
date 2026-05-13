/**
 * Unit tests — ReutersStealthFallback: DataDome detection + error handling
 * (1899a-reuters-fallback)
 *
 * Playwright mocked via mock.module() — no real browser launched.
 *
 * Coverage:
 *   - DataDome detection via captcha-delivery.com in page content
 *   - DataDome detection via x-dd-b: 3 response header
 *   - Both paths return error="datadome-block", articles=[]
 *   - Timeout error: articles=[], error contains message
 *   - Network error: articles=[], error contains message
 *   - error.method=playwright-stealth and source=REUTERS on all error paths
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { NewsSource } from '../src/domain/models.js';

// ── Shared close mock ────────────────────────────────────────────────────────
const mockClose = mock(async () => {});

// ── Page builder ─────────────────────────────────────────────────────────────
function buildMockPage(opts: {
  content: string;
  gotoResponse?: object | null;
  gotoThrows?: Error;
}) {
  const gotoResponse = opts.gotoThrows
    ? null
    : (opts.gotoResponse !== undefined ? opts.gotoResponse : { headers: () => ({}) });

  return {
    goto: opts.gotoThrows
      ? mock(async () => { throw opts.gotoThrows; })
      : mock(async () => gotoResponse),
    content: mock(async () => opts.content),
    evaluate: mock(async () => {}),
    locator: mock(() => ({ all: mock(async () => []) })),
  };
}

// ── Module mocks ──────────────────────────────────────────────────────────────
let activePage = buildMockPage({ content: '' });

mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => ({
        newContext: mock(async () => ({
          newPage: mock(async () => activePage),
        })),
        close: mockClose,
      })),
    },
  },
}));

mock.module('playwright-stealth', () => ({
  default: mock(async () => {}),
}));

const { ReutersStealthFallback } = await import(
  '../src/infrastructure/scrapers/reuters-stealth.js'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('1899a-reuters-fallback — DataDome detection', () => {
  beforeEach(() => mockClose.mockClear());

  describe('captcha-delivery.com in page body', () => {
    const DD_CONTENT = '<html><script src="https://captcha-delivery.com/c.js"></script></html>';

    it('returns error="datadome-block"', async () => {
      activePage = buildMockPage({ content: DD_CONTENT });
      const result = await new ReutersStealthFallback().fetchHeadlines();
      expect(result.error).toBe('datadome-block');
    });

    it('returns articles=[]', async () => {
      activePage = buildMockPage({ content: DD_CONTENT });
      const result = await new ReutersStealthFallback().fetchHeadlines();
      expect(result.articles).toHaveLength(0);
    });

    it('returns source=REUTERS, method=playwright-stealth', async () => {
      activePage = buildMockPage({ content: DD_CONTENT });
      const result = await new ReutersStealthFallback().fetchHeadlines();
      expect(result.source).toBe(NewsSource.REUTERS);
      expect(result.method).toBe('playwright-stealth');
    });
  });

  describe('x-dd-b: 3 response header', () => {
    const CLEAN_CONTENT = '<html><body>Reuters</body></html>';

    it('returns error="datadome-block" on x-dd-b: 3 header', async () => {
      activePage = buildMockPage({
        content: CLEAN_CONTENT,
        gotoResponse: { headers: () => ({ 'x-dd-b': '3' }) },
      });
      const result = await new ReutersStealthFallback().fetchHeadlines();
      expect(result.error).toBe('datadome-block');
    });

    it('returns articles=[] on x-dd-b: 3 header', async () => {
      activePage = buildMockPage({
        content: CLEAN_CONTENT,
        gotoResponse: { headers: () => ({ 'x-dd-b': '3' }) },
      });
      const result = await new ReutersStealthFallback().fetchHeadlines();
      expect(result.articles).toHaveLength(0);
    });

    it('does NOT trigger on x-dd-b: 1 header (non-block code)', async () => {
      activePage = buildMockPage({
        content: CLEAN_CONTENT,
        gotoResponse: { headers: () => ({ 'x-dd-b': '1' }) },
      });
      const result = await new ReutersStealthFallback().fetchHeadlines();
      expect(result.error).toBeNull();
    });
  });
});

describe('1899a-reuters-fallback — error handling', () => {
  beforeEach(() => mockClose.mockClear());

  it('returns error string and articles=[] when page.goto throws network error', async () => {
    activePage = buildMockPage({
      content: '',
      gotoThrows: new Error('net::ERR_CONNECTION_REFUSED'),
    });
    const result = await new ReutersStealthFallback().fetchHeadlines();
    expect(result.error).toContain('ERR_CONNECTION_REFUSED');
    expect(result.articles).toHaveLength(0);
    expect(result.method).toBe('playwright-stealth');
  });

  it('returns error string and articles=[] on timeout', async () => {
    activePage = buildMockPage({
      content: '',
      gotoThrows: new Error('Timeout 25000ms exceeded'),
    });
    const result = await new ReutersStealthFallback().fetchHeadlines();
    expect(result.error).toContain('Timeout');
    expect(result.articles).toHaveLength(0);
  });

  it('returns source=REUTERS on any error path', async () => {
    activePage = buildMockPage({
      content: '',
      gotoThrows: new Error('Network failure'),
    });
    const result = await new ReutersStealthFallback().fetchHeadlines();
    expect(result.source).toBe(NewsSource.REUTERS);
  });
});
