/**
 * Kinh Dich Service — Interface HTTP Handlers (Hono)
 *
 * Thin HTTP layer: parse → validate → usecase → respond.
 * No business logic.
 */

import { Hono } from 'hono';
import type { ReadingUseCase, MarketHexagramUseCase } from '../application/usecases.js';
import { errorToStatus } from './serializers.js';

export function createRouter(
  readingUseCase: ReadingUseCase,
  marketUseCase: MarketHexagramUseCase,
): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'kinh-dich-service', port: 5005 }),
  );

  app.get('/reading/:code', async (c) => {
    const code = c.req.param('code')?.toUpperCase();
    if (!code) return c.json({ error: 'stock code required' }, 400);

    const daysStr = c.req.query('days');
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    if (!Number.isFinite(days) || days < 1) {
      return c.json({ error: 'days must be a positive integer' }, 400);
    }

    try {
      const result = await readingUseCase.execute({ stockCode: code, days });
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  app.get('/market', async (c) => {
    try {
      const result = await marketUseCase.execute();
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  return app;
}
