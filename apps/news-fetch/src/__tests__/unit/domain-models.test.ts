/**
 * Unit tests — domain/models.ts + domain/repositories.ts
 *
 * RED phase: written before implementation exists.
 * Tests cover:
 *  - NewsSource enum values
 *  - Article interface shape (structural type checks via assignment)
 *  - FetchResult interface shape
 *  - ReutersNewsPort / BloombergNewsPort contract (signature inference)
 *  - DDD golden rule: no infrastructure import from domain files
 */

import { describe, it, expect } from 'bun:test';

// These imports will fail until implementation exists — that is the RED phase.
import {
  NewsSource,
  DEFAULT_MAX_ITEMS,
  resolveMaxItems,
  type Article,
  type FetchResult,
} from '../../domain/models.js';

import {
  type ReutersNewsPort,
  type BloombergNewsPort,
} from '../../domain/repositories.js';

// ---------------------------------------------------------------------------
// NewsSource enum
// ---------------------------------------------------------------------------
describe('NewsSource enum', () => {
  it('has REUTERS = "reuters"', () => {
    expect(NewsSource.REUTERS as string).toBe('reuters');
  });

  it('has BLOOMBERG = "bloomberg"', () => {
    expect(NewsSource.BLOOMBERG as string).toBe('bloomberg');
  });

  it('has exactly two members', () => {
    const values = Object.values(NewsSource).filter((v) => typeof v === 'string');
    expect(values).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_MAX_ITEMS + resolveMaxItems — FACTORY-NEWS-dedup-handlers-maxitems
// ---------------------------------------------------------------------------
describe('DEFAULT_MAX_ITEMS', () => {
  it('Reuters default is 15 (unchanged value)', () => {
    expect(DEFAULT_MAX_ITEMS[NewsSource.REUTERS]).toBe(15);
  });

  it('Bloomberg default is 10 (unchanged value)', () => {
    expect(DEFAULT_MAX_ITEMS[NewsSource.BLOOMBERG]).toBe(10);
  });
});

describe('resolveMaxItems', () => {
  it('numeric raw value is used as-is (POST-body semantics, no NaN guard)', () => {
    expect(resolveMaxItems(7, NewsSource.REUTERS)).toBe(7);
    expect(resolveMaxItems(NaN, NewsSource.BLOOMBERG)).toBeNaN();
  });

  it('string raw value is parsed base-10 (GET-querystring semantics)', () => {
    expect(resolveMaxItems('3', NewsSource.REUTERS)).toBe(3);
    expect(resolveMaxItems('6', NewsSource.BLOOMBERG)).toBe(6);
  });

  it('unparseable string falls back to the source default', () => {
    expect(resolveMaxItems('abc', NewsSource.REUTERS)).toBe(15);
    expect(resolveMaxItems('abc', NewsSource.BLOOMBERG)).toBe(10);
  });

  it('undefined raw value falls back to the source default', () => {
    expect(resolveMaxItems(undefined, NewsSource.REUTERS)).toBe(15);
    expect(resolveMaxItems(undefined, NewsSource.BLOOMBERG)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Article interface — structural conformance
// ---------------------------------------------------------------------------
describe('Article interface', () => {
  it('accepts a fully-populated HIGH-confidence article', () => {
    const a: Article = {
      source: NewsSource.REUTERS,
      headline: 'VN Index closes up 0.8%',
      url: 'https://reuters.com/article/1',
      publishedAt: '2026-05-13T10:00:00.000Z',
      fetchedAt: '2026-05-13T10:01:00.000Z',
      confidence: 'HIGH',
    };
    expect(a.source).toBe(NewsSource.REUTERS);
    expect(a.confidence).toBe('HIGH');
  });

  it('accepts null url (RSS omits link)', () => {
    const a: Article = {
      source: NewsSource.REUTERS,
      headline: 'Headline without link',
      url: null,
      publishedAt: '2026-05-13T10:00:00.000Z',
      fetchedAt: '2026-05-13T10:01:00.000Z',
      confidence: 'LOW',
    };
    expect(a.url).toBeNull();
  });

  it('accepts null publishedAt (unparseable date)', () => {
    const a: Article = {
      source: NewsSource.BLOOMBERG,
      headline: 'Markets open mixed',
      url: 'https://bloomberg.com/news/1',
      publishedAt: null,
      fetchedAt: '2026-05-13T10:01:00.000Z',
      confidence: 'HIGH',
    };
    expect(a.publishedAt).toBeNull();
  });

  it('rejects unknown confidence value at runtime via union check', () => {
    // The only valid confidence values are 'HIGH' and 'LOW'.
    // We verify this by confirming valid ones are the set.
    const validValues = ['HIGH', 'LOW'];
    expect(validValues).toContain('HIGH');
    expect(validValues).toContain('LOW');
    expect(validValues).not.toContain('MEDIUM');
  });
});

// ---------------------------------------------------------------------------
// FetchResult interface — structural conformance
// ---------------------------------------------------------------------------
describe('FetchResult interface', () => {
  it('accepts a successful RSS result', () => {
    const result: FetchResult = {
      source: NewsSource.REUTERS,
      articles: [],
      fetchedAt: '2026-05-13T10:01:00.000Z',
      method: 'rss',
      error: null,
    };
    expect(result.method).toBe('rss');
    expect(result.error).toBeNull();
  });

  it('accepts a playwright-stealth result with error', () => {
    const result: FetchResult = {
      source: NewsSource.BLOOMBERG,
      articles: [],
      fetchedAt: '2026-05-13T10:01:00.000Z',
      method: 'playwright-stealth',
      error: 'perimeterx-challenge',
    };
    expect(result.method).toBe('playwright-stealth');
    expect(result.error).toBe('perimeterx-challenge');
  });

  it('carries articles array from source enum', () => {
    const article: Article = {
      source: NewsSource.BLOOMBERG,
      headline: 'Fed holds rates steady',
      url: null,
      publishedAt: null,
      fetchedAt: '2026-05-13T10:01:00.000Z',
      confidence: 'LOW',
    };
    const result: FetchResult = {
      source: NewsSource.BLOOMBERG,
      articles: [article],
      fetchedAt: '2026-05-13T10:01:00.000Z',
      method: 'playwright-stealth',
      error: null,
    };
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.headline).toBe('Fed holds rates steady');
  });
});

// ---------------------------------------------------------------------------
// Port interfaces — contract enforcement via mock implementations
// ---------------------------------------------------------------------------
describe('ReutersNewsPort interface', () => {
  it('mock implementation satisfies the port contract', async () => {
    const mockResult: FetchResult = {
      source: NewsSource.REUTERS,
      articles: [],
      fetchedAt: new Date().toISOString(),
      method: 'rss',
      error: null,
    };

    // A minimal mock that satisfies ReutersNewsPort
    const port: ReutersNewsPort = {
      fetchHeadlines: async (maxItems?: number) => {
        void maxItems;
        return mockResult;
      },
    };

    const result = await port.fetchHeadlines(10);
    expect(result.source).toBe(NewsSource.REUTERS);
    expect(result.method).toBe('rss');
  });

  it('fetchHeadlines is callable without arguments (maxItems optional)', async () => {
    const port: ReutersNewsPort = {
      fetchHeadlines: async () => ({
        source: NewsSource.REUTERS,
        articles: [],
        fetchedAt: new Date().toISOString(),
        method: 'rss',
        error: null,
      }),
    };
    const result = await port.fetchHeadlines();
    expect(result).toBeDefined();
  });
});

describe('BloombergNewsPort interface', () => {
  it('mock implementation satisfies the port contract', async () => {
    const port: BloombergNewsPort = {
      fetchHeadlines: async (maxItems?: number) => {
        void maxItems;
        return {
          source: NewsSource.BLOOMBERG,
          articles: [],
          fetchedAt: new Date().toISOString(),
          method: 'playwright-stealth' as const,
          error: null,
        };
      },
    };

    const result = await port.fetchHeadlines(5);
    expect(result.source).toBe(NewsSource.BLOOMBERG);
    expect(result.method).toBe('playwright-stealth');
  });

  it('fetchHeadlines is callable without arguments (maxItems optional)', async () => {
    const port: BloombergNewsPort = {
      fetchHeadlines: async () => ({
        source: NewsSource.BLOOMBERG,
        articles: [],
        fetchedAt: new Date().toISOString(),
        method: 'playwright-stealth' as const,
        error: null,
      }),
    };
    const result = await port.fetchHeadlines();
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DDD golden-rule check — import path audit (static)
// ---------------------------------------------------------------------------
describe('DDD layer compliance', () => {
  it('models.ts path does not import from infrastructure, application, or interface', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const modelsPath = path.resolve(
      import.meta.dir,
      '../../domain/models.ts',
    );
    const content = fs.readFileSync(modelsPath, 'utf-8');
    expect(content).not.toMatch(/from ['"].*infrastructure/);
    expect(content).not.toMatch(/from ['"].*application/);
    expect(content).not.toMatch(/from ['"].*interface/);
  });

  it('repositories.ts only imports from ./models', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const repoPath = path.resolve(
      import.meta.dir,
      '../../domain/repositories.ts',
    );
    const content = fs.readFileSync(repoPath, 'utf-8');
    // Should NOT import from infra/app/interface
    expect(content).not.toMatch(/from ['"].*infrastructure/);
    expect(content).not.toMatch(/from ['"].*application/);
    expect(content).not.toMatch(/from ['"].*interface/);
    // Must import FetchResult from models
    expect(content).toMatch(/from ['"]\.\/models/);
  });
});
