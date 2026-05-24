/**
 * Route tests — /bloomberg/headlines + GET aliases (1899a-routes)
 *
 * Coverage:
 *   1. POST /bloomberg/headlines — RSS success (maxItems passed, source correct)
 *   2. POST /bloomberg/headlines — RSS success → stealth NOT invoked
 *   3. POST /bloomberg/headlines — RSS error → stealth fallback invoked
 *   4. POST /bloomberg/headlines — RSS empty → stealth fallback invoked
 *   5. POST /bloomberg/headlines — defaults (no body → maxItems=10)
 *   6. POST /bloomberg/headlines — RSS scraper throws → 500
 *   7. GET  /reuters/headlines — GET alias (maxItems querystring + default)
 *   8. GET  /bloomberg/headlines — GET alias (maxItems querystring + default)
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

const BLOOMBERG_RSS_SUCCESS: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [
    {
      source: NewsSource.BLOOMBERG,
      headline: 'Fed signals rate pause',
      url: 'https://news.google.com/rss/articles/1',
      publishedAt: '2026-05-13T07:00:00.000Z',
      fetchedAt: '2026-05-13T09:00:00.000Z',
      confidence: 'HIGH',
    },
  ],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: null,
};

const BLOOMBERG_RSS_EMPTY: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: null,
};

const BLOOMBERG_RSS_ERROR: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: 'http-503',
};

const BLOOMBERG_STEALTH_SUCCESS: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [
    {
      source: NewsSource.BLOOMBERG,
      headline: 'Stealth fallback headline',
      url: 'https://bloomberg.com/news/articles/stealth',
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
const bloombergRssStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
const bloombergStealthStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
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

describe('1899a-routes — POST /bloomberg/headlines RSS success', () => {
  it('returns 200 when RSS succeeds', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    const res = await post(app, '/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FetchResult;
    expect(body.source).toBe(NewsSource.BLOOMBERG);
    // method is 'module' since P1-C — fallback chain moved to news_ingest module
    expect(body.method).toBe('module');
    expect(body.articles.length).toBeGreaterThan(0);
  });

  it('stealth fallback NOT invoked when RSS succeeds', async () => {
    const stealth = bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), stealth);
    await post(app, '/bloomberg/headlines', { maxItems: 5 });
    expect(stealth.fetchHeadlines).not.toHaveBeenCalled();
  });

  it('passes maxItems to RSS port', async () => {
    const bbRss = bloombergRssStub(BLOOMBERG_RSS_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bbRss, bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    await post(app, '/bloomberg/headlines', { maxItems: 4 });
    expect(bbRss.fetchHeadlines).toHaveBeenCalledWith(4);
  });

  it('defaults maxItems to 10 when body omitted', async () => {
    const bbRss = bloombergRssStub(BLOOMBERG_RSS_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bbRss, bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    await post(app, '/bloomberg/headlines');
    expect(bbRss.fetchHeadlines).toHaveBeenCalledWith(10);
  });
});

describe('1899a-routes — POST /bloomberg/headlines RSS error → stealth fallback', () => {
  it('invokes stealth fallback when RSS returns error', async () => {
    const stealth = bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_ERROR), stealth);
    const res = await post(app, '/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    expect(stealth.fetchHeadlines).toHaveBeenCalledWith(5);
    const body = (await res.json()) as FetchResult;
    // method is 'module' since P1-C — fallback orchestration in news_ingest module
    expect(body.method).toBe('module');
  });

  it('invokes stealth fallback when RSS returns 0 articles', async () => {
    const stealth = bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_EMPTY), stealth);
    const res = await post(app, '/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    expect(stealth.fetchHeadlines).toHaveBeenCalledWith(5);
  });

  it('returns 200 with empty articles when stealth also fails', async () => {
    // P1-C: module abstracts FetchResult; stealth scraper errors are not propagated to HTTP response.
    // error field is always null at HTTP layer (module returns Article[] only).
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_ERROR), bloombergStealthStub(BLOOMBERG_ERROR));
    const res = await post(app, '/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FetchResult;
    expect(body.articles).toHaveLength(0);
  });
});

describe('1899a-routes — POST /bloomberg/headlines error handling', () => {
  it('returns 500 JSON when Bloomberg RSS scraper throws', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), throwingStub('bloomberg timeout'), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    const res = await post(app, '/bloomberg/headlines', { maxItems: 5 });
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(typeof body.fetchedAt).toBe('string');
  });
});

describe('1899a-routes — GET /reuters/headlines alias', () => {
  it('returns 200', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    expect((await get(app, '/reuters/headlines')).status).toBe(200);
  });

  it('returns FetchResult with REUTERS source', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    const body = (await (await get(app, '/reuters/headlines')).json()) as FetchResult;
    expect(body.source).toBe(NewsSource.REUTERS);
  });

  it('passes maxItems from querystring', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const app = createRouter(rss, fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    await get(app, '/reuters/headlines?maxItems=3');
    expect(rss.fetchHeadlines).toHaveBeenCalledWith(3);
  });

  it('defaults maxItems to 15 when querystring absent', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const app = createRouter(rss, fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    await get(app, '/reuters/headlines');
    expect(rss.fetchHeadlines).toHaveBeenCalledWith(15);
  });
});

describe('1899a-routes — GET /bloomberg/headlines alias', () => {
  it('returns 200', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    expect((await get(app, '/bloomberg/headlines')).status).toBe(200);
  });

  it('returns FetchResult with BLOOMBERG source', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bloombergRssStub(BLOOMBERG_RSS_SUCCESS), bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    const body = (await (await get(app, '/bloomberg/headlines')).json()) as FetchResult;
    expect(body.source).toBe(NewsSource.BLOOMBERG);
  });

  it('passes maxItems from querystring to RSS port', async () => {
    const bbRss = bloombergRssStub(BLOOMBERG_RSS_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bbRss, bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    await get(app, '/bloomberg/headlines?maxItems=6');
    expect(bbRss.fetchHeadlines).toHaveBeenCalledWith(6);
  });

  it('defaults maxItems to 10 when querystring absent', async () => {
    const bbRss = bloombergRssStub(BLOOMBERG_RSS_SUCCESS);
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK), bbRss, bloombergStealthStub(BLOOMBERG_STEALTH_SUCCESS));
    await get(app, '/bloomberg/headlines');
    expect(bbRss.fetchHeadlines).toHaveBeenCalledWith(10);
  });
});
