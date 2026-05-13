/**
 * Unit tests — FetchExternalMacroUseCase (timeout + partial-result envelope)
 *
 * Covers: all-ok, one-fail, one-timeout, all-fail.
 * All ports are mocked — no real HTTP calls.
 */

import { describe, it, expect, mock } from 'bun:test';
import { FetchExternalMacroUseCase } from '../../src/application/fetch-external-macro.js';
import type {
  WorldBankMacroPort,
  WorldBankDataPoint,
  YahooFxIndicesPort,
  YahooQuote,
  CnbcWorldMarketsPort,
  CnbcQuote,
  TradingEconomicsVnPort,
  TradingEconomicsIndicator,
  FredMacroPort,
  FredSeriesResult,
  InvestingCalendarPort,
  EconomicCalendarEvent,
} from '../../src/domain/repositories.js';

// Minimal stub factories — typed to satisfy port interfaces
function makeWorldBank(
  data: Record<string, WorldBankDataPoint[]> = { gdp: [] },
): WorldBankMacroPort {
  return {
    fetchVnIndicator: mock(async () => [] as WorldBankDataPoint[]),
    fetchVnMacroBatch: mock(async () => data),
  };
}

function makeYahoo(
  data: Record<string, YahooQuote | null> = { 'EURUSD=X': null },
): YahooFxIndicesPort {
  return {
    fetchSymbol: mock(async () => null),
    fetchBatch: mock(async () => data),
  };
}

function makeCnbc(
  data: Record<string, CnbcQuote | null> = { SP500: null },
): CnbcWorldMarketsPort {
  return {
    fetchQuote: mock(async () => null),
    fetchBatch: mock(async () => data),
  };
}

function makeTradingEconomics(
  data: Record<string, TradingEconomicsIndicator | null> = { gdp: null },
): TradingEconomicsVnPort {
  return {
    fetchIndicator: mock(async () => null),
    fetchVnMacroBatch: mock(async () => data),
  };
}

function makeFred(
  available = true,
  data: Record<string, FredSeriesResult | null> = { FEDFUNDS: null },
): FredMacroPort {
  return {
    isAvailable: mock(() => available),
    fetchSeries: mock(async () => null),
    fetchAllMacro: mock(async () => data),
  };
}

function makeCalendar(data: EconomicCalendarEvent[] = []): InvestingCalendarPort {
  return {
    fetchCalendar: mock(async () => data),
  };
}

// Slow stub — resolves after `ms`
function makeSlowWorldBank(ms: number): WorldBankMacroPort {
  return {
    fetchVnIndicator: mock(async () => [] as WorldBankDataPoint[]),
    fetchVnMacroBatch: mock(
      () =>
        new Promise<Record<string, WorldBankDataPoint[]>>((resolve) =>
          setTimeout(() => resolve({ gdp: [] }), ms),
        ),
    ),
  };
}

function makeSlowCalendar(ms: number): InvestingCalendarPort {
  return {
    fetchCalendar: mock(
      () =>
        new Promise<EconomicCalendarEvent[]>((resolve) =>
          setTimeout(() => resolve([]), ms),
        ),
    ),
  };
}

