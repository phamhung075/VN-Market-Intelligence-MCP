/**
 * ohlcvForeignFlowStore — Task 1503 / DPI-4
 *
 * Writes foreign flow data to the daily_ohlcv table.
 *
 * DPI-4 UPSERT strategy: INSERT…ON CONFLICT(code, date) DO UPDATE SET.
 *   - If a (code, date) row already exists (OHLCV data present), only the four
 *     foreign flow columns are updated; all OHLCV columns are preserved.
 *   - If no row exists yet (OHLCV data has not arrived), a stub row is created
 *     with close=0 to satisfy the NOT NULL constraint; all four foreign flow
 *     columns are populated. When the real OHLCV row arrives later via
 *     pushPricesHandler (ON CONFLICT DO UPDATE SET open/high/low/close/volume),
 *     the foreign flow values on the stub row are preserved (OHLCV write path
 *     does not touch foreign flow columns).
 *
 * R-1 race note: server.ts secondary OHLCV path was fixed (in the same DPI-4
 * scope) from INSERT OR REPLACE → ON CONFLICT DO UPDATE SET to prevent stub-row
 * deletion on OHLCV push.
 *
 * foreign_net_vol = foreignBuyVol - foreignSellVol (computed at write time).
 */

import type { Database } from "bun:sqlite";
import type { WriteForeignFlowItem } from "../../domain/models/shared-types.js";

/**
 * Persist foreign flow volumes for a set of (code, date) pairs.
 *
 * Uses INSERT…ON CONFLICT UPSERT:
 *   - Row absent  → creates stub with close=0; sets all four foreign flow columns.
 *   - Row present → updates only the four foreign flow columns (preserves OHLCV).
 *
 * @param rows - Foreign flow data items to write.
 * @param db   - SQLite Database instance (defaults to production getDb()).
 * @returns    - Object with total `changes` count across all upsert statements.
 */
export async function writeForeignFlowToOhlcv(
  rows: WriteForeignFlowItem[],
  db?: Database,
): Promise<{ changes: number }> {
  if (rows.length === 0) return { changes: 0 };

  // Lazy import to avoid pulling in production DB when a test injects its own db.
  const { getDb } = await import("./schema.js");
  const database = db ?? getDb();

  // DPI-4: UPSERT — INSERT stub row (close=0 satisfies NOT NULL) when absent,
  // otherwise update only foreign flow columns (preserves existing OHLCV data).
  const stmt = database.prepare(
    `INSERT INTO daily_ohlcv
        (code, date, close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)
      VALUES (?, ?, 0, ?, ?, ?, ?)
      ON CONFLICT(code, date) DO UPDATE SET
        foreign_buy_vol  = excluded.foreign_buy_vol,
        foreign_sell_vol = excluded.foreign_sell_vol,
        foreign_net_vol  = excluded.foreign_net_vol,
        put_through_vol  = excluded.put_through_vol`,
  );

  let totalChanges = 0;
  for (const row of rows) {
    const netVol = row.foreignBuyVol - row.foreignSellVol;
    const result = stmt.run(
      row.code,
      row.date,
      row.foreignBuyVol,
      row.foreignSellVol,
      netVol,
      row.putThroughVol,
    );
    totalChanges += result.changes;
  }

  return { changes: totalChanges };
}
