/**
 * extractorHelpers.ts — JANITOR-014a
 *
 * Canonical shared helpers for the three BCTC extractor files:
 *   - balanceSheetExtractor.ts
 *   - incomeStatementExtractor.ts
 *   - cashFlowExtractor.ts
 *
 * Domain layer — pure functions, zero I/O.
 * Only allowed external import: parseVnNumber from domain/services.
 */

import { parseVnNumber } from "../vnNumberParser.js";

// ---------------------------------------------------------------------------
// LOOKAHEAD_LINES
// ---------------------------------------------------------------------------

/**
 * Number of lines to look ahead after a label match when the label line
 * itself contains no number. OCR PDFs frequently place labels and values
 * on separate lines.
 */
export const LOOKAHEAD_LINES = 3;

// ---------------------------------------------------------------------------
// extractNumber
// ---------------------------------------------------------------------------

/**
 * Extract all number tokens from a line and return the first "large" one
 * (skipping BCTC item codes which are small integers like 01, 10, 20).
 * Falls back to the last number on the line if no large number found.
 *
 * Merges both extractor implementations:
 *   - Scientific notation support (e.g. "1.23e14") from incomeStatementExtractor
 *     (Task 1810a: extended regex to capture sci-notation OCR output).
 *   - Year-value guards from balanceSheetExtractor: integers in [1990, 2030]
 *     are treated as calendar-year column headers, not financial values.
 *   - Fallback bare-year guard: skips a token only when it is a BARE 4-digit
 *     integer with no thousands separators (e.g. "2017" from "93/2017/NĐ-CP").
 *     A Vietnamese-formatted number like "2.000" has a period separator and
 *     must NOT be blocked.
 *
 * Strategy: first-large-number wins (current-period column in multi-column
 * Vietnamese BCTC layouts). Falls back to last parseable number when no
 * large number is found.
 *
 * @param line - A single line of NFC-normalized OCR text.
 * @returns The extracted financial number, or null if none found.
 */
export function extractNumber(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Extended regex: captures scientific notation (e.g. "1.23e14") in addition
  // to standard Vietnamese number tokens (parenthesised negatives, decimals).
  const tokens = trimmed.match(/\(?\-?[\d.,]+(?:[eE][+-]?\d+)?\)?/g);
  if (!tokens || tokens.length === 0) return null;

  // Try to find the first large number (skip item codes and year values).
  for (const token of tokens) {
    const val = parseVnNumber(token);
    if (val === null) continue;
    // Skip small integers that are likely BCTC item codes (01, 02, 10, 20 … 999)
    if (Number.isInteger(val) && val >= 0 && val <= 999) continue;
    // Skip calendar years (1990–2030) — these appear as column headers in
    // bank BCTCs (e.g. "31/12/2025 VND") and must not be treated as financial
    // values. Bug confirmed in balanceSheetExtractor: Assets ≠ Liabilities + Equity
    // when a year token was returned as the "first large number".
    if (Number.isInteger(val) && val >= 1990 && val <= 2030) continue;
    return val;
  }

  // Fallback: return the last parseable number (even if small).
  // Apply a targeted bare-year guard: skip a token only when it is a BARE
  // 4-digit integer with no thousands separators (e.g. "2017" from
  // "93/2017/NĐ-CP"). A Vietnamese-formatted number like "2.000" has a period
  // separator and is NOT a bare year literal — it must NOT be blocked here.
  const BARE_YEAR = /^\d{4}$/;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    const val = parseVnNumber(token);
    if (val === null) continue;
    if (Number.isInteger(val) && val >= 1990 && val <= 2030 && BARE_YEAR.test(token)) continue;
    return val;
  }
  return null;
}

// ---------------------------------------------------------------------------
// stripDiacritics
// ---------------------------------------------------------------------------

