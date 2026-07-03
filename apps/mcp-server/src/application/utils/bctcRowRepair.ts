/**
 * bctcRowRepair.ts — FIX-BCTC-BANK-SUMMARY-MAPPING W2 (AC-5, RISK-1)
 *
 * Generic, pattern-based repair pass for a markdown-transcription corruption
 * signature observed on bank-form (Mẫu B02-TCTD) reports: a table row whose
 * value columns collapsed into the label cell during agentic-refine markdown
 * transcription, producing `code=null`, `value_current=null`, `value_prior=null`
 * while the actual numbers remain embedded as trailing text inside `label`.
 *
 * Root cause (architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md §2,§5 W2):
 * `parseRefinedMarkdown`'s 2-cell parse branch is NOT the defect — it correctly
 * parses whatever cells it receives (proven: 0 corrupted rows on VCB's 57 rows
 * and FPT's 145 rows via the SAME code path). The defect is in the SOURCE
 * markdown text: the refine subagent failed to column-split some rows into
 * separate pipe-table cells, instead emitting a single merged cell like
 * `| I. Tiền gửi tại NHNN 21.355.164 35.225.543 | - |`.
 *
 * This pass detects that exact corruption SHAPE structurally (Roman-numeral/
 * section anchor + trailing VN-formatted numeric tokens) and splits it back
 * into (code, clean_label, value_current, value_prior) — generic across ANY
 * bank ticker, NOT a per-ticker allowlist, NOT a date literal.
 *
 * RISK-1 (lossy-heuristic risk — see architecture brief §6): this pass MUST
 * be conservative. It ONLY touches rows that are structurally certain to be
 * corrupted (code === null AND value_current === null AND value_prior ===
 * null AND an anchored Roman/section label prefix is present). Any row that
 * already carries a code or a parsed value is left byte-identical — repair
 * never overwrites real data.
 *
 * CORRECTION (FIX-BCTC-BANK-BS-COLUMN-ORDER, architecture brief
 * docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md §2): the
 * claim below — that the "Tổng tài sản" grand-total row is absent from the
 * source markdown entirely — is DISPROVEN. That 2026-07-01 SPIKE queried
 * only `bctc_table_rows` (post-parse) and `bctc_md_tables`, never
 * `bctc_refined_units.markdown` (pre-parse) directly. Read verbatim, the
 * row exists, correctly labeled and valued ("**TỔNG TÀI SẢN CÓ** | |
 * **2,924,176,928** | **2,767,699,300** |", confirmed live for CTG
 * 2026-Q1). The real defect was a DIFFERENT bug: the parser's 4+-column
 * branch assumed a fixed code-first cell order that does not hold for bank
 * Mẫu B02a/TCTDHN forms (label-first), which dropped this exact row via
 * the "empty label" guard before it ever reached the array W2's
 * `repairCorruptedRows` operates on. Fixed by `resolveColumnLayout()` in
 * refinedMarkdownParser.ts (see FIX-BCTC-BANK-BS-COLUMN-ORDER comments
 * there) — this pass (W2) remains a real, separate, and still-necessary
 * fix for its own distinct corruption signature (merged-cell rows); it was
 * never capable of recovering the grand-total row, but that is because the
 * row never survived long enough to reach it, not because it was absent
 * from the source.
 *
 * @module application/utils/bctcRowRepair
 */

import type { BctcTableRow } from "./refinedMarkdownParser.js";

// ── Corruption-signature patterns ──────────────────────────────────────────

/**
 * Anchored Roman-numeral/section label prefix.
 *
 * Reuses bctcFormType.ts's ROMAN_SECTION vocabulary (I..XIII, optional
 * decimal sub-item e.g. "I.1"), but anchored as a LABEL TEXT PREFIX
 * (followed by "." and/or whitespace, then the rest of the label) rather
 * than a full-string `code` column match — the two patterns describe the
 * same Roman-numeral set in different corruption contexts.
 *
 * Longest-alternative-first ordering (XIII before XII before ... before I)
 * is mandatory so e.g. "II." is not short-circuit-matched as "I" + stray ".".
 */
