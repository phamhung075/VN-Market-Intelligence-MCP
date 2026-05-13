/**
 * Unit tests — ReutersStealthFallback: browser lifecycle + normalizeDate
 * (1899a-reuters-fallback)
 *
 * Playwright mocked via mock.module() — no real browser launched.
 *
 * Coverage:
 *   - browser.close() called on happy path
 *   - browser.close() called on DataDome detection
 *   - browser.close() called when page.goto throws
 *   - normalizeDate: ISO roundtrip, null, undefined, empty, non-date, offset
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ── Shared close mock ────────────────────────────────────────────────────────
const mockClose = mock(async () => {});

// ── Page builder ─────────────────────────────────────────────────────────────
function buildMockPage(opts: {
  content: string;
  gotoThrows?: Error;
}) {
  return {
    goto: opts.gotoThrows
      ? mock(async () => { throw opts.gotoThrows; })
      : mock(async () => ({ headers: () => ({}) })),
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

const { ReutersStealthFallback, normalizeDate } = await import(
  '../src/infrastructure/scrapers/reuters-stealth.js'
);

const CLEAN = '<html><body>Reuters</body></html>';
const DD_CONTENT = '<html><script src="https://captcha-delivery.com/c.js"></script></html>';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('1899a-reuters-fallback — browser lifecycle', () => {
  beforeEach(() => mockClose.mockClear());

  it('calls browser.close() on successful scrape', async () => {
    activePage = buildMockPage({ content: CLEAN });
    await new ReutersStealthFallback().fetchHeadlines();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('calls browser.close() on DataDome detection', async () => {
    activePage = buildMockPage({ content: DD_CONTENT });
    await new ReutersStealthFallback().fetchHeadlines();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('calls browser.close() when page.goto throws', async () => {
    activePage = buildMockPage({
      content: '',
      gotoThrows: new Error('Navigation timeout'),
    });
    const result = await new ReutersStealthFallback().fetchHeadlines();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(result.articles).toHaveLength(0);
    expect(result.error).toContain('Navigation timeout');
  });
});

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
