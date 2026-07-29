/**
 * News Fetch Microservice — Entry Point
 *
 * Thin server entry: imports app from composition-root, binds port.
 * All wiring lives in composition-root.ts (G3), except for one additional
 * DI binding done directly here (FACTORY-GUARD-CI-TSBOUNDARIES-IMPL, 2026-07-29):
 * this file is the only element the boundaries plugin classifies as
 * "composition-root" (eslint.config.mjs `pattern: "src/index.ts"`), so it is the
 * one place allowed to import infrastructure/ (Fence-C) — used here to wire the
 * Playwright browser launcher into routes/fetchArticle.ts's injectable dependency
 * instead of that route file importing PlaywrightBrowserFactory directly. This
 * runs at module load, before Bun starts accepting connections on PORT below —
 * same runtime behavior as before, just DI-wired one file up.
 */

import { app } from '../composition-root.js';
import { PlaywrightBrowserFactory } from './infrastructure/scrapers/playwright-browser-factory.js';
import { setPlaywrightLauncher } from './routes/fetchArticle.js';

setPlaywrightLauncher(() => PlaywrightBrowserFactory.launch());

const PORT = parseInt(Bun.env.PORT ?? '5008', 10);

export { app };

/**
 * idleTimeout: 0 — disable idle timeout to prevent 502 from Playwright (25-30s).
 */
export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 0,
};

console.log(`news-fetch running on port ${PORT}`);
