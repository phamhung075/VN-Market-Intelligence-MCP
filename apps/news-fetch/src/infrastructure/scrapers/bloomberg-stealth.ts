/**
 * BloombergStealth — Playwright stealth scraper for Bloomberg headlines
 *
 * Anti-bot: PerimeterX passive phase (200 delivered on first load).
 * Stealth patch applied by PlaywrightBrowserFactory before page creation.
 *
 * Extraction strategy (ordered):
 *   1. DOM: [data-component="headline"] containers (confidence HIGH)
 *   2. JSON fallback: <script id="__NEXT_DATA__"> → props.pageProps.stories (confidence LOW)
 *
 * Browser lifecycle: caller-owned via PlaywrightBrowserFactory.launch().
 * MANDATORY: browser.close() in finally — RAM constraint (~400–500 MB per scrape).
 *
 * DDD: infra layer — imports only domain/* and ./playwright-browser-factory.
 */

import type { BloombergNewsPort } from '../../domain/repositories.js';
import { NewsSource, type Article, type FetchResult } from '../../domain/models.js';
import { PlaywrightBrowserFactory } from './playwright-browser-factory.js';
import { normalizeDate } from '../../primitive/published-at-parser/index.js';

// Re-exported for callers/tests importing normalizeDate directly from this module.
export { normalizeDate };

const BLOOMBERG_NEWS_URL = 'https://www.bloomberg.com/news';
const PAGE_TIMEOUT_MS = 30_000;

export class BloombergStealth implements BloombergNewsPort {
  async fetchHeadlines(maxItems: number = 10): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const { browser, page } = await PlaywrightBrowserFactory.launch();

    try {
      // Human simulation: random pre-nav pause 500–1500 ms
      const pauseMs = Math.random() * 1000 + 500;
      await new Promise<void>((r) => setTimeout(r, pauseMs));

      await page.goto(BLOOMBERG_NEWS_URL, {
        waitUntil: 'networkidle',
        timeout: PAGE_TIMEOUT_MS,
      });

      // Human simulation: scroll to 33% then 50% of page
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.33);
      });
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.5);
      });

      // PerimeterX challenge detection
      const content = await page.content();
      if (content.includes('px-block')) {
        console.warn('[bloomberg] PerimeterX challenge detected');
        return {
          source: NewsSource.BLOOMBERG,
          articles: [],
          fetchedAt,
          method: 'playwright-stealth',
          error: 'perimeterx-challenge',
        };
      }

      // ── DOM extraction (primary, HIGH confidence) ──────────────────────────
      const articles: Article[] = [];
      const containers = await page.locator('[data-component="headline"]').all();

      for (const container of containers.slice(0, maxItems)) {
        const headline = (await container.textContent())?.trim() ?? '';
        if (!headline) continue;

        const linkLocator = container.locator('a[href^="/news/articles/"]').first();
        const rawHref = await linkLocator.getAttribute('href').catch(() => null);
        const url = rawHref ? `https://www.bloomberg.com${rawHref}` : null;

        const timeLocator = container.locator('time[data-type="published-at"]').first();
        const datetime =
          (await timeLocator.getAttribute('data-value').catch(() => null)) ??
          (await timeLocator.getAttribute('datetime').catch(() => null));

        articles.push({
          source: NewsSource.BLOOMBERG,
          headline,
          url,
          publishedAt: normalizeDate(datetime),
          fetchedAt,
          confidence: 'HIGH',
        });
      }

      // ── JSON fallback (LOW confidence) — only when DOM yields nothing ──────
      if (articles.length === 0) {
        const scriptText = await page
          .locator('script#__NEXT_DATA__')
          .textContent()
          .catch(() => null);

        if (scriptText) {
          try {
            const data = JSON.parse(scriptText) as {
              props?: { pageProps?: { stories?: unknown[] } };
            };
            const stories = data?.props?.pageProps?.stories ?? [];
            for (const story of (stories as Record<string, unknown>[]).slice(0, maxItems)) {
              articles.push({
                source: NewsSource.BLOOMBERG,
                headline: typeof story['headline'] === 'string' ? story['headline'] : '',
                url: typeof story['url'] === 'string' ? story['url'] : null,
                publishedAt: normalizeDate(
                  typeof story['publishedAt'] === 'string' ? story['publishedAt'] : null,
                ),
                fetchedAt,
                confidence: 'LOW',
              });
            }
          } catch {
            // JSON parse failed — fall through with empty articles
          }
        }
      }

      return {
        source: NewsSource.BLOOMBERG,
        articles,
        fetchedAt,
        method: 'playwright-stealth',
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        source: NewsSource.BLOOMBERG,
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
