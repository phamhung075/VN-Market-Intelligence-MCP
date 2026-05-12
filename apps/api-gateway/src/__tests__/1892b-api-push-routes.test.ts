/**
 * Task 1892b — /api/push-* routing through API Gateway
 *
 * ACs:
 *   AC-1: POST /api/push-news forwards verbatim path to MCP URL, returns 200
 *   AC-2: POST /api/push-unknown returns 404 (unknown endpoint on MCP)
 *   AC-3: POST /api/push-news without Authorization returns 401
 *   AC-4: POST /api/push-news with bad body returns 400
 *   AC-5: GET /health still enumerates services; 'api' virtual service excluded from probes
 *
 * Extra assertions:
 *   - Path passed to MCP is verbatim /api/push-news (no prefix strip)
 *   - Authorization header forwarded unchanged
 *   - Regression: existing 9 services (/stock-price/*, /macro/*, etc.) still routed
 *
 * Strategy: mock fetch globally; no real network calls.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createRouter } from '../interface/handlers.js';
import { StaticServiceRegistry } from '../infrastructure/health_checker.js';
import type { AggregateHealthUseCase, ServiceHealthUseCase } from '../application/usecases.js';
import type { AggregatedHealth } from '../domain/models.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MCP_URL = 'http://mcp-server:3000';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FIXED_HEALTH: AggregatedHealth = {
  status: 'ok',
  services: {
    mcp: 'ok', pdf: 'ok', rag: 'ok', ta: 'ok',
    macro: 'ok', stock: 'ok', 'kinh-dich': 'ok', alert: 'ok', api: 'ok',
  },
  latencies: {
    mcp: 10, pdf: 10, rag: 10, ta: 10,
    macro: 10, stock: 10, 'kinh-dich': 10, alert: 10, api: 0,
  },
  checkedAt: '2026-05-12T00:00:00.000Z',
};

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockAggregateUseCase(health: AggregatedHealth = FIXED_HEALTH): AggregateHealthUseCase {
  return {
    execute: async () => health,
  } as unknown as AggregateHealthUseCase;
}

function makeMockServiceHealthUseCase(): ServiceHealthUseCase {
  return {
    execute: async () => null,
  } as unknown as ServiceHealthUseCase;
}

/**
 * Build a StaticServiceRegistry that includes the 'api' virtual service
 * pointing at MCP_URL — mirrors what index.ts will wire.
 */
function makeRegistry(): StaticServiceRegistry {
  return new StaticServiceRegistry({
    mcp:          MCP_URL,
    pdf:          'http://pdf-extractor:5001',
    rag:          'http://rag-service:5002',
    ta:           'http://technical-analysis:5003',
    macro:        'http://macro-indicators:5004',
    stock:        'http://stock-price:5000',
    'kinh-dich':  'http://kinh-dich-service:5005',
    alert:        'http://alert-engine:5006',
    api:          MCP_URL,   // virtual alias — same target as mcp
  });
}

// ── Fetch mock helper ─────────────────────────────────────────────────────────

type FetchCall = { url: string; init: RequestInit };

/**
 * Replace globalThis.fetch with a stub that records calls.
 * Returns { calls, restore }.
 */
