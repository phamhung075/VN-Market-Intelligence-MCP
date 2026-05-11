/**
 * Macro Indicators Microservice — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5004 (configurable via $PORT)
 */

import { MacroScoreService } from './domain/services.js';
import { HTTPCommodityFetcher, SQLiteMacroRepository } from './infrastructure/repositories.js';
import { ComputeMacroUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '5004', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

const commodity = new HTTPCommodityFetcher();
const sbv = new SQLiteMacroRepository(DB_PATH);
const service = new MacroScoreService(commodity, sbv);
const useCase = new ComputeMacroUseCase(service);
const app = createRouter(useCase);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`macro-indicators running on port ${PORT}`);
