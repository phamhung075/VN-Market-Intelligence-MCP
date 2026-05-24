/**
 * Domain Models — news-fetch microservice
 *
 * Pure TypeScript: no infrastructure, application, or interface imports.
 * DDD root: all other layers import inward from this file.
 */

/** Identifies the news provider that produced an article. */
export enum NewsSource {
  REUTERS = 'reuters',
  BLOOMBERG = 'bloomberg',
}

/** A single scraped news article headline. */
export interface Article {
  /** Provider that scraped this article. */
  source: NewsSource;
  /** Headline text as scraped (untransformed). */
  headline: string;
  /** Article URL, or null when RSS feed omits the link element. */
  url: string | null;
  /** ISO 8601 timestamp from the source, or null if date is unparseable. */
  publishedAt: string | null;
  /** ISO 8601 timestamp set by the scraper at fetch time. */
  fetchedAt: string;
  /**
   * Confidence of the extraction method.
   * HIGH = structured DOM selector or RSS (predictable schema).
   * LOW  = Playwright heuristic or __NEXT_DATA__ fallback (fragile).
   */
  confidence: 'HIGH' | 'LOW';
}

/** Envelope returned by every scraper implementation. */
export interface FetchResult {
  /** Provider that was scraped. */
  source: NewsSource;
  /** Parsed articles (may be empty on partial/full failure). */
  articles: Article[];
  /** ISO 8601 timestamp set when the scrape completed. */
  fetchedAt: string;
  /** Technique used for this fetch cycle. */
  method: 'rss' | 'playwright-stealth' | 'module';
  /**
   * null on success.
   * Populated with a short error key on partial or full failure
   * (e.g. "datadome-block", "perimeterx-challenge", "http-error").
   */
  error: string | null;
}
