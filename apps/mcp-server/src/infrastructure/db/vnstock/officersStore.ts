/**
 * Infrastructure — vnstock Officers Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). No `get` counterpart existed pre-split (public API
 * preserved as-is).
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { logger } from "../../logger.js";
import type { VnstockOfficer } from "../../../domain/models/vnstockTypes.js";
import { markFetched } from "./fetchLog.js";

export function storeOfficers(code: string, officers: VnstockOfficer[]): void {
  // Guard: ensure officers is actually an array (not null, undefined, or other type)
  if (!officers || !Array.isArray(officers)) {
    logger.warn(
      `[vnstock-store] storeOfficers: officers is not an array for ticker ${code}`,
      { code, officersType: typeof officers, isArray: Array.isArray(officers) }
    );
    markFetched(code, "officers");
    return;
  }
  const valid = officers.filter((o) => !!o.code);
  const dropped = officers.length - valid.length;
  if (dropped > 0) {
    logger.warn(
      `[vnstock-store] storeOfficers: dropped ${dropped} row(s) with null/empty code for ticker ${code}`,
      { code, dropped }
    );
  }
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_officers (code, name, position, own_percent, quantity, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const o of valid) {
      stmt.run(o.code, o.name, o.position, o.ownPercent, o.quantity, now);
    }
  });
  insertAll();
  markFetched(code, "officers");
}
