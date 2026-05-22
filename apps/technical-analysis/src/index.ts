/**
 * Technical Analysis Microservice — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5003 (configurable via $PORT)
 */

import { Database } from 'bun:sqlite';
import { CalculateTAService } from './domain/services.js';
import { TACalculatorImpl } from './infrastructure/calculator.js';
import { SQLitePriceRepository } from './infrastructure/repositories.js';
import { ComputeTAUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '5003', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

const db = new Database(DB_PATH, { readonly: true, create: false });

const calculator = new TACalculatorImpl();
const priceRepo = new SQLitePriceRepository(db);
const taService = new CalculateTAService(priceRepo, calculator);
const useCase = new ComputeTAUseCase(taService);
const app = createRouter(useCase);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`technical-analysis running on port ${PORT}`);
