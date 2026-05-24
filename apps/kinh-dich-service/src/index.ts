/**
 * Kinh Dich Service — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5005
 *
 * P2-KD-F: Wires ReadingComposerDependencies (MarkovPort) at composition root.
 * Null Markov adapter used until a real hexagram_markov adapter is wired (P2-KD-G+).
 */

import { Database } from 'bun:sqlite';
import { loadConfig } from './infrastructure/config.js';
import { SQLiteKinhDichRepository, SQLitePriceScoreRepository } from './infrastructure/repositories.js';
import { ReadingUseCase, MarketHexagramUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';
import type { ReadingComposerDependencies } from './module/reading_composer/index.js';

const config = loadConfig();

const db = new Database(config.dbPath, { readonly: true, create: false });

const repo = new SQLiteKinhDichRepository(db);
const priceScorePort = new SQLitePriceScoreRepository(db);

// Null MarkovPort adapter — returns null for all hexagrams until
// a real hexagram_markov SQLite adapter is wired (future task P2-KD-G+).
// The reading_composer handles null gracefully (no confidence blending).
const composerDeps: ReadingComposerDependencies = {
  markov: {
    getMarkovData: () => null,
  },
};

const readingUseCase = new ReadingUseCase(repo, priceScorePort, composerDeps);
const marketUseCase = new MarketHexagramUseCase(repo, priceScorePort, composerDeps);

const app = createRouter(readingUseCase, marketUseCase);

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`kinh-dich-service running on port ${config.port}`);
