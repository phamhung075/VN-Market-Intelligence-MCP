/**
 * Kinh Dich Service — Interface HTTP Handlers (Hono)
 *
 * Thin HTTP layer: parse → validate → usecase → respond.
 * No business logic.
 *
 * P2-KD-G: Added 4 new endpoints:
 *   GET /readings/:code/history       — reading history (AC-3)
 *   GET /hexagram/:number/transitions — Markov transitions (AC-3)
 *   GET /backtest/:code               — hexagram backtest (AC-3)
 *   GET /hexagram/:number/explain     — hexagram explanation (AC-3)
 */

import { Hono } from 'hono';
import type {
  ReadingUseCase,
  MarketHexagramUseCase,
  ReadingHistoryUseCase,
  HexagramTransitionsUseCase,
  HexagramBacktestUseCase,
  HexagramExplainUseCase,
} from '../application/usecases.js';
import { errorToStatus } from './serializers.js';

export function createRouter(
  readingUseCase: ReadingUseCase,
  marketUseCase: MarketHexagramUseCase,
  historyUseCase: ReadingHistoryUseCase,
  transitionsUseCase: HexagramTransitionsUseCase,
  backtestUseCase: HexagramBacktestUseCase,
  explainUseCase: HexagramExplainUseCase,
): Hono {
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'kinh-dich-service', port: 5005 }),
  );

  app.get('/reading/:code', async (c) => {
    const code = c.req.param('code')?.toUpperCase();
    if (!code) return c.json({ error: 'stock code required' }, 400);

    const daysStr = c.req.query('days');
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    if (!Number.isFinite(days) || days < 1) {
      return c.json({ error: 'days must be a positive integer' }, 400);
    }

    try {
      const result = await readingUseCase.execute({ stockCode: code, days });
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  app.get('/market', async (c) => {
    try {
      const result = await marketUseCase.execute();
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  // ── 4 new endpoints (P2-KD-G) ───────────────────────────────────────────────

  // GET /readings/:code/history?days=30
  app.get('/readings/:code/history', (c) => {
    const code = c.req.param('code')?.toUpperCase();
    if (!code) return c.json({ error: 'stock code required' }, 400);

    const daysStr = c.req.query('days');
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    if (!Number.isFinite(days) || days < 1) {
      return c.json({ error: 'days must be a positive integer' }, 400);
    }

    try {
      const result = historyUseCase.execute({ stockCode: code, days });
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  // GET /hexagram/:number/transitions?stock=VCB&topN=10
  app.get('/hexagram/:number/transitions', (c) => {
    const rawNum = c.req.param('number');
    const hexagramNumber = parseInt(rawNum ?? '', 10);
    if (!Number.isFinite(hexagramNumber) || hexagramNumber < 1 || hexagramNumber > 64) {
      return c.json({ error: 'hexagram number must be 1-64' }, 400);
    }

    const stock = c.req.query('stock')?.toUpperCase();
    const topNStr = c.req.query('topN');
    const topN = topNStr ? parseInt(topNStr, 10) : 10;

    try {
      const result = transitionsUseCase.execute({ hexagramNumber, stockCode: stock, topN });
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  // GET /backtest/:code?days=30
  app.get('/backtest/:code', (c) => {
    const code = c.req.param('code')?.toUpperCase();
    if (!code) return c.json({ error: 'stock code required' }, 400);

    const daysStr = c.req.query('days');
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    if (!Number.isFinite(days) || days < 1) {
      return c.json({ error: 'days must be a positive integer' }, 400);
    }

    try {
      const result = backtestUseCase.execute({ stockCode: code, days });
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  // GET /hexagram/:number/explain
  app.get('/hexagram/:number/explain', (c) => {
    const rawNum = c.req.param('number');
    const hexagramNumber = parseInt(rawNum ?? '', 10);
    if (!Number.isFinite(hexagramNumber) || hexagramNumber < 1 || hexagramNumber > 64) {
      return c.json({ error: 'hexagram number must be 1-64' }, 400);
    }

    try {
      const result = explainUseCase.execute({ hexagramNumber });
      return c.json(result);
    } catch (err) {
      const { status, body } = errorToStatus(err);
      return c.json(body, status);
    }
  });

  return app;
}
