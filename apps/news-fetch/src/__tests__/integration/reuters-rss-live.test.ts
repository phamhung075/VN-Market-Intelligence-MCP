/**
 * Integration tests — ReutersRssScraper (live endpoint)
 *
 * Skipped by default. Run only in CI (CI=true) or explicit manual run.
 * Live HTTP to Reuters RSS feed — may fail if geo-blocked or endpoint down.
 *
 * Guard: it.skipIf(!IS_CI)
 *
 * Coverage:
 *   1. Real HTTP → parses ≥1 item (soft — may be geo-blocked)
 *   2. Date fields are ISO strings or null
 *   3. Confidence is 'HIGH' for all articles
 */

import { describe, it, expect } from 'bun:test';
import { ReutersRssScraper } from '../../infrastructure/scrapers/reuters-rss.js';

const IS_CI = Bun.env['CI'] === 'true';

describe('ReutersRssScraper — integration (live, skip by default)', () => {
  it.skipIf(!IS_CI)(
    'INT1: live RSS fetch returns ≥1 article',
    async () => {
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines(5);

      // Soft assertion — live endpoint may be geo-blocked
      expect(result.articles.length).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    },
    30_000,
  );

  it.skipIf(!IS_CI)(
    'INT2: date fields are ISO strings or null',
    async () => {
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines(5);

      for (const article of result.articles) {
        if (article.publishedAt !== null) {
          const d = new Date(article.publishedAt);
          expect(isNaN(d.getTime())).toBe(false);
        }
      }
    },
    30_000,
  );

  it.skipIf(!IS_CI)(
    'INT3: confidence is HIGH for all articles',
    async () => {
      const scraper = new ReutersRssScraper();
      const result = await scraper.fetchHeadlines(5);

      for (const article of result.articles) {
        expect(article.confidence).toBe('HIGH');
      }
    },
    30_000,
  );
});
