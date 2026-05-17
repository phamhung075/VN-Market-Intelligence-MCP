/**
 * News Fetch Microservice — Entry Point
 *
 * DDD wiring: domain/ ← application/ ← infrastructure/ ← interface/
 * Port: 5008 (configurable via $PORT)
 *
 * Routes owned by: src/interface/handlers.ts (1899a-routes)
 *   GET  /health
 *   POST /news/reuters/headlines   (RSS primary + Playwright fallback)
 *   GET  /news/reuters/headlines   (alias)
 *   POST /news/bloomberg/headlines (Playwright only)
 *   GET  /news/bloomberg/headlines (alias)
 */

import { createRouter } from './interface/handlers.js';
import { ReutersRssScraper } from './infrastructure/scrapers/reuters-rss.js';
import { ReutersStealthFallback } from './infrastructure/scrapers/reuters-stealth.js';
import { BloombergStealth } from './infrastructure/scrapers/bloomberg-stealth.js';

// ── Composition root — wire scrapers into router ──────────────────────────────
export const app = createRouter(
  new ReutersRssScraper(),
  new ReutersStealthFallback(),
  new BloombergStealth(),
);

// ── Server binding (skipped when imported in tests) ───────────────────────────
const PORT = parseInt(Bun.env.PORT ?? '5008', 10);

/**
 * idleTimeout: 0 = no idle timeout.
 *
 * Bloomberg and Reuters stealth scrapers use Playwright with a 30-second page
 * navigation timeout. Bun's default idleTimeout is 10 seconds, which causes the
 * server to close the connection before Playwright returns — producing an empty
 * reply that the api-gateway surfaces as 502 Bad Gateway.
 *
 * Setting idleTimeout to 0 disables the idle timeout entirely. The Playwright
 * scrapers have their own timeouts (PAGE_TIMEOUT_MS = 25–30 s) plus an outer
 * try/catch, so requests will always resolve without relying on the server-level
 * idle timeout for termination.
 */
export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 0,
};

console.log(`news-fetch running on port ${PORT}`);
