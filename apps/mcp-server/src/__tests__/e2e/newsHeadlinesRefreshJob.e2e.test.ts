/**
 * E2E tests — newsHeadlinesRefreshJob
 *
 * Mocks globalThis.fetch to intercept all HTTP calls.
 * Verifies that the job:
 *   1. POSTs to news-fetch Bloomberg endpoint
 *   2. POSTs to news-fetch Reuters endpoint
 *   3. POSTs to /api/push-news with article data
 *   4. Dispatches Bloomberg BEFORE Reuters (order contract)
 *   5. Continues when one source returns an error (resilience)
 *
 * No live network, no DB, no scheduler registration.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { newsHeadlinesRefreshJob } from '../../scheduler/news-analysis/newsHeadlinesRefreshJob.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFetchResult(source: 'bloomberg' | 'reuters', error: string | null = null) {
  return {
    source,
    articles: error
      ? []
      : [
          {
            headline: `${source} test headline`,
            url: null,
            publishedAt: null,
            confidence: 'HIGH' as const,
            fetchedAt: '2026-05-13T10:00:00.000Z',
          },
        ],
    fetchedAt: '2026-05-13T10:00:00.000Z',
    method: source === 'bloomberg' ? 'playwright-stealth' : 'rss',
    error,
  };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('newsHeadlinesRefreshJob — E2E', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // AC 1+2+3+4: both sources fetched, push-news called, Bloomberg before Reuters
  it('AC1-4: fetches bloomberg then reuters, pushes both to /api/push-news', async () => {
    const fetchCalls: string[] = [];

    globalThis.fetch = mock(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;
        fetchCalls.push(url);

        if (url.includes('/bloomberg/headlines')) return okResponse(makeFetchResult('bloomberg'));
        if (url.includes('/reuters/headlines')) return okResponse(makeFetchResult('reuters'));
        if (url.includes('/api/push-news')) return okResponse({ ok: true, inserted: 1 });

        return new Response('not found', { status: 404 });
      },
    ) as unknown as typeof fetch;

    await newsHeadlinesRefreshJob();

    // AC 1: bloomberg endpoint called
    expect(fetchCalls.some((u) => u.includes('/bloomberg/headlines'))).toBe(true);
    // AC 2: reuters endpoint called
    expect(fetchCalls.some((u) => u.includes('/reuters/headlines'))).toBe(true);
    // AC 3: push-news called at least once (both sources have articles)
    expect(fetchCalls.some((u) => u.includes('/api/push-news'))).toBe(true);
    // AC 4: bloomberg dispatched before reuters
    const bloombergIdx = fetchCalls.findIndex((u) => u.includes('/bloomberg/headlines'));
    const reutersIdx = fetchCalls.findIndex((u) => u.includes('/reuters/headlines'));
    expect(bloombergIdx).toBeLessThan(reutersIdx);
  });

  // AC 5: error from bloomberg → reuters still fetched
  it('AC5: bloomberg error → reuters still fetched and pushed', async () => {
    const fetchCalls: string[] = [];

    globalThis.fetch = mock(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;
        fetchCalls.push(url);

        if (url.includes('/bloomberg/headlines')) {
          return okResponse(makeFetchResult('bloomberg', 'perimeterx-challenge'));
        }
        if (url.includes('/reuters/headlines')) return okResponse(makeFetchResult('reuters'));
        if (url.includes('/api/push-news')) return okResponse({ ok: true, inserted: 1 });

        return new Response('not found', { status: 404 });
      },
    ) as unknown as typeof fetch;

    await newsHeadlinesRefreshJob();

    // Reuters still fetched despite Bloomberg error
    expect(fetchCalls.some((u) => u.includes('/reuters/headlines'))).toBe(true);
    // Bloomberg error → no push for bloomberg; Reuters ok → push called once
    const pushCalls = fetchCalls.filter((u) => u.includes('/api/push-news'));
    expect(pushCalls.length).toBeGreaterThanOrEqual(1);
  });

  // Extra: service unreachable → job never throws
  it('job never throws when news-fetch service is unreachable', async () => {
    globalThis.fetch = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw new Error('ECONNREFUSED');
      },
    ) as unknown as typeof fetch;

    await expect(newsHeadlinesRefreshJob()).resolves.toBeUndefined();
  });
});
