/**
 * Infrastructure — vnstock Shareholders Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). No `get` counterpart existed pre-split (public API
 * preserved as-is).
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { logger } from "../../logger.js";
import type { VnstockShareholder } from "../../../domain/models/vnstockTypes.js";
import { markFetched } from "./fetchLog.js";

export function storeShareholders(code: string, holders: VnstockShareholder[]): void {
  // Guard: ensure holders is actually an array (not null, undefined, or other type)
  if (!holders || !Array.isArray(holders)) {
    logger.warn(
      `[vnstock-store] storeShareholders: holders is not an array for ticker ${code}`,
      { code, holdersType: typeof holders, isArray: Array.isArray(holders) }
    );
    markFetched(code, "shareholders");
    return;
  }
  const valid = holders.filter((h) => !!h.code);
  const dropped = holders.length - valid.length;
  if (dropped > 0) {
    logger.warn(
      `[vnstock-store] storeShareholders: dropped ${dropped} row(s) with null/empty code for ticker ${code}`,
      { code, dropped }
    );
  }
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const h of valid) {
      stmt.run(h.code, h.name, h.quantity, h.ownPercent, now);
    }
  });
  insertAll();
  markFetched(code, "shareholders");
}
