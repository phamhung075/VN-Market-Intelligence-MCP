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

import { repairCorruptedRows } from "./bctcRowRepair.js";

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
  /**
   * FIX-BCTC-BANK-BS-SECTION-CLASSIFIER: the `statement_section` state this
   * parse ended on. Callers that parse a report's DONE windows one unit at a
   * time, in page order (finalizeBctcRefineTool.ts), thread this value back
   * in as the NEXT unit's `initialSection` — see `parseRefinedMarkdown`'s
   * `initialSection` param doc for why this matters (multi-page statements
   * whose header line is printed once, not repeated on continuation pages).
   */
  finalSection: string;
}

// ── Section header detection ───────────────────────────────────────────────────

const SECTION_HEADERS: Array<{ pattern: RegExp; section: string }> = [
  // Vietnamese patterns (original)
  { pattern: /BẢNG CÂN ĐỐI KẾ TOÁN/i, section: "balance_sheet" },
  // FIX-BCTC-BANK-BS-COLUMN-ORDER: bank-form (Mẫu B02a/TCTDHN) canonical
  // balance-sheet title. Corporate VAS forms title their balance sheet
  // "BẢNG CÂN ĐỐI KẾ TOÁN"; banks title theirs "BÁO CÁO TÌNH HÌNH TÀI
  // CHÍNH" ("Statement of Financial Position") — confirmed live for CTG
  // 2026-Q1 (Mẫu B02a/TCTDHN, both the "TÀI SẢN" and "NỢ PHẢI TRẢ VÀ VỐN
  // CHỦ SỞ HỮU" units repeat this exact title). Previously absent from the
  // vocabulary — the bank BS title line fell through to "general", and
  // since detectSection's non-general branch is the ONLY mechanism that
  // ever overrides `currentSection`, the unit's own real title could never
  // correct a bogus carried-in section from a prior unit.
  { pattern: /BÁO CÁO TÌNH HÌNH TÀI CHÍNH/i, section: "balance_sheet" },
  { pattern: /BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH/i, section: "income_statement" },
  { pattern: /BÁO CÁO LƯU CHUYỂN TIỀN TỆ/i, section: "cash_flow" },
  { pattern: /THUYẾT MINH BÁO CÁO TÀI CHÍNH/i, section: "notes" },
  // English patterns — bilingual / English-only refined markdown
  // FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN: refine subagent writes English H1 section
  // titles for bilingual PDFs; these fell through to "general", preventing BEQ-7 from
  // completing section detection (hasCashFlow=false → PARTIAL forever).
  { pattern: /\bBalance Sheet\b/i, section: "balance_sheet" },
  { pattern: /\bIncome Statement\b/i, section: "income_statement" },
  { pattern: /\bCash Flow Statement\b|\bStatement of Cash Flows?\b|\bCash and Cash Equivalents Position\b/i, section: "cash_flow" },
];

// FIX-BCTC-BANK-SUMMARY-MAPPING W3: section-boundary-contamination guard.
//
// Brownfield reuse of FM-VCB-1 (sibling sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT,
// TASK_331 AC-2 `_detect_section_start()`): SAME root mechanism — a REAL
// section-transition line in the source text is not recognized by keyword
// match, so `currentSection` sticks on the prior value across a real section
// boundary. Confirmed live for CTG 2026Q1 (BA §3.2 / architect brief §5 W3):
// bank income-statement rows ("Lãi thuần từ hoạt động dịch vụ", "Chi phí
// thuế TNDN hoãn lại") were tagged statement_section="balance_sheet".
//
// Reproduced structurally: when the refined-markdown transcription emits the
// income-statement header WITHOUT the "BÁO CÁO " prefix (e.g. bare "KẾT QUẢ
// HOẠT ĐỘNG KINH DOANH"), the exact-phrase SECTION_HEADERS patterns above
// never match, `detected === "general"`, the transition is silently missed,
// and `currentSection` (still "balance_sheet" from the prior table) leaks
// into every subsequent row until a recognized header appears.
//
// Fix mirrors TASK_331 AC-2's own design exactly: (1) widen the keyword
// coverage with the SAME synonym list FM-VCB-1 added (income_statement: bare
// "kết quả hoạt động kinh doanh", "... sản xuất ...", "báo cáo thu nhập";
// cash_flow: bare "lưu chuyển tiền tệ"); (2) fold Vietnamese diacritics
// before matching so accent-rendering variance in the transcription cannot
// defeat the match either — same "diacritic-insensitive keyword substring"
// principle as TASK_331 AC-2. Generic across ALL section types and ALL bank
// tickers — no per-ticker allowlist, no date literal.
const FOLDED_SECTION_KEYWORDS: Array<{ keyword: string; section: string }> = [
  { keyword: "BANG CAN DOI KE TOAN", section: "balance_sheet" },
  // FIX-BCTC-BANK-BS-COLUMN-ORDER: diacritic-insensitive sibling of the bank
  // BS title added to SECTION_HEADERS above (same rationale).
  { keyword: "BAO CAO TINH HINH TAI CHINH", section: "balance_sheet" },
  { keyword: "KET QUA HOAT DONG KINH DOANH", section: "income_statement" },
  { keyword: "KET QUA HOAT DONG SAN XUAT KINH DOANH", section: "income_statement" },
  { keyword: "BAO CAO THU NHAP", section: "income_statement" },
  { keyword: "LUU CHUYEN TIEN TE", section: "cash_flow" },
  { keyword: "THUYET MINH BAO CAO TAI CHINH", section: "notes" },
];

