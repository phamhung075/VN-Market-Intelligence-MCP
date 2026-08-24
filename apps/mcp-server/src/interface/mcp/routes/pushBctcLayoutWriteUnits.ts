/**
 * LF-OVERLAY — bctc_layout_units write for POST /api/push-bctc-layout.
 *
 * Split out of pushBctcLayoutWrite.ts (FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L,
 * 2026-08-24) — the per-table insert logic for bctc_layout_units, kept
 * separate from bctc_page_zones (pushBctcLayoutWriteZones.ts) since the two
 * tables have independent schemas/lookup needs and no FK relationship (see
 * schema-financial-reports.ts). Runs inside the caller's db.transaction() —
 * does its own DELETE-then-INSERT for report_id but does NOT open a
 * transaction itself (orchestrated in pushBctcLayoutWrite.ts, which is what
 * makes the whole write atomic).
 */

import type { Database } from "bun:sqlite";
import type { PushBctcLayoutBody } from "./pushBctcLayoutTypes.js";

/**
 * insertLayoutUnits — idempotent DELETE-then-INSERT of bctc_layout_units rows
 * for one report_id. pdf-extractor generates new unit_id UUIDs on every
 * extraction run, so INSERT OR REPLACE on (report_id, unit_id) would NOT fire
 * the REPLACE path — it would just append. Deleting first guarantees a
 * re-push REPLACES the report's units (see pushBctcLayoutWrite.ts for the
 * transaction/rollback contract this relies on).
 */
export function insertLayoutUnits(
  db: Database,
  reportId: string,
  parsed: PushBctcLayoutBody,
  documentMapJson: string,
): void {
  const schemaPagesById = new Map<string, number>();
  const pageNumbersById = new Map<string, number[]>();
  for (const dmUnit of parsed.document_map.units) {
    schemaPagesById.set(dmUnit.unit_id, dmUnit.schema_page);
    pageNumbersById.set(dmUnit.unit_id, dmUnit.pages ?? []);
  }

  db.prepare("DELETE FROM bctc_layout_units WHERE report_id = ?").run(reportId);

  const insertUnit = db.prepare(`
    INSERT INTO bctc_layout_units
      (report_id, unit_id, schema_page, page_numbers_json, page_type,
       stitched_markdown, row_count, quarantined, quarantine_reason,
       document_map_json, extracted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const unit of parsed.units) {
    const schemaPage = schemaPagesById.get(unit.unit_id) ?? 0;
    const pageNums = pageNumbersById.get(unit.unit_id) ?? [];

    // Determine page_type from document_map (fallback to 'table')
    const dmUnit = parsed.document_map.units.find((u) => u.unit_id === unit.unit_id);
    const pageType = dmUnit?.page_type ?? "table";

    insertUnit.run(
      reportId,
      unit.unit_id,
      schemaPage,
      JSON.stringify(pageNums),
      pageType,
      unit.stitched_markdown ?? "",
      unit.row_count ?? 0,
      unit.quarantined ? 1 : 0,
      unit.quarantine_reason ?? null,
      documentMapJson,
    );
  }
}
