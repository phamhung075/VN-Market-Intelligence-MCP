/**
 * Technical Analysis Microservice — Composition Root
 *
 * Responsibility: wire infrastructure adapters to domain ports, export server.
 * Rules (G3): only imports, DI bindings, server startup. No logic.
 */

// ── External ─────────────────────────────────────────────────────────────────
import { Database } from 'bun:sqlite';

// ── Infrastructure adapters ───────────────────────────────────────────────────
import { TACalculatorImpl }         from './src/infrastructure/calculator.js';
import { SQLitePriceRepository }    from './src/infrastructure/repositories.js';

// ── Domain service ────────────────────────────────────────────────────────────
import { CalculateTAService }       from './src/domain/services.js';

// ── Application use case ──────────────────────────────────────────────────────
import { ComputeTAUseCase }         from './src/application/usecases.js';

// ── Interface (HTTP router) ───────────────────────────────────────────────────
import { createRouter }             from './src/interface/handlers.js';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT    = parseInt(process.env['PORT']    ?? '5003', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

// ── DI wiring ─────────────────────────────────────────────────────────────────
const db         = new Database(DB_PATH, { readonly: true, create: false });
const calculator = new TACalculatorImpl();
const priceRepo  = new SQLitePriceRepository(db);
const taService  = new CalculateTAService(priceRepo, calculator);
const useCase    = new ComputeTAUseCase(taService);
const app        = createRouter(useCase);

// ── Server export (Bun native HTTP) ──────────────────────────────────────────
export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`technical-analysis running on port ${PORT}`);
