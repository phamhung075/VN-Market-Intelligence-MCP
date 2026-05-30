/**
 * bctcFlagEnumerationService.ts — Enumerate flagged cells for a BCTC report
 *
 * Sprint BCTC-HUMAN-CONFIRM — HC-DEV-1
 * DDD layer: application (orchestrates infra reads, no writes)
 *
 * Scans bctc_refined_units.markdown for trust flags using parseTrustFlag,
 * joins flagged cells to bctc_table_rows by stable key to get row_id and
 * value_current, then checks bctc_human_corrections for any applied corrections.
 *
 * EC-3: if refine_status not in ['DONE', 'PARTIAL'] → returns reason: 'refine_not_complete'
 * EC-1: flagged cell with no matching bctc_table_rows row → row_id = null
 * EC-2: red flag with non-matching OCR regex → ocr_value / image_value = null
 *
 * NOTE: parseTrustFlag operates at cell level. This service re-parses all cells
 * from each bctc_refined_units.markdown to detect flags. This is read-only;
 * refinedMarkdownParser core logic is 0-diff.
 */

import type { Database } from "bun:sqlite";
import { parseTrustFlag } from "../utils/refinedMarkdownParser.js";
import { hasCorrection } from "../../infrastructure/db/bctcHumanCorrectionsStore.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FlaggedCell {
  row_id: number | null;       // null for EC-1 (no bctc_table_rows match)
  unit_id: string;
  page_number: number;
  label: string;
  statement_section: string;
  flag_type: "red" | "yellow";
  ocr_value: string | null;    // null for yellow flags or EC-2
  image_value: string | null;  // null for yellow flags or EC-2
  current_value: number | null;
  has_correction: boolean;
  corrected_value: number | null;
}

export interface FlagEnumerationResult {
  doc_id: string;
  confirm_status: string;
  final_confirmed_at: string | null;
  flag_count: number;
  flags: FlaggedCell[];
  has_flags: boolean;
  reason?: string;  // EC-3: 'refine_not_complete'
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface FinancialReportRow {
  confirm_status: string | null;
  final_confirmed_at: string | null;
  refine_status: string | null;
}

interface RefinedUnitRow {
  unit_id: string;
  page_numbers_json: string;
  markdown: string;
  window_status: string;
}

interface TableRow {
  id: number;
  label: string;
  page_number: number;
  statement_section: string;
  code: string | null;
  value_current: number | null;
}

interface CorrectionRow {
  new_value: number;
}

// ── OCR vs image value extractor ──────────────────────────────────────────────

/**
 * Extract OCR and image values from a red flag reason clause.
 * Expected format: "OCR 1.234,56 vs image 1.500,00" (case-insensitive)
 *
 * Returns null for both if no match (EC-2).
 */
function extractOcrVsImage(
  flagReason: string,
): { ocr_value: string | null; image_value: string | null } {
  const match = flagReason.match(/OCR\s+([\d.,]+)\s+vs\s+image\s+([\d.,]+)/i);
  if (!match) {
    return { ocr_value: null, image_value: null };
  }
  return { ocr_value: match[1] ?? null, image_value: match[2] ?? null };
}

// ── Section header detection (mirrors parser) ─────────────────────────────────

const SECTION_HEADERS: Array<{ pattern: RegExp; section: string }> = [
  { pattern: /BẢNG CÂN ĐỐI KẾ TOÁN/i, section: "balance_sheet" },
  { pattern: /BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH/i, section: "income_statement" },
  { pattern: /BÁO CÁO LƯU CHUYỂN TIỀN TỆ/i, section: "cash_flow" },
  { pattern: /THUYẾT MINH BÁO CÁO TÀI CHÍNH/i, section: "notes" },
];

function detectSection(text: string): string {
  for (const { pattern, section } of SECTION_HEADERS) {
    if (pattern.test(text)) return section;
  }
  return "general";
}

// ── Flag scanner (scan a single markdown unit) ────────────────────────────────

interface ScannedFlag {
  page_number: number;
  label: string;
  statement_section: string;
  flag_type: "red" | "yellow";
  ocr_value: string | null;
  image_value: string | null;
}

function scanMarkdownForFlags(
  markdown: string,
  pageNumbers: number[],
): ScannedFlag[] {
  const pageNumber = pageNumbers[0] ?? 1;
  const flags: ScannedFlag[] = [];
  let currentSection = "general";
  let headerConsumed = false;
  let prevLineWasSeparator = false;

  const lines = markdown.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      prevLineWasSeparator = false;
      continue;
    }

