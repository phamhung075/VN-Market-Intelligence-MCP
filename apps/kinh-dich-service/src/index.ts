/**
 * Kinh Dich Service — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5005
 */

import { Database } from 'bun:sqlite';
import { loadConfig } from './infrastructure/config.js';
import { SQLiteKinhDichRepository, SQLitePriceScoreRepository } from './infrastructure/repositories.js';
import { ReadingUseCase, MarketHexagramUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';

const config = loadConfig();

const db = new Database(config.dbPath, { readonly: true, create: false });

const repo = new SQLiteKinhDichRepository(db);
const priceScorePort = new SQLitePriceScoreRepository(db);

const readingUseCase = new ReadingUseCase(repo, priceScorePort);
const marketUseCase = new MarketHexagramUseCase(repo, priceScorePort);

const app = createRouter(readingUseCase, marketUseCase);

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`kinh-dich-service running on port ${config.port}`);
