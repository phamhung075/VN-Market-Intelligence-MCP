/**
 * Route tests — /health + /reuters/headlines (1899a-routes)
 *
 * Coverage:
 *   1. GET /health — 200, correct JSON shape, content-type
 *   2. POST /reuters/headlines — RSS success (no fallback invoked, maxItems passed)
 *   3. POST /reuters/headlines — fallback: RSS error → Playwright invoked
 *   4. POST /reuters/headlines — fallback: RSS empty → Playwright invoked
 *   5. POST /reuters/headlines — defaults (no body → maxItems=15)
 *   6. POST /reuters/headlines — scraper throws → 500
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

const REUTERS_ERROR: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: 'http-503',
};

const REUTERS_EMPTY: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: null,
};

const REUTERS_FALLBACK_SUCCESS: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [
    {
      source: NewsSource.REUTERS,
      headline: 'Reuters fallback article',
      url: 'https://reuters.com/fallback',
      publishedAt: null,
      fetchedAt: '2026-05-13T09:00:00.000Z',
      confidence: 'LOW',
    },
  ],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'playwright-stealth',
  error: null,
};

const BLOOMBERG_RSS_STUB: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'rss',
  error: null,
};

const BLOOMBERG_STEALTH_STUB: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [],
  fetchedAt: '2026-05-13T09:00:00.000Z',
  method: 'playwright-stealth',
  error: null,
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const rssStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
const fallbackStub = (result: FetchResult) => ({ fetchHeadlines: mock(async (_?: number) => result) });
const bloombergRssStub = () => ({ fetchHeadlines: mock(async (_?: number) => BLOOMBERG_RSS_STUB) });
const bloombergStealthStub = () => ({ fetchHeadlines: mock(async (_?: number) => BLOOMBERG_STEALTH_STUB) });
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

describe('1899a-routes — GET /health', () => {
  it('returns 200', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    expect((await get(app, '/health')).status).toBe(200);
  });

  it('returns correct JSON shape', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    const body = (await (await get(app, '/health')).json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('news-fetch');
    expect(body.port).toBe(5008);
  });

  it('Content-Type is application/json', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    const res = await get(app, '/health');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('1899a-routes — POST /reuters/headlines success', () => {
  it('returns 200 with response', async () => {
    const app = createRouter(rssStub(REUTERS_SUCCESS), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    const res = await post(app, '/reuters/headlines', { maxItems: 5 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FetchResult;
    // method is 'module' since P1-C — fallback chain moved to news_ingest module
    expect(body.method).toBe('module');
    expect(body.error).toBeNull();
  });

  it('RSS success — fallback NOT invoked', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const fb = fallbackStub(REUTERS_FALLBACK_SUCCESS);
    const app = createRouter(rss, fb, bloombergRssStub(), bloombergStealthStub());
    await post(app, '/reuters/headlines', { maxItems: 5 });
    expect(fb.fetchHeadlines).not.toHaveBeenCalled();
  });

  it('passes maxItems to RSS port', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const app = createRouter(rss, fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    await post(app, '/reuters/headlines', { maxItems: 7 });
    expect(rss.fetchHeadlines).toHaveBeenCalledWith(7);
  });

  it('defaults maxItems to 15 when body omitted', async () => {
    const rss = rssStub(REUTERS_SUCCESS);
    const app = createRouter(rss, fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    await post(app, '/reuters/headlines');
    expect(rss.fetchHeadlines).toHaveBeenCalledWith(15);
  });
});

describe('1899a-routes — POST /reuters/headlines fallback: RSS error', () => {
  it('returns 200 when RSS error != null (fallback invoked)', async () => {
    const app = createRouter(rssStub(REUTERS_ERROR), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    const res = await post(app, '/reuters/headlines', { maxItems: 5 });
    // method is 'module' since P1-C — fallback orchestration in news_ingest module
    const body = (await res.json()) as FetchResult;
    expect(body.method).toBe('module');
  });

  it('invokes fallback when RSS error != null', async () => {
    const fb = fallbackStub(REUTERS_FALLBACK_SUCCESS);
    const app = createRouter(rssStub(REUTERS_ERROR), fb, bloombergRssStub(), bloombergStealthStub());
    await post(app, '/reuters/headlines', { maxItems: 5 });
    expect(fb.fetchHeadlines).toHaveBeenCalled();
  });
});

describe('1899a-routes — POST /reuters/headlines fallback: RSS empty', () => {
  it('returns 200 when RSS articles.length === 0 (fallback invoked)', async () => {
    const app = createRouter(rssStub(REUTERS_EMPTY), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    const res = await post(app, '/reuters/headlines', { maxItems: 5 });
    // method is 'module' since P1-C — fallback orchestration in news_ingest module
    const body = (await res.json()) as FetchResult;
    expect(body.method).toBe('module');
  });

  it('invokes fallback when RSS articles.length === 0', async () => {
    const fb = fallbackStub(REUTERS_FALLBACK_SUCCESS);
    const app = createRouter(rssStub(REUTERS_EMPTY), fb, bloombergRssStub(), bloombergStealthStub());
    await post(app, '/reuters/headlines', { maxItems: 5 });
    expect(fb.fetchHeadlines).toHaveBeenCalled();
  });
});

describe('1899a-routes — POST /reuters/headlines error handling', () => {
  it('returns 500 JSON when Reuters scraper throws', async () => {
    const app = createRouter(throwingStub('network timeout'), fallbackStub(REUTERS_FALLBACK_SUCCESS), bloombergRssStub(), bloombergStealthStub());
    const res = await post(app, '/reuters/headlines', { maxItems: 5 });
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(typeof body.fetchedAt).toBe('string');
  });
});
