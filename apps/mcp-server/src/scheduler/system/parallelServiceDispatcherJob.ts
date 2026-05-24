/**
 * parallelServiceDispatcherJob — Parallel microservice dispatch
 *
 * Coordinates parallel calls to multiple microservices:
 *   - Technical Analysis Service (port 5003)
 *   - Macro Indicators Service (port 5004)
 *   - Stock Price Service (port 5000)
 *   - RAG Service (port 5002) for indexing latest analyses
 *
 * Executes these in parallel via Promise.allSettled, recording results.
 * Designed to replace sequential domain service calls with distributed HTTP calls.
 *
 * Runs as part of the intelligenceCycle every 15 minutes.
 *
 * @module scheduler/system/parallelServiceDispatcherJob
 */

import { logger } from '../../infrastructure/logger.js';
import {
  computeTAIndicators,
  getMacroSnapshot,
  getGatewayHealth,
  getMarketHexagram,
} from '../../infrastructure/microservices/clients.js';
import type {
  ComputeTARequest,
  ComputeTAResponse,
  MacroSnapshotResponse,
  HealthStatus,
  KinhDichMarketResponse,
} from '../../infrastructure/microservices/clients.js';
import { sendTelegramWork } from '../../infrastructure/notifiers/telegram.js';
import { getDb } from '../../infrastructure/db/schema.js';
import type { Database } from 'bun:sqlite';

export interface DispatcherDeps {
  computeTAFn?:    (req: ComputeTARequest) => Promise<ComputeTAResponse>;
  getMacroFn?:     () => Promise<MacroSnapshotResponse>;
  getGatewayFn?:   () => Promise<HealthStatus>;
  getKinhDichFn?:  () => Promise<KinhDichMarketResponse>;
  sendTelegramFn?: (msg: string) => Promise<void>;
  getDbFn?:        () => Database;
  nowFn?:          () => Date;
}

export interface DispatcherResult {
  timestamp: string;
  services: {
    ta: { status: 'ok' | 'failed'; duration: number; message?: string };
    macro: { status: 'ok' | 'failed'; duration: number; message?: string };
    gateway: { status: 'ok' | 'failed'; duration: number; message?: string };
    kinhDich: { status: 'ok' | 'failed'; duration: number; message?: string };
  };
  allOk: boolean;
}

/**
 * Dispatch calls to multiple microservices in parallel.
 * Each service call is isolated — failure of one doesn't block others.
 */
export async function runParallelServiceDispatcher(deps?: DispatcherDeps): Promise<DispatcherResult> {
  const timestamp = new Date().toISOString();

  const _computeTA    = deps?.computeTAFn   ?? computeTAIndicators;
  const _getMacro     = deps?.getMacroFn    ?? getMacroSnapshot;
  const _getGateway   = deps?.getGatewayFn  ?? getGatewayHealth;
  const _getKinhDich  = deps?.getKinhDichFn ?? getMarketHexagram;
  const _sendTelegram = deps?.sendTelegramFn ?? sendTelegramWork;
  const _getDb        = deps?.getDbFn       ?? getDb;
  const _now          = deps?.nowFn         ?? (() => new Date());

  const db = _getDb();

  // Collect all pending tickers to scan
  const watchlist = db.query<{ code: string }, []>("SELECT code FROM watchlist LIMIT 10").all();
  const tickers = watchlist.map((w) => w.code);

  // Parallel dispatch
  const results = await Promise.allSettled([
    // 1. Technical Analysis — compute for first 5 tickers
    (async () => {
      const t0 = Date.now();
      try {
        const taResults = [];
        for (const code of tickers.slice(0, 5)) {
          const result = await _computeTA({ code });
          taResults.push(result);
        }
        return { status: 'ok' as const, duration: Date.now() - t0, count: taResults.length };
      } catch (err) {
        throw new Error(`TA Service: ${err instanceof Error ? err.message : String(err)}`);
      }
    })(),

    // 2. Macro Indicators — fetch once
    (async () => {
      const t0 = Date.now();
      try {
        const snapshot = await _getMacro();
        return {
          status: 'ok' as const,
          duration: Date.now() - t0,
          message: `VN-Index: ${snapshot.vnIndex != null ? snapshot.vnIndex.toFixed(0) : "N/A"}, Brent: $${snapshot.brentPrice.toFixed(2)}`,
        };
      } catch (err) {
        throw new Error(`Macro Service: ${err instanceof Error ? err.message : String(err)}`);
      }
    })(),

    // 3. Gateway Health — aggregate health check
    (async () => {
      const t0 = Date.now();
      try {
        const health = await _getGateway();
        return {
          status: 'ok' as const,
          duration: Date.now() - t0,
          message: `Gateway: ${health.status}`,
        };
      } catch (err) {
        throw new Error(`Gateway Health: ${err instanceof Error ? err.message : String(err)}`);
      }
    })(),

    // 4. Kinh Dich — market hexagram reading
    (async () => {
      const t0 = Date.now();
      try {
        const reading = await _getKinhDich();
        return {
          status: 'ok' as const,
          duration: Date.now() - t0,
          message: `Market Hexagram: ${reading.hexagram} (${reading.name})`,
        };
      } catch (err) {
        throw new Error(`Kinh Dich: ${err instanceof Error ? err.message : String(err)}`);
      }
    })(),
  ]);

  // Parse results
  const serviceResults = {
    ta: results[0].status === 'fulfilled'
      ? { status: 'ok' as const, duration: results[0].value.duration }
      : { status: 'failed' as const, duration: 0, message: String(results[0].reason) },
    macro: results[1].status === 'fulfilled'
      ? { status: 'ok' as const, duration: results[1].value.duration, message: results[1].value.message }
      : { status: 'failed' as const, duration: 0, message: String(results[1].reason) },
    gateway: results[2].status === 'fulfilled'
      ? { status: 'ok' as const, duration: results[2].value.duration, message: results[2].value.message }
      : { status: 'failed' as const, duration: 0, message: String(results[2].reason) },
    kinhDich: results[3].status === 'fulfilled'
      ? { status: 'ok' as const, duration: results[3].value.duration, message: results[3].value.message }
      : { status: 'failed' as const, duration: 0, message: String(results[3].reason) },
  };

  const allOk = Object.values(serviceResults).every((r) => r.status === 'ok');

  const report: DispatcherResult = {
    timestamp,
    services: serviceResults,
    allOk,
  };

  // Log summary
  if (allOk) {
    const totalDuration = Object.values(serviceResults).reduce((acc, s) => acc + s.duration, 0);
    logger.info(`[parallel-dispatcher] All services OK [${totalDuration}ms]`, {
      services: serviceResults,
    });

    // Send brief Telegram notification on weekday mornings (optional heartbeat)
    const now = _now();
    const isWeekday = now.getUTCDay() !== 0 && now.getUTCDay() !== 6;
    if (isWeekday && now.getUTCHours() === 1) {
      // ~08:00 GMT+7
      await _sendTelegram(
        `[dispatcher] Microservices online: TA (${serviceResults.ta.duration}ms), Macro (${serviceResults.macro.duration}ms), Gateway (${serviceResults.gateway.duration}ms)`,
      );
    }
  } else {
    const failedServices = Object.entries(serviceResults)
      .filter(([ , r]) => r.status === 'failed')
      .map(([name]) => name)
      .join(', ');

    logger.warn(`[parallel-dispatcher] Services failed: ${failedServices}`, {
      services: serviceResults,
    });

    await _sendTelegram(
      `[dispatcher-alert] Services DOWN: ${failedServices}\n${JSON.stringify(serviceResults, null, 2)}`,
    );
  }

  return report;
}
