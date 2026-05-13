/**
 * Unit tests — InvestingCalendarAdapter + FetchExternalMacroUseCase
 *
 * InvestingCalendarAdapter shells out to Python — unit tests mock the port
 * directly rather than spawning Python (that is the integration test's job).
 *
 * Also tests FetchExternalMacroUseCase orchestration with all 6 mocked ports.
 */

import { describe, it, expect, mock } from 'bun:test';
import { FetchExternalMacroUseCase } from '../../../src/application/fetch-external-macro.js';
import type {
  WorldBankMacroPort,
  YahooFxIndicesPort,
  CnbcWorldMarketsPort,
  TradingEconomicsVnPort,
  FredMacroPort,
  InvestingCalendarPort,
  EconomicCalendarEvent,
} from '../../../src/domain/repositories.js';

function makeCalendarEvent(overrides: Partial<EconomicCalendarEvent> = {}): EconomicCalendarEvent {
  return {
    time: '09:30',
    country: 'Vietnam',
    event: 'GDP Growth Rate QoQ',
    actual: '7.09%',
    forecast: '6.80%',
    previous: '7.55%',
    impact: 'high',
    ...overrides,
  };
}

function makeMockWorldBank(): WorldBankMacroPort {
  return {
    fetchVnIndicator: mock(async () => []),
    fetchVnMacroBatch: mock(async () => ({ gdp_usd: [], cpi_inflation: [] })),
  };
}

function makeMockYahoo(): YahooFxIndicesPort {
  return {
    fetchSymbol: mock(async () => null),
    fetchBatch: mock(async () => ({ 'EURUSD=X': null })),
  };
}

function makeMockCnbc(): CnbcWorldMarketsPort {
  return {
    fetchQuote: mock(async () => null),
    fetchBatch: mock(async () => ({ SP500: null })),
  };
}

function makeMockTe(): TradingEconomicsVnPort {
  return {
    fetchIndicator: mock(async () => null),
    fetchVnMacroBatch: mock(async () => ({ gdp: null })),
  };
}

function makeMockFred(available = false): FredMacroPort {
  return {
    isAvailable: mock(() => available),
    fetchSeries: mock(async () => null),
    fetchAllMacro: mock(async () => ({ fed_funds_rate: null })),
  };
}

function makeMockCalendar(events: EconomicCalendarEvent[] = []): InvestingCalendarPort {
  return {
    fetchCalendar: mock(async () => events),
  };
}

describe('FetchExternalMacroUseCase', () => {
  it('returns ExternalMacroResult with all 6 source fields', async () => {
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(),
      makeMockYahoo(),
      makeMockCnbc(),
      makeMockTe(),
      makeMockFred(false),
      makeMockCalendar([makeCalendarEvent()]),
    );

    const result = await useCase.execute();

    expect(result.worldBankVn).not.toBeNull();
    expect(result.yahooFxIndices).not.toBeNull();
    expect(result.cnbcIndices).not.toBeNull();
    expect(result.tradingEconomicsVn).not.toBeNull();
    expect(result.fredMacro).not.toBeNull();
    expect(Array.isArray(result.economicCalendar)).toBe(true);
    expect(result.fetchedAt).toBeTruthy();
  });

  it('reports fredAvailable=false when key not set', async () => {
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), makeMockCalendar(),
    );
    const result = await useCase.execute();
    expect(result.fredAvailable).toBe(false);
  });

  it('reports fredAvailable=true when key is set', async () => {
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(true), makeMockCalendar(),
    );
    const result = await useCase.execute();
    expect(result.fredAvailable).toBe(true);
  });

  it('returns calendar events in economicCalendar field', async () => {
    const events = [makeCalendarEvent(), makeCalendarEvent({ event: 'CPI YoY', impact: 'medium' })];
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), makeMockCalendar(events),
    );
    const result = await useCase.execute();
    expect(result.economicCalendar).toHaveLength(2);
    expect(result.economicCalendar[0]!.event).toBe('GDP Growth Rate QoQ');
    expect(result.economicCalendar[1]!.impact).toBe('medium');
  });

  it('returns empty calendar on calendar fetch failure', async () => {
    const brokenCalendar: InvestingCalendarPort = {
      fetchCalendar: mock(async () => { throw new Error('CF blocked'); }),
    };
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), brokenCalendar,
    );
    const result = await useCase.execute();
    expect(result.economicCalendar).toEqual([]);
  });

  it('still returns results when individual scrapers fail (Promise.allSettled)', async () => {
    const brokenWorldBank: WorldBankMacroPort = {
      fetchVnIndicator: mock(async () => { throw new Error('timeout'); }),
      fetchVnMacroBatch: mock(async () => { throw new Error('timeout'); }),
    };
    const useCase = new FetchExternalMacroUseCase(
      brokenWorldBank, makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), makeMockCalendar(),
    );
    const result = await useCase.execute();
    // worldBankVn is null due to failure; others succeed
    expect(result.worldBankVn).toBeNull();
    expect(result.yahooFxIndices).not.toBeNull();
  });
});