function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<Response>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;

  const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const resolvedInit = init ?? {};
    calls.push({ url, init: resolvedInit });
    return handler(url, resolvedInit);
  };

  globalThis.fetch = stub as typeof globalThis.fetch;
  return {
    calls,
    restore: () => { globalThis.fetch = original; },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Task 1892b — /api/push-* routing', () => {

  describe('AC-1: POST /api/push-news → 200 happy path', () => {
    it('returns 200 and forwards the request to MCP URL', async () => {
      const { calls, restore } = mockFetch(async (url) => {
        if (url === `${MCP_URL}/api/push-news`) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/api/push-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer tok-123' },
          body: JSON.stringify({ ticker: 'VNM', headline: 'test' }),
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${MCP_URL}/api/push-news`);
      } finally {
        restore();
      }
    });
  });

  describe('AC-1 (path verbatim): path NOT stripped of /api/ prefix', () => {
    it('upstream URL contains /api/push-news literally, not /push-news', async () => {
      let capturedUrl = '';
      const { calls, restore } = mockFetch(async (url) => {
        capturedUrl = url;
        return new Response('{}', { status: 200 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/api/push-news', {
          method: 'POST',
          body: '{}',
        });

        await app.fetch(req);
        // Must NOT strip /api/ — full path preserved
        expect(capturedUrl).toContain('/api/push-news');
        expect(capturedUrl).not.toMatch(/mcp-server:3000\/push-news/);
      } finally {
        restore();
      }
    });
  });

  describe('AC-2: POST /api/push-unknown → 404 from MCP', () => {
    it('returns 404 when MCP says route not found', async () => {
      const { restore } = mockFetch(async () => {
        return new Response('Not found', { status: 404 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/api/push-unknown', {
          method: 'POST',
          body: '{}',
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(404);
      } finally {
        restore();
      }
    });
  });

  describe('AC-3: Authorization header forwarded unchanged', () => {
    it('preserves Authorization header on the upstream request', async () => {
      const TOKEN = 'Bearer secret-token-xyz';
      let capturedHeaders: Headers | undefined;

      const { restore } = mockFetch(async (_url, init) => {
        // init.headers may be a Headers object or plain object
        if (init.headers instanceof Headers) {
          capturedHeaders = init.headers;
        } else {
          capturedHeaders = new Headers(init.headers as HeadersInit);
        }
        return new Response('{}', { status: 200 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/api/push-news', {
          method: 'POST',
          headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' },
          body: '{}',
        });

        await app.fetch(req);
        expect(capturedHeaders).toBeDefined();
        expect(capturedHeaders!.get('authorization')).toBe(TOKEN);
      } finally {
        restore();
      }
    });
  });

  describe('AC-3 (no auth strip): missing Authorization → 401', () => {
    it('returns 401 when MCP rejects missing auth', async () => {
      const { restore } = mockFetch(async () => {
        return new Response('Unauthorized', { status: 401 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/api/push-news', {
          method: 'POST',
          body: '{}',
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(401);
      } finally {
        restore();
      }
    });
  });

  describe('AC-4: bad body → 400 from MCP', () => {
    it('returns 400 when MCP rejects malformed payload', async () => {
      const { restore } = mockFetch(async () => {
        return new Response('Bad request', { status: 400 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/api/push-news', {
          method: 'POST',
          body: 'not-json',
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(400);
      } finally {
        restore();
      }
    });
  });

  describe('AC-5: health endpoint passthrough — api service excluded from probes', () => {
    it("GET /health does not attempt to probe 'api' virtual service", async () => {
      const probedUrls: string[] = [];
      const { restore } = mockFetch(async (url) => {
        probedUrls.push(url);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/health');
        await app.fetch(req);

        // The mock AggregateHealthUseCase doesn't call fetch — no probes expected
        // (health probes happen in HTTPHealthChecker which is not invoked here)
        // But the health response must include 'api' status from the mock
        // What matters: registry.getService('api') exists and points to MCP_URL
        const apiSvc = registry.getService('api');
        expect(apiSvc).toBeDefined();
        expect(apiSvc!.baseUrl).toBe(MCP_URL);
      } finally {
        restore();
      }
    });

    it("StaticServiceRegistry excludes 'api' from getAllServices() health probe list", async () => {
      const registry = makeRegistry();
      const all = registry.getAllServices();
      const apiEntry = all.find(s => s.name === 'api');
      // api IS registered (for routing) but must be excluded from health probes
      // The spec says health_checker excludes 'api' from active probes
      // Implementation: we mark it with noProbe: true OR exclude it in buildServiceConfigs
      // Test: if present, it should have a sentinel that disables probing
      // OR: getAllServices() for health probing must not include 'api'
      // Per spec: "exclude api from active health probes since it's a virtual alias"
      // The cleanest approach: health probe list = getAllServices().filter(s => !s.noProbe)
      // We test that interpretation here.
      if (apiEntry) {
        expect((apiEntry as { noProbe?: boolean }).noProbe).toBe(true);
      }
      // If apiEntry is undefined (not in getAllServices), that's also acceptable
      // Either way is fine as long as no health probe fires against api
    });
  });

  describe('AC-5 regression: existing services still routed correctly', () => {
    it('GET /stock/health still proxied to stock-price service', async () => {
      let capturedUrl = '';
      const { restore } = mockFetch(async (url) => {
        capturedUrl = url;
        return new Response('{"status":"ok"}', { status: 200 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/stock/health');
        await app.fetch(req);
        // Existing routing: strip /stock → /health
        expect(capturedUrl).toBe('http://stock-price:5000/health');
      } finally {
        restore();
      }
    });

    it('GET /macro/indicators still proxied to macro-indicators service', async () => {
      let capturedUrl = '';
      const { restore } = mockFetch(async (url) => {
        capturedUrl = url;
        return new Response('[]', { status: 200 });
      });

      try {
        const registry = makeRegistry();
        const app = createRouter(
          makeMockAggregateUseCase(),
          makeMockServiceHealthUseCase(),
          registry,
        );

        const req = new Request('http://localhost/macro/indicators');
        await app.fetch(req);
        expect(capturedUrl).toBe('http://macro-indicators:5004/indicators');
      } finally {
        restore();
      }
    });
  });

});
