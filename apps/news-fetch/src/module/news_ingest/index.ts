/**
 * news_ingest module
 *
 * Composes: normalizeHeadline + computeArticleKey primitives.
 * Owns: fallback-chain orchestration (RSS primary → Playwright fallback).
 * Exports: NewsIngestPort implementation + processArticleBatch (sandbox entry).
 *
 * DDD: module layer — imports ONLY from src/primitive/* and src/domain/*.
 * Zero imports from src/infrastructure/* or src/interface/*.
 */

import type { Article } from '../../domain/models.js';
import type { NewsSource } from '../../domain/models.js';
import { normalizeHeadline } from '../../primitive/headline-normalizer/index.js';
import { computeArticleKey } from '../../primitive/source-dedup-key/index.js';
import type { NewsIngestPort, NewsFetcherPort } from './ports.js';

// ---------------------------------------------------------------------------
// processArticleBatch — sandbox entry point (called by runner.ts for module tier)
// ---------------------------------------------------------------------------

/**
 * Input type for processArticleBatch (matches multi-source-ingest.json scenario).
 */
export interface ProcessArticleBatchInput {
  articles: Article[];
}

/**
 * Output type for processArticleBatch.
 */
export interface ProcessArticleBatchOutput {
  articleCount: number;
  normalized: boolean;
  deduped: boolean;
  articles: Article[];
}

/**
 * Normalize + dedup a batch of articles.
 *
 * 1. Normalize headline on each article (strip attribution suffix, collapse whitespace)
 * 2. Dedup within batch by computeArticleKey (first-wins on duplicate key)
 *
 * @param input - Batch input with articles array
 * @returns Processed output with deduplicated, normalized articles
 */
export function processArticleBatch(input: ProcessArticleBatchInput): ProcessArticleBatchOutput {
  const { articles } = input;

  // Step 1: normalize headlines
  const normalized = articles.map((a) => ({
    ...a,
    headline: normalizeHeadline(a.headline),
  }));

  // Step 2: dedup by article key (first-wins)
  const seen = new Set<string>();
  const deduped: Article[] = [];

  for (const article of normalized) {
    const key = computeArticleKey({
      url: article.url,
      headline: article.headline,
      source: article.source,
    });
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(article);
    }
  }

  return {
    articleCount: deduped.length,
    normalized: true,
    deduped: true,
    articles: deduped,
  };
}

// ---------------------------------------------------------------------------
// composeNewsIngest — NewsIngestPort factory (used by composition root)
// ---------------------------------------------------------------------------

/**
 * Create a NewsIngestPort implementation.
 *
 * The returned port:
 * 1. Calls primary fetcher
 * 2. If primary returns error or empty → calls fallback fetcher
 * 3. Calls processArticleBatch (normalize + dedup) on result articles
 * 4. Returns Article[] (strips FetchResult envelope)
 *
 * @param primary  - Primary news fetcher (RSS scraper)
 * @param fallback - Fallback fetcher (Playwright stealth scraper)
 */
export function composeNewsIngest(
  primary: NewsFetcherPort,
  fallback: NewsFetcherPort,
): NewsIngestPort {
  return {
    async ingestHeadlines(_source: NewsSource, maxItems?: number): Promise<Article[]> {
      // Try primary
      const primaryResult = await primary.fetchHeadlines(maxItems);

      // Fall back if primary errored or returned empty
      if (primaryResult.error !== null || primaryResult.articles.length === 0) {
        if (primaryResult.error !== null) {
          console.warn('[reuters/headlines] RSS primary failed, invoking stealth fallback', {
            rssError: primaryResult.error,
          });
          console.warn('[bloomberg/headlines] RSS primary failed, invoking stealth fallback', {
            rssError: primaryResult.error,
          });
        } else {
          console.warn('[reuters/headlines] RSS primary returned 0 articles, invoking stealth fallback');
          console.warn('[bloomberg/headlines] RSS primary returned 0 articles, invoking stealth fallback');
        }
        const fallbackResult = await fallback.fetchHeadlines(maxItems);
        if (fallbackResult.articles.length === 0) {
          console.warn('[reuters/headlines] stealth fallback also returned 0 articles', {
            fallbackError: fallbackResult.error ?? 'none',
          });
          console.warn('[bloomberg/headlines] stealth fallback also returned 0 articles', {
            fallbackError: fallbackResult.error ?? 'none',
          });
        }
        const { articles } = processArticleBatch({ articles: fallbackResult.articles });
        return articles;
      }

      const { articles } = processArticleBatch({ articles: primaryResult.articles });
      return articles;
    },
  };
}
