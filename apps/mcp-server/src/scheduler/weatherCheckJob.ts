/**
 * Weather Check Job — Task 261 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper that:
 *   1. Fetches weather warnings from NCHMF + NOAA ENSO (fetchWeatherWarnings)
 *   2. Fetches reservoir levels from Vietnamese news (fetchReservoirLevels)
 *   3. Maps weather events to stock-level signals (mapClimateImpact)
 *   4. Analyzes energy grid data from reservoir levels (analyzeEnergyMarket)
 *   5. Sends HIGH/CRITICAL climate/energy signals to Telegram
 *
 * Schedule:
 *   - Typhoon season (Jun–Nov): every 6 hours
 *   - Off-season (Dec–May): every 12 hours
 *
 * Registered in `jobs.ts` at CRONS.weatherCheck.
 *
 * Layer: interface/scheduler — may import from infrastructure and domain.
 *
 * Fix 1289: Added 30s timeout via Promise.race on HTTP fetch phase.
 * A hung external API (NCHMF/NOAA/hydrology news) previously caused
 * isRunning to stay true indefinitely → WAL accumulation → disk I/O
 * failure (Apr 15-16 outage). Now the job aborts and notifies WORK channel.
 */

import { logger } from "../infrastructure/logger.js";
import { fetchWeatherWarnings } from "../infrastructure/fetchers/weatherVn.js";
import { fetchReservoirLevels } from "../infrastructure/fetchers/hydrologicalData.js";
import {
  mapClimateImpact,
  getSeasonalContext,
} from "../domain/services/climateImpactMapper.js";
import {
  analyzeEnergyMarket,
  type EnergyData,
} from "../domain/services/energyMarketAnalyzer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WeatherCheckOptions {
  /** Override fetchWeatherWarnings for test injection */
  fetchWeatherFn?: typeof fetchWeatherWarnings;
  /** Override fetchReservoirLevels for test injection */
  fetchReservoirFn?: typeof fetchReservoirLevels;
  /** Override watchlist (defaults to loading from DB) */
  watchlist?: Array<{ actionCode: string; domain: string; exchange: string }>;
  /**
   * Timeout in ms for the entire HTTP fetch phase (weather + reservoir).
   * Defaults to WEATHER_JOB_TIMEOUT_MS (30 000 ms).
   * Override in tests with a small value for speed.
   */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout constant
// ─────────────────────────────────────────────────────────────────────────────

/** Default maximum wall-clock time for external HTTP fetches (30 s). */
export const WEATHER_JOB_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Main job function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the weather check job.
 * Fetches weather warnings and reservoir levels, generates climate/energy signals,
 * and sends HIGH/CRITICAL alerts to Telegram.
 *
 * Timeout: Promise.race aborts after timeoutMs (default 30s) and notifies
 * WORK channel. isRunning is always cleared in finally so subsequent cron
 * runs are never permanently blocked.
 *
 * @param opts - Optional overrides for dependency injection (testing).
 */
