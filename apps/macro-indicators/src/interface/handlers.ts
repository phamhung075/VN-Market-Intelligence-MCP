/**
 * Macro Indicators Interface — Hono HTTP Handlers
 */

import { Hono } from 'hono';
import type { ComputeMacroUseCase } from '../application/usecases.js';

export function createRouter(useCase: ComputeMacroUseCase): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'macro-indicators', port: 5004 }),
  );

  app.post('/macro/snapshot', async (c) => {
    try {
      const result = await useCase.execute({});
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
