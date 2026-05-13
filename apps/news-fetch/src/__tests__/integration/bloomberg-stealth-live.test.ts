/**
 * Integration tests — BloombergStealth (live Playwright)
 *
 * Skipped by default. Run only when PLAYWRIGHT_LIVE=true (manual only).
 * Launches real Chromium — flaky, requires display + bandwidth.
 *
 * Guard: it.skipIf(Bun.env['PLAYWRIGHT_LIVE'] !== 'true')
 *
 * Coverage:
 *   1. Real Playwright navigates to bloomberg.com/news without crash
 *   2. DOM or JSON extraction yields ≥1 article OR returns a known block error
 *   3. No process leak — second scrape instance still works
 */

import { describe, it, expect } from 'bun:test';
import { BloombergStealth } from '../../infrastructure/scrapers/bloomberg-stealth.js';

const PLAYWRIGHT_LIVE = Bun.env['PLAYWRIGHT_LIVE'] === 'true';

describe('BloombergStealth — integration (live Playwright, skip by default)', () => {
  it.skipIf(!PLAYWRIGHT_LIVE)(
    'INT1: navigates to bloomberg.com/news without throwing',
    async () => {
      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines(5);

      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
      expect(result.method).toBe('playwright-stealth');
    },
    120_000,
  );

  it.skipIf(!PLAYWRIGHT_LIVE)(
    'INT2: DOM or JSON extraction yields ≥1 article OR known block error',
    async () => {
      const scraper = new BloombergStealth();
      const result = await scraper.fetchHeadlines(5);

      const knownErrors = ['perimeterx-challenge', 'datadome-block'];
      const hasArticles = result.articles.length >= 1;
      const isKnownBlock =
        result.error !== null && knownErrors.some((e) => result.error!.includes(e));

      expect(hasArticles || isKnownBlock).toBe(true);
    },
    120_000,
  );

  it.skipIf(!PLAYWRIGHT_LIVE)(
    'INT3: second scrape completes — no leaked browser state',
    async () => {
      const scraper = new BloombergStealth();
      await scraper.fetchHeadlines(3);
      const result2 = await scraper.fetchHeadlines(3);

      expect(result2).toBeDefined();
    },
    240_000,
  );
});
