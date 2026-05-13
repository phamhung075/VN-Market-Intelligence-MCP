/**
 * Application Use Case — FetchExternalMacroUseCase
 *
 * Orchestrates all 6 external macro scrapers:
 *   1. world-bank-macro      (header-rotation, ~5MB)
 *   2. yahoo-finance-fx-indices (header-rotation, ~5MB)
 *   3. cnbc-world-markets    (header-rotation, ~5MB)
 *   4. trading-economics-vn  (header-rotation, ~5MB)
 *   5. fred-macro            (open-api-key, ~5MB — conditional on FRED_API_KEY)
 *   6. investing-economic-calendar (cloudflare-managed-bypass, ~25MB)
 *
 * All sources run in parallel where safe. Calendar runs last (rate-limited).
 * Total estimated RAM: ~50MB for all 6 (well within 512MB container budget).
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

export interface ExternalMacroResult {
  worldBankVn: Awaited<ReturnType<WorldBankMacroPort['fetchVnMacroBatch']>> | null;
  yahooFxIndices: Awaited<ReturnType<YahooFxIndicesPort['fetchBatch']>> | null;
  cnbcIndices: Awaited<ReturnType<CnbcWorldMarketsPort['fetchBatch']>> | null;
  tradingEconomicsVn: Awaited<ReturnType<TradingEconomicsVnPort['fetchVnMacroBatch']>> | null;
  fredMacro: Awaited<ReturnType<FredMacroPort['fetchAllMacro']>> | null;
  economicCalendar: Awaited<ReturnType<InvestingCalendarPort['fetchCalendar']>>;
  fredAvailable: boolean;
  fetchedAt: string;
}

export class FetchExternalMacroUseCase {
  constructor(
    private readonly worldBank: WorldBankMacroPort,
    private readonly yahooFx: YahooFxIndicesPort,
    private readonly cnbc: CnbcWorldMarketsPort,
    private readonly tradingEconomics: TradingEconomicsVnPort,
    private readonly fred: FredMacroPort,
    private readonly calendar: InvestingCalendarPort,
  ) {}

  async execute(): Promise<ExternalMacroResult> {
    const fetchedAt = new Date().toISOString();
    const fredAvailable = this.fred.isAvailable();

    if (!fredAvailable) {
      console.warn(
        '[FetchExternalMacroUseCase] FRED_API_KEY not set — ' +
        'fred-macro adapter inactive. Ops: add FRED_API_KEY to .env to activate.',
      );
    }

    // Run lightweight scrapers in parallel (all ~5MB, no rate-limit conflict)
    const [worldBankVn, yahooFxIndices, cnbcIndices, tradingEconomicsVn, fredMacro] =
      await Promise.allSettled([
        this.worldBank.fetchVnMacroBatch(),
        this.yahooFx.fetchBatch(DEFAULT_SYMBOLS),
        this.cnbc.fetchBatch(DEFAULT_CNBC_SYMBOLS),
        this.tradingEconomics.fetchVnMacroBatch(),
        this.fred.fetchAllMacro(),
      ]);

    // Calendar runs separately — it has strict rate limits and CF session warmup
    let economicCalendar: Awaited<ReturnType<InvestingCalendarPort['fetchCalendar']>> = [];
    try {
      economicCalendar = await this.calendar.fetchCalendar();
    } catch (err) {
      console.error('[FetchExternalMacroUseCase] calendar fetch failed:', err);
    }

    return {
      worldBankVn: worldBankVn.status === 'fulfilled' ? worldBankVn.value : null,
      yahooFxIndices: yahooFxIndices.status === 'fulfilled' ? yahooFxIndices.value : null,
      cnbcIndices: cnbcIndices.status === 'fulfilled' ? cnbcIndices.value : null,
      tradingEconomicsVn:
        tradingEconomicsVn.status === 'fulfilled' ? tradingEconomicsVn.value : null,
      fredMacro: fredMacro.status === 'fulfilled' ? fredMacro.value : null,
      economicCalendar,
      fredAvailable,
      fetchedAt,
    };
  }
}
