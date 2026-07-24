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

/**
 * Per-source default cap on the number of headlines a fetch returns when the
 * caller omits (or supplies an invalid) `maxItems` override.
 * Values unchanged from the original per-route handler literals.
 */
export const DEFAULT_MAX_ITEMS: Record<NewsSource, number> = {
  [NewsSource.REUTERS]: 15,
  [NewsSource.BLOOMBERG]: 10,
};

/**
 * Resolve the effective `maxItems` value from a raw request input.
 * - `number` (JSON body field) → used as-is, no NaN guard (mirrors legacy
 *   POST-handler behaviour: `typeof body.maxItems === 'number' ? body.maxItems : default`)
 * - `string` (querystring param) → parsed as base-10 int; falls back to the
 *   source's default when parsing yields NaN (mirrors legacy GET-handler behaviour)
 * - `undefined` → the source's default
 */
export function resolveMaxItems(raw: number | string | undefined, source: NewsSource): number {
  const fallback = DEFAULT_MAX_ITEMS[source];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
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
