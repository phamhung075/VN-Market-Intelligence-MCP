/**
 * ohlcvWriteService — application/usecases layer
 *
 * SSOT choke-point for all OHLCV upserts.
 * FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
 *
 * DDD layer: application/usecases
 *   - MAY import from: domain/services, infrastructure/db
 *   - MUST NOT be imported by: domain/
 *   - Callers (interface/, scheduler/) import from here — correct DDD direction.
 *
 * Pipeline (per-row, in order):
 *   1. FR-S1 seed-bar rejection  — skip rows where date >= vnToday AND volume=0 AND O=H=L=C
 *   2. normalizeOhlcvToVnd       — ×1000 when max(OHLC) < STOCK_MIN_VND (100)
 *   3. detectAndNormalizeScaleFromPrevClose — ×1000 when ratio vs DB prevClose >= 50
 *      prevClose sourced from ONE batched JOIN query (no N+1) — see fetchPrevCloseMap()
 *   4. validateOhlcvUnit         — fail-closed: reject + log BUG on out-of-range
 *   5. SQL upsert                — conflict clause selected by conflictStrategy
 *
 * conflictStrategy:
 *   'backfill' — Writer D (taOhlcvBackfillJob): unconditionally overwrite all fields.
 *   'intraday' — Writer A (pushPricesHandler): accumulate-high / self-heal-open /
 *                protected-low semantics. EXTENSION POINT for SUBTASK-3.
 *
 * SUBTASK-1 -- Skeleton ONLY.
 * SUBTASK-2 migrates Writer D (taOhlcvBackfillJob) to call writeOhlcvBatch.
 * SUBTASK-3 migrates Writer A (pushPricesHandler) and fills the 'intraday' SQL branch.
 */

// =============================================================================
// WRITER INVENTORY (post-FIX-OHLCV-WRITER-SSOT-DURABLE, 2026-06-17)
// =============================================================================
//
// This service is the authoritative chokepoint for all writes to daily_ohlcv
// that carry OHLCV price data (open/high/low/close/volume). It enforces:
//   - C=0 rejection (no zero-close stubs)
//   - FR-S1 flat-seed skipping (no vol=0 AND O=H=L=C stubs)
//   - Unit normalization (VND scale, x1000 correction)
//   - Duplicate detection
//
// Writer | File                                               | SQL Path              | Status          | Notes
// -------|----------------------------------------------------|-----------------------|-----------------|-------
// A      | interface/mcp/routes/pushPricesHandler.ts          | writeOhlcvBatch       | Migrated        | Real-time market open / intraday writes
// C      | scheduler/market-data/ohlcvDailyAggregatorJob.ts   | writeOhlcvBatch       | Migrated        | Daily aggregation from minute bars
// D      | scheduler/market-data/taOhlcvBackfillJob.ts        | writeOhlcvBatch       | Migrated        | Historical backfill for TA indicators
// E      | infrastructure/fetchers/ohlcvBackfill.ts           | INSERT OR IGNORE      | In-scope bypass | Historical backfill; guarded FR-S1+validateOhlcvUnit; sentinel present
// F      | domain/services/priceBackfillService.ts            | INSERT OR IGNORE      | In-scope bypass | Historical seed/mock only (not live-market); sentinel present
// G      | infrastructure/db/ohlcvForeignFlowStore.ts         | UPDATE-only (merge)   | Fixed           | No INSERT stub; defers on absent row (/goal#1); changes=0 = deferred, not error
// H      | interface/mcp/server.ts (push-ohlcv-history route) | ON CONFLICT DO UPDATE | In-scope bypass | Secondary push path; C=0/vol=0 guard at L1264; sentinel present
//
// Note: There is no Writer B (label skipped for historical continuity).
//
// =============================================================================
// WRITER-BYPASS SENTINEL PATTERN
// =============================================================================
//
// Writers E, F, and H are "in-scope bypasses" -- they write directly to
// daily_ohlcv WITHOUT routing through writeOhlcvBatch, but they have legitimate
// justifications (historical backfill, guarded against stub injection) and MUST
// carry the sentinel comment on the line immediately before any raw INSERT:
//
//   // OHLCV-WRITE-BYPASS-ALLOWED -- [justification, e.g. "historical backfill, guarded by FR-S1"]
//   const sql = "INSERT OR IGNORE INTO daily_ohlcv ...";
//
// Any new raw INSERT INTO daily_ohlcv that does NOT carry this sentinel is an
// ARCHITECTURAL VIOLATION and must be escalated to the architect.
//
// Writer G (ohlcvForeignFlowStore.ts) was converted to UPDATE-only (no INSERT)
// as of FIX-OHLCV-WRITER-SSOT-DURABLE -- it no longer needs the sentinel.
//
// =============================================================================
// FUTURE HARDENING (follow-on LINT-OHLCV-WRITE-BYPASS -- backlog, not P0)
// =============================================================================
//
// A custom ESLint rule (LINT-OHLCV-WRITE-BYPASS) will enforce the sentinel
// pattern at lint time: any INSERT INTO daily_ohlcv literal in a .ts file
// outside this file that lacks the sentinel on the prior line -> lint error.
// Until that rule ships, THIS COMMENT BLOCK IS THE AUTHORITATIVE HUMAN-READABLE INVENTORY.
// =============================================================================

