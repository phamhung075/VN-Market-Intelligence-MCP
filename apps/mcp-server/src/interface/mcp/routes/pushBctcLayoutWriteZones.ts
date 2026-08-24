/**
 * LF-OVERLAY — bctc_page_zones write for POST /api/push-bctc-layout.
 *
 * Split out of pushBctcLayoutWrite.ts (FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L,
 * 2026-08-24) — the per-table insert logic for bctc_page_zones, kept separate
 * from bctc_layout_units (pushBctcLayoutWriteUnits.ts) since the two tables
 * have no FK relationship (see schema-financial-reports.ts). Runs inside the
 * caller's db.transaction() — does its own DELETE-then-INSERT for report_id
 * but does NOT open a transaction itself (orchestrated in pushBctcLayoutWrite.ts,
 * which is what makes the whole write atomic).
 */

import type { Database } from "bun:sqlite";
import type { PushBctcLayoutBody } from "./pushBctcLayoutTypes.js";

/**
 * insertPageZones — idempotent DELETE-then-INSERT of bctc_page_zones rows
 * for one report_id. Same re-push-safety rationale as insertLayoutUnits
 * (pushBctcLayoutWriteUnits.ts).
 */
export function insertPageZones(db: Database, reportId: string, parsed: PushBctcLayoutBody): void {
  db.prepare("DELETE FROM bctc_page_zones WHERE report_id = ?").run(reportId);

  const insertZone = db.prepare(`
    INSERT INTO bctc_page_zones
      (report_id, page_number, unit_id, page_type,
       is_schema_page, is_continuation_page, schema_inherited_from_page,
       zones_json, extracted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const zone of parsed.page_zones) {
    insertZone.run(
      reportId,
      zone.page_number,
      zone.unit_id,
      zone.page_type ?? "table",
      zone.is_schema_page ? 1 : 0,
      zone.is_continuation_page ? 1 : 0,
      zone.schema_inherited_from_page ?? null,
      JSON.stringify(zone.zones),
    );
  }
}
