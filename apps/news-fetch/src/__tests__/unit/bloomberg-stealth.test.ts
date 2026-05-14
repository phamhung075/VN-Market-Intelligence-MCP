/**
 * Unit tests — BloombergStealth scraper
 *
 * Playwright fully mocked via mock.module('playwright') + mock.module('playwright-stealth').
 * No real browser launched. No live network.
 *
 * Coverage (AC 1899a-tests):
 *   1. DOM extraction path → source=BLOOMBERG, method=playwright-stealth
 *   2. Empty DOM + no __NEXT_DATA__ → articles=[], error=null (graceful)
 *   3. browser.close() called in finally (verified via spy)
 *   4. PerimeterX detection (px-block in page content) → error=perimeterx-challenge
 *   5. maxItems parameter — no crash on boundary values
 *   6. Timeout / generic error handling → error FetchResult (never throws)
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { NewsSource } from '../../domain/models.js';

// ---------------------------------------------------------------------------
// Playwright module mock
// Must be declared before importing BloombergStealth so the module cache
// receives the mock version on first load.
// ---------------------------------------------------------------------------

let browserCloseSpy = mock(async () => {});
let pageContentFn: () => Promise<string> = async () => '<html></html>';

mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => ({
        newContext: mock(async () => ({
          addInitScript: mock(async () => {}),
          newPage: mock(async () => ({
            goto: mock(async () => {}),
            evaluate: mock(async (_fn: unknown) => { void _fn; }),
            content: mock(async () => pageContentFn()),
            locator: mock((_selector: string) => {
              void _selector;
              return {
                all: mock(async () => []),
                textContent: mock(async () => null),
                getAttribute: mock(async (_attr: string) => { void _attr; return null; }),
                first: () => ({
                  textContent: mock(async () => null),
                  getAttribute: mock(async (_attr: string) => { void _attr; return null; }),
                }),
              };
            }),
            close: mock(async () => {}),
          })),
        })),
        close: browserCloseSpy,
      })),
    },
  },
}));

// Import AFTER mock.module — module sees mock on first require
const { BloombergStealth } = await import('../../infrastructure/scrapers/bloomberg-stealth.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BloombergStealth — unit', () => {
  beforeEach(() => {
    browserCloseSpy = mock(async () => {});
    pageContentFn = async () => '<html></html>';
  });

  // AC 1: correct source and method on DOM extraction path
  it('AC1: returns source=BLOOMBERG and method=playwright-stealth', async () => {
    pageContentFn = async () => '<html>clean page</html>';
    const scraper = new BloombergStealth();
    const result = await scraper.fetchHeadlines(5);

    expect(result.source).toBe(NewsSource.BLOOMBERG);
    expect(result.method).toBe('playwright-stealth');
  });

  // AC 2: empty DOM + no __NEXT_DATA__ → graceful empty result
  it('AC2: empty DOM path returns articles=[], error=null', async () => {
    pageContentFn = async () => '<html>clean page</html>';
    const scraper = new BloombergStealth();
    const result = await scraper.fetchHeadlines(5);

    expect(result.articles).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  // AC 3: browser.close() called in finally block
  it('AC3: browser.close() is called on success path', async () => {
    pageContentFn = async () => '<html>clean</html>';
    const scraper = new BloombergStealth();
    await scraper.fetchHeadlines(5);

    expect(browserCloseSpy).toHaveBeenCalled();
  });

  // AC 4: PerimeterX detection
  it('AC4: px-block in content → error=perimeterx-challenge, articles=[]', async () => {
    pageContentFn = async () => '<html><div class="px-block">challenge</div></html>';
    const scraper = new BloombergStealth();
    const result = await scraper.fetchHeadlines(5);

    expect(result.error).toBe('perimeterx-challenge');
    expect(result.articles).toHaveLength(0);
  });

  // AC 5: maxItems boundary — no crash
  it('AC5: maxItems=1 and maxItems=100 do not crash', async () => {
    pageContentFn = async () => '<html>clean</html>';
    const scraper = new BloombergStealth();

    await expect(scraper.fetchHeadlines(1)).resolves.toBeDefined();
    await expect(scraper.fetchHeadlines(100)).resolves.toBeDefined();
  });

  // AC 6: generic error → error FetchResult, never throws
  it('AC6: page.content() throwing → error returned, never throws', async () => {
    pageContentFn = async () => { throw new Error('Navigation timeout 30000ms exceeded'); };
    const scraper = new BloombergStealth();
    const result = await scraper.fetchHeadlines(5);

    expect(result.error).toBeDefined();
    expect(result.error).not.toBeNull();
    expect(result.articles).toHaveLength(0);
    expect(result.source).toBe(NewsSource.BLOOMBERG);
  });

  it('fetchedAt is a valid ISO string', async () => {
    pageContentFn = async () => '<html>clean</html>';
    const result = await new BloombergStealth().fetchHeadlines(5);

    expect(() => new Date(result.fetchedAt)).not.toThrow();
    expect(isNaN(new Date(result.fetchedAt).getTime())).toBe(false);
  });
});
