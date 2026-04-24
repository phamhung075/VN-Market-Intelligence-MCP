/**
 * Technical Analysis Interface — Hono HTTP Handlers
 *
 * Thin HTTP layer: parse → validate → usecase → respond.
 * No business logic here.
 */

import { Hono } from 'hono';
import type { ComputeTAUseCase } from '../application/usecases.js';

export function createRouter(computeUseCase: ComputeTAUseCase): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'technical-analysis', port: 5003 }),
  );

  app.post('/ta/indicators', async (c) => {
    let body: { code?: unknown; days?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const days = typeof body.days === 'number' ? body.days : parseInt(String(body.days), 10);

    if (!code) return c.json({ error: 'code is required' }, 400);
    if (!Number.isFinite(days) || days < 1) return c.json({ error: 'days must be a positive integer' }, 400);

    try {
      const result = await computeUseCase.execute({ code, days });
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
