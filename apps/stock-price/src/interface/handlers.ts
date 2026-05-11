/**
 * Stock Price Interface — Hono HTTP Handlers
 */

import { Hono } from 'hono';
import type { FetchPriceUseCase, PriceHistoryUseCase } from '../application/usecases.js';
import { PriceNotAvailableError } from '../domain/services.js';

export function createRouter(
  fetchUseCase: FetchPriceUseCase,
  historyUseCase: PriceHistoryUseCase,
): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'stock-price', port: 5000 }),
  );

  app.post('/price/fetch', async (c) => {
    let body: { code?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) return c.json({ error: 'code is required' }, 400);

    try {
      const result = await fetchUseCase.execute({ code });
      return c.json(result);
    } catch (err) {
      if (err instanceof PriceNotAvailableError) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get('/price/history/:code', async (c) => {
    const code = c.req.param('code').trim().toUpperCase();
    const days = parseInt(c.req.query('days') ?? '30', 10);

    if (!code) return c.json({ error: 'code is required' }, 400);
    if (!Number.isFinite(days) || days < 1) return c.json({ error: 'days must be positive' }, 400);

    try {
      const result = await historyUseCase.execute({ code, days });
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
