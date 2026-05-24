/**
 * news_ingest module — port interfaces
 *
 * Domain-only imports. Zero infrastructure imports.
 * DDD: module layer — composes via ports, never imports infrastructure directly.
 */

import type { Article } from '../../domain/models.js';
import type { NewsSource } from '../../domain/models.js';

/**
 * Port contract for the news ingest module.
 * Implemented by composeNewsIngest(); consumed by handlers.ts.
 */
export interface NewsIngestPort {
  ingestHeadlines(source: NewsSource, maxItems?: number): Promise<Article[]>;
}

/**
 * Adapter port injected into the module — implemented by scrapers in infrastructure.
 * The module calls this; it never imports scrapers directly.
 */
export interface NewsFetcherPort {
  fetchHeadlines(maxItems?: number): Promise<import('../../domain/models.js').FetchResult>;
}