/**
 * Strip Vietnamese diacritics from a string, producing ASCII-only text.
 * Used to build fallback lines for corrupted pdf-parse output where combining
 * diacritical marks are lost or garbled.
 *
 * Verbatim copy from incomeStatementExtractor.ts.
 *
 * @param text - Input string (any encoding).
 * @returns ASCII-only string with diacritics removed.
 */
export function stripDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove combining diacritical marks
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D")); // handle đ/Đ separately
}

// ---------------------------------------------------------------------------
// detectUnitMultiplier
// ---------------------------------------------------------------------------

/**
 * Scan PDF lines for a unit-declaration header and return the appropriate
 * multiplier to convert reported values to triệu đồng (million VND).
 *
 * This is the canonical (balanceSheetExtractor) version — it scans the first
 * 400 lines (not 50 like incomeStatementExtractor) to handle VCB BCTCs that
 * have a 5-page cover letter before the "(Triệu VND)" column header.
 *
 * Return values:
 *   1      — "Đơn vị tính: Triệu đồng" or "(Triệu VND)" found → already triệu
 *   1000   — "Đơn vị tính: Tỷ đồng" found → 1 tỷ = 1000 triệu
 *   0.001  — "nghìn đồng" found → 1 nghìn = 0.001 triệu
 *   -1     — bare "đồng" or "VND" without qualifier → magnitude inference needed
 *   -2     — no unit declaration found at all → magnitude inference needed
 *
 * @param lines - Array of lines from the NFC-normalized rawText.
 * @returns Numeric multiplier or sentinel (-1 / -2).
 */
export function detectUnitMultiplier(lines: string[]): number {
  const P_UNIT_TRIEU =
    /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*(tri[eệ]u|trieu)/i;
  const P_UNIT_TY =
    /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*t[yỷ]/i;

  for (const line of lines) {
    if (P_UNIT_TRIEU.test(line)) return 1;
    if (P_UNIT_TY.test(line)) return 1000;
  }

  // Fallback: OCR text may garble diacritics or lack the formal "Đơn vị tính"
  // prefix. Scan first ~400 lines for any unit hint (report #1088 slice a).
  // VCB BCTCs have a 5-page cover letter; "(Triệu VND)" appears at line ~343 of
  // extracted text, so 50 was insufficient — expanded to 400 for safety margin.
  const head = lines.slice(0, 400);
  // Also matches "(Triệu VND)" — bank BCTCs use this column header format
  const P_TRIEU_LOOSE = /tri[eệ]u\s*[đd][oồ]ng|trieu\s*dong|tri[eệ]u\s*VND/i;
  const P_TY_LOOSE = /t[yỷ]\s*[đd][oồ]ng|ty\s*dong/i;
  const P_NGHIN_LOOSE = /ngh?[iì]n\s*[đd][oồ]ng|nghin\s*dong|1[.,]?000\s*[đd][oồ]ng/i;
  const P_DONG_ONLY = /[đd][oồ]ng|VND/i;

  for (const line of head) {
    if (P_TRIEU_LOOSE.test(line)) return 1;
    if (P_TY_LOOSE.test(line)) return 1000;
    if (P_NGHIN_LOOSE.test(line)) return 0.001; // nghìn đồng → /1000 to get triệu
  }

  // Last resort: bare "đồng" or "VND" without qualifier → raw VND.
  // Return a sentinel (-1) so the caller can apply magnitude-based inference
  // after extraction, when we know the actual numbers.
  for (const line of head) {
    if (P_DONG_ONLY.test(line)) {
      console.warn("[extractorHelpers] Found bare 'đồng/VND' without triệu/tỷ prefix; will infer from magnitude.");
      return -1; // sentinel: magnitude inference needed
    }
  }

  // Sentinel -2: no unit declaration found at all. Caller will apply
  // magnitude-based inference (same path as -1 bare đồng).
  console.warn("[extractorHelpers] No unit header found; defaulting multiplier to 1.");
  return -2;
}
