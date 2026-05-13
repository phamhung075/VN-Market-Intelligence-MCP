/**
 * Macro Indicators Microservice — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5004 (configurable via $PORT)
 *
 * External scrapers wired (sprint 2026-05-13):
 *   - world-bank-macro      (header-rotation, ~5MB)
 *   - yahoo-finance-fx-indices (header-rotation, ~5MB)
 *   - cnbc-world-markets    (header-rotation, ~5MB)
 *   - trading-economics-vn  (header-rotation, ~5MB)
 *   - fred-macro            (open-api-key, ~5MB — requires FRED_API_KEY env var)
 *   - investing-economic-calendar (cloudflare-managed-bypass, ~25MB)
 * Total external RAM: ~50MB — within 512MB container budget.
 */

import { MacroScoreService } from './domain/services.js';
import { HTTPCommodityFetcher, SQLiteMacroRepository } from './infrastructure/repositories.js';
import { ComputeMacroUseCase } from './application/usecases.js';
import { FetchExternalMacroUseCase } from './application/fetch-external-macro.js';
import { WorldBankMacroAdapter } from './infrastructure/scrapers/world-bank-macro.js';
import { YahooFxIndicesAdapter } from './infrastructure/scrapers/yahoo-finance-fx-indices.js';
import { CnbcWorldMarketsAdapter } from './infrastructure/scrapers/cnbc-world-markets.js';
import { TradingEconomicsVnAdapter } from './infrastructure/scrapers/trading-economics-vn.js';
import { FredMacroAdapter } from './infrastructure/scrapers/fred-macro.js';
import { InvestingCalendarAdapter } from './infrastructure/scrapers/investing-economic-calendar.js';
import { createRouter } from './interface/handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '5004', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

// ── Existing scraper chain ────────────────────────────────────────────────
const commodity = new HTTPCommodityFetcher();
const sbv = new SQLiteMacroRepository(DB_PATH);
const service = new MacroScoreService(commodity, sbv);
const useCase = new ComputeMacroUseCase(service);

// ── External macro scrapers (6 new sources) ───────────────────────────────
const worldBank = new WorldBankMacroAdapter();
const yahooFx = new YahooFxIndicesAdapter();
const cnbc = new CnbcWorldMarketsAdapter();
const tradingEconomics = new TradingEconomicsVnAdapter();
const fred = new FredMacroAdapter();
const calendar = new InvestingCalendarAdapter();

const externalUseCase = new FetchExternalMacroUseCase(
  worldBank, yahooFx, cnbc, tradingEconomics, fred, calendar,
);

const app = createRouter(useCase, externalUseCase);

if (!fred.isAvailable()) {
  console.warn(
    '[macro-indicators] FRED_API_KEY not set — fred-macro adapter inactive.' +
    ' Ops: add FRED_API_KEY to .env to activate US macro series.',
  );
}

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`macro-indicators running on port ${PORT}`);