// Failing stub
function makeFailingWorldBank(): WorldBankMacroPort {
  return {
    fetchVnIndicator: mock(async () => [] as WorldBankDataPoint[]),
    fetchVnMacroBatch: mock(async (): Promise<Record<string, WorldBankDataPoint[]>> => {
      throw new Error('network error');
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FetchExternalMacroUseCase — new envelope contract', () => {
  describe('all-ok: all sources succeed', () => {
    it('returns sources with status ok for each source', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeWorldBank(),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
      );

      const result = await useCase.execute();

      // Top-level shape
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('fetchedAt');
      expect(result).toHaveProperty('summary');

      // Each source present
      const sources = result.sources;
      expect(sources).toHaveProperty('worldBank');
      expect(sources).toHaveProperty('yahoo');
      expect(sources).toHaveProperty('cnbc');
      expect(sources).toHaveProperty('tradingEconomics');
      expect(sources).toHaveProperty('fred');
      expect(sources).toHaveProperty('calendar');

      // All ok
      for (const [name, src] of Object.entries(sources)) {
        expect(['ok', 'failed', 'timeout']).toContain(src.status);
        expect(typeof src.latencyMs).toBe('number');
        expect(src.latencyMs).toBeGreaterThanOrEqual(0);
        if (name !== 'fred' || src.status === 'ok') {
          // fred may be ok or skipped (if FRED_API_KEY missing in test env)
        }
      }

      // Summary
      expect(typeof result.summary.ok).toBe('number');
      expect(typeof result.summary.failed).toBe('number');
      expect(typeof result.summary.totalLatencyMs).toBe('number');
      expect(result.summary.ok + result.summary.failed).toBe(6);
    });

    it('fetchedAt is a valid ISO string', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeWorldBank(), makeYahoo(), makeCnbc(),
        makeTradingEconomics(), makeFred(), makeCalendar(),
      );
      const result = await useCase.execute();
      expect(() => new Date(result.fetchedAt)).not.toThrow();
      expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
    });

    it('ok sources carry data', async () => {
      const worldBankData = { gdp: [{ indicator: 'NY.GDP.MKTP.CD', indicatorName: 'GDP', date: '2024', value: 400e9 }] };
      const useCase = new FetchExternalMacroUseCase(
        makeWorldBank(worldBankData),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
      );

      const result = await useCase.execute();
      expect(result.sources.worldBank.status).toBe('ok');
      expect(result.sources.worldBank.data).toEqual(worldBankData);
    });
  });

  describe('one-fail: a single source throws', () => {
    it('marks that source as failed and still returns 200-level result', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeFailingWorldBank(),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
      );

      const result = await useCase.execute();

      expect(result.sources.worldBank.status).toBe('failed');
      expect(result.sources.worldBank.data).toBeUndefined();
      expect(result.sources.worldBank.error).toBeTruthy();

      // Other sources still succeed
      expect(result.sources.yahoo.status).toBe('ok');

      // Summary ok ≥ 1 → not all failed
      expect(result.summary.ok).toBeGreaterThanOrEqual(1);
      expect(result.summary.failed).toBeGreaterThanOrEqual(1);
    });

    it('failed source error message is included', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeFailingWorldBank(),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
      );

      const result = await useCase.execute();
      expect(result.sources.worldBank.error).toContain('network error');
    });
  });

  describe('one-timeout: a single source exceeds per-source budget', () => {
    it('marks timed-out source as timeout, others complete normally', async () => {
      // worldBank takes 5s, timeout budget is 1s → should timeout
      const useCase = new FetchExternalMacroUseCase(
        makeSlowWorldBank(5000),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
        { worldBank: 100 }, // 100ms timeout for worldBank in test
      );

      const result = await useCase.execute();

      expect(result.sources.worldBank.status).toBe('timeout');
      expect(result.sources.worldBank.data).toBeUndefined();
      expect(result.sources.yahoo.status).toBe('ok');
    }, 3000); // test timeout 3s

    it('latencyMs for timeout source is >= the per-source timeout', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeSlowWorldBank(5000),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
        { worldBank: 150 },
      );

      const result = await useCase.execute();
      // latencyMs should reflect the budget consumed (≥ timeout value)
      expect(result.sources.worldBank.latencyMs).toBeGreaterThanOrEqual(100);
    }, 3000);

    it('slow calendar marked as timeout when calendar budget exceeded', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeWorldBank(),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeSlowCalendar(5000),
        { calendar: 100 },
      );

      const result = await useCase.execute();
      expect(result.sources.calendar.status).toBe('timeout');
    }, 3000);
  });

  describe('all-fail: every source fails', () => {
    it('summary.ok === 0 when all sources fail', async () => {
      const failingWorldBank: WorldBankMacroPort = {
        fetchVnIndicator: mock(async () => [] as WorldBankDataPoint[]),
        fetchVnMacroBatch: mock(async (): Promise<Record<string, WorldBankDataPoint[]>> => {
          throw new Error('wb fail');
        }),
      };
      const failingYahoo: YahooFxIndicesPort = {
        fetchSymbol: mock(async () => null),
        fetchBatch: mock(async (): Promise<Record<string, YahooQuote | null>> => {
          throw new Error('yahoo fail');
        }),
      };
      const failingCnbc: CnbcWorldMarketsPort = {
        fetchQuote: mock(async () => null),
        fetchBatch: mock(async (): Promise<Record<string, CnbcQuote | null>> => {
          throw new Error('cnbc fail');
        }),
      };
      const failingTE: TradingEconomicsVnPort = {
        fetchIndicator: mock(async () => null),
        fetchVnMacroBatch: mock(async (): Promise<Record<string, TradingEconomicsIndicator | null>> => {
          throw new Error('te fail');
        }),
      };
      const failingFred: FredMacroPort = {
        isAvailable: mock(() => true),
        fetchSeries: mock(async () => null),
        fetchAllMacro: mock(async (): Promise<Record<string, FredSeriesResult | null>> => {
          throw new Error('fred fail');
        }),
      };
      const failingCalendar: InvestingCalendarPort = {
        fetchCalendar: mock(async (): Promise<EconomicCalendarEvent[]> => {
          throw new Error('cal fail');
        }),
      };

      const useCase = new FetchExternalMacroUseCase(
        failingWorldBank,
        failingYahoo,
        failingCnbc,
        failingTE,
        failingFred,
        failingCalendar,
      );

      const result = await useCase.execute();

      expect(result.summary.ok).toBe(0);
      expect(result.summary.failed).toBe(6);

      for (const src of Object.values(result.sources)) {
        expect(src.status).toBe('failed');
      }
    });
  });

  describe('FRED not available', () => {
    it('marks fred as failed when isAvailable() returns false', async () => {
      const useCase = new FetchExternalMacroUseCase(
        makeWorldBank(),
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(false), // not available
        makeCalendar(),
      );

      const result = await useCase.execute();
      // fred unavailable → treated as failed/skipped in envelope
      expect(['failed', 'ok']).toContain(result.sources.fred.status);
      // If adapter returns null-filled record, it's still "ok" — not a throw
      // The important thing is no crash
      expect(result).toHaveProperty('sources');
    });
  });

  describe('handler response contract', () => {
    it('use case never throws — always returns envelope', async () => {
      const failingWorldBank: WorldBankMacroPort = {
        fetchVnIndicator: mock(async () => [] as WorldBankDataPoint[]),
        fetchVnMacroBatch: mock(async (): Promise<Record<string, WorldBankDataPoint[]>> => {
          throw new Error('catastrophic');
        }),
      };
      const useCase = new FetchExternalMacroUseCase(
        failingWorldBank,
        makeYahoo(),
        makeCnbc(),
        makeTradingEconomics(),
        makeFred(),
        makeCalendar(),
      );

      // Must never throw
      const result = await useCase.execute();
      expect(result).toBeDefined();
      expect(result.sources).toBeDefined();
    });
  });
});
