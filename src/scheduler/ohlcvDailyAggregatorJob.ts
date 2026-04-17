// src/scheduler/ohlcvDailyAggregatorJob.ts
// Task 1359 — implementation (Sprint 122)
// Aggregates intraday market_prices_history ticks into daily_ohlcv rows.
// VN timezone (UTC+7): window = [VN midnight UTC, now).

import { Database } from "bun:sqlite";
import { getDb } from "../infrastructure/db/schema.js";
import { sendTelegramWork } from "../infrastructure/notifiers/telegram.js";

export interface OhlcvAggregatorDeps {
  db?: () => Database;
  nowMsFn?: () => number;
  sendWorkFn?: (msg: string) => Promise<unknown>;
}

export interface OhlcvAggregatorResult {
  tickersProcessed: number;
  rowsWritten: number;
  tickersSkipped: number;
  sent: boolean;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

/**
 * Compute VN midnight in UTC for the given nowMs.
 * Example: nowMs = 2026-04-17T09:00Z → VN date 2026-04-17 → midnight UTC = 2026-04-16T17:00Z
 */
function vnMidnightUtcMs(nowMs: number): number {
  const nowInVnMs = nowMs + VN_OFFSET_MS;
  const vnDate = new Date(nowInVnMs);
  // Floor to VN day boundary
  const vnYear = vnDate.getUTCFullYear();
  const vnMonth = vnDate.getUTCMonth();
  const vnDay = vnDate.getUTCDate();
  // VN midnight (00:00 VN) in UTC = that day T-07:00 UTC = previous UTC day T17:00 UTC
  return Date.UTC(vnYear, vnMonth, vnDay) - VN_OFFSET_MS;
}

/**
 * Derive YYYY-MM-DD VN date string from nowMs.
 */
function vnDateString(nowMs: number): string {
  const nowInVnMs = nowMs + VN_OFFSET_MS;
  const d = new Date(nowInVnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function runOhlcvDailyAggregator(
  deps?: OhlcvAggregatorDeps
): Promise<OhlcvAggregatorResult> {
  const db = deps?.db ? deps.db() : getDb();
  const nowMs = deps?.nowMsFn ? deps.nowMsFn() : Date.now();
  const sendWorkFn = deps?.sendWorkFn
    ?? ((msg: string) => sendTelegramWork(msg));

  const windowStart = new Date(vnMidnightUtcMs(nowMs)).toISOString();
  const windowEnd = new Date(nowMs).toISOString();
  const dateStr = vnDateString(nowMs);

  // Query watchlist tickers
  const tickers = db.prepare("SELECT code FROM watchlist").all() as Array<{ code: string }>;

  let tickersProcessed = 0;
  let rowsWritten = 0;
  let tickersSkipped = 0;

  for (const { code } of tickers) {
    tickersProcessed++;

    // Count ticks in window
    const countRow = db.prepare(
      "SELECT COUNT(*) as cnt FROM market_prices_history WHERE code = ? AND fetched_at >= ? AND fetched_at < ?"
    ).get(code, windowStart, windowEnd) as { cnt: number } | undefined;

    const count = countRow?.cnt ?? 0;
    if (count === 0) {
      tickersSkipped++;
      continue;
    }

    // Open: price of earliest tick
    const openRow = db.prepare(
      "SELECT price FROM market_prices_history WHERE code = ? AND fetched_at >= ? AND fetched_at < ? ORDER BY fetched_at ASC LIMIT 1"
    ).get(code, windowStart, windowEnd) as { price: number } | undefined;

    // Close: price of latest tick
    const closeRow = db.prepare(
      "SELECT price FROM market_prices_history WHERE code = ? AND fetched_at >= ? AND fetched_at < ? ORDER BY fetched_at DESC LIMIT 1"
    ).get(code, windowStart, windowEnd) as { price: number } | undefined;

    // High/Low: MAX/MIN over the window
    const hlRow = db.prepare(
      "SELECT MAX(price) as high_p, MIN(price) as low_p FROM market_prices_history WHERE code = ? AND fetched_at >= ? AND fetched_at < ?"
    ).get(code, windowStart, windowEnd) as { high_p: number; low_p: number } | undefined;

    const open = openRow!.price;
    const close = closeRow!.price;
    const high = hlRow!.high_p;
    const low = hlRow!.low_p;
    const volume = count;

    // Upsert into daily_ohlcv
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code, date) DO UPDATE SET
         open       = excluded.open,
         high       = excluded.high,
         low        = excluded.low,
         close      = excluded.close,
         volume     = excluded.volume,
         updated_at = excluded.updated_at`
    ).run(code, dateStr, open, high, low, close, volume, new Date(nowMs).toISOString());

    rowsWritten++;
  }

  const summary = `[ohlcv-aggregator] date=${dateStr} processed=${tickersProcessed} written=${rowsWritten} skipped=${tickersSkipped}`;
  await sendWorkFn(summary);

  return { tickersProcessed, rowsWritten, tickersSkipped, sent: true };
}
