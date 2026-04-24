/**
 * Alert Engine — Integration Tests (real handler, mock use case)
 *
 * Tests HTTP routing with real Hono handlers but mock use case.
 */

import { describe, it, expect, mock } from 'bun:test';
import { createRouter } from '../../interface/handlers.js';
import type { EvaluateAlertUseCase } from '../../application/usecases.js';
import type { EvaluateAlertResponse } from '../../application/dtos.js';

const FIRED_RESPONSE: EvaluateAlertResponse = {
  fired: true,
  cooldown_sec: 1800,
  reason: 'alert fired',
  fingerprint: 'abc12345',
};

const SUPPRESSED_RESPONSE: EvaluateAlertResponse = {
  fired: false,
  cooldown_sec: 1800,
  reason: 'cooldown: same signal within 30min',
  fingerprint: 'abc12345',
};

function makeUseCase(result: EvaluateAlertResponse | Error): EvaluateAlertUseCase {
  return {
    execute: mock(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as EvaluateAlertUseCase;
}

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const app = createRouter(makeUseCase(FIRED_RESPONSE));
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('alert-engine');
  });
});

describe('POST /evaluate', () => {
  it('returns 200 with fired=true for valid alert', async () => {
    const app = createRouter(makeUseCase(FIRED_RESPONSE));
    const res = await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 'VCB', severity: 'high', message: 'Price surge' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as EvaluateAlertResponse;
    expect(body.fired).toBe(true);
    expect(body.fingerprint).toBe('abc12345');
  });

  it('returns 200 with fired=false when suppressed', async () => {
    const app = createRouter(makeUseCase(SUPPRESSED_RESPONSE));
    const res = await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 'VCB', severity: 'medium', message: 'repeated alert' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as EvaluateAlertResponse;
    expect(body.fired).toBe(false);
    expect(body.reason).toContain('cooldown');
  });

  it('returns 400 when stock is missing', async () => {
    const app = createRouter(makeUseCase(FIRED_RESPONSE));
    const res = await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: 'high', message: 'test' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid severity', async () => {
    const app = createRouter(makeUseCase(FIRED_RESPONSE));
    const res = await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 'VCB', severity: 'extreme', message: 'test' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const app = createRouter(makeUseCase(FIRED_RESPONSE));
    const res = await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 'VCB', severity: 'high' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON', async () => {
    const app = createRouter(makeUseCase(FIRED_RESPONSE));
    const res = await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('normalises stock code to uppercase', async () => {
    let capturedStock = '';
    const uc = {
      execute: mock(async (req: { stock: string }) => {
        capturedStock = req.stock;
        return FIRED_RESPONSE;
      }),
    } as unknown as EvaluateAlertUseCase;
    const app = createRouter(uc);
    await app.fetch(
      new Request('http://localhost/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 'vcb', severity: 'high', message: 'test' }),
      }),
    );
    expect(capturedStock).toBe('VCB');
  });
});
