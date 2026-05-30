/**
 * bctcHumanCorrectionsStore.ts — Infrastructure DB store for bctc_human_corrections
 *
 * Sprint BCTC-HUMAN-CONFIRM — HC-DEV-1
 * DDD layer: infrastructure (DB access only, no domain logic)
 *
 * CRUD + re-anchor for human corrections on BCTC table rows.
 * All public functions take `db: Database` as first argument (DI pattern —
 * caller owns the connection; supports in-memory test DBs).
 *
 * Idempotency: INSERT OR REPLACE on UNIQUE(report_id, row_id).
 * Repeated corrections to the same cell → single record, latest value wins.
 *
 * Re-anchor: after re-parse (finalizeBctcRefineTool Phase 4), row_id integers
 * change. reAnchorCorrections() re-links row_id using stable composite key:
 *   (report_id, label, page_number, statement_section, code_or_null)
 * Duplicate match → anchor_status = 'anchor_ambiguous'; correction NOT applied
 * to ANY row (safe-fail, never mis-attach).
 */

import type { Database } from "bun:sqlite";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HumanCorrectionRecord {
  id?: number;
  report_id: string;
  row_id: number;
  label: string;
  page_number: number;
  statement_section: string;
  code: string | null;
  old_value: number | null;
  new_value: number;
  correction_source: string;
  confirmed_by: string;
  corrected_at?: string;
  flag_type: string;
  ocr_value_snapshot: string | null;
  image_value_snapshot: string | null;
  anchor_status: string;
}

// ── Stable anchor key helper ───────────────────────────────────────────────────

/**
 * Build the stable anchor key used for correction lookup in getCorrectionsMap.
 * Format: `${label}||${page_number}||${statement_section}||${code ?? ''}`
 */
export function buildAnchorKey(
  label: string,
  page_number: number,
  statement_section: string,
  code: string | null,
): string {
  return `${label}||${page_number}||${statement_section}||${code ?? ""}`;
}

// ── Upsert ────────────────────────────────────────────────────────────────────

/**
 * upsertCorrection — Insert or replace a human correction record.
 *
 * INSERT OR REPLACE on UNIQUE(report_id, row_id) — the idempotency mechanism.
 * Correcting the same cell multiple times produces a single record with the
 * latest new_value.
 *
 * @param db         Database instance (injected)
 * @param correction Correction record to write
 */
