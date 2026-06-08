/**
 * News Fetch Microservice — Hono HTTP Router
 *
 * Routes:
 *   GET  /health                    → liveness probe
 *   POST /reuters/headlines         → Reuters news ingest (via NewsIngestPort)
 *   GET  /reuters/headlines         → convenience GET alias
 *   POST /bloomberg/headlines       → Bloomberg news ingest (via NewsIngestPort)
 *   GET  /bloomberg/headlines       → convenience GET alias
 *   POST /fetch-article             → Playwright fallback article-body extractor (DFR-P2-MAIN)
 *
 * DDD: interface layer — imports from module/ (NewsIngestPort) and domain/ only.
 * Fallback orchestration logic is in news_ingest module, not here.
 *
 * Router accepts either:
 *   (a) A pre-built NewsIngestPort per source (new composition root pattern)
 *   (b) 4 raw scraper ports for backward compatibility (tests + legacy wiring)
 */

import { Hono } from 'hono';
import type { ReutersNewsPort, BloombergNewsPort } from '../domain/repositories.js';
import type { NewsIngestPort } from '../module/news_ingest/ports.js';
import { composeNewsIngest } from '../module/news_ingest/index.js';
import { NewsSource } from '../domain/models.js';
import { handleFetchArticle } from '../routes/fetchArticle.js';

// ---------------------------------------------------------------------------
// Router factory — primary signature: two NewsIngestPort
// ---------------------------------------------------------------------------

/**
 * Build and return a Hono router.
 *
 * Primary usage (new composition root):
 *   createRouter(reutersIngestPort, bloombergIngestPort)
 *
 * Legacy usage (backward compat for existing tests):
 *   createRouter(rssPort, fallbackPort, bloombergRssPort, bloombergStealthPort)
 */
export function createRouter(
  reutersPortOrRss: NewsIngestPort | ReutersNewsPort,
  bloombergPortOrFallback: NewsIngestPort | ReutersNewsPort,
  bloombergRssPort?: BloombergNewsPort,
  bloombergStealthPort?: BloombergNewsPort,
): Hono {
  let reutersIngest: NewsIngestPort;
  let bloombergIngest: NewsIngestPort;

  if (bloombergRssPort !== undefined && bloombergStealthPort !== undefined) {
    // Legacy 4-param path: build NewsIngestPort from raw scrapers
    const rssPort = reutersPortOrRss as ReutersNewsPort;
    const fallbackPort = bloombergPortOrFallback as ReutersNewsPort;
    reutersIngest = composeNewsIngest(rssPort, fallbackPort);
    bloombergIngest = composeNewsIngest(bloombergRssPort, bloombergStealthPort);
  } else {
    // New 2-param path: ports already wrapped
    reutersIngest = reutersPortOrRss as NewsIngestPort;
    bloombergIngest = bloombergPortOrFallback as NewsIngestPort;
  }

  const app = new Hono();

  // ── GET /health ────────────────────────────────────────────────────────────

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'news-fetch', port: 5008 }),
  );

  // ── POST /reuters/headlines ────────────────────────────────────────────────

  app.post('/reuters/headlines', async (c) => {
    try {
      const body = (await c.req.json<{ maxItems?: number }>().catch(() => ({} as { maxItems?: number })));
      const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 15;
      const articles = await reutersIngest.ingestHeadlines(NewsSource.REUTERS, maxItems);
      return c.json({
        source: NewsSource.REUTERS,
        articles,
        fetchedAt: new Date().toISOString(),
        method: 'module',
        error: null,
      });
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
      const articles = await reutersIngest.ingestHeadlines(NewsSource.REUTERS, isNaN(maxItems) ? 15 : maxItems);
      return c.json({
        source: NewsSource.REUTERS,
        articles,
        fetchedAt: new Date().toISOString(),
        method: 'module',
        error: null,
      });
    } catch (err) {
      console.error('[reuters/headlines] unexpected error:', err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  });

  // ── POST /bloomberg/headlines ─────────────────────────────────────────────

  app.post('/bloomberg/headlines', async (c) => {
    try {
      const body = (await c.req.json<{ maxItems?: number }>().catch(() => ({} as { maxItems?: number })));
      const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 10;
      const articles = await bloombergIngest.ingestHeadlines(NewsSource.BLOOMBERG, maxItems);
      return c.json({
        source: NewsSource.BLOOMBERG,
        articles,
        fetchedAt: new Date().toISOString(),
        method: 'module',
        error: null,
      });
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
      const articles = await bloombergIngest.ingestHeadlines(NewsSource.BLOOMBERG, isNaN(maxItems) ? 10 : maxItems);
      return c.json({
        source: NewsSource.BLOOMBERG,
        articles,
        fetchedAt: new Date().toISOString(),
        method: 'module',
        error: null,
      });
    } catch (err) {
      console.error('[bloomberg/headlines] unexpected error:', err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  });

  // ── POST /fetch-article (DFR-P2-MAIN — Playwright fallback executor) ──────
  //
  // Contract B: called by deepFetchMainJob.ts for queue rows status='vps-failed'.
  // SSRF guard: allowlist loaded from mcp.config.json deepFetch.playwrightAllowedDomains.
  // Returns: { status, url, body_text, published_at }

  app.post('/fetch-article', handleFetchArticle);

  return app;
}
