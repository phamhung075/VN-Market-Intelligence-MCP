/**
 * Unit tests — NullCalendarAdapter (wontfix: investing.com dead endpoint)
 *
 * investing.com/economic-calendar is permanently unreachable from the Docker
 * container (Cloudflare Turnstile v2, always times out). The adapter has been
 * replaced with NullCalendarAdapter that immediately returns [] at zero cost.
 *
 * Decision: wontfix — no viable free replacement for Vietnam economic calendar
 * without authentication. The InvestingCalendarPort and EconomicCalendarEvent
 * types are retained for future use.
 *
 * Also tests: DEFAULT_TIMEOUTS.calendar === 0 (no budget needed for null adapter).
 */

import { describe, it, expect } from 'bun:test';
import { NullCalendarAdapter } from '../../../src/infrastructure/scrapers/investing-economic-calendar.js';
import { DEFAULT_TIMEOUTS } from '../../../src/application/fetch-external-macro.js';

describe('NullCalendarAdapter', () => {
  it('implements InvestingCalendarPort and returns [] immediately', async () => {
    const adapter = new NullCalendarAdapter();
    const result = await adapter.fetchCalendar();
    expect(result).toEqual([]);
  });

  it('returns [] when countryId arg is supplied', async () => {
    const adapter = new NullCalendarAdapter();
    const result = await adapter.fetchCalendar('35');
    expect(result).toEqual([]);
  });

  it('resolves in under 50ms (no network, no subprocess)', async () => {
    const adapter = new NullCalendarAdapter();
    const start = Date.now();
    await adapter.fetchCalendar();
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe('DEFAULT_TIMEOUTS.calendar — wontfix null adapter', () => {
  it('calendar timeout is 0 — NullCalendarAdapter never needs a budget', () => {
    expect(DEFAULT_TIMEOUTS.calendar).toBe(0);
  });
});