    if (!trimmed.startsWith("|")) {
      const detected = detectSection(trimmed);
      if (detected !== "general") {
        currentSection = detected;
        headerConsumed = false;
      }
      prevLineWasSeparator = false;
      continue;
    }

    if (!trimmed.endsWith("|")) {
      prevLineWasSeparator = false;
      continue;
    }

    const rawCells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (rawCells.length === 0) continue;

    // Separator row
    if (rawCells.every((cell) => /^[-:\s]+$/.test(cell))) {
      prevLineWasSeparator = true;
      headerConsumed = false;
      continue;
    }

    // Header row (before separator)
    if (!headerConsumed && !prevLineWasSeparator) {
      headerConsumed = false;
      prevLineWasSeparator = false;
      continue;
    }

    if (!headerConsumed && prevLineWasSeparator) {
      headerConsumed = true;
    }
    prevLineWasSeparator = false;

    if (rawCells.length < 2) continue;

    // Determine label cell index (mirrors parser logic)
    let labelRaw: string;
    let valueCurrentRaw: string;

    if (rawCells.length === 2) {
      [labelRaw, valueCurrentRaw] = rawCells as [string, string];
    } else if (rawCells.length === 3) {
      const firstCell = rawCells[0]!.trim();
      const looksLikeCode = /^\d{1,4}[a-z]?$/i.test(firstCell) || firstCell.length <= 6;
      if (looksLikeCode && firstCell !== "") {
        [, labelRaw, valueCurrentRaw] = rawCells as [string, string, string];
      } else {
        [labelRaw, valueCurrentRaw] = rawCells as [string, string, string];
      }
    } else {
      labelRaw = rawCells[1]!;
      valueCurrentRaw = rawCells[2]!;
    }

    // Check label cell for flags
    const labelFlag = parseTrustFlag(labelRaw);
    // Check value_current cell for flags
    const valueFlag = parseTrustFlag(valueCurrentRaw);

    // Determine which cell carries the flag (value_current takes priority for red)
    const cleanLabel = labelFlag.cleanedText;
    if (!cleanLabel) continue;

    let flagType: "red" | "yellow" | null = null;
    let flagReason = "";

    if (valueFlag.confidence === 0.2) {
      flagType = "red";
      flagReason = valueFlag.flag?.replace(/^high_discrepancy:/, "") ?? "";
    } else if (labelFlag.confidence === 0.2) {
      flagType = "red";
      flagReason = labelFlag.flag?.replace(/^high_discrepancy:/, "") ?? "";
    } else if (valueFlag.confidence === 0.4) {
      flagType = "yellow";
    } else if (labelFlag.confidence === 0.4) {
      flagType = "yellow";
    }

    if (!flagType) continue;

    let ocr_value: string | null = null;
    let image_value: string | null = null;

    if (flagType === "red") {
      const extracted = extractOcrVsImage(flagReason);
      ocr_value = extracted.ocr_value;
      image_value = extracted.image_value;
    }

    flags.push({
      page_number: pageNumber,
      label: cleanLabel,
      statement_section: currentSection,
      flag_type: flagType,
      ocr_value,
      image_value,
    });
  }

  return flags;
}

// ── Main service ───────────────────────────────────────────────────────────────

