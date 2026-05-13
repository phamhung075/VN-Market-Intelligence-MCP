/**
 * Smoke test — news-fetch service skeleton
 * Task: 1899a-core (updated by 1899a-routes: health shape now includes port field)
 *
 * Boots the Hono app directly (no network port) and hits /health.
 * Playwright pre-flight is NOT required at this stage.
 */

import { describe, it, expect } from 'bun:test';
import { app } from '../src/index.js';

describe('1899a-core — news-fetch skeleton smoke test', () => {
  it('GET /health returns 200', async () => {
    const req = new Request('http://localhost:5008/health');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
  });

  it('GET /health returns correct JSON shape', async () => {
    const req = new Request('http://localhost:5008/health');
    const res = await app.fetch(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.status).toBe('ok');
    expect(body.service).toBe('news-fetch');
    // port field added by 1899a-routes (spec §AC GET /health)
    expect(body.port).toBe(5008);
  });

  it('GET /health Content-Type is application/json', async () => {
    const req = new Request('http://localhost:5008/health');
    const res = await app.fetch(req);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
