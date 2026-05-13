/**
 * Macro Indicators Interface — Hono HTTP Handlers
 */

import { Hono } from 'hono';
import type { ComputeMacroUseCase } from '../application/usecases.js';
import type { FetchExternalMacroUseCase } from '../application/fetch-external-macro.js';
import type { FetchInternationalMacroUseCase } from '../application/fetch-international-macro.js';

export function createRouter(
  useCase: ComputeMacroUseCase,
  externalUseCase: FetchExternalMacroUseCase,
  internationalUseCase: FetchInternationalMacroUseCase,
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

  /** Fetch all external macro sources (World Bank, Yahoo, CNBC, TE, FRED, Investing).
   *
   * Returns the partial-result envelope:
   *   { sources: { worldBank, yahoo, cnbc, tradingEconomics, fred, calendar }, fetchedAt, summary }
   *
   * HTTP 200 — ≥1 source succeeded (partial data is still useful).
   * HTTP 502 — ALL sources failed or timed out (no data available).
   * execute() never throws; envelope shape is guaranteed.
   */
  app.post('/macro/external', async (c) => {
    const result = await externalUseCase.execute();
    if (result.summary.ok === 0) {
      return c.json(result, 502);
    }
    return c.json(result);
  });

  /** GET convenience alias — trigger external macro fetch. */
  app.get('/macro/external', async (c) => {
    const result = await externalUseCase.execute();
    if (result.summary.ok === 0) {
      return c.json(result, 502);
    }
    return c.json(result);
  });

  /** Fetch international institutional data: ADB KIDB + IMF WEO. */
  app.post('/macro/external/adb', async (c) => {
    try {
      const result = await internationalUseCase.execute();
      return c.json({ adbKidb: result.adbKidb, fetchedAt: result.fetchedAt });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.post('/macro/external/imf', async (c) => {
    try {
      const result = await internationalUseCase.execute();
      return c.json({ imfWeo: result.imfWeo, fetchedAt: result.fetchedAt });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  /** Fetch both ADB KIDB + IMF WEO together. */
  app.post('/macro/external/international', async (c) => {
    try {
      const result = await internationalUseCase.execute();
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get('/macro/external/international', async (c) => {
    try {
      const result = await internationalUseCase.execute();
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
