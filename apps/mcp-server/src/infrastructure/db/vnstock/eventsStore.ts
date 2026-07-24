/**
 * Infrastructure — vnstock Events Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). One store+get pair per entity.
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { logger } from "../../logger.js";
import type { VnstockEvent } from "../../../domain/models/shared-types.js";
import { markFetched } from "./fetchLog.js";

export function storeEvents(code: string, events: VnstockEvent[]): void {
  // Guard: ensure events is actually an array (not null, undefined, or other type)
  if (!events || !Array.isArray(events)) {
    logger.warn(
      `[vnstock-store] storeEvents: events is not an array for ticker ${code}`,
      { code, eventsType: typeof events, isArray: Array.isArray(events) }
    );
    markFetched(code, "events");
    return;
  }
  // Guard: skip rows where code is null/undefined/empty — prevents NOT NULL constraint failure
  const valid = events.filter((ev) => !!ev.code);
  const dropped = events.length - valid.length;
  if (dropped > 0) {
    logger.warn(
      `[vnstock-store] storeEvents: dropped ${dropped} row(s) with null/empty code for ticker ${code}`,
      { code, dropped }
    );
  }
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_events
     (code, event_name, event_date, event_type, description, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const ev of valid) {
      stmt.run(ev.code, ev.eventName, ev.eventDate, ev.eventType, ev.description, now);
    }
  });
  insertAll();
  markFetched(code, "events");
}

export function getEvents(code: string): VnstockEvent[] {
  const db = getDb();
  const rows = db
    .prepare<any, [string]>(
      `SELECT code, event_name, event_date, event_type, description
       FROM vnstock_events
       WHERE code = ?
       ORDER BY event_date ASC`,
    )
    .all(code);

  return rows.map((row) => ({
    code: row.code,
    eventName: row.event_name,
    eventDate: row.event_date,
    eventType: row.event_type,
    description: row.description ?? "",
  }));
}
