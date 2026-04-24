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
}

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
 * @param opts - Optional overrides for dependency injection (testing).
 */
export async function runWeatherCheck(opts: WeatherCheckOptions = {}): Promise<void> {
  if (isRunning) {
    logger.warn("[weatherCheckJob] previous run still in progress — skipping");
    return;
  }
  isRunning = true;

  try {
    logger.info("[weatherCheckJob] starting weather + energy check");

    // ── Step 1: Load watchlist from DB ─────────────────────────────────────
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

    // ── Step 2: Fetch weather warnings ─────────────────────────────────────
    const fetchWeatherFn = opts.fetchWeatherFn ?? fetchWeatherWarnings;
    const weatherEvents = await fetchWeatherFn();
    logger.info("[weatherCheckJob] weather events fetched", {
      count: weatherEvents.length,
    });

    // ── Step 3: Fetch reservoir levels ─────────────────────────────────────
    const fetchReservoirFn = opts.fetchReservoirFn ?? fetchReservoirLevels;
    const reservoirs = await fetchReservoirFn();
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
        const { sendTelegramMarket } = await import(
          "../infrastructure/notifiers/telegram.js"
        );
        let msg = `⚠️ CẢNH BÁO KHÍ HẬU + ĐIỆN LỰC\n`;
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

        await sendTelegramMarket(msg, {
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
