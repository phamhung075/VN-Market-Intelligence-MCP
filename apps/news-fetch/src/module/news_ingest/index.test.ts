/**
 * Unit tests — news_ingest module stub
 *
 * RED phase: written before implementation.
 * All ports are mocked — no real scraper calls.
 */

import { describe, it, expect } from 'bun:test';
import { processArticleBatch, composeNewsIngest } from './index.js';
import type { NewsIngestPort, NewsFetcherPort } from './ports.js';
import type { Article, FetchResult } from '../../domain/models.js';
import { NewsSource } from '../../domain/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Partial<Article>): Article {
  return {
    source: NewsSource.REUTERS,
    headline: 'Test headline',
    url: null,
    publishedAt: '2026-05-13T14:30:00.000Z',
    fetchedAt: '2026-05-13T14:31:00.000Z',
    confidence: 'HIGH',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// processArticleBatch tests
// ---------------------------------------------------------------------------

describe('processArticleBatch', () => {
  it('normalizes headlines and deduplicates by key', () => {
    const articles: Article[] = [
      makeArticle({
        source: NewsSource.REUTERS,
        headline: 'Fed raises rates - Reuters',
        url: 'https://reuters.com/fed-rates',
      }),
      makeArticle({
        // Duplicate by URL
        source: NewsSource.REUTERS,
        headline: 'Fed raises rates - Reuters',
        url: 'https://reuters.com/fed-rates',
      }),
      makeArticle({
        source: NewsSource.BLOOMBERG,
        headline: 'Vietnam GDP grows in Q1 - Bloomberg',
        url: null,
      }),
    ];

    const result = processArticleBatch({ articles });
    expect(result.articleCount).toBe(2);
    expect(result.normalized).toBe(true);
    expect(result.deduped).toBe(true);
  });

  it('returns all articles when none are duplicates', () => {
    const articles: Article[] = [
      makeArticle({ url: 'https://reuters.com/a1', headline: 'Article One' }),
      makeArticle({ url: 'https://reuters.com/a2', headline: 'Article Two' }),
    ];
    const result = processArticleBatch({ articles });
    expect(result.articleCount).toBe(2);
  });

  it('handles empty article array', () => {
    const result = processArticleBatch({ articles: [] });
    expect(result.articleCount).toBe(0);
    expect(result.normalized).toBe(true);
    expect(result.deduped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// composeNewsIngest tests
// ---------------------------------------------------------------------------

describe('composeNewsIngest', () => {
  it('returns articles from primary fetcher when successful', async () => {
    const primaryArticles: Article[] = [
      makeArticle({ headline: 'Primary result - Reuters' }),
    ];
    const primaryResult: FetchResult = {
      source: NewsSource.REUTERS,
      articles: primaryArticles,
      fetchedAt: '2026-05-13T14:31:00.000Z',
      method: 'rss',
      error: null,
    };

    const mockPrimary: NewsFetcherPort = {
      fetchHeadlines: async () => primaryResult,
    };
    const mockFallback: NewsFetcherPort = {
      fetchHeadlines: async () => ({ ...primaryResult, articles: [], error: 'should not be called' }),
    };

    const port = composeNewsIngest(mockPrimary, mockFallback);
    const articles = await port.ingestHeadlines(NewsSource.REUTERS, 10);
    expect(articles.length).toBe(1);
  });

  it('falls back to fallback fetcher when primary returns error', async () => {
    const fallbackArticles: Article[] = [
      makeArticle({ headline: 'Fallback result - Reuters' }),
    ];
    const errorResult: FetchResult = {
      source: NewsSource.REUTERS,
      articles: [],
      fetchedAt: '2026-05-13T14:31:00.000Z',
      method: 'rss',
      error: 'http-503',
    };
    const fallbackResult: FetchResult = {
      source: NewsSource.REUTERS,
      articles: fallbackArticles,
      fetchedAt: '2026-05-13T14:31:00.000Z',
      method: 'playwright-stealth',
      error: null,
    };

    const mockPrimary: NewsFetcherPort = {
      fetchHeadlines: async () => errorResult,
    };
    const mockFallback: NewsFetcherPort = {
      fetchHeadlines: async () => fallbackResult,
    };

    const port = composeNewsIngest(mockPrimary, mockFallback);
    const articles = await port.ingestHeadlines(NewsSource.REUTERS, 10);
    expect(articles.length).toBe(1);
    expect(articles[0]!.headline).toContain('Fallback result');
  });

  it('falls back when primary returns empty articles', async () => {
    const emptyResult: FetchResult = {
      source: NewsSource.REUTERS,
      articles: [],
      fetchedAt: '2026-05-13T14:31:00.000Z',
      method: 'rss',
      error: null,
    };
    const fallbackArticles: Article[] = [makeArticle({ headline: 'Fallback' })];
    const fallbackResult: FetchResult = {
      ...emptyResult,
      articles: fallbackArticles,
      method: 'playwright-stealth',
    };

    const mockPrimary: NewsFetcherPort = { fetchHeadlines: async () => emptyResult };
    const mockFallback: NewsFetcherPort = { fetchHeadlines: async () => fallbackResult };

    const port = composeNewsIngest(mockPrimary, mockFallback);
    const articles = await port.ingestHeadlines(NewsSource.REUTERS, 10);
    expect(articles.length).toBe(1);
  });
});
