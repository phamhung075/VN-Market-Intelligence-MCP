/**
 * Unit tests — InvestingCalendarAdapter + FetchExternalMacroUseCase
 *
 * InvestingCalendarAdapter shells out to Python — unit tests mock the port
 * directly rather than spawning Python (that is the integration test's job).
 *
 * Also tests FetchExternalMacroUseCase orchestration with all 6 mocked ports.
 * Updated to the new partial-result envelope shape (ExternalMacroEnvelope).
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
  it('returns ExternalMacroEnvelope with all 6 sources in the sources field', async () => {
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(),
      makeMockYahoo(),
      makeMockCnbc(),
      makeMockTe(),
      makeMockFred(false),
      makeMockCalendar([makeCalendarEvent()]),
    );

    const result = await useCase.execute();

    // New envelope shape
    expect(result).toHaveProperty('sources');
    expect(result).toHaveProperty('fetchedAt');
    expect(result).toHaveProperty('summary');

    expect(result.sources.worldBank.status).toBe('ok');
    expect(result.sources.yahoo.status).toBe('ok');
    expect(result.sources.cnbc.status).toBe('ok');
    expect(result.sources.tradingEconomics.status).toBe('ok');
    expect(result.sources.fred.status).toBe('ok');
    expect(result.sources.calendar.status).toBe('ok');
    expect(result.fetchedAt).toBeTruthy();
  });

  it('fred source is ok regardless of isAvailable — adapter returns null-filled record (not throws)', async () => {
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), makeMockCalendar(),
    );
    const result = await useCase.execute();
    // isAvailable=false means the adapter returns null-filled record, not throws
    // so the envelope sees status='ok' (data received, albeit null-filled)
    expect(result.sources.fred.status).toBe('ok');
  });

  it('fred source is ok when isAvailable=true', async () => {
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(true), makeMockCalendar(),
    );
    const result = await useCase.execute();
    expect(result.sources.fred.status).toBe('ok');
  });

  it('returns calendar events in calendar source data field', async () => {
    const events = [makeCalendarEvent(), makeCalendarEvent({ event: 'CPI YoY', impact: 'medium' })];
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), makeMockCalendar(events),
    );
    const result = await useCase.execute();
    expect(result.sources.calendar.status).toBe('ok');
    const calData = result.sources.calendar.data as EconomicCalendarEvent[];
    expect(calData).toHaveLength(2);
    expect(calData[0]!.event).toBe('GDP Growth Rate QoQ');
    expect(calData[1]!.impact).toBe('medium');
  });

  it('marks calendar as failed and still returns envelope on calendar fetch failure', async () => {
    const brokenCalendar: InvestingCalendarPort = {
      fetchCalendar: mock(async () => { throw new Error('CF blocked'); }),
    };
    const useCase = new FetchExternalMacroUseCase(
      makeMockWorldBank(), makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), brokenCalendar,
    );
    const result = await useCase.execute();
    // calendar failed, but envelope is still returned
    expect(result.sources.calendar.status).toBe('failed');
    expect(result.sources.calendar.error).toContain('CF blocked');
    // other sources succeed
    expect(result.sources.worldBank.status).toBe('ok');
  });

  it('marks worldBank as failed when scraper throws, others succeed', async () => {
    const brokenWorldBank: WorldBankMacroPort = {
      fetchVnIndicator: mock(async () => { throw new Error('timeout'); }),
      fetchVnMacroBatch: mock(async () => { throw new Error('timeout'); }),
    };
    const useCase = new FetchExternalMacroUseCase(
      brokenWorldBank, makeMockYahoo(), makeMockCnbc(),
      makeMockTe(), makeMockFred(false), makeMockCalendar(),
    );
    const result = await useCase.execute();
    // worldBank failed; others succeed
    expect(result.sources.worldBank.status).toBe('failed');
    expect(result.sources.worldBank.data).toBeUndefined();
    expect(result.sources.yahoo.status).toBe('ok');
    // summary reflects partial success
    expect(result.summary.ok).toBeGreaterThanOrEqual(1);
    expect(result.summary.failed).toBeGreaterThanOrEqual(1);
  });
});
