/**
 * Application Use Case — FetchExternalMacroUseCase
 *
 * Orchestrates all 6 external macro scrapers:
 *   1. world-bank-macro      (header-rotation, ~5MB)
 *   2. yahoo-finance-fx-indices (header-rotation, ~5MB)
 *   3. cnbc-world-markets    (header-rotation, ~5MB)
 *   4. trading-economics-vn  (header-rotation, ~5MB)
 *   5. fred-macro            (open-api-key, ~5MB — conditional on FRED_API_KEY)
 *   6. investing-economic-calendar (NullCalendarAdapter — wontfix 2026-05-18)
 *
 * All 6 sources run concurrently via Promise.allSettled.
 * Each source has an independent per-source timeout (default: 8s for fast scrapers).
 * A timed-out source is marked status='timeout'; it never blocks the others.
 * calendar budget is 0ms — NullCalendarAdapter returns [] immediately.
 *
 * Contract: execute() NEVER throws. Always returns ExternalMacroEnvelope.
 * HTTP 200 when ≥1 source succeeded; HTTP 502 only when ALL sources failed
 * (the handler inspects summary.ok to decide the status code).
 *
 * FRED: if key absent, fredMacro field returns null-filled record; ops signaled
 * via console warning (key addition auto-activates adapter — no code change needed).
 */

import type {
  WorldBankMacroPort,
  YahooFxIndicesPort,
  CnbcWorldMarketsPort,
  TradingEconomicsVnPort,
  FredMacroPort,
  InvestingCalendarPort,
} from '../domain/repositories.js';
import { DEFAULT_SYMBOLS, DEFAULT_CNBC_SYMBOLS } from '../domain/defaults.js';

// ── Per-source timeout budgets (ms) ──────────────────────────────────────────

/**
 * Default timeout budget per source. Override via constructor for tests.
 *
 * 2026-05-13: yahoo, cnbc, tradingEconomics upgraded to Python subprocess
 * (curl_cffi + ThreadPoolExecutor). Budgets raised to accommodate subprocess
 * startup (~1s) + parallel network time (~3-5s) + safety margin.
 *   yahoo:           50s (11 symbols, parallel ~4s in practice)
 *   cnbc:            35s (6 dotted symbols, parallel ~2s in practice)
 *   tradingEconomics: 65s (7 slugs, parallel ~4-6s; slug pages are heavier)
 *
 * 2026-05-17: calendar reduced from 30s → 10s → 5s.
 *   Observed hang: ~63s (totalLatencyMs: 62700ms, status: "timeout").
 *   Root cause: subprocess can stall far beyond 30s CF warmup estimate.
 *   10s cap introduced 2026-05-17; further reduced to 5s same day because
 *   the calendar endpoint is permanently unreachable — shorter timeout
 *   reduces page-load wait from ~30s to ~5s.
 * 2026-05-18: wontfix — NullCalendarAdapter replaces InvestingCalendarAdapter.
 *   NullCalendarAdapter returns [] immediately; calendar budget is now 0ms.
 *   The other 5 sources (worldBank, yahoo, fred, cnbc, tradingEconomics)
 *   are never blocked — all 6 run concurrently via Promise.all(withTimeout).
 */
export const DEFAULT_TIMEOUTS: Required<SourceTimeouts> = {
  worldBank:         8_000,
  yahoo:            50_000,  // Python subprocess + 11 parallel symbol fetches
  cnbc:             35_000,  // Python subprocess + 6 parallel quote fetches
  tradingEconomics: 65_000,  // Python subprocess + 7 parallel TE page fetches
  fred:              8_000,
  calendar:              0,  // Wontfix 2026-05-18: NullCalendarAdapter returns [] instantly
};

export interface SourceTimeouts {
  worldBank?:        number;
  yahoo?:            number;
  cnbc?:             number;
  tradingEconomics?: number;
  fred?:             number;
  calendar?:         number;
}

// ── Result envelope types ─────────────────────────────────────────────────────

export type SourceStatus = 'ok' | 'failed' | 'timeout';

export interface SourceResult<T = unknown> {
  status: SourceStatus;
  data?: T;
  error?: string;
  latencyMs: number;
}

export interface ExternalMacroSources {
  worldBank:        SourceResult<Awaited<ReturnType<WorldBankMacroPort['fetchVnMacroBatch']>>>;
  yahoo:            SourceResult<Awaited<ReturnType<YahooFxIndicesPort['fetchBatch']>>>;
  cnbc:             SourceResult<Awaited<ReturnType<CnbcWorldMarketsPort['fetchBatch']>>>;
  tradingEconomics: SourceResult<Awaited<ReturnType<TradingEconomicsVnPort['fetchVnMacroBatch']>>>;
  fred:             SourceResult<Awaited<ReturnType<FredMacroPort['fetchAllMacro']>>>;
  calendar:         SourceResult<Awaited<ReturnType<InvestingCalendarPort['fetchCalendar']>>>;
}

export interface ExternalMacroSummary {
  ok:             number;
  failed:         number;
  totalLatencyMs: number;
}

export interface ExternalMacroEnvelope {
  sources:   ExternalMacroSources;
  fetchedAt: string;            // ISO timestamp
  summary:   ExternalMacroSummary;
}

// ── Timeout sentinel ──────────────────────────────────────────────────────────

