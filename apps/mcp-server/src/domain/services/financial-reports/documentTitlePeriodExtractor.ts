/**
 * FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST
 *
 * Root cause (full analysis on the task_board row / architect brief
 * docs/architecture-briefs/2026-08-05-fix-bctc-ssc-doc-selection-quarter-blind.md):
 * `listSscDocuments()` (infrastructure/fetchers/ssc.ts) has no quarter
 * parameter — for a given (ticker, year) every quarter request lists the
 * SAME documents — and `fetchParseAndStoreBctc.ts` Step 1 took `docs[0]`
 * unconditionally, silently returning whichever document the portal happened
 * to list first.
 *
 * This module is the selection signal: a pure, zero-I/O domain function that
 * parses (year, quarter) out of an `SscDocument.title` string. Deliberately
 * much simpler than the content-based `periodContentExtractor.ts` sibling —
 * title text is clean DOM text scraped from the portal, not OCR output, so
 * no multi-signal corroboration / MIN_SIGNAL_COUNT plurality logic is needed
 * here. `titleMatchesReportType()` (sscCommon.ts) already proves titles carry
 * "quý N năm YYYY" markers today; the regexes below cover every live
 * fixture-title shape found across the SSC/HOSE/HNX/UPCOM fetchers:
 *   "Báo cáo tài chính quý 1/2025 — VCB"      (digit quarter, slash year)
 *   "Báo cáo tài chính quý 1 năm 2025 - VCB"  (digit quarter, "năm" year)
 *   "BCTC Quý I 2025 - VCB"                   (roman-numeral quarter)
 *   "BCTC Q1 2024"                            (abbreviated "Q1" form)
 *
 * Conservative-by-design: both halves (quarter AND year) must resolve or this
 * returns `null` — never guesses one half from the other (mirrors
 * periodContentExtractor.ts's rule of the same name).
 *
 * Domain layer — pure function, zero I/O. Depends on nothing but the input string.
 */

export interface TitlePeriodSignal {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

// Vietnamese "quý N" / "quý I".."quý IV" — both digit and roman-numeral forms
// appear in live portal titles (see module doc comment above).
const QUY_QUARTER_REGEX = /qu[ýy]\s*(?:số)?\s*(I{1,3}V?|[1-4])\b/i;
// Abbreviated "Q1".."Q4" form (e.g. HOSE title "BCTC Q1 2024").
const Q_ABBR_QUARTER_REGEX = /\bQ([1-4])\b/i;

const ROMAN_QUARTER: Readonly<Record<string, 1 | 2 | 3 | 4>> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
};

// Year: prefer the one immediately following "năm" (Vietnamese "year"); fall
// back to any bare 20xx token in the title (live titles carry exactly one).
const YEAR_NEAR_NAM_REGEX = /n[ăa]m\s*(20\d{2})/i;
const YEAR_BARE_REGEX = /(20\d{2})/;

function parseQuarterToken(raw: string): 1 | 2 | 3 | 4 | null {
  const roman = ROMAN_QUARTER[raw.toUpperCase()];
  if (roman !== undefined) return roman;
  const digit = Number(raw);
  return digit >= 1 && digit <= 4 ? (digit as 1 | 2 | 3 | 4) : null;
}

/**
 * Parses (year, quarter) out of an `SscDocument.title` string.
 *
 * @param title - Document title as scraped from the SSC/HOSE/HNX/UPCOM portal.
 * @returns `{ year, quarter }` when both halves resolve, else `null`.
 */
export function extractPeriodFromTitle(title: string): TitlePeriodSignal | null {
  if (!title) return null;

  const quarterMatch = title.match(QUY_QUARTER_REGEX) ?? title.match(Q_ABBR_QUARTER_REGEX);
  if (!quarterMatch?.[1]) return null;
  const quarter = parseQuarterToken(quarterMatch[1]);
  if (quarter === null) return null;

  const yearMatch = title.match(YEAR_NEAR_NAM_REGEX) ?? title.match(YEAR_BARE_REGEX);
  if (!yearMatch?.[1]) return null;
  const year = Number(yearMatch[1]);

  return { year, quarter };
}
