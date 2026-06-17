/**
 * taAlertScanJob — RSI overbought/oversold intraday alert scanner (Task 1307)
 *
 * Scans every watchlist ticker for RSI(14) extremes every 15 minutes during
 * VN market hours (every 15min, 2-8 UTC = 09:00-15:59 GMT+7 Mon-Fri).
 *
 * Business rules:
 *   RSI > 70 → type='ta_overbought', message suffix "quá mua"
 *   RSI < 30 → type='ta_oversold',   message suffix "quá bán"
 *   RSI null  → skip (insufficient history — < 15 candles)
 *   RSI 30–70 → no alert
 *
 * Cooldown: skips insert if same (ticker, alert_type) fired within the last 4h.
 * The cooldown cutoff is computed from nowFn() so tests can inject controlled time.
 *
 * Alert row written to the `alerts` table following the same pattern as
 * bctcOverdueCheckJob. NO direct Telegram send — Alert Commander reads
 * unnotified alerts via readUnnotifiedAlerts() and handles dispatch.
 *
 * Per-ticker error isolation: if computeAllIndicators() or the candle query
 * throws for any single ticker, the error is logged (warn) and the scan
 * continues. The errored ticker IS counted in `scanned` (increment happens
 * before the try block) so the caller sees the full watchlist size.
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 * MUST NOT import sendTelegram or any Telegram client.
 *
 * @module scheduler/taAlertScanJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { computeTAIndicators } from "../../infrastructure/microservices/clients.js";
import type { ComputeTAResponse } from "../../infrastructure/microservices/clients.js";
import { recordJobMetrics } from "../../infrastructure/observability/jobMetrics.js";
import { computeScanAlertFingerprint } from "../../domain/services/alertDedup.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Dependency-injectable params — all optional; production uses defaults. */
export interface TaAlertScanDeps {
  db?: Database;
  /** Injectable compute function receiving code + closes array for testability. */
  computeFn?: (code: string, closes: number[]) => Promise<ComputeTAResponse>;
  nowFn?: () => Date;
}

/** Return type wired into recordJobRun({ rowsWritten }). */
export interface TaAlertScanResult {
  scanned: number;
  fired: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
}

interface CandleRow {
  day: string;
  close_price: number;
  volume: number;
}

