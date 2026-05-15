/**
 * Integration tests — FetchPriceUseCase + PriceHistoryUseCase
 *
 * Real ResolvePriceService + mocked tier fetchers + in-memory history.
 */

import { describe, it, expect, mock } from 'bun:test';
import { FetchPriceUseCase, PriceHistoryUseCase } from '../../src/application/usecases.js';
import { ResolvePriceService, PriceNotAvailableError } from '../../src/domain/services.js';
import type { PriceFetcherPort, PriceHistoryPort } from '../../src/domain/repositories.js';
import type { PriceQuote, DailyOHLCV } from '../../src/domain/models.js';

function makeQuote(code: string): PriceQuote {
  return {
    code, price: 88000, volume: 2000000, change: -1000, changePercent: -1.12,
    source: 'hose', latencyMs: 45, fetchedAt: new Date().toISOString(),
  };
}

function makeHistory(days = 5): PriceHistoryPort {
  const history: DailyOHLCV[] = Array.from({ length: days }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: 85000, high: 87000, low: 84000, close: 86000, volume: 1000000,
  }));
  return {
    getHistory: mock(async () => history),
    saveQuote: mock(async () => void 0),
  };
}

describe('FetchPriceUseCase (integration)', () => {
  it('returns correctly shaped FetchPriceResponse', async () => {
    const tier1: PriceFetcherPort = { fetchPrice: mock(async (code) => makeQuote(code)) };
    const service = new ResolvePriceService(tier1, { fetchPrice: mock(async () => null) }, { fetchPrice: mock(async () => null) }, makeHistory());
    const useCase = new FetchPriceUseCase(service);

    const result = await useCase.execute({ code: 'VCB' });

    expect(result.code).toBe('VCB');
    expect(result.price).toBe(88000);
    expect(result.source).toBe('hose');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.fetchedAt).toBeTruthy();
  });

  it('uppercases code before fetch', async () => {
    let capturedCode = '';
    const tier1: PriceFetcherPort = {
      fetchPrice: mock(async (code) => { capturedCode = code; return makeQuote(code); }),
    };
    const service = new ResolvePriceService(tier1, { fetchPrice: mock(async () => null) }, { fetchPrice: mock(async () => null) }, makeHistory());
    const useCase = new FetchPriceUseCase(service);

    await useCase.execute({ code: 'vcb' });

    expect(capturedCode).toBe('VCB');
  });

  it('propagates PriceNotAvailableError when all tiers fail', async () => {
    const failing: PriceFetcherPort = { fetchPrice: mock(async () => null) };
    const service = new ResolvePriceService(failing, failing, failing, makeHistory());
    const useCase = new FetchPriceUseCase(service);

    await expect(useCase.execute({ code: 'UNKNOWN' })).rejects.toBeInstanceOf(PriceNotAvailableError);
  });
});

describe('PriceHistoryUseCase (integration)', () => {
  it('returns history for given code and days', async () => {
    const historyRepo = makeHistory(30);
    const useCase = new PriceHistoryUseCase(historyRepo);

    const result = await useCase.execute({ code: 'VCB', days: 30 });

    expect(result.code).toBe('VCB');
    expect(Array.isArray(result.history)).toBe(true);
    expect(result.history).toHaveLength(30);
    expect(historyRepo.getHistory).toHaveBeenCalledWith('VCB', 30);
  });

  it('uppercases code in history response', async () => {
    const historyRepo = makeHistory(5);
    const useCase = new PriceHistoryUseCase(historyRepo);

    const result = await useCase.execute({ code: 'hpg', days: 5 });

    expect(result.code).toBe('HPG');
  });

  it('returns empty array for unknown code', async () => {
    const emptyRepo: PriceHistoryPort = {
      getHistory: mock(async () => []),
      saveQuote: mock(async () => void 0),
    };
    const useCase = new PriceHistoryUseCase(emptyRepo);

    const result = await useCase.execute({ code: 'UNKNOWN', days: 30 });

    expect(result.history).toHaveLength(0);
  });
});
