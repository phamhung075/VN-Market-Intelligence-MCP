// src/scheduler/ohlcvDailyAggregatorJob.ts
// Task 1359 — implementation (Sprint 122)
// FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 — migrated to writeOhlcvBatch (2026-06-16)
// Aggregates intraday market_prices_history ticks into daily_ohlcv rows.
// VN timezone (UTC+7): window = [VN midnight UTC, now).
//
// All writes now route through writeOhlcvBatch so FR-S1 seed-rejection,
// C=0 guard, detectAndNormalizeScaleFromPrevClose, and validateOhlcvUnit
// apply to ALL tickers generically (no per-ticker allowlist).

import { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import {
  writeOhlcvBatch,
  type OhlcvWriteRow,
} from "../../application/usecases/ohlcvWriteService.js";

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

  // Collect all eligible rows into a batch — writeOhlcvBatch owns the write pipeline
  // (FR-S1 seed-rejection, C=0 guard, scale normalization, unit validation).
  const writeRows: OhlcvWriteRow[] = [];
  // Track which tickers produced an eligible row (before writeOhlcvBatch filtering)
  const eligibleCodes: string[] = [];

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

    // Guard checks: ensure all OHLCV components exist before using
    const open = openRow?.price;
    const close = closeRow?.price;
    const high = hlRow?.high_p;
    const low = hlRow?.low_p;

    if (open === undefined || close === undefined || high === undefined || low === undefined) {
      tickersSkipped++;
      continue;  // Skip ticker if any price component is missing
    }

    // Volume: MAX(volume) across intraday ticks.
    // market_prices_history.volume is the cumulative traded volume reported by the
    // exchange at each snapshot — the maximum value is the end-of-day total.
    // Bug fix (Task 1390): COUNT(*) was used before, which counted poll ticks not shares.
    const volRow = db.prepare(
      "SELECT MAX(volume) as max_vol FROM market_prices_history WHERE code = ? AND fetched_at >= ? AND fetched_at < ?"
    ).get(code, windowStart, windowEnd) as { max_vol: number | null } | undefined;
    const volume = volRow?.max_vol ?? 0;

    // Collect into batch — do NOT write directly.
    // writeOhlcvBatch applies FR-S1 seed-rejection, C=0 guard,
    // detectAndNormalizeScaleFromPrevClose (÷1000 correction), and validateOhlcvUnit.
    writeRows.push({
      code,
      date: dateStr,
      open,
      high,
      low,
      close,
      volume,
      type: "stock",
    });
    eligibleCodes.push(code);
  }

  // Batch write through the SSOT choke-point.
  // conflictStrategy='backfill': unconditional overwrite (aggregator is intraday authority).
  // vnToday=dateStr: FR-S1 fires when date >= dateStr (same-day flat vol=0 bars are seeds).
  const writeResult = await writeOhlcvBatch(writeRows, db, {
    conflictStrategy: "backfill",
    vnToday: dateStr,
  });

  // Translate writeOhlcvBatch result back to aggregator counters.
  // skipped = FR-S1 seed-bar rejections (flat vol=0 bars on today's date).
  // rejected = C=0 guard + validateOhlcvUnit failures (zero-price, out-of-range).
  rowsWritten = writeResult.written;
  // Both FR-S1 skips and unit-guard rejects count as "skipped" in the aggregator summary.
  tickersSkipped += writeResult.skipped + writeResult.rejected.length;

  // Log any unit-guard rejections for ops visibility.
  if (writeResult.rejected.length > 0) {
    console.error(
      `[ohlcv-aggregator] ${writeResult.rejected.length} rows rejected by write pipeline:`,
      writeResult.rejected.slice(0, 5),
    );
  }

  // taReady / top-3: query row counts after batch write (only for tickers that got written).
  // Per-ticker row counts in daily_ohlcv (for taReady + top-3 computation)
  const tickerOhlcvRows: Map<string, number> = new Map();

  if (eligibleCodes.length > 0) {
    const placeholders = eligibleCodes.map(() => "?").join(",");
    const countRows = db.prepare(
      `SELECT code, COUNT(*) as cnt FROM daily_ohlcv WHERE code IN (${placeholders}) GROUP BY code`
    ).all(...eligibleCodes) as Array<{ code: string; cnt: number }>;
    for (const { code, cnt } of countRows) {
      tickerOhlcvRows.set(code, cnt);
    }
  }

  // taReady: tickers with >= 8 OHLCV rows (enough for TA computation)
  const taReadyCount = Array.from(tickerOhlcvRows.values()).filter((n) => n >= 8).length;

  // Top-3 tickers by row count (descending)
  const top3 = Array.from(tickerOhlcvRows.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code);

  const top3Str = top3.length > 0 ? ` top3=[${top3.join(",")}]` : "";
  const summary = `[ohlcv-aggregator] date=${dateStr} processed=${tickersProcessed} written=${rowsWritten} skipped=${tickersSkipped} taReady=${taReadyCount}${top3Str}`;

  let sent = false;
  try {
    await sendWorkFn(summary);
    sent = true;
  } catch {
    // Swallow notification errors — aggregation succeeded regardless
  }

  return { tickersProcessed, rowsWritten, tickersSkipped, sent };
}
