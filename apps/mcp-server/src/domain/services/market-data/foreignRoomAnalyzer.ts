/**
 * Domain — Foreign Room Analyzer (P0-2-FOREIGN-ROOM-SUITE)
 *
 * Pure computation layer — no I/O. Implements FR-1 through FR-5 of the
 * MARKET-INDICATOR-DEPTH-P0 spec for per-ticker room utilization, depletion
 * velocity, ROOM_LOCKED / FULL_ROOM_SELL flags, and market/sector saturation.
 *
 * Layer: domain/services (pure — no database or network access)
 *
 * @module domain/services/market-data/foreignRoomAnalyzer
 */

// ---------------------------------------------------------------------------
// Input types (data rows from infrastructure layer)
// ---------------------------------------------------------------------------

/** One daily row from vnstock_trading_stats for a single ticker. */
export interface TradingStatsRow {
  code: string;
  date: string;              // YYYY-MM-DD
  foreign_room: number | null;          // remaining room in shares
  foreign_volume: number | null;        // daily foreign buy volume
  current_holding_ratio: number | null; // e.g. 0.25 = 25%
  max_holding_ratio: number | null;     // e.g. 0.49 = 49%
  market_cap_bn: number | null;         // market cap in billion VND
}

/** History for a single ticker: rows sorted by date DESC (newest first). */
export interface TickerHistory {
  code: string;
  sector: string;            // from stock-classification.json
  rows: TradingStatsRow[];   // at least 1 row; rows[0] = latest
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** FR-1: Per-ticker room utilization result. */
export interface RoomUtilization {
  room_utilization_pct: number | null;    // 0–100; null when max_holding_ratio ≤ 0
  foreign_room_remaining: number | null;  // shares; from foreign_room column
  max_holding_ratio: number | null;       // raw ratio
  current_holding_ratio: number | null;   // raw ratio
  foreign_restricted: boolean;            // true when max_holding_ratio = 0 or null
  asof: string | null;                    // date of the latest row used
  source_tier: 2;
}

/** FR-3: 5-day depletion velocity result. */
export interface DepletionVelocity {
  depletion_velocity_5d: number | null;  // shares/day; positive = room shrinking; null when <5 rows
  confidence: 'full' | 'insufficient';
  null_reason?: string;
}

/** FR-4: Room constraint flags. */
export interface RoomFlags {
  room_locked: boolean | null;       // null when insufficient data
  full_room_sell: boolean | null;    // null when insufficient data
  null_reason?: string;
}

/** FR-1 through FR-4 combined per-ticker result. */
export interface TickerRoomAnalysis {
  code: string;
  sector: string;
  market_cap_bn: number | null;
  utilization: RoomUtilization;
  velocity: DepletionVelocity;
  flags: RoomFlags;
  recent_events: ForeignRoomEvent[];  // from foreign_room_events table
}

/** FR-2: Event row shape (read from infrastructure). */
export interface ForeignRoomEvent {
  event_type: 'ROOM_FULL' | 'ROOM_REOPEN';
  event_date: string;
  room_remaining_before: number | null;
  room_remaining_after: number | null;
}

/** FR-5: Market-wide saturation output. */
export interface MarketSaturation {
  market_saturation_pct: number | null;              // watchlist cap-weighted 0–100
  sector_saturation: Record<string, number>;          // sector → cap-weighted pct
  foreign_outflow_z_5d: number | null;               // gauge-ready z-score; null when <20 sessions
  sessions_for_z: number;                            // actual session count used for z computation
  source_tier: 2;
  unit: 'pct';
  null_reason?: string;
}

// ---------------------------------------------------------------------------
// FR-1: Per-ticker room utilization
// ---------------------------------------------------------------------------

/**
 * Compute per-ticker room utilization from the latest trading stats row.
 *
 * NFR-P02-3: if max_holding_ratio = 0 or null, room_utilization_pct = null.
 * Do NOT emit 0 or Infinity.
 */
export function computeRoomUtilization(history: TickerHistory): RoomUtilization {
  const latest = history.rows[0];
  if (!latest) {
    return {
      room_utilization_pct: null,
      foreign_room_remaining: null,
      max_holding_ratio: null,
      current_holding_ratio: null,
      foreign_restricted: true,
      asof: null,
      source_tier: 2,
    };
  }

  const maxRatio = latest.max_holding_ratio;
  const currRatio = latest.current_holding_ratio;

  // Foreign-restricted: max_holding_ratio = 0 or null
  if (maxRatio === null || maxRatio <= 0) {
    return {
      room_utilization_pct: null,
      foreign_room_remaining: latest.foreign_room,
      max_holding_ratio: maxRatio,
      current_holding_ratio: currRatio,
      foreign_restricted: true,
      asof: latest.date,
      source_tier: 2,
    };
  }

  // Compute utilization: current / max * 100
  const utilPct = currRatio !== null ? (currRatio / maxRatio) * 100 : null;

  return {
    room_utilization_pct: utilPct !== null ? Math.min(100, Math.max(0, utilPct)) : null,
    foreign_room_remaining: latest.foreign_room,
    max_holding_ratio: maxRatio,
    current_holding_ratio: currRatio,
    foreign_restricted: false,
    asof: latest.date,
    source_tier: 2,
  };
}

// ---------------------------------------------------------------------------
// FR-3: 5-day depletion velocity
// ---------------------------------------------------------------------------

/**
 * Compute 5-day depletion velocity from per-ticker history.
 *
 * depletion_velocity_5d = (room_5d_ago − room_today) / 5
 * Positive = room shrinking (foreign positions growing or existing).
 * Null when fewer than 5 rows available.
 *
 * Rows must be sorted DESC (newest first). rows[0] = today, rows[4] = 5 days ago.
 */
export function computeDepletionVelocity5d(history: TickerHistory): DepletionVelocity {
  const rows = history.rows;

  if (rows.length < 5) {
    return {
      depletion_velocity_5d: null,
      confidence: 'insufficient',
      null_reason: `Only ${rows.length} rows available (need ≥5)`,
    };
  }

  const roomToday = rows[0]!.foreign_room;
  const room5dAgo = rows[4]!.foreign_room;

  if (roomToday === null || room5dAgo === null) {
    return {
      depletion_velocity_5d: null,
      confidence: 'insufficient',
      null_reason: 'foreign_room null in one or more required rows',
    };
  }

  return {
    depletion_velocity_5d: (room5dAgo - roomToday) / 5,
    confidence: 'full',
  };
}

// ---------------------------------------------------------------------------
// FR-4: ROOM_LOCKED and FULL_ROOM_SELL flags
// ---------------------------------------------------------------------------

/**
 * Compute ROOM_LOCKED and FULL_ROOM_SELL flags.
 *
 * ROOM_LOCKED: utilization >= 99% AND depletion_velocity_5d <= 0 (not recovering)
 * FULL_ROOM_SELL: utilization >= 99% AND current_holding_ratio declining over 3d
 *
 * Both flags are null when:
 *   - foreign_restricted (max_holding_ratio = 0)
 *   - utilization_pct is null
 *   - Minimum data window unavailable (FULL_ROOM_SELL needs ≥3 rows; ROOM_LOCKED needs velocity)
 */
export function computeRoomFlags(
  utilization: RoomUtilization,
  velocity: DepletionVelocity,
  history: TickerHistory,
): RoomFlags {
  if (utilization.foreign_restricted || utilization.room_utilization_pct === null) {
    return {
      room_locked: null,
      full_room_sell: null,
      null_reason: 'foreign_restricted or utilization null',
    };
  }

  const utilPct = utilization.room_utilization_pct;
  const roomFull = utilPct >= 99;

  // ROOM_LOCKED: needs velocity (5d)
  let roomLocked: boolean | null = null;
  if (velocity.confidence === 'full' && velocity.depletion_velocity_5d !== null) {
    roomLocked = roomFull && velocity.depletion_velocity_5d <= 0;
  }

  // FULL_ROOM_SELL: needs ≥3 rows, checks if holding_ratio declining
  let fullRoomSell: boolean | null = null;
  const rows = history.rows;
  if (rows.length >= 3) {
    const r0 = rows[0]!.current_holding_ratio;
    const r1 = rows[1]!.current_holding_ratio;
    const r2 = rows[2]!.current_holding_ratio;

    if (r0 !== null && r1 !== null && r2 !== null) {
      // Net selling: holding ratio consistently declining over 3d
      const decliningPattern = r0 < r1 && r1 < r2;
      fullRoomSell = roomFull && decliningPattern;
    }
  }

  return { room_locked: roomLocked, full_room_sell: fullRoomSell };
}

// ---------------------------------------------------------------------------
// FR-5: Market-wide and sector cap-weighted saturation
// ---------------------------------------------------------------------------

/**
 * Compute cap-weighted market saturation across all tickers.
 * Only tickers with non-null utilization and market_cap_bn > 0 contribute.
 */
export function computeMarketSaturation(
  analyses: TickerRoomAnalysis[],
): { market_saturation_pct: number | null; sector_saturation: Record<string, number> } {
  let totalCap = 0;
  let capWeightedPct = 0;

  const sectorCap: Record<string, number> = {};
  const sectorWtdPct: Record<string, number> = {};

  for (const a of analyses) {
    const utilPct = a.utilization.room_utilization_pct;
    const cap = a.market_cap_bn;

    if (utilPct === null || cap === null || cap <= 0) continue;

    totalCap += cap;
    capWeightedPct += utilPct * cap;

    const sector = a.sector;
    sectorCap[sector] = (sectorCap[sector] ?? 0) + cap;
    sectorWtdPct[sector] = (sectorWtdPct[sector] ?? 0) + utilPct * cap;
  }

  const market_saturation_pct = totalCap > 0 ? capWeightedPct / totalCap : null;

  const sector_saturation: Record<string, number> = {};
  for (const sector of Object.keys(sectorCap)) {
    const sCap = sectorCap[sector]!;
    if (sCap > 0) {
      sector_saturation[sector] = sectorWtdPct[sector]! / sCap;
    }
  }

  return { market_saturation_pct, sector_saturation };
}

// ---------------------------------------------------------------------------
// FR-5: foreign_outflow_z_5d (gauge-ready scalar)
// ---------------------------------------------------------------------------

/**
 * Compute z-score of the market-wide depletion_velocity_5d vs 20-session rolling
 * mean and stddev.
 *
 * Inputs:
 *   `velocitySeries` — array of market-wide cap-weighted depletion_velocity values
 *   per session, sorted by date DESC (newest first). Must have ≥20 entries.
 *
 * Returns null when fewer than 20 sessions available.
 */
export function computeForeignOutflowZ5d(
  velocitySeries: number[],
): { z: number | null; sessions: number; null_reason?: string } {
  if (velocitySeries.length < 20) {
    return {
      z: null,
      sessions: velocitySeries.length,
      null_reason: `Only ${velocitySeries.length} sessions available (need ≥20)`,
    };
  }

  // Use last 20 sessions (most recent first → index 0 is today)
  const window = velocitySeries.slice(0, 20);
  const today = window[0]!;
  const baseline = window.slice(1); // 19 historical sessions

  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const stdev = Math.sqrt(variance);

  if (stdev === 0) {
    return { z: null, sessions: velocitySeries.length, null_reason: 'stdev=0 (all baseline values identical)' };
  }

  return { z: (today - mean) / stdev, sessions: velocitySeries.length };
}

// ---------------------------------------------------------------------------
// FR-2: Event detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect room transition events for a single ticker.
 *
 * Returns the event type if a transition occurred, or null.
 *
 *   ROOM_FULL:   current utilization_pct >= 99
 *   ROOM_REOPEN: current utilization_pct < 95 AND there was a prior ROOM_FULL event
 */
export function detectRoomEvent(
  utilPct: number | null,
  hadPriorFullEvent: boolean,
): 'ROOM_FULL' | 'ROOM_REOPEN' | null {
  if (utilPct === null) return null;
  if (utilPct >= 99) return 'ROOM_FULL';
  if (utilPct < 95 && hadPriorFullEvent) return 'ROOM_REOPEN';
  return null;
}

// ---------------------------------------------------------------------------
// FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET: tool-result trimming
// ---------------------------------------------------------------------------

/** Aggregate counts computed over the FULL ticker universe (never truncated). */
export interface ForeignRoomRollup {
  total_tickers: number;
  returned_tickers: number;
  room_locked_count: number;
  full_room_sell_count: number;
  foreign_restricted_count: number;
  avg_utilization_pct: number | null;
}

/** Result of summarizing a full TickerRoomAnalysis[] down to a token-bounded slice. */
export interface ForeignRoomSummary {
  tickers: TickerRoomAnalysis[];
  rollup: ForeignRoomRollup;
  omitted_codes: string[];
}

/**
 * Trim a full-universe `TickerRoomAnalysis[]` to at most `topN` entries for
 * MCP tool-result serialization, without discarding the aggregate signal.
 *
 * Root cause this closes (FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET,
 * recurring 3x): `getForeignRoom(db)` with no `code` filter serves EVERY
 * code present in `vnstock_trading_stats` (the full traded universe the
 * fundamentals job has touched — 100+ tickers live, not just the ~33-ticker
 * watchlist), so the MCP tool-result payload grows unbounded and exceeded
 * the caller's tool-result token budget. The effective limit here is ALWAYS
 * derived from the real `analyses.length` — never a hardcoded universe-size
 * assumption (`Math.min(topN, analyses.length)`).
 *
 * Ranking (highest alert-relevance first — never buries the two states this
 * tool exists to surface behind an unremarkable ticker):
 *   1. ROOM_LOCKED / FULL_ROOM_SELL flagged tickers
 *   2. `|depletion_velocity_5d|` descending — "top-N by |net|" per the fix spec
 *   3. `room_utilization_pct` descending (tie-break)
 *   4. `market_cap_bn` descending, then `code` ascending (final determinism)
 *
 * Rollup counts (room_locked_count, full_room_sell_count,
 * foreign_restricted_count, avg_utilization_pct) are computed over the FULL
 * universe, never just the returned slice — a ticker dropped from
 * `tickers[]` is still represented in the rollup, and its code is listed in
 * `omitted_codes` so the caller can re-fetch it individually via
 * `code=<ticker>` (fetch-more handle).
 */
export function summarizeForeignRoomTickers(
  analyses: TickerRoomAnalysis[],
  topN: number,
): ForeignRoomSummary {
  const total_tickers = analyses.length;

  // ── Rollup over the FULL universe (never truncated) ──────────────────────
  let room_locked_count = 0;
  let full_room_sell_count = 0;
  let foreign_restricted_count = 0;
  let utilSum = 0;
  let utilCount = 0;

  for (const a of analyses) {
    if (a.flags.room_locked === true) room_locked_count++;
    if (a.flags.full_room_sell === true) full_room_sell_count++;
    if (a.utilization.foreign_restricted) foreign_restricted_count++;
    if (a.utilization.room_utilization_pct !== null) {
      utilSum += a.utilization.room_utilization_pct;
      utilCount++;
    }
  }
  const avg_utilization_pct = utilCount > 0 ? utilSum / utilCount : null;

  // ── Rank + trim ───────────────────────────────────────────────────────────
  const isFlagged = (a: TickerRoomAnalysis): boolean =>
    a.flags.room_locked === true || a.flags.full_room_sell === true;
  const absVel = (a: TickerRoomAnalysis): number =>
    a.velocity.depletion_velocity_5d !== null ? Math.abs(a.velocity.depletion_velocity_5d) : -Infinity;
  const util = (a: TickerRoomAnalysis): number =>
    a.utilization.room_utilization_pct !== null ? a.utilization.room_utilization_pct : -Infinity;
  const cap = (a: TickerRoomAnalysis): number => a.market_cap_bn ?? -Infinity;

  const ranked = [...analyses].sort((x, y) => {
    const flagDelta = Number(isFlagged(y)) - Number(isFlagged(x));
    if (flagDelta !== 0) return flagDelta;
    if (absVel(y) !== absVel(x)) return absVel(y) - absVel(x);
    if (util(y) !== util(x)) return util(y) - util(x);
    if (cap(y) !== cap(x)) return cap(y) - cap(x);
    return x.code.localeCompare(y.code);
  });

  const effectiveN = Math.min(Math.max(topN, 0), total_tickers);
  const selected = ranked.slice(0, effectiveN);
  const selectedCodes = new Set(selected.map((a) => a.code));
  const omitted_codes = analyses
    .filter((a) => !selectedCodes.has(a.code))
    .map((a) => a.code)
    .sort();

  return {
    tickers: selected,
    rollup: {
      total_tickers,
      returned_tickers: selected.length,
      room_locked_count,
      full_room_sell_count,
      foreign_restricted_count,
      avg_utilization_pct,
    },
    omitted_codes,
  };
}
