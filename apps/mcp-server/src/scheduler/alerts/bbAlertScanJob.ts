/**
 * bbAlertScanJob — Bollinger Band breakout intraday alert scanner (Task 1309)
 *
 * Scans every watchlist ticker for BB20 breakouts every 15 minutes during
 * VN market hours (every 15min, 2-8 UTC = 09:00-15:59 GMT+7 Mon-Fri).
 *
 * Business rules:
 *   close > bb20.upper → type='ta_bb_breakout_up',   message "bứt phá tăng"
 *   close < bb20.lower → type='ta_bb_breakout_down',  message "bứt phá giảm"
 *   bb20 null          → skip (insufficient history — < 20 candles)
 *   candles.length = 0 → skip (no price history for ticker)
 *   lower <= close <= upper → no alert (inside band, incl. exact boundary)
 *
 * Cooldown: skips insert if same (ticker, alert_type) fired within the last 4h.
 * The cooldown cutoff is computed from nowFn() so tests can inject controlled time.
 * ta_bb_breakout_up and ta_bb_breakout_down have independent 4h cooldowns per ticker.
 *
 * Alert row written to the `alerts` table. NO direct Telegram send — Alert
 * Commander reads unnotified alerts via readUnnotifiedAlerts() and handles dispatch.
 *
 * Per-ticker error isolation: if computeAllIndicators() or the candle query
 * throws for any single ticker, the error is logged (warn) and the scan
 * continues. The errored ticker IS counted in `scanned` (increment happens
 * before the try block).
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 * MUST NOT import sendTelegram or any Telegram client.
 *
 * @module scheduler/bbAlertScanJob
 */

import type { Database } from "bun:sqlite";
import { computeTAIndicators } from "../../infrastructure/microservices/clients.js";
import type { ComputeTAResponse } from "../../infrastructure/microservices/clients.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { recordJobMetrics } from "../../infrastructure/observability/jobMetrics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Dependency-injectable params — all optional; production uses defaults. */
export interface BbAlertScanDeps {
  db?: Database;
  /** Injectable compute function receiving code + closes array for testability. */
  computeFn?: (code: string, closes: number[]) => Promise<ComputeTAResponse>;
  nowFn?: () => Date;
}

/** Return type wired into recordJobRun({ rowsWritten }). */
export interface BbAlertScanResult {
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
}

interface CooldownRow {
  cnt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL constants (identical to taAlertScanJob — copy verbatim)
// ─────────────────────────────────────────────────────────────────────────────

// Uses daily_ohlcv (OHLCV table) for closing prices — provides 30–60 days of
// daily candle data required for BB20 computation (≥20 rows needed).
// market_prices_history only has intraday ticks and is insufficient for TA.
const CANDLE_SQL = `
  SELECT date AS day, close AS close_price
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

const INSERT_ALERT_SQL = `
  INSERT INTO alerts
    (id, triggered_at, severity, signals_json, affected_actions_json,
     analysis_ids_json, message, read, user_note)
  VALUES
    (?, ?, ?, ?, ?, NULL, ?, 0, NULL)
`;

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs one BB20 breakout scan pass over the entire watchlist.
 *
 * @param deps - Optional injectable dependencies for testing.
 * @returns { scanned, fired } summary for recordJobRun logging.
 */
export async function runBbAlertScan(deps?: BbAlertScanDeps): Promise<BbAlertScanResult> {
  const database: Database = deps?.db ?? getDb();
  const computeFn = deps?.computeFn ?? (async (code: string, closes: number[]) => computeTAIndicators({ code, closes }));
  const nowFn = deps?.nowFn ?? (() => new Date());

  const cycleStart = Date.now();
  let cycleErrors = 0;

  // 1. Load watchlist
  let watchlist: WatchlistRow[];
  try {
    watchlist = database.query<WatchlistRow, []>("SELECT code FROM watchlist ORDER BY code").all();
  } catch (err) {
    logger.warn("[bbAlertScan] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    recordJobMetrics("bbAlertScan", Date.now() - cycleStart, 1, 0);
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
      // a. Fetch candles from local DB to get latest close price
      const candleRows = database.query<CandleRow, [string]>(CANDLE_SQL).all(code);

      // b. Skip if no candle data
      if (candleRows.length === 0) {
        continue;
      }

      // c. Extract latest close price — reject stale candles (not from today).
      // Task 1391 fix: the candle query groups by calendar date; if the most
      // recent row is from a previous day the price is stale and embedding it
      // in the alert message produces an inverted-direction report at dispatch
      // time (FPT message id 335: 73,100 -0.41% sent when live price was 74,400 +1.36%).
      // Use real wall clock (not nowFn) — candles stored with datetime('now').
      const lastCandle = candleRows[candleRows.length - 1];
      if (lastCandle === undefined) {
        continue;
      }
      const todayUtc = new Date().toISOString().slice(0, 10);
      if (lastCandle.day !== todayUtc) {
        // Candle is from a previous session — skip to avoid stale price in message
        continue;
      }
      const close = Math.round(lastCandle.close_price);

      // d. Call TA microservice to compute indicators (async, via HTTP), passing closes array
      const closes = candleRows.map(r => r.close_price);
      const indicators = await computeFn(code, closes);

      // e. Extract BB20 bands
      const bb20 = indicators.bb;

      // f. null/undefined BB20 → skip silently (insufficient history — < 20 candles)
      if (!bb20) {
        continue;
      }

      // g. Determine alert type
      let alertType: string;
      let message: string;

      if (close > bb20.upper) {
        alertType = "ta_bb_breakout_up";
        message = `${code}: giá ${close} vượt BB trên ${Math.round(bb20.upper)} — bứt phá tăng`;
      } else if (close < bb20.lower) {
        alertType = "ta_bb_breakout_down";
        message = `${code}: giá ${close} dưới BB dưới ${Math.round(bb20.lower)} — bứt phá giảm`;
      } else {
        // Inside band (including exact boundary) — no alert
        continue;
      }

      // h. Cooldown check — skip if same (code, alertType) fired within last 4h
      const cooldownRow = cooldownStmt.get(alertType, code, cooldownCutoff);
      if ((cooldownRow?.cnt ?? 0) > 0) {
        continue;
      }

      // i. Build alert payload
      const triggeredAt = nowFn().toISOString();
      const signalsJson = JSON.stringify([
        {
          type: alertType,
          actionCode: code,
          message,
          confidence: 0.65,
          detectedAt: triggeredAt,
        },
      ]);
      const affectedActionsJson = JSON.stringify([{ code }]);
      const id = crypto.randomUUID();

      // j. Insert alert (no INSERT OR IGNORE — cooldown enforced above)
      insertStmt.run(id, triggeredAt, "warning", signalsJson, affectedActionsJson, message);

      // k. Count the fired alert
      fired++;
    } catch (err) {
      logger.warn(`[bbAlertScan] error ticker=${code}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      cycleErrors++;
      // scanned already incremented; continue to next ticker
    }
  }

  recordJobMetrics("bbAlertScan", Date.now() - cycleStart, cycleErrors, fired);
  return { scanned, fired };
}
