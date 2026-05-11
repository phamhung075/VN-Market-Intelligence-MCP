/**
 * Kinh Dich Service — Integration Tests (real handler, mock repos)
 *
 * Tests HTTP routing with real Hono handlers but mock use cases.
 */

import { describe, it, expect, mock } from 'bun:test';
import { createRouter } from '../../interface/handlers.js';
import type { ReadingUseCase, MarketHexagramUseCase } from '../../application/usecases.js';
import { HexagramNotFoundError, InsufficientDataError } from '../../domain/errors.js';
import type { ReadingResponse, MarketReadingResponse } from '../../application/dtos.js';

function makeReadingUseCase(result: ReadingResponse | Error): ReadingUseCase {
  return {
    execute: mock(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as ReadingUseCase;
}

function makeMarketUseCase(result: MarketReadingResponse | Error): MarketHexagramUseCase {
  return {
    execute: mock(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as MarketHexagramUseCase;
}

const SAMPLE_READING: ReadingResponse = {
  stock: 'VCB',
  hexagram: 11,
  name: 'Thai',
  trend: 'THUẬN LỢI — mạnh',
  signal: 'MUA (tích cực)',
  confidence: 0.75,
  actionNote: 'KHUYẾN NGHỊ: MUA',
  overallReading: '[VCB] Quẻ Thai...',
  timestamp: '2026-04-24T00:00:00.000Z',
};

const SAMPLE_MARKET: MarketReadingResponse = {
  hexagram: 54,
  name: 'Gui Mei',
  trend: 'BẤT LỢI',
  signal: 'GIU (tiêu cực)',
  confidence: 0.6,
  timestamp: '2026-04-24T00:00:00.000Z',
};

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const app = createRouter(
      makeReadingUseCase(SAMPLE_READING),
      makeMarketUseCase(SAMPLE_MARKET),
    );
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('kinh-dich-service');
  });
});

describe('GET /reading/:code', () => {
  it('returns 200 with reading for valid code', async () => {
    const app = createRouter(
      makeReadingUseCase(SAMPLE_READING),
      makeMarketUseCase(SAMPLE_MARKET),
    );
    const res = await app.fetch(new Request('http://localhost/reading/VCB?days=30'));
    expect(res.status).toBe(200);
    const body = await res.json() as ReadingResponse;
    expect(body.stock).toBe('VCB');
    expect(body.hexagram).toBe(11);
    expect(body.confidence).toBe(0.75);
  });

  it('returns 404 when hexagram not found', async () => {
    const app = createRouter(
      makeReadingUseCase(new HexagramNotFoundError('UNKNOWN')),
      makeMarketUseCase(SAMPLE_MARKET),
    );
    const res = await app.fetch(new Request('http://localhost/reading/UNKNOWN'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid days param', async () => {
    const app = createRouter(
      makeReadingUseCase(SAMPLE_READING),
      makeMarketUseCase(SAMPLE_MARKET),
    );
    const res = await app.fetch(new Request('http://localhost/reading/VCB?days=-5'));
    expect(res.status).toBe(400);
  });

  it('normalises stock code to uppercase', async () => {
    let capturedCode = '';
    const uc = {
      execute: mock(async ({ stockCode }: { stockCode: string }) => {
        capturedCode = stockCode;
        return SAMPLE_READING;
      }),
    } as unknown as ReadingUseCase;
    const app = createRouter(uc, makeMarketUseCase(SAMPLE_MARKET));
    await app.fetch(new Request('http://localhost/reading/vcb'));
    expect(capturedCode).toBe('VCB');
  });
});

describe('GET /market', () => {
  it('returns 200 with market reading', async () => {
    const app = createRouter(
      makeReadingUseCase(SAMPLE_READING),
      makeMarketUseCase(SAMPLE_MARKET),
    );
    const res = await app.fetch(new Request('http://localhost/market'));
    expect(res.status).toBe(200);
    const body = await res.json() as MarketReadingResponse;
    expect(body.hexagram).toBe(54);
    expect(body.name).toBe('Gui Mei');
  });

  it('returns 422 when insufficient data', async () => {
    const app = createRouter(
      makeReadingUseCase(SAMPLE_READING),
      makeMarketUseCase(new InsufficientDataError('VNINDEX', 30)),
    );
    const res = await app.fetch(new Request('http://localhost/market'));
    expect(res.status).toBe(422);
  });
});
