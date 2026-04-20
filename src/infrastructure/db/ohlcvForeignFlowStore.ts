/**
 * ohlcvForeignFlowStore — Task 1503
 *
 * Writes foreign flow data to the daily_ohlcv table.
 * UPDATE-only strategy: no stub rows are inserted when there is no matching OHLCV row.
 * foreign_net_vol = foreignBuyVol - foreignSellVol (computed at write time).
 */

import type { Database } from "bun:sqlite";

export interface WriteForeignFlowItem {
  code: string;
  date: string;
  foreignBuyVol: number;
  foreignSellVol: number;
  putThroughVol: number;
}

/**
 * Update existing daily_ohlcv rows with foreign flow columns.
 * Rows without a matching (code, date) primary key are silently skipped.
 *
 * @param rows - Foreign flow data items to write.
 * @param db   - SQLite Database instance (defaults to production getDb()).
 * @returns    - Object with total `changes` count across all UPDATE statements.
 */
export async function writeForeignFlowToOhlcv(
  rows: WriteForeignFlowItem[],
  db?: Database,
): Promise<{ changes: number }> {
  if (rows.length === 0) return { changes: 0 };

  // Lazy import to avoid pulling in production DB when a test injects its own db.
  const { getDb } = await import("./schema.js");
  const database = db ?? getDb();

  const stmt = database.prepare(
    `UPDATE daily_ohlcv
        SET foreign_buy_vol  = ?,
            foreign_sell_vol = ?,
            foreign_net_vol  = ?,
            put_through_vol  = ?
      WHERE code = ? AND date = ?`,
  );

  let totalChanges = 0;
  for (const row of rows) {
    const netVol = row.foreignBuyVol - row.foreignSellVol;
    const result = stmt.run(
      row.foreignBuyVol,
      row.foreignSellVol,
      netVol,
      row.putThroughVol,
      row.code,
      row.date,
    );
    totalChanges += result.changes;
  }

  return { changes: totalChanges };
}
