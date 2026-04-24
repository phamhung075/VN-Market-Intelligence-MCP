/**
 * API Gateway Interface — Hono HTTP Handlers
 *
 * Routes:
 *   GET  /health              → aggregate health of all services
 *   GET  /health/:service     → per-service health check
 *   ANY  /:service/*          → reverse proxy to downstream service
 */

import { Hono } from 'hono';
import type { AggregateHealthUseCase, ServiceHealthUseCase } from '../application/usecases.js';
import type { ServiceRegistryPort } from '../domain/repositories.js';

export function createRouter(
  aggregateHealthUseCase: AggregateHealthUseCase,
  serviceHealthUseCase: ServiceHealthUseCase,
  registry: ServiceRegistryPort,
): Hono {
  const app = new Hono();

  // ── Health endpoints ────────────────────────────────────────────────────

  app.get('/health', async (c) => {
    const result = await aggregateHealthUseCase.execute();
    const statusCode = result.status === 'down' ? 503 : 200;
    return c.json(result, statusCode);
  });

  app.get('/health/:service', async (c) => {
    const serviceName = c.req.param('service');
    const result = await serviceHealthUseCase.execute(serviceName);
    if (!result) {
      return c.json({ error: `Unknown service: ${serviceName}` }, 404);
    }
    const statusCode = result.status === 'down' ? 503 : 200;
    return c.json(result, statusCode);
  });

  // ── Reverse proxy ───────────────────────────────────────────────────────

  app.all('/:service/*', async (c) => {
    const serviceName = c.req.param('service');
    const svc = registry.getService(serviceName);

    if (!svc) {
      return c.json({ error: `Unknown service: ${serviceName}` }, 404);
    }

    // Build downstream URL: strip leading /:service from path
    const path = '/' + c.req.path.split('/').slice(2).join('/');
    const query = c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : '';
    const targetUrl = `${svc.baseUrl}${path}${query}`;

    try {
      const upstream = await fetch(targetUrl, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
        signal: AbortSignal.timeout(svc.timeoutMs * 5), // proxy timeout = 5x health timeout
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
      });
    } catch (err) {
      return c.json({ error: `Upstream ${serviceName} unreachable: ${String(err)}` }, 502);
    }
  });

  return app;
}
