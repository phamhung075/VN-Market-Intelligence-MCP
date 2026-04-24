/**
 * Stock Price Microservice — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5000 (configurable via $PORT)
 */

import { ResolvePriceService } from './domain/services.js';
import {
  Tier1VnDirectFetcher,
  Tier2VnDirectLegacyFetcher,
  Tier3CacheFetcher,
  SQLitePriceHistoryRepository,
} from './infrastructure/fetchers.js';
import { FetchPriceUseCase, PriceHistoryUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '5000', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

const tier1 = new Tier1VnDirectFetcher();
const tier2 = new Tier2VnDirectLegacyFetcher();
const tier3 = new Tier3CacheFetcher(DB_PATH);
const historyRepo = new SQLitePriceHistoryRepository(DB_PATH);

const resolveService = new ResolvePriceService(tier1, tier2, tier3, historyRepo);
const fetchUseCase = new FetchPriceUseCase(resolveService);
const historyUseCase = new PriceHistoryUseCase(historyRepo);
const app = createRouter(fetchUseCase, historyUseCase);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`stock-price running on port ${PORT}`);
