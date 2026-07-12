/**
 * BloombergRssScraper — PRIMARY path for Bloomberg news headlines
 *
 * Bloomberg has no public RSS feed. bloomberg.com returns HTTP 403 on direct
 * scrape. `[data-component="headline"]` selector was the previous DOM approach
 * but Bloomberg's PerimeterX blocks Playwright on the first navigation —
 * resulting in articles: [] consistently.
 *
 * Solution (same pattern as Reuters):
 *   Google News RSS search for "bloomberg markets news" reliably returns
 *   Bloomberg-sourced articles from news.google.com without anti-bot blocking.
 *   Verified live 2026-05-17: ~100 items returned including Bloomberg.com URLs.
 *
 * Fallback (when error != null OR articles empty): bloomberg-stealth.ts
 *   — that decision belongs to handlers.ts, not here.
 *
 * Implements BloombergNewsPort via plain HTTP fetch + XML parse (shared
 * fetch/parse orchestration lives in ./rss-parse.ts — see that file for the
 * failure-handling contract and XML parsing strategy).
 * No browser, no Playwright. RAM: ~30–50 MB per scrape.
 *
 * DDD: infrastructure layer — imports only from domain + sibling rss-parse.
 */

import type { BloombergNewsPort } from '../../domain/repositories.js';
import { NewsSource, type FetchResult } from '../../domain/models.js';
import { fetchRss } from './rss-parse.js';

/**
 * Google News RSS for Bloomberg markets and finance news.
 *
 * The query "bloomberg markets finance" consistently returns articles sourced
 * from bloomberg.com (verified 2026-05-17, ~100 items per fetch).
 * Mirrors the reuters-rss.ts approach which replaced the dead feeds.reuters.com
 * endpoint with the same Google News RSS pattern.
 */
const BLOOMBERG_RSS_URL =
  'https://news.google.com/rss/search?q=bloomberg+markets+finance&ceid=US:en&hl=en-US&gl=US';

export class BloombergRssScraper implements BloombergNewsPort {
  async fetchHeadlines(maxItems: number = 10): Promise<FetchResult> {
    return fetchRss(BLOOMBERG_RSS_URL, NewsSource.BLOOMBERG, maxItems);
  }
}

// normalizeRfcDate extracted to src/primitive/published-at-parser/index.ts.
// Re-exported here for backward compatibility with existing tests.
export { parsePublishedAt as normalizeRfcDate } from '../../primitive/published-at-parser/index.js';