/**
 * Fold Vietnamese diacritics to plain ASCII (uppercased) for accent-
 * insensitive keyword matching. Pure, deterministic. `đ`/`Đ` do not have a
 * combining-mark NFD decomposition, so they are folded explicitly.
 */
function foldDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip NFD combining diacritical marks
    .replace(/[đĐ]/g, "d") // đ/Đ have no combining-mark decomposition
    .toUpperCase();
}

function detectSection(text: string): string {
  // FIX-BCTC-BANK-BS-COLUMN-ORDER: table-of-contents lines are markdown
  // bullets ("- Báo cáo lưu chuyển tiền tệ hợp nhất") that legitimately
  // MENTION a statement's name without being that statement's own title
  // line — both the exact-phrase list above and the diacritic-folded
  // fallback below can false-positive-match a ToC bullet (confirmed live:
  // CTG 2026-Q1 unit-0001, the "MỤC LỤC" table-of-contents page). Cheapest
  // generic fix: skip section detection entirely for bullet-prefixed
  // lines — a real statement title is never itself a markdown list item.
  // No per-ticker/date literal; applies to any ToC shaped this way.
  const trimmed = text.trim();
  if (/^[-*]\s/.test(trimmed)) return "general";

  for (const { pattern, section } of SECTION_HEADERS) {
    if (pattern.test(text)) return section;
  }
  // Fallback: diacritic-insensitive keyword match — see FOLDED_SECTION_KEYWORDS
  // comment above (FIX-BCTC-BANK-SUMMARY-MAPPING W3 / FM-VCB-1 reuse).
  const folded = foldDiacritics(text);
  for (const { keyword, section } of FOLDED_SECTION_KEYWORDS) {
    if (folded.includes(keyword)) return section;
  }
  return "general";
}

// ── Vietnamese number normalization ───────────────────────────────────────────

/**
 * Parse a Vietnamese-formatted number string.
 * Vietnamese uses '.' as thousands separator and ',' as decimal separator.
 * E.g. "1.234.567" → 1234567, "1.234,56" → 1234.56
 *
 * Full VN accounting format support:
 *   - Parentheses-wrapped negatives: "(35.872.175.224)" → -35872175224
 *     (standard VN BCTC notation for COGS, deductions, losses)
 *   - Thousand-separator dots: "1.234.567" → 1234567
 *   - Decimal comma: "1.234,56" → 1234.56
 *   - English-style comma-thousands: "2,924,176,928" → 2924176928
 *     (FIX-BCTC-BANK-BS-COLUMN-ORDER: some agentic-refine transcriptions —
 *     confirmed live for CTG 2026-Q1 bank-form B02a/TCTDHN — use English
 *     comma-thousands notation rather than the VN dot-thousands convention;
 *     format is auto-detected, never assumed. See DV-BS-1/2 test coverage.)
 *   - Markdown emphasis markers (`**bold**`, `__bold__`) stripped before
 *     parsing (FIX-BCTC-BANK-BS-COLUMN-ORDER: real agentic-refine markdown
 *     bolds grand-total/summary values, e.g. "**2,924,176,928**")
 *   - Em-dash / en-dash / hyphen-only / blank / "..." → null (absent, not 0)
 *   - Footnote superscripts / trailing markers stripped before parse
 *
 * NULL semantics:
 *   Returns null for genuinely absent/blank cells.
 *   Never returns 0 for a cell that is absent — caller must distinguish.
 *
 * @param raw Raw cell value string
 * @returns Parsed number or null if cell is genuinely absent/unparseable
 */