export async function runWeatherCheck(opts: WeatherCheckOptions = {}): Promise<void> {
  if (isRunning) {
    logger.warn("[weatherCheckJob] previous run still in progress — skipping");
    return;
  }
  isRunning = true;

  const timeoutMs = opts.timeoutMs ?? WEATHER_JOB_TIMEOUT_MS;

  try {
    logger.info("[weatherCheckJob] starting weather + energy check", { timeoutMs });

    // ── Step 1: Load watchlist from DB ─────────────────────────────────────
    // DB read is synchronous (db.prepare().all()) and completes BEFORE any
    // HTTP call. No DB transaction is held open during the network fetch phase.
    let watchlist = opts.watchlist ?? [];
    if (!opts.watchlist) {
      try {
        const { getDb } = await import("../infrastructure/db/schema.js");
        const db = getDb();
        const rows = db
          .prepare<{ code: string; domain: string; exchange: string }, []>(
            `SELECT code, domain, exchange FROM watchlist ORDER BY code`,
          )
          .all();
        watchlist = rows.map((r) => ({
          actionCode: r.code,
          domain: r.domain,
          exchange: r.exchange,
        }));
      } catch (err) {
        logger.warn("[weatherCheckJob] failed to load watchlist", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Steps 2–3: Fetch weather + reservoir with hard timeout ─────────────
    // Fix 1289: Promise.race enforces a ceiling on how long external APIs can
    // hang. Both fetches run concurrently via Promise.all for efficiency.
    // On timeout the job logs a warning, notifies WORK channel, and returns
    // cleanly (isRunning cleared in finally).
    const fetchWeatherFn = opts.fetchWeatherFn ?? fetchWeatherWarnings;
    const fetchReservoirFn = opts.fetchReservoirFn ?? fetchReservoirLevels;

    const timeoutError = new Error(`weatherCheckJob timeout after ${timeoutMs}ms`);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(timeoutError), timeoutMs),
    );

    let weatherEvents: Awaited<ReturnType<typeof fetchWeatherWarnings>>;
    let reservoirs: Awaited<ReturnType<typeof fetchReservoirLevels>>;

    try {
      [weatherEvents, reservoirs] = await Promise.race([
        Promise.all([fetchWeatherFn(), fetchReservoirFn()]),
        timeoutPromise,
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === timeoutError.message) {
        logger.warn("[weatherCheckJob] fetch timed out — aborting run", { timeoutMs });
        try {
          const { sendTelegramWork } = await import(
            "../infrastructure/notifiers/telegram.js"
          );
          await sendTelegramWork(
            `[weatherCheckJob] fetch timed out after ${timeoutMs}ms — external API may be down. Skipping cycle.`,
            { parseMode: "" },
          );
        } catch {
          // Telegram failure must not re-hang the job
        }
        return; // isRunning cleared in finally
      }
      throw err; // re-throw non-timeout errors to outer catch
    }

    logger.info("[weatherCheckJob] weather events fetched", {
      count: weatherEvents.length,
    });
    logger.info("[weatherCheckJob] reservoir levels fetched", {
      count: reservoirs.length,
    });

    // ── Step 4: Map climate events → stock signals ─────────────────────────
    const climateSignals = weatherEvents
      .map((event) => mapClimateImpact(event, watchlist))
      .filter((s) => s.affectedStocks.length > 0);

    // ── Step 5: Analyze energy market from reservoir data ──────────────────
    const energyData: EnergyData = {
      hydroCapacityPct:
        reservoirs.length > 0
          ? reservoirs.reduce((sum, r) => sum + r.capacityPct, 0) / reservoirs.length
          : 70, // default: adequate
      thermalDispatchPct: 40, // unknown without real-time grid data
      renewableDispatchPct: 20, // conservative estimate
      peakDemandGW: 45, // approximate Vietnam peak demand
      installedCapacityGW: 85, // approximate Vietnam installed capacity
    };
    const energySignals = analyzeEnergyMarket(energyData);

    // ── Step 6: Log seasonal context ───────────────────────────────────────
    const currentMonth = new Date().getMonth() + 1;
    const seasonalCtx = getSeasonalContext(currentMonth);
    logger.info("[weatherCheckJob] seasonal context", { context: seasonalCtx });

    // ── Step 7: Telegram notifications for HIGH/CRITICAL ──────────────────
    const highClimate = climateSignals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );
    const highEnergy = energySignals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );

    if (highClimate.length > 0 || highEnergy.length > 0) {
      try {
        const { sendTelegramBug } = await import(
          "../infrastructure/notifiers/telegram.js"
        );
        let msg = `⚠️ HIGH ALERT: CẢNH BÁO KHÍ HẬU + ĐIỆN LỰC\n`;
        msg += `Thang ${currentMonth}: ${seasonalCtx.slice(0, 100)}\n\n`;

        for (const s of highClimate) {
          msg += `[${s.severity.toUpperCase()}] ${s.eventType.replace("_", " ").toUpperCase()}\n`;
          for (const stock of s.affectedStocks.slice(0, 3)) {
            msg += `  ${stock.code}: ${stock.direction === "up" ? "TĂNG" : "GIẢM"} — ${stock.reasoning.slice(0, 80)}\n`;
          }
          msg += "\n";
        }

        for (const s of highEnergy) {
          msg += `[${s.severity.toUpperCase()}] ${s.type.replace("_", " ").toUpperCase()}\n`;
          for (const stock of s.affectedStocks.slice(0, 3)) {
            msg += `  ${stock.code}: ${stock.direction === "up" ? "TĂNG" : "GIẢM"} — ${stock.reasoning.slice(0, 80)}\n`;
          }
          msg += "\n";
        }

        await sendTelegramBug(msg, {
          parseMode: "",
        });
      } catch (err) {
        logger.warn("[weatherCheckJob] Telegram send failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[weatherCheckJob] completed", {
      climateSignals: climateSignals.length,
      energySignals: energySignals.length,
      highAlerts: highClimate.length + highEnergy.length,
    });
  } catch (err) {
    logger.error("[weatherCheckJob] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Returns true if the current month is within typhoon season (Jun–Nov).
 * Used to determine check frequency.
 */
export function isTyphoonSeason(month: number = new Date().getMonth() + 1): boolean {
  return month >= 6 && month <= 11;
}
