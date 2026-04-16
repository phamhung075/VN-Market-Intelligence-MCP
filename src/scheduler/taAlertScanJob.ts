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
import { computeAllIndicators } from "../domain/services/technicalIndicators.js";
import type { DailyCandle, TechnicalIndicatorResult } from "../domain/services/technicalIndicators.js";
import { getDb } from "../infrastructure/db/schema.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Dependency-injectable params — all optional; production uses defaults. */
export interface TaAlertScanDeps {
  db?: Database;
  computeFn?: (candles: DailyCandle[]) => TechnicalIndicatorResult;
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
}

interface CooldownRow {
  cnt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL constants
// ─────────────────────────────────────────────────────────────────────────────

const CANDLE_SQL = `
  SELECT date(fetched_at) AS day, AVG(price) AS close_price
    FROM market_prices_history
   WHERE code = ?
     AND fetched_at >= datetime('now', '-60 days')
   GROUP BY date(fetched_at)
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
 * Runs one RSI overbought/oversold scan pass over the entire watchlist.
 *
 * @param deps - Optional injectable dependencies for testing.
 * @returns { scanned, fired } summary for recordJobRun logging.
 */
export async function runTaAlertScan(deps?: TaAlertScanDeps): Promise<TaAlertScanResult> {
  const database: Database = deps?.db ?? getDb();
  const computeFn = deps?.computeFn ?? computeAllIndicators;
  const nowFn = deps?.nowFn ?? (() => new Date());

  // 1. Load watchlist
  let watchlist: WatchlistRow[];
  try {
    watchlist = database.query<WatchlistRow, []>("SELECT code FROM watchlist").all();
  } catch (err) {
    logger.warn("[taAlertScan] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
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
      // a. Fetch candles from local DB
      const candleRows = database.query<CandleRow, [string]>(CANDLE_SQL).all(code);

      // b. Map to DailyCandle[]
      const candles: DailyCandle[] = candleRows.map((row) => ({
        day: row.day,
        close: row.close_price,
      }));

      // c. Compute indicators (injectable — replaced by mock in tests)
      const indicators = computeFn(candles);

      // d. Extract RSI
      const rsi = indicators.rsi14;

      // e. null RSI → skip silently (insufficient history)
      if (rsi === null) {
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

      // i. Insert alert (no INSERT OR IGNORE — cooldown enforced above)
      insertStmt.run(id, triggeredAt, "warning", signalsJson, affectedActionsJson, message);

      // j. Count the fired alert
      fired++;
    } catch (err) {
      logger.warn(`[taAlertScan] error ticker=${code}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      // scanned already incremented; continue to next ticker
    }
  }

  return { scanned, fired };
}
