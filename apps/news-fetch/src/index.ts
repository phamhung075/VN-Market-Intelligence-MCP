/**
 * News Fetch Microservice — Entry Point
 *
 * Thin server entry: imports app from composition-root, binds port.
 * All wiring lives in composition-root.ts (G3).
 */

import { app } from '../composition-root.js';

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
