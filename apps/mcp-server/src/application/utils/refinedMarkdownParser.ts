/**
 * refinedMarkdownParser.ts — FR-10 Deterministic Markdown → bctc_table_rows Parser
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (pure function, deterministic, no I/O)
 *
 * Converts refined markdown produced by the refine_bctc_md agent into structured
 * BctcTableRow objects matching the LIVE bctc_table_rows schema.
 *
 * CRITICAL naming: uses LIVE schema column names:
 *   - label (NOT row_label)
 *   - value_prior (NOT value_previous)
 *   - period_prior (NOT period_previous)
 *
 * @module application/utils/refinedMarkdownParser
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BctcTableRow {
  report_id: string;
  statement_section: string;  // "balance_sheet" | "income_statement" | "cash_flow" | "notes" | "general"
  row_order: number;
  code: string | null;
  label: string;              // LIVE schema: label (NOT row_label)
  period_current: string;
  value_current: number | null;
  period_prior: string | null;
  value_prior: number | null;  // LIVE schema: value_prior (NOT value_previous)
  unit: string;               // default "billion_vnd"
  page_number: number;
  source_confidence: number;  // 0.0–1.0
  is_summary_row: number;     // 0 or 1
}

export interface ParseResult {
  rows: BctcTableRow[];
  errors: string[];
}

// ── Section header detection ───────────────────────────────────────────────────

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

// ── Vietnamese number normalization ───────────────────────────────────────────

/**
 * Parse a Vietnamese-formatted number string.
 * Vietnamese uses '.' as thousands separator and ',' as decimal separator.
 * E.g. "1.234.567" → 1234567, "1.234,56" → 1234.56
 *
 * @param raw Raw cell value string
 * @returns Parsed number or null if not a valid number
 */
export function parseVnNumber(raw: string): number | null {
  const stripped = raw.trim();
  if (!stripped || stripped === "-" || stripped === "—" || stripped === "N/A") return null;

  // Remove thousand separators (dots) then replace decimal comma with dot
  const cleaned = stripped.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ── Trust flag parsing ─────────────────────────────────────────────────────────

interface TrustFlagResult {
  confidence: number;
  flag: string | null;
  cleanedText: string;
}

/**
 * Extract trust flags from a cell value and return cleaned text + confidence.
 *
 * Red flag: [ĐỘ TIN CẬY THẤP — {reason}] → confidence = 0.2
 * Yellow flag: [độ tin cậy thấp] → confidence = 0.4
 * No flag → confidence = 1.0
 */
function parseTrustFlag(cellText: string): TrustFlagResult {
  // Red flag: [ĐỘ TIN CẬY THẤP — {reason}]
  const redMatch = cellText.match(/\[ĐỘ TIN CẬY THẤP\s*—\s*([^\]]+)\]/i);
  if (redMatch) {
    const reason = redMatch[1]!.trim();
    const cleanedText = cellText.replace(redMatch[0], "").trim();
    return {
      confidence: 0.2,
      flag: `high_discrepancy:${reason}`,
      cleanedText,
    };
  }

  // Yellow flag: [độ tin cậy thấp]
  const yellowMatch = cellText.match(/\[độ tin cậy thấp\]/i);
  if (yellowMatch) {
    const cleanedText = cellText.replace(yellowMatch[0], "").trim();
    return {
      confidence: 0.4,
      flag: "minor_discrepancy",
      cleanedText,
    };
  }

  return {
    confidence: 1.0,
    flag: null,
    cleanedText: cellText,
  };
}

// ── Pipe-table parsing ─────────────────────────────────────────────────────────

/**
 * Detect if a line is a separator row (e.g. |---|---|---|)
 */
function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^[-:\s]+$/.test(cell.trim()));
}

/**
 * Detect if a line is a header row by checking if no numeric values present.
 * Used as heuristic to skip column headers.
 */
