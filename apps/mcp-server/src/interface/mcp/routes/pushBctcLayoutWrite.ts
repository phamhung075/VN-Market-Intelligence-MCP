/**
 * LF-OVERLAY — transactional write orchestration for POST /api/push-bctc-layout.
 *
 * Extracted from pushBctcLayoutHandler.ts (FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L,
 * 2026-08-24). Assumes the caller has already run validatePushBctcLayoutRequest
 * (reportId is a confirmed-existing financial_reports row; document_map/units/
 * page_zones have the correct shapes) — this module does zero re-validation.
 *
 * Per-table insert logic lives in pushBctcLayoutWriteUnits.ts and
 * pushBctcLayoutWriteZones.ts — this file only opens the single
 * db.transaction() both share (a mid-write failure rolls back completely,
 * so the report is never left partially written) and returns DB-verified
 * counts (write-wedge detection — never echo input length).
 *
 * mcp-server is the SOLE WRITE OWNER of market.db (architecture invariant).
 * Zero writes to bctc_table_rows, bctc_balance_checks, or bctc_md_tables.
 */

import type { Database } from "bun:sqlite";
import type { PushBctcLayoutBody } from "./pushBctcLayoutTypes.js";
import { insertLayoutUnits } from "./pushBctcLayoutWriteUnits.js";
import { insertPageZones } from "./pushBctcLayoutWriteZones.js";

export interface WriteBctcLayoutResult {
  unitsStored: number;
  pagesStored: number;
}

/**
 * writeBctcLayoutPayload — idempotent DELETE-before-INSERT within one
 * transaction across both bctc_layout_units and bctc_page_zones.
 */
export function writeBctcLayoutPayload(
  db: Database,
  reportId: string,
  parsed: PushBctcLayoutBody,
): WriteBctcLayoutResult {
  const documentMapJson = JSON.stringify(parsed.document_map);

  db.transaction(() => {
    insertLayoutUnits(db, reportId, parsed, documentMapJson);
    insertPageZones(db, reportId, parsed);
  })();

  // ── DB-verified counts (write-wedge detection — never echo input length) ─
  const unitsStored =
    db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?",
      )
      .get(reportId)?.cnt ?? 0;

  const pagesStored =
    db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_page_zones WHERE report_id = ?",
      )
      .get(reportId)?.cnt ?? 0;

  return { unitsStored, pagesStored };
}
