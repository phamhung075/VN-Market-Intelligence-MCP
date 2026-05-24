/**
 * Kinh Dich Service — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5005
 *
 * P2-KD-F: Wires ReadingComposerDependencies (MarkovPort) at composition root.
 * P2-KD-G: Wires 4 new use cases: ReadingHistory, HexagramTransitions, HexagramBacktest, HexagramExplain.
 * Null Markov adapter used until a real hexagram_markov adapter is wired.
 */

import { Database } from 'bun:sqlite';
import { loadConfig } from './infrastructure/config.js';
import { SQLiteKinhDichRepository, SQLitePriceScoreRepository } from './infrastructure/repositories.js';
import {
  ReadingUseCase,
  MarketHexagramUseCase,
  ReadingHistoryUseCase,
  HexagramTransitionsUseCase,
  HexagramBacktestUseCase,
  HexagramExplainUseCase,
} from './application/usecases.js';
import { createRouter } from './interface/handlers.js';
import type { ReadingComposerDependencies } from './module/reading_composer/index.js';

const config = loadConfig();

const db = new Database(config.dbPath, { readonly: true, create: false });

const repo = new SQLiteKinhDichRepository(db);
const priceScorePort = new SQLitePriceScoreRepository(db);

// Null MarkovPort adapter — returns null for all hexagrams until
// a real hexagram_markov SQLite adapter is wired.
// The reading_composer handles null gracefully (no confidence blending).
const composerDeps: ReadingComposerDependencies = {
  markov: {
    getMarkovData: () => null,
  },
};

const readingUseCase = new ReadingUseCase(repo, priceScorePort, composerDeps);
const marketUseCase = new MarketHexagramUseCase(repo, priceScorePort, composerDeps);
const historyUseCase = new ReadingHistoryUseCase(repo);
const transitionsUseCase = new HexagramTransitionsUseCase(repo);
const backtestUseCase = new HexagramBacktestUseCase(repo);
const explainUseCase = new HexagramExplainUseCase();

const app = createRouter(
  readingUseCase,
  marketUseCase,
  historyUseCase,
  transitionsUseCase,
  backtestUseCase,
  explainUseCase,
);

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`kinh-dich-service running on port ${config.port}`);
