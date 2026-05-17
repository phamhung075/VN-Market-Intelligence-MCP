/**
 * Domain Port Interfaces — news-fetch microservice
 *
 * Pure TypeScript: imports only from ./models (domain root).
 * No infrastructure imports (fetch, playwright, database, etc.).
 * Infrastructure scrapers implement these interfaces via constructor injection.
 */

import type { FetchResult } from './models.js';

/**
 * Port contract for the Reuters news scraper.
 *
 * Primary implementation: reuters-rss.ts (RSS, no bot protection).
 * Fallback implementation: reuters-stealth.ts (Playwright stealth, DataDome).
 */
export interface ReutersNewsPort {
  /**
   * Fetch the latest Reuters headlines.
   * @param maxItems - Maximum number of articles to return (default: 15).
   * @returns FetchResult envelope; error field is non-null on failure.
   */
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}

/**
 * Port contract for the Bloomberg news scraper.
 *
 * Primary implementation: bloomberg-rss.ts (Google News RSS, no bot protection).
 *   bloomberg.com returns HTTP 403 on direct fetch; [data-component="headline"]
 *   DOM selector is stale (PerimeterX blocks Playwright → articles:[] always).
 *   Google News RSS for "bloomberg markets finance" returns ~100 Bloomberg-sourced
 *   articles without anti-bot blocking (verified 2026-05-17).
 *
 * Fallback implementation: bloomberg-stealth.ts (Playwright stealth, PerimeterX passive bypass).
 *   Invoked when RSS primary returns error or 0 articles.
 */
export interface BloombergNewsPort {
  /**
   * Fetch the latest Bloomberg headlines.
   * @param maxItems - Maximum number of articles to return (default: 10).
   * @returns FetchResult envelope; error field is non-null on failure.
   */
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}
