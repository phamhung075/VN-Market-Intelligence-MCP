/**
 * ReutersRssScraper — PRIMARY path for Reuters news headlines
 *
 * Implements ReutersNewsPort via plain HTTP fetch + XML parse (shared
 * fetch/parse orchestration lives in ./rss-parse.ts — see that file for the
 * failure-handling contract and XML parsing strategy).
 * No browser, no Playwright. RAM: ~30–50 MB per scrape.
 *
 * Fallback (when error != null OR articles empty): reuters-stealth.ts
 * — that decision belongs to the use-case / cron dispatcher, not here.
 *
 * DDD: infrastructure layer — imports only from domain + sibling rss-parse.
 */

import type { ReutersNewsPort } from '../../domain/repositories.js';
import { NewsSource, type FetchResult } from '../../domain/models.js';
import { fetchRss } from './rss-parse.js';

/**
 * feeds.reuters.com was decommissioned in 2020 — DNS no longer resolves.
 * Replacement: Google News RSS search for "reuters business news", sourced from
 * reuters.com results. Returns ~100 items; no time restriction needed because
 * Google News naturally surfaces recent articles first.
 *
 * The `when:24h+allinurl:reuters.com` variant was tested and returned 0 items
 * (Google News query syntax changed). The keyword search reliably returns ≥ 50
 * Reuters-sourced articles and matches the same pattern used in the mcp-server
 * infrastructure/fetchers/reuters.ts fallback.
 */
const REUTERS_RSS_URL =
  'https://news.google.com/rss/search?q=reuters+business+news&ceid=US:en&hl=en-US&gl=US';

export class ReutersRssScraper implements ReutersNewsPort {
  async fetchHeadlines(maxItems: number = 15): Promise<FetchResult> {
    return fetchRss(REUTERS_RSS_URL, NewsSource.REUTERS, maxItems);
  }
}

// normalizeRfcDate extracted to src/primitive/published-at-parser/index.ts.
// Re-exported here for backward compatibility with existing tests.
export { parsePublishedAt as normalizeRfcDate } from '../../primitive/published-at-parser/index.js';
