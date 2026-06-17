/**
 * ohlcvForeignFlowStore — FIX-OHLCV-WRITER-SSOT-DURABLE / SUBTASK-1
 *
 * Writes foreign flow data to the daily_ohlcv table.
 *
 * MERGE-ONLY strategy (Option G — no stub INSERT):
 *   - Row present → UPDATE only the foreign-flow columns (OHLCV columns UNTOUCHED).
 *   - Row absent  → changes=0, log debug, NO stub row created.
 *                   Foreign-flow data is deferred until the real OHLCV bar arrives
 *                   via pushPricesHandler. The next 60s re-fetch (CRONS.foreignFlowFetch
 *                   fires every 60s, cron "every-1-min") will pick up the row and UPDATE it.
 *                   Honest gap beats fake close=0 stub (/goal#1).
 *
 * Root cause closed: the prior INSERT…ON CONFLICT pattern injected an all-zero
 * stub row (open=0/high=0/low=0/close=0/volume=0) when the foreign-flow fetch fired
 * before the real OHLCV bar arrived. close=0 is physically impossible on VN market
 * and corrupted every TA consumer (RSI→single-digit, Bollinger Bands→"giá 0 dưới BB").
 * This is the 4th-recurrence producer-root fix (ARCH-OHLCV-WRITER-SSOT-DURABLE).
 *
 * Callers verified non-error on changes=0:
 *   - foreignFlowFetcher.ts L137: const { changes } = await writeForeignFlowToOhlcv(...)
 *   - foreignFlowFetcher.ts L220: same pattern (SSE fallback path)
 *   - pushForeignFlowHandler.ts L319: const ohlcvResult = await writeForeignFlowToOhlcv(...)
 *     followed by log.info(... ohlcvResult.changes) -- changes=0 is logged, not thrown.
 *
 * foreign_net_vol = foreignBuyVol - foreignSellVol (computed at write time).
 */

import type { Database } from "bun:sqlite";
import type { WriteForeignFlowItem } from "../../domain/models/shared-types.js";

/** Simple logger shim — uses console.debug when no logger is injected. */
const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    if (process.env["NODE_ENV"] !== "test") {
      console.debug(msg, ctx ?? "");
    }
  },
};

/**
 * Persist foreign flow volumes for a set of (code, date) pairs.
 *
 * MERGE-ONLY: uses UPDATE-only (no INSERT). When no OHLCV row exists for
 * (code, date), the write is deferred (changes=0, debug log emitted).
 * The caller should treat changes=0 as a non-error deferred write.
 *
 * @param rows - Foreign flow data items to write.
 * @param db   - SQLite Database instance (defaults to production getDb()).
 * @returns    - Object with total `changes` count across all UPDATE statements.
 *               changes=0 means no OHLCV row existed yet — deferred, not an error.
 */
export async function writeForeignFlowToOhlcv(
  rows: WriteForeignFlowItem[],
  db?: Database,
): Promise<{ changes: number }> {
  if (rows.length === 0) return { changes: 0 };

  // Lazy import to avoid pulling in production DB when a test injects its own db.
  const { getDb } = await import("./schema.js");
  const database = db ?? getDb();

  // FIX-OHLCV-WRITER-SSOT-DURABLE: UPDATE-only — no stub INSERT.
  // SQL contract (architect Option G):
  //   UPDATE daily_ohlcv
  //   SET foreign_buy_vol=?, foreign_sell_vol=?, foreign_net_vol=?, put_through_vol=?,
  //       foreign_buy_value  = COALESCE(?, foreign_buy_value),
  //       foreign_sell_value = COALESCE(?, foreign_sell_value),
  //       updated_at = ?
  //   WHERE code = ? AND date = ?
  //   -- changes=0 → no OHLCV row yet → DEFER: log debug, write NOTHING, leave honest gap.
  const stmt = database.prepare(
    `UPDATE daily_ohlcv
     SET
       foreign_buy_vol   = ?,
       foreign_sell_vol  = ?,
       foreign_net_vol   = ?,
       put_through_vol   = ?,
       foreign_buy_value  = COALESCE(?, foreign_buy_value),
       foreign_sell_value = COALESCE(?, foreign_sell_value),
       updated_at = ?
     WHERE code = ? AND date = ?`,
  );

  let totalChanges = 0;
  for (const row of rows) {
    const netVol = row.foreignBuyVol - row.foreignSellVol;
    const now = new Date().toISOString();
    const result = stmt.run(
      row.foreignBuyVol,
      row.foreignSellVol,
      netVol,
      row.putThroughVol,
      row.foreignBuyValue ?? null,
      row.foreignSellValue ?? null,
      now,
      row.code,
      row.date,
    );

    if (result.changes === 0) {
      // No OHLCV row exists yet for this (code, date) — foreign-flow deferred.
      // The next 60s re-fetch will find the real row once pushPricesHandler writes it.
      logger.debug(
        `[ohlcvForeignFlowStore] no OHLCV row yet for ${row.code} ${row.date} — foreign-flow deferred`,
        { code: row.code, date: row.date },
      );
    }

    totalChanges += result.changes;
  }

  return { changes: totalChanges };
}