import type { Database } from "bun:sqlite";

import {
  normalizeOhlcvToVnd,
  detectAndNormalizeScaleFromPrevClose,
  validateOhlcvUnit,
} from "../../domain/services/market-data/ohlcvUnitGuard.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** One row passed to writeOhlcvBatch. Values must be RAW (pre-normalization). */
export interface OhlcvWriteRow {
  code: string;
  date: string;         // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 'stock' (default) or 'index' */
  type?: "stock" | "index";
  /** data_env tag — null/undefined means caller does not set it (Writer D pattern) */
  dataEnv?: string | null;
}

/** Summary returned by writeOhlcvBatch for caller logging. */
export interface OhlcvWriteResult {
  /** Number of rows successfully upserted. */
  written: number;
  /** Number of rows skipped by FR-S1 seed-bar filter (synthetic seed bars). */
  skipped: number;
  /** Rows rejected by validateOhlcvUnit: "CODE DATE: reason" strings. */
  rejected: string[];
}

/** Conflict resolution strategy for the SQL upsert. */
export type OhlcvConflictStrategy = "backfill" | "intraday";

/** Options for writeOhlcvBatch. */
export interface OhlcvWriteOptions {
  /**
   * 'backfill' (default): unconditionally overwrite all OHLCV fields (Writer D semantics).
   * 'intraday': accumulate-high / self-heal-open / protected-low (Writer A semantics).
   *             Implemented in SUBTASK-3 — UPSERT_INTRADAY_SQL is now filled.
   */
  conflictStrategy?: OhlcvConflictStrategy;
  /**
   * Vietnam local date 'YYYY-MM-DD' (UTC+7) injected for testability.
   * When omitted, computed automatically as new Date(Date.now() + 7*3600_000).toISOString().slice(0,10).
   *
   * Architect R-4: must use VN local date, not UTC, to avoid false positive near midnight.
   */
  vnToday?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Backfill strategy: unconditionally overwrite all OHLCV fields.
 * Writer D (taOhlcvBackfillJob) semantics — backfill is the source of truth.
 * Preserves foreign_flow columns (no-touch via DO UPDATE SET on named columns only).
 */
const UPSERT_BACKFILL_SQL = `
  INSERT INTO daily_ohlcv
    (code, date, open, high, low, close, volume, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(code, date) DO UPDATE SET
    open       = excluded.open,
    high       = excluded.high,
    low        = excluded.low,
    close      = excluded.close,
    volume     = excluded.volume,
    updated_at = excluded.updated_at
`;

/**
 * Intraday strategy: Writer A (pushPricesHandler) conflict semantics.
 *
 * SUBTASK-3 — filled from live pushPricesHandler ON CONFLICT clause (verified
 * against apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts lines 171-183).
 *
 * Three conflict rules preserved EXACTLY:
 *
 *   open  = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open
 *                ELSE daily_ohlcv.open END
 *           (CONTAM-2 self-heal: overwrite if existing open is contaminated thousand-VND leakage)
 *
 *   high  = MAX(daily_ohlcv.high, excluded.high)
 *           (intraday accumulate-high: never lose an intraday peak)
 *
 *   low   = CASE WHEN daily_ohlcv.low = 0 THEN excluded.low
 *                ELSE MIN(daily_ohlcv.low, excluded.low) END
 *           (CONTAM-9 protected-low: if existing low is 0/sentinel, replace; else true min)
 *
 *   close  = excluded.close    (latest VPS push wins)
 *   volume = excluded.volume   (latest cumulative VPS volume)
 *
 * Architect ref: §4.2 R-2 (HIGH risk — semantics must be preserved exactly).
 */
const UPSERT_INTRADAY_SQL: string = `
  INSERT INTO daily_ohlcv
    (code, date, open, high, low, close, volume, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(code, date) DO UPDATE SET
    open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open
                ELSE daily_ohlcv.open END,
    high = MAX(daily_ohlcv.high, excluded.high),
    low  = CASE WHEN daily_ohlcv.low = 0 THEN excluded.low
                ELSE MIN(daily_ohlcv.low, excluded.low)
           END,
    close      = excluded.close,
    volume     = excluded.volume,
    updated_at = excluded.updated_at
`;

// ─────────────────────────────────────────────────────────────────────────────
// Batched prevClose query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the most recent prior real close for each code in the batch.
 * Single SQL query regardless of batch size — NO N+1.
 *
 * Shape (per architect §2.2):
 *   SELECT d.code, d.close
 *   FROM daily_ohlcv d
 *   INNER JOIN (
 *     SELECT code, MAX(date) as max_date
 *     FROM daily_ohlcv
 *     WHERE code IN (?,?,?...)   -- all unique codes in the batch
 *       AND date < ?             -- strictly before vnToday
 *       AND volume > 0           -- real trading rows only (excludes synthetic seed bars)
 *     GROUP BY code
 *   ) latest ON d.code = latest.code AND d.date = latest.max_date
 *
 * Returns Map<code, prevClose> — codes with no prior real row are absent (caller gets 0).
 */
function fetchPrevCloseMap(
  db: Database,
  codes: string[],
  beforeDate: string,
): Map<string, number> {
  if (codes.length === 0) return new Map();

  const placeholders = codes.map(() => "?").join(",");
  const sql = `
    SELECT d.code, d.close
    FROM daily_ohlcv d
    INNER JOIN (
      SELECT code, MAX(date) AS max_date
      FROM daily_ohlcv
      WHERE code IN (${placeholders})
        AND date < ?
        AND volume > 0
      GROUP BY code
    ) latest ON d.code = latest.code AND d.date = latest.max_date
  `;

  const rows = db.prepare(sql).all(...codes, beforeDate) as Array<{
    code: string;
    close: number;
  }>;

  return new Map(rows.map((r) => [r.code, r.close]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * writeOhlcvBatch — single authoritative OHLCV upsert entry point.
 *
 * All writers (A, C, D, E) must funnel through this service.
 * Currently wired by:
 *   SUBTASK-2: Writer D (taOhlcvBackfillJob) — conflictStrategy='backfill'
 *   SUBTASK-3: Writer A (pushPricesHandler)  — conflictStrategy='intraday' (DONE)
 *
 * @param rows             Batch of raw OHLCV rows (pre-normalization)
 * @param db               bun:sqlite Database instance (injected by caller)
 * @param options          { conflictStrategy, vnToday } — both injectable for tests
 * @returns                OhlcvWriteResult — written / skipped / rejected counts
 */
export async function writeOhlcvBatch(
  rows: OhlcvWriteRow[],
  db: Database,
  options?: OhlcvWriteOptions,
): Promise<OhlcvWriteResult> {
  const strategy: OhlcvConflictStrategy = options?.conflictStrategy ?? "backfill";

  // Compute VN today (UTC+7) — injectable for tests (architect R-4)
  const vnToday: string =
    options?.vnToday ??
    new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  const upsertSql =
    strategy === "backfill" ? UPSERT_BACKFILL_SQL : UPSERT_INTRADAY_SQL;

  // ── Stage 0: Collect unique codes for the batched prevClose fetch ──────────
  const uniqueCodes = [...new Set(rows.map((r) => r.code))];

  // ── Stage 1 (batched): Fetch prevClose from DB — ONE query for all codes ───
  // Architect §2.2: INNER JOIN on MAX(date) prior to vnToday with volume > 0.
  // Codes absent from the map had no prior real close → treated as 0 (no-op in guard).
  const prevCloseMap = fetchPrevCloseMap(db, uniqueCodes, vnToday);

  // ── Stage 2: Prepare the upsert statement ─────────────────────────────────
  const upsertStmt = db.prepare(upsertSql);

  const result: OhlcvWriteResult = {
    written: 0,
    skipped: 0,
    rejected: [],
  };

  // ── Stage 3: Per-row pipeline ──────────────────────────────────────────────
  const writeInTx = db.transaction(() => {
    for (const row of rows) {
      const type = row.type ?? "stock";

      // ── Pipeline step 0: C=0 fail-closed guard ────────────────────────────
      // A zero close must NEVER persist in daily_ohlcv — it would poison all
      // TA indicators (RSI/MACD/BB) and generate false "giá 0 dưới BB" alerts.
      // Fail-closed: reject any row where close=0, regardless of other fields.
      // Belt-and-suspenders: FR-S1 (below) and validateOhlcvUnit (Rule 1) also
      // catch zero-price rows, but this explicit guard fires first with a clear
      // diagnostic reason for the caller log.
      if (row.close === 0) {
        console.error(
          `[ohlcvWriteService] C=0 reject: ${row.code} ${row.date} close=0 — ` +
            `zero close must never persist (all-zero bar or missing data)`,
        );
        result.rejected.push(`${row.code} ${row.date}: zero_close C=0 guard`);
        continue;
      }

      // ── Pipeline step 1: FR-S1 seed-bar rejection ──────────────────────────
      // Skip synthetic seed bars: date >= vnToday AND volume=0 AND O=H=L=C
      // These are VNDIRECT reference-price rows with no real trading activity.
      // Architect §4.2 step 1; BA spec FR-S1.
      if (
        row.date >= vnToday &&
        row.volume === 0 &&
        row.open === row.high &&
        row.high === row.low &&
        row.low === row.close
      ) {
        console.debug(
          `[ohlcvWriteService] FR-S1 skip seed-bar: ${row.code} ${row.date} ` +
            `O=H=L=C=${row.close} vol=0 >= vnToday=${vnToday}`,
        );
        result.skipped++;
        continue;
      }

      // ── Pipeline step 2: normalizeOhlcvToVnd ──────────────────────────────
      // ×1000 when max(OHLC) < STOCK_MIN_VND (100): catches pure thousand-VND rows.
      // Domain guard — pure function, no I/O.
      let ohlcv = normalizeOhlcvToVnd(type, {
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
      });

      // ── Pipeline step 3: detectAndNormalizeScaleFromPrevClose ──────────────
      // ×1000 when prevClose / current.close >= SCALE_DETECTION_RATIO (50).
      // prevClose sourced from batched DB query (no N+1); 0 when no prior real row.
      // This catches expensive stocks (VHM/VIC/VJC) whose seed price looks valid
      // (136.1 >= 100) but is actually thousand-VND vs prior close 136,100.
      const prevClose = prevCloseMap.get(row.code) ?? 0;
      const scaleResult = detectAndNormalizeScaleFromPrevClose(type, ohlcv, prevClose);
      if (scaleResult.corrected) {
        console.debug(
          `[ohlcvWriteService] scale_correction ${row.code} ${row.date}: ` +
            scaleResult.reason,
        );
        ohlcv = scaleResult.ohlcv;
      }

      // ── Pipeline step 4: validateOhlcvUnit ────────────────────────────────
      // Fail-closed: reject and log BUG on out-of-range. Never writes corrupt data.
      const guardResult = validateOhlcvUnit(
        row.code,
        type,
        ohlcv.open,
        ohlcv.high,
        ohlcv.low,
        ohlcv.close,
      );
      if (!guardResult.valid) {
        const msg = `${row.code} ${row.date}: ${guardResult.reason}`;
        console.error(`[ohlcvWriteService] BUG unit_reject ${msg}`);
        result.rejected.push(msg);
        continue;
      }

      // ── Pipeline step 5: SQL upsert ────────────────────────────────────────
      // conflictStrategy selects the ON CONFLICT clause (see SQL constants above).
      upsertStmt.run(
        row.code,
        row.date,
        ohlcv.open,
        ohlcv.high,
        ohlcv.low,
        ohlcv.close,
        row.volume,
      );
      result.written++;
    }
  });

  writeInTx();

  return result;
}
