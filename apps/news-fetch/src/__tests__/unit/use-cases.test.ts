/**
 * Unit tests — FetchReutersHeadlinesUseCase + FetchBloombergHeadlinesUseCase
 *
 * Port interfaces injected as plain mocks — no infrastructure imports.
 * DDD: tests live in application layer boundary.
 *
 * Coverage (AC 1899a-tests):
 *   1. FetchReutersHeadlinesUseCase.execute() delegates to port.fetchHeadlines()
 *   2. maxItems passed through (default 15)
 *   3. FetchBloombergHeadlinesUseCase.execute() delegates to port.fetchHeadlines()
 *   4. maxItems passed through (default 10)
 *   5. Error propagation (port returns error → use case returns error)
 */

import { describe, it, expect, mock } from 'bun:test';
import { FetchReutersHeadlinesUseCase, FetchBloombergHeadlinesUseCase } from '../../application/use-cases.js';
import { NewsSource, type FetchResult } from '../../domain/models.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REUTERS_OK: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [],
  fetchedAt: '2026-05-13T10:00:00.000Z',
  method: 'rss',
  error: null,
};

const BLOOMBERG_OK: FetchResult = {
  source: NewsSource.BLOOMBERG,
  articles: [],
  fetchedAt: '2026-05-13T10:00:00.000Z',
  method: 'playwright-stealth',
  error: null,
};

const REUTERS_ERROR: FetchResult = {
  source: NewsSource.REUTERS,
  articles: [],
  fetchedAt: '2026-05-13T10:00:00.000Z',
  method: 'rss',
  error: 'http-503',
};

// ---------------------------------------------------------------------------
// FetchReutersHeadlinesUseCase
// ---------------------------------------------------------------------------

describe('FetchReutersHeadlinesUseCase', () => {
  // AC 1: delegates to port
  it('AC1: execute() delegates to port.fetchHeadlines()', async () => {
    const portFn = mock(async (_maxItems?: number) => REUTERS_OK);
    const port = { fetchHeadlines: portFn };
    const useCase = new FetchReutersHeadlinesUseCase(port);

    await useCase.execute(10);

    expect(portFn).toHaveBeenCalledTimes(1);
  });

  // AC 2: maxItems passed through
  it('AC2: passes explicit maxItems to port', async () => {
    const portFn = mock(async (_maxItems?: number) => REUTERS_OK);
    const port = { fetchHeadlines: portFn };
    const useCase = new FetchReutersHeadlinesUseCase(port);

    await useCase.execute(20);

    expect(portFn).toHaveBeenCalledWith(20);
  });

  it('AC2b: defaults to maxItems=15 when not provided', async () => {
    const portFn = mock(async (_maxItems?: number) => REUTERS_OK);
    const port = { fetchHeadlines: portFn };
    const useCase = new FetchReutersHeadlinesUseCase(port);

    await useCase.execute();

    expect(portFn).toHaveBeenCalledWith(15);
  });

  // AC 5: error propagation
  it('AC5: error from port propagated to caller', async () => {
    const port = { fetchHeadlines: mock(async (_?: number) => REUTERS_ERROR) };
    const useCase = new FetchReutersHeadlinesUseCase(port);

    const result = await useCase.execute(15);

    expect(result.error).toBe('http-503');
    expect(result.articles).toHaveLength(0);
  });

  it('returns the FetchResult from port unchanged', async () => {
    const port = { fetchHeadlines: mock(async (_?: number) => REUTERS_OK) };
    const result = await new FetchReutersHeadlinesUseCase(port).execute(15);

    expect(result.source).toBe(NewsSource.REUTERS);
    expect(result.method).toBe('rss');
  });
});

// ---------------------------------------------------------------------------
// FetchBloombergHeadlinesUseCase
// ---------------------------------------------------------------------------

describe('FetchBloombergHeadlinesUseCase', () => {
  // AC 3: delegates to port
  it('AC3: execute() delegates to port.fetchHeadlines()', async () => {
    const portFn = mock(async (_maxItems?: number) => BLOOMBERG_OK);
    const port = { fetchHeadlines: portFn };
    const useCase = new FetchBloombergHeadlinesUseCase(port);

    await useCase.execute(5);

    expect(portFn).toHaveBeenCalledTimes(1);
  });

  // AC 4: maxItems passed through (default 10)
  it('AC4: defaults to maxItems=10 when not provided', async () => {
    const portFn = mock(async (_maxItems?: number) => BLOOMBERG_OK);
    const port = { fetchHeadlines: portFn };
    const useCase = new FetchBloombergHeadlinesUseCase(port);

    await useCase.execute();

    expect(portFn).toHaveBeenCalledWith(10);
  });

  it('AC4b: passes explicit maxItems to port', async () => {
    const portFn = mock(async (_maxItems?: number) => BLOOMBERG_OK);
    const port = { fetchHeadlines: portFn };
    const useCase = new FetchBloombergHeadlinesUseCase(port);

    await useCase.execute(7);

    expect(portFn).toHaveBeenCalledWith(7);
  });

  it('returns FetchResult from port unchanged', async () => {
    const port = { fetchHeadlines: mock(async (_?: number) => BLOOMBERG_OK) };
    const result = await new FetchBloombergHeadlinesUseCase(port).execute(10);

    expect(result.source).toBe(NewsSource.BLOOMBERG);
    expect(result.method).toBe('playwright-stealth');
  });
});
