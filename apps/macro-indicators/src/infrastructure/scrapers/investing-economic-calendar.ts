/**
 * Infrastructure Adapter — investing-economic-calendar
 *
 * WONTFIX (2026-05-18): investing.com/economic-calendar is permanently
 * unreachable from the Docker container. Cloudflare Turnstile v2 JS challenge
 * blocked all bypass attempts (FlareSolverr v3.4.6, curl_cffi chrome124/136).
 * The endpoint always timed out regardless of timeout budget (30s → 10s → 5s).
 * No viable free replacement for Vietnam economic calendar events was found.
 *
 * Decision: replace with NullCalendarAdapter that returns [] immediately.
 *   - Zero CPU/RAM/time cost per macroRefresh cycle
 *   - InvestingCalendarPort + EconomicCalendarEvent types retained for future use
 *   - Python helper (investing_calendar_fetch.py) retained as historical reference
 *   - DEFAULT_TIMEOUTS.calendar set to 0 in FetchExternalMacroUseCase
 *
 * History:
 *   2026-05-13: FlareSolverr smoke test passed (1.53MB HTML, 5s) — initial hope
 *   2026-05-13: Subsequent calls always timeout — endpoint permanently blocked
 *   2026-05-17: Timeout cap reduced 30s → 10s → 5s to limit cycle blocking
 *   2026-05-18: Wontfix — replaced with NullCalendarAdapter (zero-cost stub)
 */

import type { InvestingCalendarPort, EconomicCalendarEvent } from '../../domain/repositories.js';

/**
 * NullCalendarAdapter — zero-cost stub for permanently unreachable endpoint.
 *
 * Implements InvestingCalendarPort. Always returns [] immediately.
 * Wire this in index.ts instead of the old InvestingCalendarAdapter.
 * DEFAULT_TIMEOUTS.calendar should be 0 — no budget needed.
 */
export class NullCalendarAdapter implements InvestingCalendarPort {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchCalendar(_countryId?: string): Promise<EconomicCalendarEvent[]> {
    return [];
  }
}

/**
 * InvestingCalendarAdapter — DEPRECATED (wontfix 2026-05-18).
 *
 * Retained as dead code for historical reference. Do NOT wire this in index.ts.
 * The Python helper (investing_calendar_fetch.py) is also retained for reference.
 *
 * Original approach: shell out to Python subprocess for FlareSolverr bypass.
 * Root cause of failure: Cloudflare Turnstile v2 JS challenge — always times out
 * from Docker container network regardless of solver configuration.
 *
 * @deprecated Use NullCalendarAdapter instead.
 */
export class InvestingCalendarAdapter implements InvestingCalendarPort {
  async fetchCalendar(_countryId?: string): Promise<EconomicCalendarEvent[]> {
    console.warn(
      '[investing-calendar] InvestingCalendarAdapter is deprecated (wontfix 2026-05-18). ' +
      'Wire NullCalendarAdapter instead.'
    );
    return [];
  }
}