const TIMEOUT_SENTINEL = Symbol('timeout');

/**
 * Races a promise against a per-source timeout.
 * Returns { data, latencyMs } on success.
 * Returns { timedOut: true, latencyMs } on timeout.
 * Returns { error, latencyMs } on rejection.
 * Never throws.
 */
async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  budgetMs: number,
): Promise<SourceResult<T>> {
  const start = Date.now();

  const timeoutPromise: Promise<typeof TIMEOUT_SENTINEL> = new Promise((resolve) =>
    setTimeout(() => resolve(TIMEOUT_SENTINEL), budgetMs),
  );

  try {
    const winner = await Promise.race([fn(), timeoutPromise]);

    const latencyMs = Date.now() - start;

    if (winner === TIMEOUT_SENTINEL) {
      console.warn(`[FetchExternalMacroUseCase] ${label} timed out after ${budgetMs}ms`);
      return { status: 'timeout', latencyMs };
    }

    return { status: 'ok', data: winner as T, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[FetchExternalMacroUseCase] ${label} failed: ${error}`);
    return { status: 'failed', error, latencyMs };
  }
}

// ── Use Case ──────────────────────────────────────────────────────────────────

export class FetchExternalMacroUseCase {
  private readonly timeouts: Required<SourceTimeouts>;

  constructor(
    private readonly worldBank: WorldBankMacroPort,
    private readonly yahooFx: YahooFxIndicesPort,
    private readonly cnbc: CnbcWorldMarketsPort,
    private readonly tradingEconomics: TradingEconomicsVnPort,
    private readonly fred: FredMacroPort,
    private readonly calendar: InvestingCalendarPort,
    timeouts?: SourceTimeouts,
  ) {
    this.timeouts = {
      worldBank:        timeouts?.worldBank        ?? DEFAULT_TIMEOUTS.worldBank,
      yahoo:            timeouts?.yahoo            ?? DEFAULT_TIMEOUTS.yahoo,
      cnbc:             timeouts?.cnbc             ?? DEFAULT_TIMEOUTS.cnbc,
      tradingEconomics: timeouts?.tradingEconomics ?? DEFAULT_TIMEOUTS.tradingEconomics,
      fred:             timeouts?.fred             ?? DEFAULT_TIMEOUTS.fred,
      calendar:         timeouts?.calendar         ?? DEFAULT_TIMEOUTS.calendar,
    };
  }

  async execute(): Promise<ExternalMacroEnvelope> {
    const fetchedAt = new Date().toISOString();

    if (!this.fred.isAvailable()) {
      console.warn(
        '[FetchExternalMacroUseCase] FRED_API_KEY not set — ' +
        'fred-macro adapter inactive. Ops: add FRED_API_KEY to .env to activate.',
      );
    }

    // Fan out all 6 sources concurrently with per-source timeout guards.
    // Promise.allSettled on withTimeout() calls is redundant (withTimeout never rejects)
    // but kept for symmetry and future-proofing.
    const [worldBankR, yahooR, cnbcR, tradingEconomicsR, fredR, calendarR] =
      await Promise.all([
        withTimeout(
          'worldBank',
          () => this.worldBank.fetchVnMacroBatch(),
          this.timeouts.worldBank,
        ),
        withTimeout(
          'yahoo',
          () => this.yahooFx.fetchBatch(DEFAULT_SYMBOLS),
          this.timeouts.yahoo,
        ),
        withTimeout(
          'cnbc',
          () => this.cnbc.fetchBatch(DEFAULT_CNBC_SYMBOLS),
          this.timeouts.cnbc,
        ),
        withTimeout(
          'tradingEconomics',
          () => this.tradingEconomics.fetchVnMacroBatch(),
          this.timeouts.tradingEconomics,
        ),
        withTimeout(
          'fred',
          () => this.fred.fetchAllMacro(),
          this.timeouts.fred,
        ),
        withTimeout(
          'calendar',
          () => this.calendar.fetchCalendar(),
          this.timeouts.calendar,
        ),
      ]);

    const sources: ExternalMacroSources = {
      worldBank:        worldBankR        as SourceResult<Awaited<ReturnType<WorldBankMacroPort['fetchVnMacroBatch']>>>,
      yahoo:            yahooR            as SourceResult<Awaited<ReturnType<YahooFxIndicesPort['fetchBatch']>>>,
      cnbc:             cnbcR             as SourceResult<Awaited<ReturnType<CnbcWorldMarketsPort['fetchBatch']>>>,
      tradingEconomics: tradingEconomicsR as SourceResult<Awaited<ReturnType<TradingEconomicsVnPort['fetchVnMacroBatch']>>>,
      fred:             fredR             as SourceResult<Awaited<ReturnType<FredMacroPort['fetchAllMacro']>>>,
      calendar:         calendarR         as SourceResult<Awaited<ReturnType<InvestingCalendarPort['fetchCalendar']>>>,
    };

    const sourceList = Object.values(sources);
    const okCount     = sourceList.filter((s) => s.status === 'ok').length;
    const failedCount = sourceList.filter((s) => s.status !== 'ok').length;
    const totalLatencyMs = sourceList.reduce((acc, s) => acc + s.latencyMs, 0);

    return {
      sources,
      fetchedAt,
      summary: {
        ok:             okCount,
        failed:         failedCount,
        totalLatencyMs,
      },
    };
  }
}