const LABEL_SECTION_PREFIX =
  /^(XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)(\.\d+)?[.\s]+(.+)$/;

/**
 * One VN-formatted numeric token: optional parenthesis/minus negative,
 * 1-3 leading digits, zero or more ".ddd" thousand-separator groups,
 * optional ",dd" decimal-comma suffix, optional closing parenthesis.
 */
const VN_NUMBER_TOKEN_SOURCE =
  "\\(?-?\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?\\)?";

/** Same token, anchored to the end of the (remaining) string. */
const TRAILING_VN_NUMBER = new RegExp(`(${VN_NUMBER_TOKEN_SOURCE})\\s*$`);

/** Minimum digit count for a trailing match to count as a real number token
 *  (not a stray 1-2 digit footnote/ordinal accidentally at the end). */
const MIN_TOKEN_DIGITS = 3;

/**
 * Attempt to repair one row. Returns the ORIGINAL row object unchanged
 * (same reference) whenever the corruption signature does not match —
 * this is the RISK-1 non-lossy guard: no partial/speculative rewrites.
 */
function repairRow(
  row: BctcTableRow,
  parseNumber: (raw: string) => number | null,
): BctcTableRow {
  // Signature gate — ONLY rows that are structurally certain to be
  // corrupted (no code, no parsed values at all) are eligible. A row that
  // already has a code or a parsed value is left completely untouched.
  if (row.code !== null || row.value_current !== null || row.value_prior !== null) {
    return row;
  }

  const prefixMatch = LABEL_SECTION_PREFIX.exec(row.label);
  if (!prefixMatch) return row;

  const sectionCode = prefixMatch[1]! + (prefixMatch[2] ?? "");
  let remaining = prefixMatch[3]!.trim();
  if (!remaining) return row;

  // Peel off up to 2 trailing VN-number tokens (current, then prior),
  // scanning right-to-left. Stop as soon as a candidate is too short to
  // count as a real number (footnote-guard) or no more tokens are found.
  const trailingTokens: string[] = [];
  for (let i = 0; i < 2; i++) {
    const m = TRAILING_VN_NUMBER.exec(remaining);
    if (!m) break;
    const digitsOnly = m[1]!.replace(/[^0-9]/g, "");
    if (digitsOnly.length < MIN_TOKEN_DIGITS) break;
    trailingTokens.unshift(m[1]!);
    remaining = remaining.slice(0, m.index).trim();
  }

  // No recoverable numeric token → not the corruption this pass targets.
  if (trailingTokens.length === 0) return row;

  // If stripping the numbers left no descriptive text at all, bail out
  // rather than emit a row with an empty label — non-lossy fallback.
  if (!remaining) return row;

  const valueCurrent = parseNumber(trailingTokens[0]!);
  const valuePrior =
    trailingTokens.length >= 2 ? parseNumber(trailingTokens[1]!) : null;

  return {
    ...row,
    code: sectionCode,
    label: remaining,
    value_current: valueCurrent,
    value_prior: valuePrior,
    period_prior: valuePrior !== null ? (row.period_prior ?? "prior") : row.period_prior,
    // code is now populated → this can never be a code-null summary row.
    is_summary_row: 0,
  };
}

/**
 * repairCorruptedRows — apply the corruption-signature repair pass to a
 * full row set. Pure, deterministic, no I/O. Rows that do not match the
 * exact corruption signature pass through completely unchanged (same
 * object reference) — this is the RISK-1 "not lossy" guarantee.
 *
 * @param rows         Rows produced by parseRefinedMarkdown's cell-split pass.
 * @param parseNumber  VN-number parser (pass `parseVnNumber` from
 *                     refinedMarkdownParser.ts — injected to avoid a
 *                     circular module import between the two files).
 */
export function repairCorruptedRows(
  rows: BctcTableRow[],
  parseNumber: (raw: string) => number | null,
): BctcTableRow[] {
  return rows.map((row) => repairRow(row, parseNumber));
}
