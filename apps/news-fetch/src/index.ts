/**
 * News Fetch Microservice — Entry Point
 *
 * DDD wiring: domain/ ← application/ ← infrastructure/ ← interface/
 * Port: 5008 (configurable via $PORT)
 *
 * Skeleton: /health only. Adapters, use-cases, and routes
 * are added by downstream tasks (1899a-domain, 1899a-app,
 * 1899a-factory, 1899a-reuters-rss, 1899a-bloomberg, 1899a-routes).
 */

import { Hono } from 'hono';
import { pkg } from './pkg.js';

/** Hono app — exported for unit tests (no port binding required). */
export const app = new Hono();

// ── Health route ─────────────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'news-fetch', version: pkg.version }),
);

// ── Server binding (skipped when imported in tests) ───────────────────────────
const PORT = parseInt(Bun.env.PORT ?? '5008', 10);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`news-fetch running on port ${PORT}`);