function isHeaderRow(cells: string[], isAfterSeparator: boolean): boolean {
  if (isAfterSeparator) return false; // already consumed header
  // If cells contain mostly non-numeric content (Vietnamese keywords), it's a header
  const nonNumericCount = cells.filter((c) => {
    const cleaned = c.trim();
    if (!cleaned) return true;
    return isNaN(parseVnNumber(cleaned) ?? NaN);
  }).length;
  return nonNumericCount === cells.length;
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse refined markdown (pipe-table format) into BctcTableRow objects.
 *
 * Deterministic: same input → same output always. No ML, no randomness.
 *
 * @param markdown      Refined markdown string from bctc_refined_units
 * @param report_id     Report ID to stamp on each row
 * @param page_numbers  Page numbers for this unit (uses [0] for page_number)
 * @returns ParseResult with rows and any parsing errors
 */
export function parseRefinedMarkdown(
  markdown: string,
  report_id: string,
  page_numbers: number[],
): ParseResult {
  const rows: BctcTableRow[] = [];
  const errors: string[] = [];

  const pageNumber = page_numbers[0] ?? 1;
  let currentSection = "general";
  let rowOrder = 0;
  let headerConsumed = false;
  let prevLineWasSeparator = false;

  const lines = markdown.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!.trim();

    // Skip empty lines
    if (!line) {
      prevLineWasSeparator = false;
      continue;
    }

    // Section header detection (non-table lines)
    if (!line.startsWith("|")) {
      const detected = detectSection(line);
      if (detected !== "general") {
        currentSection = detected;
        headerConsumed = false; // reset for new section
      }
      prevLineWasSeparator = false;
      continue;
    }

    // Pipe-table row — must start and end with |
    if (!line.startsWith("|") || !line.endsWith("|")) {
      prevLineWasSeparator = false;
      continue;
    }

    // Split on | and trim cells (remove first and last empty cells from split)
    const rawCells = line.split("|").slice(1, -1).map((c) => c.trim());

    if (rawCells.length === 0) continue;

    // Separator row (|---|---|...) — marks end of header
    if (isSeparatorRow(rawCells)) {
      prevLineWasSeparator = true;
      headerConsumed = false; // the next row is the first data row
      continue;
    }

    // Header row — skip it (first non-separator row after table start)
    if (!headerConsumed && !prevLineWasSeparator) {
      // This is the header row (before separator)
      headerConsumed = false;
      prevLineWasSeparator = false;
      continue;
    }

    // First data row after separator
    if (!headerConsumed && prevLineWasSeparator) {
      headerConsumed = true;
    }

    prevLineWasSeparator = false;

    // Must have at least 2 cells (label + value_current minimum)
    if (rawCells.length < 2) {
      errors.push(`Line ${lineIdx + 1}: too few columns (${rawCells.length}), minimum 2 required`);
      continue;
    }

    // Determine column layout based on number of cells:
    // 2 cols: [label, value_current]
    // 3 cols: [code, label, value_current] OR [label, value_current, value_prior]
    // 4 cols: [code, label, value_current, value_prior]
    // >4 cols: try to use first 4

    let code: string | null = null;
    let labelRaw: string;
    let valueCurrentRaw: string;
    let valuePriorRaw: string | null = null;

    if (rawCells.length === 2) {
      [labelRaw, valueCurrentRaw] = rawCells as [string, string];
    } else if (rawCells.length === 3) {
      // Heuristic: if first cell looks like a code (short, possibly numeric), treat as code
      const firstCell = rawCells[0]!.trim();
      const looksLikeCode = /^\d{1,4}[a-z]?$/i.test(firstCell) || firstCell.length <= 6;
      if (looksLikeCode && firstCell !== "") {
        [, labelRaw, valueCurrentRaw] = rawCells as [string, string, string];
        code = firstCell || null;
      } else {
        [labelRaw, valueCurrentRaw, valuePriorRaw] = rawCells as [string, string, string];
      }
    } else {
      // 4+ columns: code, label, value_current, value_prior
      const firstCell = rawCells[0]!.trim();
      code = firstCell || null;
      labelRaw = rawCells[1]!;
      valueCurrentRaw = rawCells[2]!;
      valuePriorRaw = rawCells[3] ?? null;
    }

    // Parse trust flags from ALL cells
    const labelFlagResult = parseTrustFlag(labelRaw);
    const currentFlagResult = parseTrustFlag(valueCurrentRaw);
    const priorFlagResult = valuePriorRaw !== null ? parseTrustFlag(valuePriorRaw) : null;

    // Confidence is the minimum across all cells with flags
    const confidences = [
      labelFlagResult.confidence,
      currentFlagResult.confidence,
      ...(priorFlagResult ? [priorFlagResult.confidence] : []),
    ];
    const sourceConfidence = Math.min(...confidences);

    // Clean label
    const label = labelFlagResult.cleanedText;
    if (!label) {
      errors.push(`Line ${lineIdx + 1}: empty label after flag stripping`);
      continue;
    }

    // Parse numeric values
    const valueCurrentStr = currentFlagResult.cleanedText;
    const valuePriorStr = priorFlagResult?.cleanedText ?? null;

    const valueCurrent = parseVnNumber(valueCurrentStr);
    const valuePrior = valuePriorStr !== null ? parseVnNumber(valuePriorStr) : null;

    // Validate: value_current must be parseable or empty (null is OK for missing)
    // If valueCurrentStr is non-empty and non-parseable, record error and skip
    if (valueCurrentStr && valueCurrent === null && !/^[-—]$/.test(valueCurrentStr.trim())) {
      // Not a number and not a dash — could be a text value (OK for some rows)
      // Only error if it looks like it SHOULD be a number (has digits)
      if (/\d/.test(valueCurrentStr)) {
        errors.push(`Line ${lineIdx + 1}: non-numeric value_current "${valueCurrentStr}"`);
        continue;
      }
    }

    // is_summary_row: code is null AND label is ALL-CAPS
    const isSummaryRow = !code && label === label.toUpperCase() && /[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-ỹ]/.test(label) ? 1 : 0;

    // Default periods (will be overridden by headers when available)
    const periodCurrent = "current";
    const periodPrior = valuePrior !== null ? "prior" : null;

    rows.push({
      report_id,
      statement_section: currentSection,
      row_order: rowOrder++,
      code: code || null,
      label,
      period_current: periodCurrent,
      value_current: valueCurrent,
      period_prior: periodPrior,
      value_prior: valuePrior,
      unit: "billion_vnd",
      page_number: pageNumber,
      source_confidence: sourceConfidence,
      is_summary_row: isSummaryRow,
    });
  }

  return { rows, errors };
}