export function upsertCorrection(
  db: Database,
  correction: HumanCorrectionRecord,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_human_corrections
       (report_id, row_id, label, page_number, statement_section, code,
        old_value, new_value, correction_source, confirmed_by, corrected_at,
        flag_type, ocr_value_snapshot, image_value_snapshot, anchor_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`,
  ).run(
    correction.report_id,
    correction.row_id,
    correction.label,
    correction.page_number,
    correction.statement_section,
    correction.code ?? null,
    correction.old_value ?? null,
    correction.new_value,
    correction.correction_source ?? "human_ui",
    correction.confirmed_by ?? "user",
    correction.flag_type,
    correction.ocr_value_snapshot ?? null,
    correction.image_value_snapshot ?? null,
    correction.anchor_status ?? "ok",
  );
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * getCorrectionsForReport — fetch all correction records for a report.
 * Used by Layer 2 selective DELETE (finalizeBctcRefineTool).
 *
 * @param db        Database instance
 * @param report_id Report UUID
 */
export function getCorrectionsForReport(
  db: Database,
  report_id: string,
): HumanCorrectionRecord[] {
  return db
    .prepare<HumanCorrectionRecord, [string]>(
      `SELECT id, report_id, row_id, label, page_number, statement_section, code,
              old_value, new_value, correction_source, confirmed_by, corrected_at,
              flag_type, ocr_value_snapshot, image_value_snapshot, anchor_status
       FROM bctc_human_corrections
       WHERE report_id = ?
       ORDER BY id ASC`,
    )
    .all(report_id);
}

/**
 * getCorrectionsMap — return Map keyed by stable anchor key.
 *
 * Key format: `${label}||${page_number}||${statement_section}||${code ?? ''}`
 * Used by applyCorrections post-pass in finalizeBctcRefineTool.
 *
 * @param db        Database instance
 * @param report_id Report UUID
 */
export function getCorrectionsMap(
  db: Database,
  report_id: string,
): Map<string, HumanCorrectionRecord> {
  const records = getCorrectionsForReport(db, report_id);
  const map = new Map<string, HumanCorrectionRecord>();
  for (const rec of records) {
    const key = buildAnchorKey(
      rec.label,
      rec.page_number,
      rec.statement_section,
      rec.code,
    );
    map.set(key, rec);
  }
  return map;
}

/**
 * hasCorrection — return true if a correction exists for (report_id, row_id).
 * Used by Layer 2 selective DELETE: rows with corrections are preserved.
 *
 * @param db        Database instance
 * @param report_id Report UUID
 * @param row_id    bctc_table_rows.id (integer PK)
 */
export function hasCorrection(
  db: Database,
  report_id: string,
  row_id: number,
): boolean {
  const row = db
    .prepare<{ id: number }, [string, number]>(
      `SELECT id FROM bctc_human_corrections WHERE report_id = ? AND row_id = ? LIMIT 1`,
    )
    .get(report_id, row_id);
  return row !== null && row !== undefined;
}

// ── Re-anchor ─────────────────────────────────────────────────────────────────

/**
 * reAnchorCorrections — re-link correction row_ids after a re-parse.
 *
 * After finalizeBctcRefineTool inserts new bctc_table_rows, the integer PKs
 * change. This function re-links each correction's row_id using the stable key:
 *   (report_id, label, page_number, statement_section) + code as disambiguator
 *
 * Outcomes per correction:
 *   - Exactly 1 match → UPDATE row_id = <new_id>, anchor_status = 'ok'
 *   - >1 matches (genuine duplicate) → anchor_status = 'anchor_ambiguous';
 *                                       row_id NOT updated (safe-fail)
 *   - 0 matches → anchor_status = 'anchor_missing'; row_id NOT updated
 *
 * Called INSIDE the finalize transaction (after INSERT, before commit).
 *
 * @param db        Database instance
 * @param report_id Report UUID
 */
export function reAnchorCorrections(db: Database, report_id: string): void {
  const corrections = getCorrectionsForReport(db, report_id);

  for (const correction of corrections) {
    // Query bctc_table_rows using stable composite key + code disambiguator
    interface RowMatch {
      id: number;
    }
    const matches = db
      .prepare<RowMatch, [string, string, number, string, string | null, string | null]>(
        `SELECT id FROM bctc_table_rows
         WHERE report_id = ?
           AND label = ?
           AND page_number = ?
           AND statement_section = ?
           AND (code = ? OR (code IS NULL AND ? IS NULL))`,
      )
      .all(
        report_id,
        correction.label,
        correction.page_number,
        correction.statement_section,
        correction.code ?? null,
        correction.code ?? null,
      );

    if (matches.length === 1) {
      // Exactly one match — anchor to new row_id
      const newRowId = matches[0]!.id;
      db.prepare(
        `UPDATE bctc_human_corrections
         SET row_id = ?, anchor_status = 'ok'
         WHERE id = ?`,
      ).run(newRowId, correction.id!);
    } else if (matches.length > 1) {
      // Duplicate match — safe-fail; do NOT update row_id
      db.prepare(
        `UPDATE bctc_human_corrections
         SET anchor_status = 'anchor_ambiguous'
         WHERE id = ?`,
      ).run(correction.id!);
    } else {
      // No match — record as missing
      db.prepare(
        `UPDATE bctc_human_corrections
         SET anchor_status = 'anchor_missing'
         WHERE id = ?`,
      ).run(correction.id!);
    }
  }
}
