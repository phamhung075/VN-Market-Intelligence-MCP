/**
 * API Gateway Interface — Hono HTTP Handlers
 *
 * Routes:
 *   GET  /health              → aggregate health of all services
 *   GET  /health/:service     → per-service health check
 *   GET  /health-dashboard    → self-contained HTML health dashboard (auto-refresh 60s)
 *   ANY  /api/*               → reverse proxy to MCP server — path passed VERBATIM (no prefix strip)
 *   ANY  /:service/*          → reverse proxy to downstream service — strips /:service prefix
 */

import { Hono } from 'hono';
import type { AggregateHealthUseCase, ServiceHealthUseCase } from '../application/usecases.js';
import type { ServiceRegistryPort } from '../domain/repositories.js';
import type { AggregatedHealth, HealthStatus } from '../domain/models.js';

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

  // ── Health dashboard (read-only HTML) ───────────────────────────────────

  app.get('/health-dashboard', async (c) => {
    const health = await aggregateHealthUseCase.execute();
    return c.html(buildDashboardHtml(health));
  });

  // ── Reverse proxy ───────────────────────────────────────────────────────

  app.all('/:service/*', async (c) => {
    const serviceName = c.req.param('service');
    const svc = registry.getService(serviceName);

    if (!svc) {
      return c.json({ error: `Unknown service: ${serviceName}` }, 404);
    }

    // Build downstream URL.
    // Virtual alias services (noProbe=true, e.g. 'api') forward the FULL path verbatim
    // so that /api/push-news reaches MCP as /api/push-news, not /push-news.
    // All other services strip the leading /:service segment as before.
    const path = proxyPath(c.req.path, svc as { noProbe?: boolean });
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

// ── Path helpers ───────────────────────────────────────────────────────────

/**
 * Determine the downstream path for a proxy request.
 *
 * - Virtual alias services (noProbe=true): pass the full request path VERBATIM.
 *   Example: /api/push-news → /api/push-news (MCP expects the full path).
 * - Real services: strip the leading /:service segment.
 *   Example: /stock/prices → /prices
 */
export function proxyPath(reqPath: string, svc: { noProbe?: boolean }): string {
  if (svc.noProbe) {
    return reqPath; // verbatim — preserve full path including /api/ prefix
  }
  return '/' + reqPath.split('/').slice(2).join('/');
}

// ── Dashboard HTML builder ─────────────────────────────────────────────────

/** All known services displayed in the dashboard (order matters for layout). */
const DASHBOARD_SERVICES: ReadonlyArray<string> = [
  'mcp', 'pdf', 'rag', 'ta', 'macro', 'stock', 'kinh-dich', 'alert',
];

/** Map a HealthStatus to a CSS class used in the dashboard. */
function statusClass(status: HealthStatus | undefined): string {
  if (status === 'ok') return 'status-up';
  if (status === 'down') return 'status-down';
  return 'status-unknown';
}

/** Map a HealthStatus to a human-readable label. */
function statusLabel(status: HealthStatus | undefined): string {
  if (status === 'ok') return 'UP';
  if (status === 'down') return 'DOWN';
  if (status === 'degraded') return 'DEGRADED';
  return 'UNKNOWN';
}

/**
 * Build a self-contained HTML page for the health dashboard.
 * Called server-side on every request to /health-dashboard.
 * No external CDN, fonts, or JS libraries — fully offline-capable.
 */
export function buildDashboardHtml(health: AggregatedHealth): string {
  const serviceCards = DASHBOARD_SERVICES.map((name) => {
    const status = health.services[name];
    const latency = health.latencies[name];
    const cls = statusClass(status);
    const label = statusLabel(status);
    const latencyText = latency !== undefined && latency >= 0
      ? `${latency} ms`
      : 'N/A';

    return `
      <div class="card ${cls}">
        <span class="service-name">${escapeHtml(name)}</span>
        <span class="badge">${label}</span>
        <span class="latency">${latencyText}</span>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <title>VN Market Intelligence — Health Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      padding: 2rem;
      min-height: 100vh;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1rem; margin-bottom: 0.75rem; color: #94a3b8; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      border-radius: 0.5rem;
      padding: 1rem;
      border: 2px solid #334155;
      background: #1e293b;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .card.status-up    { border-color: #22c55e; }
    .card.status-down  { border-color: #ef4444; }
    .card.status-unknown { border-color: #64748b; }
    .service-name { font-weight: 600; font-size: 0.9rem; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      width: fit-content;
    }
    .status-up    .badge { background: #166534; color: #bbf7d0; }
    .status-down  .badge { background: #7f1d1d; color: #fecaca; }
    .status-unknown .badge { background: #1e293b; color: #94a3b8; border: 1px solid #475569; }
    .latency { font-size: 0.75rem; color: #64748b; }
    section { margin-bottom: 2rem; }
    .placeholder { color: #64748b; font-size: 0.875rem; font-style: italic; }
    footer { margin-top: 2rem; color: #475569; font-size: 0.75rem; border-top: 1px solid #1e293b; padding-top: 1rem; }
    .overall { margin-bottom: 1.5rem; }
    .overall-badge {
      display: inline-block;
      font-size: 0.875rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
    }
    .overall-ok         { background: #166534; color: #bbf7d0; }
    .overall-degraded   { background: #713f12; color: #fef3c7; }
    .overall-down       { background: #7f1d1d; color: #fecaca; }
  </style>
</head>
<body>
  <h1>VN Market Intelligence — Health Dashboard</h1>
  <p class="subtitle">Auto-refreshes every 60 seconds. Last checked: ${escapeHtml(health.checkedAt)}</p>

  <div class="overall">
    <span class="overall-badge overall-${escapeHtml(health.status)}">
      Overall: ${escapeHtml(health.status.toUpperCase())}
    </span>
  </div>

  <section id="services">
    <h2>Service Status (${DASHBOARD_SERVICES.length} services)</h2>
    <div class="grid">
      ${serviceCards}
    </div>
  </section>

  <section id="signals">
    <h2>Last 10 Signals</h2>
    <p class="placeholder">N/A — MCP data not wired in this sprint</p>
  </section>

  <section id="prediction">
    <h2>Prediction Accuracy</h2>
    <p class="placeholder">N/A — MCP data not wired in this sprint</p>
  </section>

  <section id="alerts">
    <h2>Active Alerts</h2>
    <p class="placeholder">N/A — MCP data not wired in this sprint</p>
  </section>

  <footer>
    VN Market Intelligence MCP &mdash; api-gateway health dashboard &mdash; read-only
  </footer>
</body>
</html>`;
}

/** Minimal HTML entity escaping — prevents XSS from service names or status values. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