export function parseVnNumber(raw: string): number | null {
  // FIX-BCTC-BANK-BS-COLUMN-ORDER: strip markdown emphasis markers (bold
  // `**`/`__` or stray single `*`/`_`) before any other processing. These
  // characters are never legitimate content of a numeric BCTC cell, so
  // blanket-stripping is safe, generic, and carries no per-ticker/date
  // literal — without it, a bolded grand total like "**2,924,176,928**"
  // fails parseFloat entirely (leading "*" is not a valid numeric start).
  const stripped = raw.trim().replace(/[*_]/g, "").trim();

  // Null signals: empty, dashes, ellipsis, N/A
  if (
    !stripped ||
    stripped === "-" ||
    stripped === "—" ||   // em-dash
    stripped === "–" ||   // en-dash
    stripped === "..." ||
    stripped === "…" ||   // Unicode ellipsis
    stripped === "N/A" ||
    stripped === "n/a"
  ) return null;

  // Strip trailing footnote superscripts / end-of-cell markers:
  // e.g. "1.234.567¹" or "1.234.567(1)" where "(1)" is a footnote reference.
  // Pattern: strip trailing (digit+) that appear AFTER the main number,
  // but ONLY when the whole string is NOT wrapped in parens (parens = negatives below).
  let work = stripped;
  // Strip trailing footnote-style (N) where N is 1–2 digits (footnote reference)
  // Safe: only strip if there is numeric content before the footnote
  work = work.replace(/\(\d{1,2}\)\s*$/, "");
  // Strip trailing Unicode superscripts (¹²³⁴⁵⁶⁷⁸⁹⁰)
  work = work.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+\s*$/, "");
  work = work.trim();

  // Parentheses-wrapped negative: "(35.872.175.224)" → -35872175224
  // Standard VN accounting BCTC notation for COGS, deductions, losses.
  let isNegative = false;
  if (work.startsWith("(") && work.endsWith(")")) {
    work = work.slice(1, -1).trim();
    isNegative = true;
  }
  // Also handle explicit leading minus that survived footnote strip
  if (work.startsWith("-") && !isNegative) {
    work = work.slice(1).trim();
    isNegative = true;
  }

  // Determine format: Vietnamese (dot=thousands, comma=decimal) vs English
  // (comma=thousands, dot=decimal) — auto-detected, never assumed.
  // FIX-BCTC-BANK-BS-COLUMN-ORDER: the old hardcoded rule ("dots are ALWAYS
  // thousand separators, comma is ALWAYS decimal") truncated every
  // English-style comma-thousands value at the first decimal point
  // (parseFloat stops at the 2nd "."), e.g. "2,924,176,928" →
  // work.replace(/,/g,".") → "2.924.176.928" → parseFloat → 2.924 (wrong by
  // 9 orders of magnitude). Mirrors the auto-detect heuristic already
  // proven in the sibling legacy-pipeline parser
  // (domain/services/vnNumberParser.ts) — duplicated here rather than
  // imported because this file's footnote/superscript/bold stripping above
  // is specific to the agentic-refine markdown shape and has no
  // domain-layer equivalent.
  const hasComma = work.includes(",");
  const hasDot = work.includes(".");
  let cleaned: string;
  if (hasComma && hasDot) {
    // Both present — the one appearing LAST is the decimal separator.
    const lastComma = work.lastIndexOf(",");
    const lastDot = work.lastIndexOf(".");
    cleaned = lastComma > lastDot
      ? work.replace(/\./g, "").replace(",", ".")  // VN: 1.234,56
      : work.replace(/,/g, "");                     // English: 1,234.56
  } else if (hasComma && !hasDot) {
    // Only commas — VN decimal ("0,5") or English thousands ("1,234,567").
    const commaCount = (work.match(/,/g) ?? []).length;
    cleaned = commaCount > 1 || /,\d{3}$/.test(work)
      ? work.replace(/,/g, "")   // English thousands separator
      : work.replace(",", ".");  // VN decimal separator
  } else if (hasDot && !hasComma) {
    // Only dots — VN thousands ("1.234.567") or plain decimal ("1.5").
    const dotCount = (work.match(/\./g) ?? []).length;
    cleaned = dotCount > 1
      ? work.replace(/\./g, "")
      : (/\.\d{3}$/.test(work) ? work.replace(".", "") : work);
  } else {
    cleaned = work;
  }
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return isNegative ? -n : n;
}

