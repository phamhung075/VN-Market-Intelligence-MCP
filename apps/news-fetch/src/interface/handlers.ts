/**
 * News Fetch Microservice — Hono HTTP Router
 *
 * Routes:
 *   GET  /health                    → liveness probe
 *   POST /reuters/headlines         → Reuters RSS primary + Playwright fallback
 *   GET  /reuters/headlines         → convenience GET alias
 *   POST /bloomberg/headlines       → Bloomberg Playwright only (no fallback)
 *   GET  /bloomberg/headlines       → convenience GET alias
 *
 * DDD: interface layer — imports from application/ (use cases) only.
 * Scrapers are injected via createRouter() to enable unit testing without
 * launching real browsers.
 *
 * Fallback logic (Reuters only):
 *   1. RSS primary  → if error != null OR articles.length === 0
 *   2. Playwright fallback  → return fallback result regardless
 *   Bloomberg: single path, error result returned as-is.
 */

import { Hono } from 'hono';
import type { ReutersNewsPort, BloombergNewsPort } from '../domain/repositories.js';
import { FetchReutersHeadlinesUseCase } from '../application/use-cases.js';
import { FetchBloombergHeadlinesUseCase } from '../application/use-cases.js';
import type { FetchResult } from '../domain/models.js';

// ---------------------------------------------------------------------------
// Router factory — accepts injected ports for testability
// ---------------------------------------------------------------------------

/**
 * Build and return a Hono router with all 5 news-fetch routes wired.
 *
 * @param rssPort       Primary Reuters adapter (ReutersRssScraper in production)
 * @param fallbackPort  Fallback Reuters adapter (ReutersStealthFallback in production)
 * @param bloombergPort Bloomberg adapter (BloombergStealth in production)
 */
export function createRouter(
  rssPort: ReutersNewsPort,
  fallbackPort: ReutersNewsPort,
  bloombergPort: BloombergNewsPort,
): Hono {
  const app = new Hono();

  // ── GET /health ────────────────────────────────────────────────────────────

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'news-fetch', port: 5008 }),
  );

  // ── Reuters shared logic ───────────────────────────────────────────────────

  async function fetchReuters(maxItems: number): Promise<FetchResult> {
    const rssUseCase = new FetchReutersHeadlinesUseCase(rssPort);
    const rssResult = await rssUseCase.execute(maxItems);

    // Fallback: RSS error or empty feed → try Playwright stealth
    if (rssResult.error != null || rssResult.articles.length === 0) {
      if (rssResult.error != null) {
        console.warn('[reuters/headlines] RSS primary failed, invoking stealth fallback', {
          rssError: rssResult.error,
        });
      } else {
        console.warn('[reuters/headlines] RSS primary returned 0 articles, invoking stealth fallback');
      }
      const fallbackUseCase = new FetchReutersHeadlinesUseCase(fallbackPort);
      const fallbackResult = await fallbackUseCase.execute(maxItems);
      if (fallbackResult.articles.length === 0) {
        console.warn('[reuters/headlines] stealth fallback also returned 0 articles', {
          fallbackError: fallbackResult.error ?? 'none',
        });
      }
      return fallbackResult;
    }

    return rssResult;
  }

  // ── POST /reuters/headlines ────────────────────────────────────────────────

  app.post('/reuters/headlines', async (c) => {
    try {
      const body = (await c.req.json<{ maxItems?: number }>().catch(() => ({} as { maxItems?: number })));
      const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 15;
      const result = await fetchReuters(maxItems);
      return c.json(result);
    } catch (err) {
      console.error('[reuters/headlines] unexpected error:', err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  });

  // ── GET /reuters/headlines (alias) ────────────────────────────────────────

  app.get('/reuters/headlines', async (c) => {
    try {
      const raw = c.req.query('maxItems');
      const maxItems = raw !== undefined ? parseInt(raw, 10) : 15;
      const result = await fetchReuters(isNaN(maxItems) ? 15 : maxItems);
      return c.json(result);
    } catch (err) {
      console.error('[reuters/headlines] unexpected error:', err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  });

  // ── Bloomberg shared logic ─────────────────────────────────────────────────

  async function fetchBloomberg(maxItems: number): Promise<FetchResult> {
    const useCase = new FetchBloombergHeadlinesUseCase(bloombergPort);
    return useCase.execute(maxItems);
  }

  // ── POST /bloomberg/headlines ─────────────────────────────────────────────

  app.post('/bloomberg/headlines', async (c) => {
    try {
      const body = (await c.req.json<{ maxItems?: number }>().catch(() => ({} as { maxItems?: number })));
      const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 10;
      const result = await fetchBloomberg(maxItems);
      return c.json(result);
    } catch (err) {
      console.error('[bloomberg/headlines] unexpected error:', err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  });

  // ── GET /bloomberg/headlines (alias) ─────────────────────────────────────

  app.get('/bloomberg/headlines', async (c) => {
    try {
      const raw = c.req.query('maxItems');
      const maxItems = raw !== undefined ? parseInt(raw, 10) : 10;
      const result = await fetchBloomberg(isNaN(maxItems) ? 10 : maxItems);
      return c.json(result);
    } catch (err) {
      console.error('[bloomberg/headlines] unexpected error:', err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  });

  return app;
}
