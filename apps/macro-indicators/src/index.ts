/**
 * Macro Indicators Microservice — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5004 (configurable via $PORT)
 *
 * External scrapers wired (sprint 2026-05-13):
 *   - world-bank-macro           (header-rotation, ~5MB)
 *   - yahoo-finance-fx-indices   (header-rotation, ~5MB)
 *   - cnbc-world-markets         (header-rotation, ~5MB)
 *   - trading-economics-vn       (header-rotation, ~5MB)
 *   - fred-macro                 (open-api-key, ~5MB — requires FRED_API_KEY)
 *   - investing-economic-calendar (NullCalendarAdapter — wontfix 2026-05-18, ~0MB)
 *   - adb-kidb                   (spa-xhr-intercept Phase 2, direct API, ~15MB)
 *   - imf-weo                    (open-api-key, api.imf.org SDMX 3.0, ~5MB)
 * Total external RAM: ~70MB — within 1.5GB container budget (post-resize).
 */

import { MacroScoreService } from './domain/services.js';
import { HTTPCommodityFetcher, SQLiteMacroRepository } from './infrastructure/repositories.js';
import { ComputeMacroUseCase } from './application/usecases.js';
import { FetchExternalMacroUseCase } from './application/fetch-external-macro.js';
import { FetchInternationalMacroUseCase } from './application/fetch-international-macro.js';
import { WorldBankMacroAdapter } from './infrastructure/scrapers/world-bank-macro.js';
import { YahooFxIndicesAdapter } from './infrastructure/scrapers/yahoo-finance-fx-indices.js';
import { CnbcWorldMarketsAdapter } from './infrastructure/scrapers/cnbc-world-markets.js';
import { TradingEconomicsVnAdapter } from './infrastructure/scrapers/trading-economics-vn.js';
import { FredMacroAdapter } from './infrastructure/scrapers/fred-macro.js';
import { NullCalendarAdapter } from './infrastructure/scrapers/investing-economic-calendar.js';
import { AdbKidbAdapter } from './infrastructure/scrapers/adb-kidb.js';
import { ImfWeoAdapter } from './infrastructure/scrapers/imf-weo.js';
import { createRouter } from './interface/handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '5004', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

// ── Core scraper chain ────────────────────────────────────────────────────
const commodity = new HTTPCommodityFetcher();
const sbv = new SQLiteMacroRepository(DB_PATH);
const service = new MacroScoreService(commodity, sbv);
const useCase = new ComputeMacroUseCase(service);

// ── External macro scrapers (6 lightweight sources) ───────────────────────
const worldBank = new WorldBankMacroAdapter();
const yahooFx = new YahooFxIndicesAdapter();
const cnbc = new CnbcWorldMarketsAdapter();
const tradingEconomics = new TradingEconomicsVnAdapter();
const fred = new FredMacroAdapter();
// Wontfix 2026-05-18: investing.com endpoint permanently unreachable. NullCalendarAdapter
// returns [] immediately — zero CPU/RAM/time cost per macroRefresh cycle.
const calendar = new NullCalendarAdapter();

const externalUseCase = new FetchExternalMacroUseCase(
  worldBank, yahooFx, cnbc, tradingEconomics, fred, calendar,
);

// ── International institutional scrapers (ADB KIDB + IMF WEO) ────────────
const adbKidb = new AdbKidbAdapter();
const imfWeo = new ImfWeoAdapter();

const internationalUseCase = new FetchInternationalMacroUseCase(adbKidb, imfWeo);

const app = createRouter(useCase, externalUseCase, internationalUseCase);

if (!fred.isAvailable()) {
  console.warn(
    '[macro-indicators] FRED_API_KEY not set — fred-macro adapter inactive.' +
    ' Ops: add FRED_API_KEY to .env to activate US macro series.',
  );
}

export default {
  port: PORT,
  fetch: app.fetch,
  // External scraper max budget: TE 65s + margin → 90s minimum (calendar=NullAdapter → 0)
  idleTimeout: 90,
};

console.log(`macro-indicators running on port ${PORT}`);
