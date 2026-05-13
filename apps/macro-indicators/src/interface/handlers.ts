/**
 * Macro Indicators Interface — Hono HTTP Handlers
 */

import { Hono } from 'hono';
import type { ComputeMacroUseCase } from '../application/usecases.js';
import type { FetchExternalMacroUseCase } from '../application/fetch-external-macro.js';

export function createRouter(
  useCase: ComputeMacroUseCase,
  externalUseCase: FetchExternalMacroUseCase,
): Hono {
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

  /** Fetch all external macro sources (World Bank, Yahoo, CNBC, TE, FRED, Investing). */
  app.post('/macro/external', async (c) => {
    try {
      const result = await externalUseCase.execute();
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  /** GET convenience alias — trigger external macro fetch. */
  app.get('/macro/external', async (c) => {
    try {
      const result = await externalUseCase.execute();
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
