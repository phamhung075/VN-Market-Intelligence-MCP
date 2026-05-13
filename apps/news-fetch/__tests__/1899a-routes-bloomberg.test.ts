/**
 * Route tests — /news/bloomberg/headlines + GET aliases (1899a-routes)
 *
 * Coverage:
 *   1. POST /news/bloomberg/headlines — success (maxItems passed, source correct)
 *   2. POST /news/bloomberg/headlines — error result returned as-is (no fallback)
 *   3. POST /news/bloomberg/headlines — defaults (no body → maxItems=10)
 *   4. POST /news/bloomberg/headlines — scraper throws → 500
 *   5. GET  /news/reuters/headlines — GET alias (maxItems querystring + default)
 *   6. GET  /news/bloomberg/headlines — GET alias (maxItems querystring + default)
 */

import { describe, it, expect, mock } from 'bun:test';
import { NewsSource, type FetchResult } from '../src/domain/models.js';
import { createRouter } from '../src/interface/handlers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REUTERS_SUCCESS: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [
    {
      source: NewsSource.REUTERS,
      headline: 'Vietnam GDP beats forecast',
      url: 'https://reuters.com/1',
      publishedAt: '2026-05-13T08:00:00.000Z',
      fetchedAt: '2026-05-13T09:00:00.000Z',
      confidence: 'HIGH',
    },
  ],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: null,
};

const REUTERS_FALLBACK: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'playwright-stealth',
  error: null,
};

const BLOOMBERG_SUCCESS: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [
    {
      source: NewsSource.BLOOMBERG,
      headline: 'Fed signals rate pause',
      url: 'https://bloomberg.com/news/articles/1',
      publishedAt: '2026-05-13T07:00:00.000Z',
      fetchedAt: '2026-05-13T09:00:00.000Z',
      confidence: 'HIGH',
    },
  ],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'playwright-stealth',
  error: null,
};

const BLOOMBERG_ERROR: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'playwright-stealth',
  error: 'perimeterx-challenge',
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const rssStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
const fallbackStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
const bloombergStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
const throwingStub = (msg: string) => ({
  fetchHeadlines: mock(async (_?: number) => { throw new Error(msg); }),
});

async function post(app: ReturnType<typeof createRouter>, path: string, body?: unknown): Promise<Response> {
  return app.fetch(new Request(`http://localhost:5008${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

async function get(app: ReturnType<typeof createRouter>, path: string): Promise<Response> {
  return app.fetch(new Request(`http://localhost:5008${path}`));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('1899a-routes — POST /news/bloomberg/headlines success', () => {
  it('returns 200 with FetchResult', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    const res = await post(app, '/news/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FetchResult;
    expect(body.source).toBe(NewsSource.BLOOMBERG);
    expect(body.method).toBe('playwright-stealth');
  });

  it('passes maxItems to Bloomberg port', async () => {
    const bb = bloombergStub(BLOOMBERG_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bb);
    await post(app, '/news/bloomberg/headlines', { maxItems: 4 });
    expect(bb.fetchHeadlines).toHaveBeenCalledWith(4);
  });

  it('defaults maxItems to 10 when body omitted', async () => {
    const bb = bloombergStub(BLOOMBERG_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bb);
    await post(app, '/news/bloomberg/headlines');
    expect(bb.fetchHeadlines).toHaveBeenCalledWith(10);
  });
});

describe('1899a-routes — POST /news/bloomberg/headlines error (no fallback)', () => {
  it('returns Bloomberg error result as-is', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_ERROR));
    const res = await post(app, '/news/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FetchResult;
    expect(body.error).toBe('perimeterx-challenge');
    expect(body.articles).toHaveLength(0);
  });
});

describe('1899a-routes — POST /news/bloomberg/headlines error handling', () => {
  it('returns 500 JSON when Bloomberg scraper throws', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), throwingStub('bloomberg timeout'));
    const res = await post(app, '/news/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(typeof body.fetchedAt).toBe('string');
  });
});

describe('1899a-routes — GET /news/reuters/headlines alias', () => {
  it('returns 200', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    expect((await get(app, '/news/reuters/headlines')).status).toBe(200);
  });

  it('returns FetchResult with REUTERS source', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    const body = (await (await get(app, '/news/reuters/headlines')).json()) as FetchResult;
    expect(body.source).toBe(NewsSource.REUTERS);
  });

  it('passes maxItems from querystring', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const app = createRouter(rss, fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    await get(app, '/news/reuters/headlines?maxItems=3');
    expect(rss.fetchHeadlines).toHaveBeenCalledWith(3);
  });

  it('defaults maxItems to 15 when querystring absent', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const app = createRouter(rss, fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    await get(app, '/news/reuters/headlines');
    expect(rss.fetchHeadlines).toHaveBeenCalledWith(15);
  });
});

describe('1899a-routes — GET /news/bloomberg/headlines alias', () => {
  it('returns 200', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    expect((await get(app, '/news/bloomberg/headlines')).status).toBe(200);
  });

  it('returns FetchResult with BLOOMBERG source', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergStub(BLOOMBERG_SUCCESS));
    const body = (await (await get(app, '/news/bloomberg/headlines')).json()) as FetchResult;
    expect(body.source).toBe(NewsSource.BLOOMBERG);
  });

  it('passes maxItems from querystring', async () => {
    const bb = bloombergStub(BLOOMBERG_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bb);
    await get(app, '/news/bloomberg/headlines?maxItems=6');
    expect(bb.fetchHeadlines).toHaveBeenCalledWith(6);
  });

  it('defaults maxItems to 10 when querystring absent', async () => {
    const bb = bloombergStub(BLOOMBERG_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bb);
    await get(app, '/news/bloomberg/headlines');
    expect(bb.fetchHeadlines).toHaveBeenCalledWith(10);
  });
});
