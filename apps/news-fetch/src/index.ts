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

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`news-fetch running on port ${PORT}`);
