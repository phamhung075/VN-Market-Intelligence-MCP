/**
 * Alert Engine — Interface HTTP Handlers (Hono)
 *
 * Thin HTTP layer: parse → validate → usecase → respond.
 * No business logic.
 */

import { Hono } from 'hono';
import type { EvaluateAlertUseCase } from '../application/usecases.js';
import type { EvaluateAlertRequest } from '../application/dtos.js';

export function createRouter(evaluateUseCase: EvaluateAlertUseCase): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'alert-engine', port: 5006 }),
  );

  app.post('/evaluate', async (c) => {
    let body: Partial<EvaluateAlertRequest>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const stock = typeof body.stock === 'string' ? body.stock.trim().toUpperCase() : '';
    const severity = body.severity;
    const message = typeof body.message === 'string' ? body.message : '';

    if (!stock) return c.json({ error: 'stock is required' }, 400);
    if (!severity || !['low', 'medium', 'high', 'critical'].includes(severity)) {
      return c.json({ error: 'severity must be low|medium|high|critical' }, 400);
    }
    if (!message) return c.json({ error: 'message is required' }, 400);

    try {
      const result = await evaluateUseCase.execute({
        stock,
        severity,
        message,
        signalTypes: Array.isArray(body.signalTypes) ? body.signalTypes : [],
        actionCode: body.actionCode,
        sendTelegram: body.sendTelegram ?? false, // default off in microservice mode
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
