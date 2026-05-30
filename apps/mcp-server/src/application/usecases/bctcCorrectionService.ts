/**
 * bctcCorrectionService.ts — Correction apply + confirm orchestration
 *
 * Sprint BCTC-HUMAN-CONFIRM — HC-DEV-1
 * DDD layer: application (orchestrates FR-2 steps 1-6)
 *
 * Shared by:
 *   - bctcCorrectHandler.ts (HTTP POST /api/bctc-inspect/correct/{doc_id})
 *   - submitBctcCorrectionTool.ts (MCP tool submit_bctc_correction)
 *
 * Zero code duplication: both callers delegate here.
 *
 * submitCorrection steps:
 * 1. Validate report_id (UUID) + row_id (integer)
 * 2. Read financial_reports.confirm_status — 409 if 'CONFIRMED'
 * 3. Read bctc_table_rows WHERE id = row_id AND report_id = report_id
 *    → get old_value, label, page_number, statement_section, code
 * 4. If no row → 400 row_not_found
 * 5. Enumerate flagged cells → extract flag_type, ocr/image snapshots
 *    EC-4: if cell not flagged, use flag_type='yellow', snapshots=null
 * 6. DB transaction: upsertCorrection + UPDATE bctc_table_rows source_confidence
 * 7. Return { ok: true, row_id, new_value, source_confidence: 1.0 }
 */

import type { Database } from "bun:sqlite";
import {
  upsertCorrection,
} from "../../infrastructure/db/bctcHumanCorrectionsStore.js";
import { enumerateFlaggedCells } from "./bctcFlagEnumerationService.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CorrectionInput {
  report_id: string;
  row_id: number;
  new_value: number;
  correction_source?: string;  // defaults to 'human_ui'
}

export interface CorrectionResult {
  ok: boolean;
  row_id?: number;
  new_value?: number;
  source_confidence?: number;
  error?: string;
  http_status?: number;
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface ConfirmStatusRow {
  confirm_status: string | null;
}

interface TableRowRecord {
  id: number;
  report_id: string;
  old_value: number | null;
  value_current: number | null;
  label: string;
  page_number: number;
  statement_section: string;
  code: string | null;
}

// ── UUID validation ────────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ── Main service ───────────────────────────────────────────────────────────────

/**
 * submitCorrection — validate, guard, and transactionally write a human correction.
 *
 * This function is the single source of truth for the correction write path.
 * HTTP handlers and MCP tools both delegate here — never bypass this function.
 *
 * @param db    Database instance (injected, DI pattern)
 * @param input CorrectionInput with report_id, row_id, new_value
 */
export function submitCorrection(
  db: Database,
  input: CorrectionInput,
): CorrectionResult {
  const { report_id, row_id, new_value } = input;
  const correction_source = input.correction_source ?? "human_ui";

  // Step 1: validate report_id (UUID) + row_id (integer)
  if (!report_id || !isValidUuid(report_id)) {
    return { ok: false, error: "invalid_report_id", http_status: 400 };
  }
  if (!Number.isInteger(row_id) || row_id < 0) {
    return { ok: false, error: "invalid_row_id", http_status: 400 };
  }
  if (typeof new_value !== "number" || !isFinite(new_value)) {
    return { ok: false, error: "invalid_new_value", http_status: 400 };
  }

  // Step 2: read confirm_status — 409 if CONFIRMED
  const reportRow = db
    .prepare<ConfirmStatusRow, [string]>(
      `SELECT confirm_status FROM financial_reports WHERE id = ?`,
    )
    .get(report_id);

  if (reportRow?.confirm_status === "CONFIRMED") {
    return { ok: false, error: "report_confirmed", http_status: 409 };
  }

  // Step 3: read bctc_table_rows for this row_id + report_id
  const tableRow = db
    .prepare<TableRowRecord, [number, string]>(
      `SELECT id, report_id, value_current AS old_value, value_current,
              label, page_number, statement_section, code
       FROM bctc_table_rows
       WHERE id = ? AND report_id = ?`,
    )
    .get(row_id, report_id);

  // Step 4: row not found → 400
  if (!tableRow) {
    return { ok: false, error: "row_not_found", http_status: 400 };
  }

  // Step 5: get flag info for this cell (for audit snapshot)
  let flagType = "yellow";
  let ocrValueSnapshot: string | null = null;
  let imageValueSnapshot: string | null = null;

  try {
    const enumResult = enumerateFlaggedCells(db, report_id);
    const matchedFlag = enumResult.flags.find(
      (f) => f.row_id === row_id,
    );
    if (matchedFlag) {
      flagType = matchedFlag.flag_type;
      ocrValueSnapshot = matchedFlag.ocr_value;
      imageValueSnapshot = matchedFlag.image_value;
    }
    // EC-4: if not found in flags, use defaults (flag_type='yellow', snapshots=null)
  } catch {
    // If flag enumeration fails (e.g. refine_not_complete), use defaults
    flagType = "yellow";
  }

  // Step 6: DB transaction — write correction + update source_confidence
  db.transaction(() => {
    upsertCorrection(db, {
      report_id,
      row_id,
      label: tableRow.label,
      page_number: tableRow.page_number,
      statement_section: tableRow.statement_section,
      code: tableRow.code,
      old_value: tableRow.old_value,
      new_value,
      correction_source,
      confirmed_by: "user",
      flag_type: flagType,
      ocr_value_snapshot: ocrValueSnapshot,
      image_value_snapshot: imageValueSnapshot,
      anchor_status: "ok",
    });

    db.prepare(
      `UPDATE bctc_table_rows
       SET value_current = ?, source_confidence = 1.0
       WHERE id = ?`,
    ).run(new_value, row_id);
  })();

  // Step 7: return success
  return {
    ok: true,
    row_id,
    new_value,
    source_confidence: 1.0,
  };
}