// ── Trust flag parsing ─────────────────────────────────────────────────────────

export interface TrustFlagResult {
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
export function parseTrustFlag(cellText: string): TrustFlagResult {
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

/**
 * FIX-BCTC-BANK-BS-COLUMN-ORDER: resolve a captured header row's cell order.
 *
 *   "code-first"  — corporate VAS convention: "Mã số | Chỉ tiêu | …"
 *   "label-first" — bank Mẫu B02a/TCTDHN convention: "Mục (Item) | Mã
 *                   (Code) | …", confirmed live for CTG 2026-Q1.
 *   "label-only"  — no code/Mã column exists at all — e.g. a bank equity
 *                   roll-forward note ("Mục | Số dư đầu năm | Phát sinh
 *                   trong năm | | Số dư cuối kỳ", confirmed live for CTG
 *                   2026-Q1 report_id 96e36139 unit-0038/page 45): a
 *                   positive label-keyword match with NO code-keyword
 *                   match anywhere in the header is decisive evidence of
 *                   this shape, not mere ambiguity.
 *
 * Reads the header row's OWN cell text — already segmented by the pipe-table
 * splitter above but previously discarded — instead of assuming a fixed
 * position. Falls back to "code-first" (the pre-existing, 0-diff default
 * for every VCB/FPT/corporate fixture, and for any table whose header this
 * function never captured) only when the header is missing or truly
 * ambiguous (neither keyword found).
 *
 * The code-keyword pattern also matches "STT" (Vietnamese "Số Thứ Tự" —
 * ordinal/sequence number), the income-statement convention seen live for
 * CTG ("STT | CHỈ TIÊU (Thuyết minh) | …") — without it, a genuinely
 * code-first STT table with a "Chỉ tiêu" label column would false-positive
 * into "label-only" (no code column at all) purely because "STT" isn't the
 * literal word "Mã"/"Code".
 *
 * @param headerCells  The captured header row's trimmed cell text, or null
 *   when no header row was recognized for the current table.
 */
function resolveColumnLayout(headerCells: string[] | null): "code-first" | "label-first" | "label-only" {
  if (!headerCells || headerCells.length < 2) return "code-first";
  const codeIdx = headerCells.findIndex((c) => /mã|code|stt/i.test(c));
  const labelIdx = headerCells.findIndex((c) => /mục|chỉ\s*tiêu|item/i.test(c));
  if (codeIdx === -1 && labelIdx !== -1) return "label-only";
  if (codeIdx === -1 || labelIdx === -1) return "code-first";
  return labelIdx < codeIdx ? "label-first" : "code-first";
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
 * @param initialSection FIX-BCTC-BANK-BS-SECTION-CLASSIFIER: `statement_section`
 *   to start this unit in, defaulting to `"general"` (0-diff for every
 *   existing caller). Real multi-page VN BCTC PDFs print a statement's
 *   header ("BẢNG CÂN ĐỐI KẾ TOÁN" etc.) once, on its FIRST page, and never
 *   repeat it on continuation pages. finalize_bctc_refine parses each
 *   refined-markdown window (~= one PDF page range) as an ISOLATED unit —
 *   without this param, a continuation unit that legitimately has no header
 *   line of its own always falls back to "general" no matter what statement
 *   its rows actually belong to (reproduced: report_id 96e36139 unit-0003,
 *   the NGUỒN VỐN continuation of a balance sheet started in unit-0002,
 *   mistagged statement_section=general). The caller threads the PRIOR
 *   unit's `finalSection` (see ParseResult) into the NEXT unit's
 *   `initialSection`, in page order — this function stays pure/stateless;
 *   the caller owns the ordering.
 * @returns ParseResult with rows, any parsing errors, and finalSection.
 */
export function parseRefinedMarkdown(
  markdown: string,
  report_id: string,
  page_numbers: number[],
  initialSection: string = "general",
): ParseResult {
  const rows: BctcTableRow[] = [];
  const errors: string[] = [];

  const pageNumber = page_numbers[0] ?? 1;
  let currentSection = initialSection;
  let rowOrder = 0;
  let headerConsumed = false;
  let prevLineWasSeparator = false;
  // FIX-BCTC-BANK-BS-COLUMN-ORDER: captured header row cell text (trimmed),
  // used by resolveColumnLayout() to detect code-first vs label-first
  // column order for the 4+-column data-row branch below. null until the
  // first header row is recognized for the current table.
  let headerCells: string[] | null = null;

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

    if (!headerConsumed) {
      if (prevLineWasSeparator) {
        // First data row right after a real |---| separator — the
        // separator is an unambiguous header/data boundary, no further
        // content check needed.
        headerConsumed = true;
      } else if (isHeaderRow(rawCells, false)) {
        // Still waiting for the header to resolve, and this row IS the
        // (all-non-numeric) header/label-only row itself — skip it.
        // FIX-BCTC-BANK-BS-COLUMN-ORDER: capture its cell text (see
        // resolveColumnLayout doc) before skipping — but only the FIRST
        // such row per table. Some real bank tables have a merged-cell
        // header spanning TWO physical header lines (confirmed live: CTG
        // 2026-Q1 unit-0038 "Mục | Số dư đầu năm | Phát sinh trong năm | |
        // Số dư cuối kỳ" followed by a blank/"Tăng"/"Giảm" sub-header
        // continuation line) — the FIRST line carries the meaningful
        // Mục/Mã column labels; overwriting with the second would discard
        // that signal.
        if (headerCells === null) headerCells = rawCells;
        prevLineWasSeparator = false;
        continue;
      } else {
        // FIX-BCTC-BANK-BS-SECTION-CLASSIFIER: content-based recovery for a
        // dropped |---| separator. Before this fix, `headerConsumed` could
        // ONLY ever become true via a separator row — if the source
        // markdown's separator line was lost in transcription (reproduced:
        // report_id 96e36139 unit-0002, a Roman-numeral/bold-header B02a/
        // TCTDHN balance-sheet table), EVERY row for the REST of the
        // document was silently treated as "still waiting for the header"
        // and dropped — 0 rows out of 34, no errors. A pipe-row containing
        // any parseable numeric cell is structurally DATA, never a header
        // (real BCTC header rows are label-only) — promote directly to
        // data mode instead of waiting forever for a separator that will
        // never arrive.
        headerConsumed = true;
      }
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
      // Heuristic: if first cell looks like a code (short, possibly numeric), treat as code.
      // FIX-BCTC-BANK-BS-SECTION-CLASSIFIER: a BLANK first cell is ALWAYS the
      // [code(blank), label, value_current] layout, never [label, value_current,
      // value_prior] with an empty label — a real BCTC data row can never have
      // a nameless line item. The bank-form B02a/TCTDHN layout leaves "Mã số"
      // blank for most sub-items (reproduced: report_id 96e36139 unit-0003),
      // and the previous `firstCell !== ""` guard mis-routed exactly that case
      // into the [label, value_current, value_prior] branch — the blank code
      // cell became an empty `labelRaw`, tripping the "empty label after flag
      // stripping" drop below and silently discarding the row's real data.
      const firstCell = rawCells[0]!.trim();
      const looksLikeCode = firstCell === "" || /^\d{1,4}[a-z]?$/i.test(firstCell) || firstCell.length <= 6;
      if (looksLikeCode) {
        [, labelRaw, valueCurrentRaw] = rawCells as [string, string, string];
        code = firstCell || null;
      } else {
        [labelRaw, valueCurrentRaw, valuePriorRaw] = rawCells as [string, string, string];
      }
    } else {
      // 4+ columns: layout depends on the header's own cell order.
      // FIX-BCTC-BANK-BS-COLUMN-ORDER: this branch used to hardcode
      // [code, label, value_current, value_prior] (the corporate VAS
      // convention: "Mã số | Chỉ tiêu | …"). Bank Mẫu B02a/TCTDHN forms are
      // LABEL-FIRST ("Mục (Item) | Mã (Code) | …", confirmed live for CTG
      // 2026-Q1) — the hardcoded assumption silently dropped every
      // blank-Mã row (every section header + BOTH grand totals: "TỔNG TÀI
      // SẢN CÓ", "TỔNG NỢ PHẢI TRẢ", "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU")
      // via the "empty label" guard below (the blank Mã cell became an
      // empty labelRaw), and silently SWAPPED code/label for populated
      // rows (e.g. "I. Các khoản nợ Chính phủ và NHNN | 7 | …" → code
      // became the label text, label became "7"). resolveColumnLayout()
      // reads the captured header text instead of assuming position;
      // falls back to code-first (0-diff) when no header was captured or
      // it is ambiguous.
      const layout = resolveColumnLayout(headerCells);
      if (layout === "label-only") {
        // No Mã/code column exists in this table at all — e.g. a bank
        // equity roll-forward note ("Mục | Số dư đầu năm | Phát sinh
        // trong năm: Tăng | Giảm | Số dư cuối kỳ", confirmed live for CTG
        // 2026-Q1 unit-0038/page 45). code stays null. The row schema has
        // only 2 value slots (value_current/value_prior) — no field for
        // intermediate "Tăng"/"Giảm" delta columns — so this carries the
        // FIRST value column (period start) as value_prior and the LAST
        // (period end) as value_current, discarding only the delta
        // columns in between. The row itself is never dropped, and the
        // two carried values are exactly the period-start/period-end
        // figures the schema already models everywhere else.
        labelRaw = rawCells[0]!;
        valueCurrentRaw = rawCells[rawCells.length - 1]!;
        valuePriorRaw = rawCells[1] ?? null;
      } else if (layout === "label-first") {
        labelRaw = rawCells[0]!;
        const codeCell = rawCells[1]!.trim();
        code = codeCell || null;
        valueCurrentRaw = rawCells[2]!;
        valuePriorRaw = rawCells[3] ?? null;
      } else {
        const firstCell = rawCells[0]!.trim();
        code = firstCell || null;
        labelRaw = rawCells[1]!;
        valueCurrentRaw = rawCells[2]!;
        valuePriorRaw = rawCells[3] ?? null;
      }
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

    // FAIL-LOUD: value_current unparseable — NEVER silently drop the row.
    // Silent drop was the root anti-pattern that caused 3 rounds of trust seams:
    //   round 1: empty-OCR, round 2: scalar backfill, round 3: parens-negatives.
    //
    // If parseVnNumber returns null on a cell that contains digits (looks numeric),
    // record a rich error (report_id + page + label + raw string) AND retain the row
    // with value_current=null + source_confidence=0.1 (unparseable flag).
    //
    // The row MUST be retained so:
    //   (a) the aggregator can see the row exists (even with null value)
    //   (b) the error surface reveals the FULL class of failures in one pass,
    //       not one-rebuild-at-a-time.
    //
    // Null-for-absent (dash/blank) is still correct and goes to value_current=null
    // with normal confidence — those rows are genuinely absent, not unparseable.
    let unparseableFlag = false;
    if (valueCurrentStr && valueCurrent === null && !/^[-—–]$/.test(valueCurrentStr.trim())) {
      // Not a number and not a dash — could be a text value (OK for some rows)
      // Only flag if it looks like it SHOULD be a number (has digits)
      if (/\d/.test(valueCurrentStr)) {
        errors.push(
          `[UNPARSEABLE] report=${report_id} page=${pageNumber} label="${label}" raw_value="${valueCurrentStr}" line=${lineIdx + 1}`,
        );
        unparseableFlag = true;
        // DO NOT continue — retain the row with value_current=null
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
      // Unparseable numeric cells: confidence → 0.1 (lowest non-zero),
      // signaling the row is structurally present but value extraction failed.
      source_confidence: unparseableFlag ? Math.min(sourceConfidence, 0.1) : sourceConfidence,
      is_summary_row: isSummaryRow,
    });
  }

  // FIX-BCTC-BANK-SUMMARY-MAPPING W2: repair the corruption-signature rows
  // (code=null, values merged into label text) generically, structurally,
  // for ANY bank-form ticker — see bctcRowRepair.ts. Rows not matching the
  // exact corruption signature pass through unchanged (RISK-1 non-lossy).
  return { rows: repairCorruptedRows(rows, parseVnNumber), errors, finalSection: currentSection };
}
