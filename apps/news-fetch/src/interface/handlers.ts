/**
 * News Fetch Microservice — Hono HTTP Router
 *
 * Routes: GET /health | POST+GET /reuters/headlines | POST+GET /bloomberg/headlines
 *   (both /headlines pairs built by makeHeadlinesHandler) | POST /fetch-article (DFR-P2-MAIN)
 *
 * DDD: interface layer — imports from module/ (NewsIngestPort) and domain/ only.
 * Fallback orchestration logic is in news_ingest module, not here.
 *
 * Router accepts either (a) a pre-built NewsIngestPort per source (new composition
 * root pattern), or (b) 4 raw scraper ports for backward compat (tests + legacy wiring).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ReutersNewsPort, BloombergNewsPort } from '../domain/repositories.js';
import type { NewsIngestPort } from '../module/news_ingest/ports.js';
import { composeNewsIngest } from '../module/news_ingest/index.js';
import { NewsSource, resolveMaxItems } from '../domain/models.js';
import { handleFetchArticle } from '../routes/fetchArticle.js';

// ---------------------------------------------------------------------------
// Shared /<source>/headlines handler factory (POST + GET alias)
// ---------------------------------------------------------------------------

/**
 * POST + GET handler pair for one source's /headlines route — identical
 * response-envelope + error handling; only the maxItems input channel
 * differs (JSON body vs querystring), resolved via resolveMaxItems.
 */
function makeHeadlinesHandler(ingest: NewsIngestPort, source: NewsSource) {
  const tag = `[${source}/headlines]`;

  const respond = async (c: Context, maxItems: number) => {
    try {
      const articles = await ingest.ingestHeadlines(source, maxItems);
      return c.json({
        source,
        articles,
        fetchedAt: new Date().toISOString(),
        method: 'module',
        error: null,
      });
    } catch (err) {
      console.error(`${tag} unexpected error:`, err);
      return c.json(
        { error: 'Internal server error', fetchedAt: new Date().toISOString() },
        500,
      );
    }
  };

  return {
    post: async (c: Context) => {
      const body = await c.req.json<{ maxItems?: number }>().catch(() => ({} as { maxItems?: number }));
      return respond(c, resolveMaxItems(body.maxItems, source));
    },
    get: async (c: Context) => {
      return respond(c, resolveMaxItems(c.req.query('maxItems'), source));
    },
  };
}

// ---------------------------------------------------------------------------
// Router factory — primary signature: two NewsIngestPort
// ---------------------------------------------------------------------------

/**
 * Build and return a Hono router.
 * Primary: createRouter(reutersIngestPort, bloombergIngestPort)
 * Legacy (backward compat): createRouter(rssPort, fallbackPort, bloombergRssPort, bloombergStealthPort)
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

  // ── /reuters/headlines (POST + GET alias) ─────────────────────────────────

  const reutersHandlers = makeHeadlinesHandler(reutersIngest, NewsSource.REUTERS);
  app.post('/reuters/headlines', reutersHandlers.post);
  app.get('/reuters/headlines', reutersHandlers.get);

  // ── /bloomberg/headlines (POST + GET alias) ───────────────────────────────

  const bloombergHandlers = makeHeadlinesHandler(bloombergIngest, NewsSource.BLOOMBERG);
  app.post('/bloomberg/headlines', bloombergHandlers.post);
  app.get('/bloomberg/headlines', bloombergHandlers.get);

  // ── POST /fetch-article (DFR-P2-MAIN — Playwright fallback, see routes/fetchArticle.ts) ──
  app.post('/fetch-article', handleFetchArticle);

  return app;
}