/**
 * enumerateFlaggedCells — scan a report's refined markdown for trust flags.
 *
 * Algorithm:
 * 1. Read financial_reports for confirm_status, final_confirmed_at, refine_status
 * 2. EC-3 guard: refine_status not in ['DONE','PARTIAL'] → reason: 'refine_not_complete'
 * 3. Read all bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'
 * 4. For each unit, parse markdown cells via parseTrustFlag
 * 5. Join flagged cells to bctc_table_rows by (report_id, page_number, label, statement_section)
 * 6. For each cell with row_id, check bctc_human_corrections → has_correction, corrected_value
 * 7. Extract ocr_value/image_value from red flag reason string
 *
 * @param db        Database instance (injected, DI pattern)
 * @param report_id Report UUID
 */
export function enumerateFlaggedCells(
  db: Database,
  report_id: string,
): FlagEnumerationResult {
  // Step 1: read report metadata
  const reportRow = db
    .prepare<FinancialReportRow, [string]>(
      `SELECT confirm_status, final_confirmed_at, refine_status
       FROM financial_reports
       WHERE id = ?`,
    )
    .get(report_id);

  const confirmStatus = reportRow?.confirm_status ?? "PENDING";
  const finalConfirmedAt = reportRow?.final_confirmed_at ?? null;
  const refineStatus = reportRow?.refine_status ?? null;

  // Step 2: EC-3 guard
  const READY_STATUSES = ["DONE", "PARTIAL"];
  if (!refineStatus || !READY_STATUSES.includes(refineStatus)) {
    return {
      doc_id: report_id,
      confirm_status: confirmStatus,
      final_confirmed_at: finalConfirmedAt,
      flag_count: 0,
      flags: [],
      has_flags: false,
      reason: "refine_not_complete",
    };
  }

  // Step 3: read done refined units
  const units = db
    .prepare<RefinedUnitRow, [string]>(
      `SELECT unit_id, page_numbers_json, markdown, window_status
       FROM bctc_refined_units
       WHERE report_id = ? AND window_status = 'DONE'
       ORDER BY id ASC`,
    )
    .all(report_id);

  const allFlags: FlaggedCell[] = [];

  for (const unit of units) {
    let pageNumbers: number[];
    try {
      pageNumbers = JSON.parse(unit.page_numbers_json) as number[];
    } catch {
      pageNumbers = [1];
    }

    // Step 4: scan markdown for flags
    const scanned = scanMarkdownForFlags(unit.markdown, pageNumbers);

    for (const scannedFlag of scanned) {
      // Step 5: join to bctc_table_rows
      const tableRow = db
        .prepare<TableRow, [string, number, string, string]>(
          `SELECT id, label, page_number, statement_section, code, value_current
           FROM bctc_table_rows
           WHERE report_id = ?
             AND page_number = ?
             AND label = ?
             AND statement_section = ?
           LIMIT 1`,
        )
        .get(report_id, scannedFlag.page_number, scannedFlag.label, scannedFlag.statement_section);

      const rowId: number | null = tableRow?.id ?? null;
      const currentValue: number | null = tableRow?.value_current ?? null;

      // Step 6: check for existing correction
      let hasCorrectionFlag = false;
      let correctedValue: number | null = null;

      if (rowId !== null) {
        hasCorrectionFlag = hasCorrection(db, report_id, rowId);
        if (hasCorrectionFlag) {
          const corrRow = db
            .prepare<CorrectionRow, [string, number]>(
              `SELECT new_value FROM bctc_human_corrections
               WHERE report_id = ? AND row_id = ?
               LIMIT 1`,
            )
            .get(report_id, rowId);
          correctedValue = corrRow?.new_value ?? null;
        }
      }

      allFlags.push({
        row_id: rowId,
        unit_id: unit.unit_id,
        page_number: scannedFlag.page_number,
        label: scannedFlag.label,
        statement_section: scannedFlag.statement_section,
        flag_type: scannedFlag.flag_type,
        ocr_value: scannedFlag.ocr_value,
        image_value: scannedFlag.image_value,
        current_value: currentValue,
        has_correction: hasCorrectionFlag,
        corrected_value: correctedValue,
      });
    }
  }

  return {
    doc_id: report_id,
    confirm_status: confirmStatus,
    final_confirmed_at: finalConfirmedAt,
    flag_count: allFlags.length,
    flags: allFlags,
    has_flags: allFlags.length > 0,
  };
}
