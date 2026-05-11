/**
 * Task 1841a — U-9 Health Dashboard
 *
 * Tests for GET /health-dashboard route in api-gateway.
 *
 * Strategy: construct the Hono app via createRouter() with a mock
 * AggregateHealthUseCase that returns deterministic data. No HTTP fetch.
 */

import { describe, it, expect } from 'bun:test';
import { createRouter } from '../interface/handlers.js';
import { buildDashboardHtml } from '../interface/handlers.js';
import type { AggregateHealthUseCase, ServiceHealthUseCase } from '../application/usecases.js';
import type { ServiceRegistryPort } from '../domain/repositories.js';
import type { AggregatedHealth } from '../domain/models.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FIXED_HEALTH: AggregatedHealth = {
  status: 'ok',
  services: {
    mcp: 'ok',
    pdf: 'ok',
    rag: 'ok',
    ta: 'ok',
    macro: 'ok',
    stock: 'ok',
    'kinh-dich': 'ok',
    alert: 'ok',
  },
  latencies: {
    mcp: 42,
    pdf: 55,
    rag: 33,
    ta: 60,
    macro: 70,
    stock: 45,
    'kinh-dich': 80,
    alert: 38,
  },
  checkedAt: '2026-05-03T10:00:00.000Z',
};

const DEGRADED_HEALTH: AggregatedHealth = {
  status: 'degraded',
  services: {
    mcp: 'ok',
    pdf: 'down',
    rag: 'down',
    ta: 'ok',
    macro: 'ok',
    stock: 'ok',
    'kinh-dich': 'ok',
    alert: 'ok',
  },
  latencies: {
    mcp: 42,
    pdf: -1,
    rag: -1,
    ta: 60,
    macro: 70,
    stock: 45,
    'kinh-dich': 80,
    alert: 38,
  },
  checkedAt: '2026-05-03T10:01:00.000Z',
};

// ── Mock factory ─────────────────────────────────────────────────────────────

function makeMockAggregateUseCase(health: AggregatedHealth): AggregateHealthUseCase {
  return {
    execute: async () => health,
  } as unknown as AggregateHealthUseCase;
}

const mockServiceHealthUseCase: ServiceHealthUseCase = {
  execute: async () => null,
} as unknown as ServiceHealthUseCase;

const mockRegistry: ServiceRegistryPort = {
  getAllServices: () => [],
  getService: () => undefined,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDashboardHtml(health: AggregatedHealth = FIXED_HEALTH): Promise<{ status: number; contentType: string; body: string }> {
  const app = createRouter(
    makeMockAggregateUseCase(health),
    mockServiceHealthUseCase,
    mockRegistry,
  );
  const req = new Request('http://localhost/health-dashboard');
  const res = await app.fetch(req);
  const body = await res.text();
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Task 1841a — GET /health-dashboard', () => {
  it('AC-1: returns HTTP 200 with content-type text/html', async () => {
    const { status, contentType } = await getDashboardHtml();
    expect(status).toBe(200);
    expect(contentType).toContain('text/html');
  });

  it('AC-2: response body contains the page title', async () => {
    const { body } = await getDashboardHtml();
    expect(body).toContain('<title>VN Market Intelligence');
  });

  it('AC-3: response body contains all 8 service names', async () => {
    const { body } = await getDashboardHtml();
    const serviceNames = ['mcp', 'pdf', 'rag', 'ta', 'macro', 'stock', 'kinh-dich', 'alert'];
    for (const name of serviceNames) {
      expect(body).toContain(name);
    }
  });

  it('AC-4a: up services render with green CSS class', async () => {
    const { body } = await getDashboardHtml(FIXED_HEALTH);
    // All 8 are 'ok' — should see card elements with status-up class
    expect(body).toContain('<div class="card status-up">');
    // Should NOT have any card elements with status-down class (CSS definition is expected)
    expect(body).not.toContain('<div class="card status-down">');
  });

  it('AC-4b: down services render with red CSS class', async () => {
    const { body } = await getDashboardHtml(DEGRADED_HEALTH);
    expect(body).toContain('<div class="card status-up">');
    expect(body).toContain('<div class="card status-down">');
  });

  it('AC-5: page contains auto-refresh meta tag with content="60"', async () => {
    const { body } = await getDashboardHtml();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain('content="60"');
  });

  it('AC-6: page is self-contained — no external http/https URLs in link or script tags', async () => {
    const { body } = await getDashboardHtml();
    // Extract <link ...> and <script ...> tags
    const linkTags = body.match(/<link[^>]*>/gi) ?? [];
    const scriptTags = body.match(/<script[^>]*>/gi) ?? [];
    for (const tag of [...linkTags, ...scriptTags]) {
      expect(tag).not.toMatch(/https?:\/\//);
    }
  });

  it('AC-7: page contains placeholder text for signals, prediction, and alerts', async () => {
    const { body } = await getDashboardHtml();
    expect(body).toContain('id="signals"');
    expect(body).toContain('id="prediction"');
    expect(body).toContain('id="alerts"');
    expect(body).toContain('N/A — MCP data not wired in this sprint');
  });
});

describe('Task 1841a — buildDashboardHtml unit', () => {
  it('renders UP badge for ok services', () => {
    const html = buildDashboardHtml(FIXED_HEALTH);
    expect(html).toContain('>UP<');
    expect(html).not.toContain('>DOWN<');
  });

  it('renders DOWN badge for down services', () => {
    const html = buildDashboardHtml(DEGRADED_HEALTH);
    expect(html).toContain('>UP<');
    expect(html).toContain('>DOWN<');
  });

  it('shows the checkedAt timestamp', () => {
    const html = buildDashboardHtml(FIXED_HEALTH);
    expect(html).toContain(FIXED_HEALTH.checkedAt);
  });

  it('shows latency in ms for each ok service', () => {
    const html = buildDashboardHtml(FIXED_HEALTH);
    expect(html).toContain('42 ms');
  });

  it('shows N/A latency for down services (latency=-1)', () => {
    const html = buildDashboardHtml(DEGRADED_HEALTH);
    expect(html).toContain('N/A');
  });
});
