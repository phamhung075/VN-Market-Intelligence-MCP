/**
 * ReutersStealthFallback — Playwright stealth scraper for Reuters headlines
 *
 * Anti-bot: DataDome (hard-block detection via captcha-delivery.com + x-dd-b: 3).
 * Stealth patch applied by PlaywrightBrowserFactory before page creation.
 *
 * FALLBACK path only — invoked when reuters-rss.ts returns error or 0 articles.
 * Primary path: reuters-rss.ts (RSS, no bot protection).
 *
 * Extraction strategy:
 *   DOM: article[data-testid="Article"] containers (confidence LOW — stealth
 *   JS-level effectiveness declining per technique doc, 2026).
 *
 * Browser lifecycle: caller-owned via PlaywrightBrowserFactory.launch().
 * MANDATORY: browser.close() in finally — RAM constraint (~400–500 MB per scrape).
 *
 * DDD: infra layer — imports only domain/* and ./playwright-browser-factory.
 */

import type { ReutersNewsPort } from '../../domain/repositories.js';
import { NewsSource, type Article, type FetchResult } from '../../domain/models.js';
import { PlaywrightBrowserFactory } from './playwright-browser-factory.js';
import { normalizeDate } from '../../primitive/published-at-parser/index.js';

// Re-exported for callers/tests importing normalizeDate directly from this module.
export { normalizeDate };

const REUTERS_BUSINESS_URL = 'https://www.reuters.com/business';
const PAGE_TIMEOUT_MS = 25_000;

export class ReutersStealthFallback implements ReutersNewsPort {
  async fetchHeadlines(maxItems: number = 15): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const { browser, page } = await PlaywrightBrowserFactory.launch();

    try {
      // Human simulation: random pre-nav pause 500–1500 ms
      const pauseMs = Math.random() * 1000 + 500;
      await new Promise<void>((r) => setTimeout(r, pauseMs));

      const response = await page.goto(REUTERS_BUSINESS_URL, {
        waitUntil: 'networkidle',
        timeout: PAGE_TIMEOUT_MS,
      });

      // DataDome hard-block detection via response header x-dd-b: 3
      const ddHeader = response?.headers()['x-dd-b'];
      if (ddHeader === '3') {
        console.warn('[reuters] datadome-block detected (x-dd-b: 3)');
        return {
          source: NewsSource.REUTERS,
          articles: [],
          fetchedAt,
          method: 'playwright-stealth',
          error: 'datadome-block',
        };
      }

      // DataDome captcha delivery page detection via body content
      const content = await page.content();
      if (content.includes('captcha-delivery.com')) {
        console.warn('[reuters] datadome-block detected (captcha-delivery.com)');
        return {
          source: NewsSource.REUTERS,
          articles: [],
          fetchedAt,
          method: 'playwright-stealth',
          error: 'datadome-block',
        };
      }

      // Human simulation: scroll to 33% then 50% of page
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.33);
      });
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.5);
      });

      // ── DOM extraction (LOW confidence — stealth heuristic) ───────────────
      const articles: Article[] = [];
      const articleElems = await page.locator('article[data-testid="Article"]').all();

      for (const elem of articleElems.slice(0, maxItems)) {
        const headline = (await elem.locator('[data-testid="Heading"]').textContent())?.trim() ?? '';
        if (!headline) continue;

        const linkLocator = elem.locator('a[href*="/article/"]').first();
        const rawHref = await linkLocator.getAttribute('href').catch(() => null);
        const url = rawHref ? `https://www.reuters.com${rawHref}` : null;

        const timeLocator = elem.locator('time[data-testid="DateLineTime"]').first();
        const datetime = await timeLocator.getAttribute('datetime').catch(() => null);

        articles.push({
          source: NewsSource.REUTERS,
          headline,
          url,
          publishedAt: normalizeDate(datetime),
          fetchedAt,
          confidence: 'LOW',
        });
      }

      return {
        source: NewsSource.REUTERS,
        articles,
        fetchedAt,
        method: 'playwright-stealth',
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        source: NewsSource.REUTERS,
        articles: [],
        fetchedAt,
        method: 'playwright-stealth',
        error: message,
      };
    } finally {
      await browser.close();
    }
  }
}