interface CooldownRow {
  cnt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum candle depth required before calling the Go TA service for RSI.
 *
 * RSI(14) is mathematically computable with 15 closes, but Wilder smoothing
 * needs a warm-up window to converge to reliable values. With only 15–30
 * candles, short all-gain or all-loss windows produce degenerate saturated RSI
 * (DAG RSI=100.0) or near-zero RSI (VHM RSI=9.8, VIC RSI=7.4) that do NOT
 * reflect real market conditions — they are artefacts of the short window.
 *
 * 35 candles ≈ 2.5 × period (14) provides sufficient warm-up and matches
 * the "TA pending" threshold used by the canonical get_technical_indicators
 * tool. Below this depth the job must fail-closed (skip, never emit an alert).
 *
 * This guard is the root-cause fix for FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.
 */
const MIN_CANDLES = 35;

// ─────────────────────────────────────────────────────────────────────────────
// SQL constants
// ─────────────────────────────────────────────────────────────────────────────

// Uses daily_ohlcv (OHLCV table) for closing prices — provides 30–60 days of
// daily candle data required for RSI(14) computation (≥35 rows required per
// MIN_CANDLES guard; fewer than 35 produce degenerate single-digit / clamped RSI).
// market_prices_history only has intraday ticks and is insufficient for TA.
// volume is selected so the stub-bar guard (FIX-ALERT-SCAN-REJECT-STUB-BAR-P0) can
// reject a latest bar with close<=0 OR volume<=0 before feeding closes[] to Wilder RSI.
const CANDLE_SQL = `
  SELECT date AS day, close AS close_price, volume
    FROM daily_ohlcv
   WHERE code = ?
     AND date >= date('now', '-60 days')
   ORDER BY day ASC
`;

const COOLDOWN_SQL = `
  SELECT COUNT(*) AS cnt
    FROM alerts
   WHERE json_extract(signals_json, '$[0].type') = ?
     AND json_extract(affected_actions_json, '$[0].code') = ?
     AND triggered_at >= ?
`;

// FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS: INSERT OR IGNORE with fingerprint column.
// The UNIQUE(fingerprint) constraint is the authoritative dedup gate — any
// concurrent parallel scan that tries to insert the same (ticker, alertType, day)
// will be silently rejected by SQLite regardless of timing.  The 4h cooldown
// SQL check above is kept as a first-pass filter to avoid unnecessary TA calls.
const INSERT_ALERT_SQL = `
  INSERT OR IGNORE INTO alerts
    (id, triggered_at, severity, signals_json, affected_actions_json,
     analysis_ids_json, message, read, user_note, fingerprint)
  VALUES
    (?, ?, ?, ?, ?, NULL, ?, 0, NULL, ?)
`;

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs one RSI overbought/oversold scan pass over the entire watchlist.
 *
 * @param deps - Optional injectable dependencies for testing.
 * @returns { scanned, fired } summary for recordJobRun logging.
 */
export async function runTaAlertScan(deps?: TaAlertScanDeps): Promise<TaAlertScanResult> {
  const database: Database = deps?.db ?? getDb();
  const computeFn = deps?.computeFn ?? (async (code: string, closes: number[]) => computeTAIndicators({ code, closes }));
  const nowFn = deps?.nowFn ?? (() => new Date());

  const cycleStart = Date.now();
  let cycleErrors = 0;

  // 1. Load watchlist
  let watchlist: WatchlistRow[];
  try {
    watchlist = database.query<WatchlistRow, []>("SELECT code FROM watchlist").all();
  } catch (err) {
    logger.warn("[taAlertScan] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    recordJobMetrics("taAlertScan", Date.now() - cycleStart, 1, 0);
    return { scanned: 0, fired: 0 };
  }

  if (watchlist.length === 0) {
    return { scanned: 0, fired: 0 };
  }

  // Prepare statements once for the entire scan pass (perf: avoids re-parsing per ticker)
  const cooldownCutoff = new Date(nowFn().getTime() - 4 * 3_600_000).toISOString();
  const cooldownStmt = database.query<CooldownRow, [string, string, string]>(COOLDOWN_SQL);
  const insertStmt = database.prepare(INSERT_ALERT_SQL);

  let scanned = 0;
  let fired = 0;

  for (const { code } of watchlist) {
    // Increment BEFORE try — errored tickers count toward scanned (documented above)
    scanned++;

    try {
      // a. Fetch close prices from local DB (needed for pure-compute TA service path)
      const candleRows = database.query<CandleRow, [string]>(CANDLE_SQL).all(code);
      const closes = candleRows.map(r => r.close_price);

      // a2. Candle depth guard (FIX-ALERT-ENGINE-RSI-SINGLEDIGIT).
      // Wilder RSI requires MIN_CANDLES (35) to avoid degenerate saturation (100.0)
      // or near-zero single-digit values caused by short all-gain/all-loss windows.
      // Tickers below this threshold are silently skipped — fail-closed, no alert.
      if (closes.length < MIN_CANDLES) {
        logger.info(`[taAlertScan] TA pending for ${code}: ${closes.length}/${MIN_CANDLES} candles — skip (fail-closed)`);
        continue;
      }

      // a3. Stub-bar guard (FIX-ALERT-SCAN-REJECT-STUB-BAR-P0).
      // Consumer defense-in-depth: reject the LATEST bar (the bar that would be used
      // as "today's price") if it is a stub/invalid row: close<=0 OR volume<=0.
      // A foreign-flow writer can insert an all-zero stub bar before the real OHLCV
      // bar arrives at market open; that 0-close at the tail of closes[] collapses
      // Wilder RSI to single-digit universe-wide. Fail-closed = skip this cycle, no
      // alert emitted, no substitute value fabricated. An illiquid/not-yet-arrived bar
      // is an honest gap (/goal#1), never a 0-valued RSI alert (/goal#2 generic).
      // NOTE: only the LATEST bar is inspected; interior bars are fed to Wilder RSI as-is.
      const latestCandle = candleRows[candleRows.length - 1];
      if (latestCandle !== undefined && (latestCandle.close_price <= 0 || latestCandle.volume <= 0)) {
        logger.info(`[taAlertScan] stub-bar skip for ${code}: latest bar close=${latestCandle.close_price} volume=${latestCandle.volume} — fail-closed (no alert)`);
        continue;
      }

      // b. Call TA Service to compute indicators via HTTP, passing closes array
      const taResponse = await computeFn(code, closes);

      // c. Extract RSI from response
      const rsi = taResponse.rsi;

      // e. null RSI → skip with pending annotation (insufficient history)
      if (rsi == null) {
        const available = taResponse.candlesAvailable;
        if (available !== undefined) {
          logger.info(`[taAlertScan] TA pending for ${code}: ${available}/35 candles`);
        }
        continue;
      }

      // f. Determine alert type
      let alertType: string;
      let suffix: string;

      if (rsi > 70) {
        alertType = "ta_overbought";
        suffix = "quá mua";
      } else if (rsi < 30) {
        alertType = "ta_oversold";
        suffix = "quá bán";
      } else {
        // Neutral RSI — no alert
        continue;
      }

      // g. Cooldown check — skip if same (code, alertType) fired within last 4h
      const cooldownRow = cooldownStmt.get(alertType, code, cooldownCutoff);
      if ((cooldownRow?.cnt ?? 0) > 0) {
        continue;
      }

      // h. Build alert payload
      const triggeredAt = nowFn().toISOString();
      const message = `${code}: RSI(14) = ${rsi.toFixed(1)} — ${suffix}`;
      const signalsJson = JSON.stringify([
        {
          type: alertType,
          actionCode: code,
          message,
          confidence: 0.7,
          detectedAt: triggeredAt,
        },
      ]);
      const affectedActionsJson = JSON.stringify([{ code }]);
      const id = crypto.randomUUID();

      // FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS: compute composite fingerprint so
      // the DB-level UNIQUE constraint collapses any concurrent duplicate inserts
      // (parallel job race, multi-cycle repeat within the same UTC day).
      const daySlot = triggeredAt.slice(0, 10); // "YYYY-MM-DD"
      const fingerprint = computeScanAlertFingerprint(code, alertType, daySlot);

      // i. Insert alert — INSERT OR IGNORE; fingerprint UNIQUE constraint is the
      //    authoritative dedup gate (cooldown check above is a cost-saving pre-filter).
      insertStmt.run(id, triggeredAt, "warning", signalsJson, affectedActionsJson, message, fingerprint);

      // j. Count the fired alert
      fired++;
    } catch (err) {
      logger.warn(`[taAlertScan] error ticker=${code}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      cycleErrors++;
      // scanned already incremented; continue to next ticker
    }
  }

  recordJobMetrics("taAlertScan", Date.now() - cycleStart, cycleErrors, fired);
  return { scanned, fired };
}
