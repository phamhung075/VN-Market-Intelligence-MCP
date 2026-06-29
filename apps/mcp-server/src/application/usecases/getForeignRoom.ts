/**
 * Application Use Case — Get Foreign Room (P0-2-FOREIGN-ROOM-SUITE)
 *
 * Orchestrates: store queries → domain computations → structured response.
 *
 * Implements FR-1 through FR-5 of P0-2 spec:
 *   FR-1: Per-ticker room utilization
 *   FR-2: Room event reads (foreign_room_events table)
 *   FR-3: 5-day depletion velocity
 *   FR-4: ROOM_LOCKED / FULL_ROOM_SELL flags
 *   FR-5: Market-wide + sector cap-weighted saturation + gauge z-score
 *
 * DDD layer: application/usecases — orchestrates domain + infrastructure.
 *
 * @module application/usecases/getForeignRoom
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import {
  computeRoomUtilization,
  computeDepletionVelocity5d,
  computeRoomFlags,
  computeMarketSaturation,
  computeForeignOutflowZ5d,
  type TickerHistory,
  type TickerRoomAnalysis,
  type MarketSaturation,
} from "../../domain/services/market-data/foreignRoomAnalyzer.js";
import {
  getAllTickersHistory,
  getTickerRecentEvents,
  getMarketWideDailyVelocities,
} from "../../infrastructure/db/foreignRoomStore.js";

// ---------------------------------------------------------------------------
// Sector map loader
// ---------------------------------------------------------------------------

interface ClassificationEntry {
  ticker: string;
  sector: string;
}

let _sectorMapCache: Record<string, string> | null = null;

function loadSectorMap(): Record<string, string> {
  if (_sectorMapCache) return _sectorMapCache;

  try {
    const raw = readFileSync(
      resolve(process.cwd(), "docs/data/stock-classification.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { watchlist?: ClassificationEntry[] };
    const map: Record<string, string> = {};
    for (const entry of parsed.watchlist ?? []) {
      map[entry.ticker] = entry.sector;
    }
    _sectorMapCache = map;
    return map;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Full response type
// ---------------------------------------------------------------------------

export interface ForeignRoomResponse {
  as_of_date: string | null;
  tickers: TickerRoomAnalysis[];
  market: MarketSaturation;
  source_tier: 2;
  coverage_note: string;
}

// ---------------------------------------------------------------------------
// Use case entry point
// ---------------------------------------------------------------------------

/**
 * Execute the foreign room analysis.
 *
 * 1. Load sector map
 * 2. Fetch all ticker histories from vnstock_trading_stats
 * 3. Compute per-ticker: utilization, velocity, flags
 * 4. Read recent room events per ticker
 * 5. Aggregate market + sector saturation
 * 6. Compute gauge-ready z-score
 *
 * @param db   - SQLite database (supports injection for tests)
 * @param code - Optional: filter to a single ticker
 */
export async function getForeignRoom(
  db: Database,
  code?: string,
): Promise<ForeignRoomResponse> {
  const sectorMap = loadSectorMap();

  // ── 1. Fetch all ticker histories ──────────────────────────────────────────
  const allRows = getAllTickersHistory(db, 20);

  // Group rows by code
  const byCode: Record<string, TickerHistory['rows']> = {};
  for (const row of allRows) {
    if (!byCode[row.code]) byCode[row.code] = [];
    byCode[row.code]!.push(row);
  }

  // Optionally filter to a single ticker
  const codes = code ? [code] : Object.keys(byCode);

  // ── 2. Compute per-ticker analysis ────────────────────────────────────────
  const analyses: TickerRoomAnalysis[] = [];

  for (const ticker of codes) {
    const rows = byCode[ticker] ?? [];
    const sector = sectorMap[ticker] ?? 'Unknown';

    const history: TickerHistory = { code: ticker, sector, rows };

    const utilization = computeRoomUtilization(history);
    const velocity = computeDepletionVelocity5d(history);
    const flags = computeRoomFlags(utilization, velocity, history);

    // Read recent room events (max 5 per ticker)
    const recent_events = getTickerRecentEvents(db, ticker, 5);

    const latestRow = rows[0];
    analyses.push({
      code: ticker,
      sector,
      market_cap_bn: latestRow?.market_cap_bn ?? null,
      utilization,
      velocity,
      flags,
      recent_events,
    });
  }

  // ── 3. Market-wide + sector saturation ────────────────────────────────────
  const { market_saturation_pct, sector_saturation } = computeMarketSaturation(analyses);

  // ── 4. Gauge-ready z-score ────────────────────────────────────────────────
  const velocitySeries = getMarketWideDailyVelocities(db, 25);
  const velocityValues = velocitySeries.map((v) => v.cap_wtd_velocity);
  const { z: foreign_outflow_z_5d, sessions: sessions_for_z, null_reason: zNullReason } =
    computeForeignOutflowZ5d(velocityValues);

  const market: MarketSaturation = {
    market_saturation_pct,
    sector_saturation,
    foreign_outflow_z_5d,
    sessions_for_z,
    source_tier: 2,
    unit: 'pct',
    ...(zNullReason ? { null_reason: zNullReason } : {}),
  };

  // Determine as_of_date from latest row across all tickers
  const latestDates = analyses
    .map((a) => a.utilization.asof)
    .filter((d): d is string => d !== null)
    .sort()
    .reverse();
  const as_of_date = latestDates[0] ?? null;

  return {
    as_of_date,
    tickers: analyses,
    market,
    source_tier: 2,
    coverage_note:
      'Covers watchlist tickers only (vnstock_trading_stats). ' +
      'Foreign-restricted tickers (max_holding_ratio=0) flagged with foreign_restricted=true.',
  };
}
