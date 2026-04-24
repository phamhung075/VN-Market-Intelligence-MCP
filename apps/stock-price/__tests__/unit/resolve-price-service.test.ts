/**
 * Unit tests — ResolvePriceService
 *
 * Tests 3-tier fallback logic using mocked ports.
 */

import { describe, it, expect, mock } from 'bun:test';
import { ResolvePriceService, PriceNotAvailableError } from '../../src/domain/services.js';
import type { PriceFetcherPort, PriceHistoryPort } from '../../src/domain/repositories.js';
import type { PriceQuote } from '../../src/domain/models.js';

function makeQuote(code: string, source: PriceQuote['source']): PriceQuote {
  return {
    code, price: 75000, volume: 1000000, change: 500, changePercent: 0.67,
    source, latencyMs: 50, fetchedAt: new Date().toISOString(),
  };
}

function makeFetcher(result: PriceQuote | null): PriceFetcherPort {
  return { fetchPrice: mock(async () => result) };
}

function makeHistory(): PriceHistoryPort {
  return {
    getHistory: mock(async () => []),
    saveQuote: mock(async () => void 0),
  };
}

describe('ResolvePriceService', () => {
  it('returns tier1 result when tier1 succeeds', async () => {
    const tier1 = makeFetcher(makeQuote('VCB', 'hose'));
    const tier2 = makeFetcher(makeQuote('VCB', 'hnx'));
    const tier3 = makeFetcher(makeQuote('VCB', 'cache'));
    const service = new ResolvePriceService(tier1, tier2, tier3, makeHistory());

    const result = await service.fetchPrice('VCB');

    expect(result.source).toBe('hose');
  });

  it('falls back to tier2 when tier1 returns null', async () => {
    const tier1 = makeFetcher(null);
    const tier2 = makeFetcher(makeQuote('VCB', 'hnx'));
    const tier3 = makeFetcher(makeQuote('VCB', 'cache'));
    const service = new ResolvePriceService(tier1, tier2, tier3, makeHistory());

    const result = await service.fetchPrice('VCB');

    expect(result.source).toBe('hnx');
  });

  it('falls back to tier3 when tier1 and tier2 return null', async () => {
    const tier1 = makeFetcher(null);
    const tier2 = makeFetcher(null);
    const tier3 = makeFetcher(makeQuote('VCB', 'cache'));
    const service = new ResolvePriceService(tier1, tier2, tier3, makeHistory());

    const result = await service.fetchPrice('VCB');

    expect(result.source).toBe('cache');
  });

  it('throws PriceNotAvailableError when all tiers fail', async () => {
    const service = new ResolvePriceService(
      makeFetcher(null), makeFetcher(null), makeFetcher(null), makeHistory(),
    );

    await expect(service.fetchPrice('UNKNOWN')).rejects.toBeInstanceOf(PriceNotAvailableError);
  });

  it('throws PriceNotAvailableError when all tiers throw', async () => {
    const throwing: PriceFetcherPort = {
      fetchPrice: mock(async () => { throw new Error('network'); }),
    };
    const service = new ResolvePriceService(throwing, throwing, throwing, makeHistory());

    await expect(service.fetchPrice('VCB')).rejects.toBeInstanceOf(PriceNotAvailableError);
  });

  it('calls saveQuote on history repo after successful fetch', async () => {
    const tier1 = makeFetcher(makeQuote('VCB', 'hose'));
    const history = makeHistory();
    const service = new ResolvePriceService(tier1, makeFetcher(null), makeFetcher(null), history);

    await service.fetchPrice('VCB');

    // saveQuote is fire-and-forget — allow microtask to complete
    await new Promise((r) => setTimeout(r, 10));
    expect(history.saveQuote).toHaveBeenCalledWith(expect.objectContaining({ code: 'VCB', source: 'hose' }));
  });

  it('returns correct code in quote', async () => {
    const service = new ResolvePriceService(
      makeFetcher(makeQuote('HPG', 'hose')),
      makeFetcher(null), makeFetcher(null), makeHistory(),
    );

    const result = await service.fetchPrice('HPG');

    expect(result.code).toBe('HPG');
  });
});
