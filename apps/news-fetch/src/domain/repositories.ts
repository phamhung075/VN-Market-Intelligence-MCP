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
 * Implementation: bloomberg-stealth.ts (Playwright stealth, PerimeterX passive bypass).
 */
export interface BloombergNewsPort {
  /**
   * Fetch the latest Bloomberg headlines.
   * @param maxItems - Maximum number of articles to return (default: 10).
   * @returns FetchResult envelope; error field is non-null on failure.
   */
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}
