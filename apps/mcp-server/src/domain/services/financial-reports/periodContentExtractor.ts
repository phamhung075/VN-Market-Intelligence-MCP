/**
 * FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT
 *
 * Root cause (po/triage-20260725T1649, full analysis on the task_board row):
 * `financial_reports.period_year` / `period_quarter` (and therefore `sort_key`,
 * the `(action_code, sort_key)` conflict-target identity) come ENTIRELY from a
 * caller-supplied `FiscalPeriod` — never from the document itself. A caller
 * that supplies a wrong period (VPS pusher associated the wrong SSC listing
 * URL with a backfill target — see docs/data/orch/orch-state.json's `note`
 * field for the concrete DPM 5b0dad71 instance) silently occupies the slot
 * the CORRECT filing for that period would need, with no defense anywhere in
 * the pipeline. Class parallel: memory lesson
 * feedback_pressure_state_caller_supplied_fields_dead_server_computed_live
 * (UC-CDC-P1) — compute the correct value server-side at the boundary, gate
 * the caller override.
 *
 * This module is the "compute server-side" half of that remedy: a pure,
 * zero-I/O domain function that scans a BCTC PDF's extracted raw text for the
 * quarter-boundary dates every VAS financial statement states repeatedly
 * (balance sheet "Tại ngày ..." as-of date; income/cash-flow "Từ ngày ... đến
 * ngày ..." period-covered range) and derives the (year, quarter) the
 * DOCUMENT itself claims to cover.
 *
 * Real-world OCR/font-corruption tolerance (verified against the actual
 * report_id=5b0dad71-3b05-4455-9823-c2072442777d PDF, whose pdf-parse
 * extraction is badly mangled by an embedded-font ToUnicode-CMap defect —
 * e.g. "Tqi ngity 31 thing 03 nbn 2026" for "Tại ngày 31 tháng 03 năm 2026"):
 * Vietnamese diacritic-bearing letters are frequently misdecoded to random
 * glyphs/digits by this class of PDF, but the DIGITS and short ASCII word
 * stems ("ng", "th", "n") survive intact far more reliably. The regexes below
 * anchor on those stems + digit groups rather than exact diacritics, so the
 * signal still resolves even on this corrupted real-world document (verified:
 * the boundary pair day=31/month=3/year=2026 — i.e. Q1-2026 — is the clear
 * plurality match against that PDF's real extracted text).
 *
 * Conservative-by-design (STRONG CAUTION in the task row against a naive
 * content-derivation that itself becomes unreliable on poor-OCR filings):
 *   - Only EXACT quarter-boundary (day, month) pairs count as a signal at all
 *     (1/1, 31/3, 1/4, 30/6, 1/7, 30/9, 1/10, 31/12) — a stray date elsewhere
 *     in the document (e.g. a signature date, an unrelated contract date)
 *     essentially never lands on one of these 8 exact pairs.
 *   - A (year, quarter) candidate only becomes a "signal" once it reaches
 *     MIN_SIGNAL_COUNT independent occurrences AND strictly dominates the
 *     runner-up. Below that bar this returns `null` — "cannot determine" —
 *     which the caller (parseBctcReport.ts) must treat as INDISTINGUISHABLE
 *     from a correctly-labelled filing (AC-3 negative control: a filing too
 *     poor to extract a period from must still ingest normally, using the
 *     caller-supplied key, exactly as today).
 *   - Annual reports (FiscalPeriod.quarter === null) are out of scope — the
 *     day=31/month=12 boundary is ambiguous between "Q4" and "ANNUAL end",
 *     and disambiguating that is not needed for this fix (see
 *     checkPeriodContentConsistency doc comment).
 *
 * Domain layer — pure function, zero I/O. Depends on nothing but the input string.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Quarter-boundary date table
// ─────────────────────────────────────────────────────────────────────────────

interface QuarterBoundary {
  quarter: 1 | 2 | 3 | 4;
  day: number;
  month: number;
}

/** Start-of-quarter and end-of-quarter calendar dates. All 8 (day, month) pairs are distinct. */
const QUARTER_BOUNDARIES: readonly QuarterBoundary[] = [
  { quarter: 1, day: 1, month: 1 },
  { quarter: 1, day: 31, month: 3 },
  { quarter: 2, day: 1, month: 4 },
  { quarter: 2, day: 30, month: 6 },
  { quarter: 3, day: 1, month: 7 },
  { quarter: 3, day: 30, month: 9 },
  { quarter: 4, day: 1, month: 10 },
  { quarter: 4, day: 31, month: 12 },
];

function findBoundaryQuarter(day: number, month: number): 1 | 2 | 3 | 4 | null {
  const hit = QUARTER_BOUNDARIES.find((b) => b.day === day && b.month === month);
  return hit ? hit.quarter : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date-pattern regexes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "ngày DD tháng MM năm YYYY" — tolerant of Vietnamese-diacritic OCR/font
 * corruption: matches on the short ASCII stems "ng"/"th"/"n" + a bounded
 * run of non-digit filler, never on the accented letters themselves.
 */
const RE_NGAY_THANG_NAM =
  /ng\S{0,6}\s*(\d{1,2})\D{1,25}th\S{0,6}\s*(\d{1,2})\D{1,25}n\S{0,6}\s*(20\d{2})/gi;

/** "DD/MM/YYYY" — clean slash-delimited date, common in cleaner-OCR / refined text. */
const RE_SLASH_DATE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})\b/g;

/** Minimum independent occurrences of the SAME (year, quarter) boundary before it counts as a signal. */
const MIN_SIGNAL_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentPeriodSignal {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** Occurrences of the winning (year, quarter) boundary pair. */
  matchCount: number;
  /** Occurrences of the next most-frequent (year, quarter) candidate (0 if none). */
  runnerUpCount: number;
}

/**
 * Scan `rawText` for repeated quarter-boundary date statements and return the
 * (year, quarter) the document's own text claims to cover, or `null` when no
 * candidate reaches MIN_SIGNAL_COUNT with a clear plurality (poor OCR / no
 * boundary dates present / genuinely ambiguous text — always resolves to
 * "cannot determine", never a guess).
 */
export function extractPeriodFromContent(rawText: string): ContentPeriodSignal | null {
  const tally = new Map<string, { year: number; quarter: 1 | 2 | 3 | 4; count: number }>();

  const record = (dayStr: string, monthStr: string, yearStr: string): void => {
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return;
    if (year < 2000 || year > 2099) return;
    const quarter = findBoundaryQuarter(day, month);
    if (quarter === null) return;
    const key = `${year}-Q${quarter}`;
    const existing = tally.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      tally.set(key, { year, quarter, count: 1 });
    }
  };

  for (const re of [RE_NGAY_THANG_NAM, RE_SLASH_DATE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      record(m[1]!, m[2]!, m[3]!);
    }
  }

  if (tally.size === 0) return null;

  const ranked = [...tally.values()].sort((a, b) => b.count - a.count);
  const top = ranked[0]!;
  const runnerUp = ranked[1];
  const runnerUpCount = runnerUp?.count ?? 0;

  if (top.count < MIN_SIGNAL_COUNT) return null;
  if (runnerUp && runnerUp.count >= top.count) return null; // no clear plurality — inconclusive

  return { year: top.year, quarter: top.quarter, matchCount: top.count, runnerUpCount };
}

export interface PeriodConsistencyResult {
  consistent: boolean;
  suppliedYear: number;
  suppliedQuarter: 1 | 2 | 3 | 4 | null;
  contentSignal: ContentPeriodSignal | null;
}

/**
 * Compare a caller-supplied (year, quarter) against what the document content
 * itself indicates. `consistent: false` is returned ONLY when the content
 * produced a confident signal (see extractPeriodFromContent) that disagrees
 * with the supplied period — this is the one case parseBctcReport.ts must
 * reject/quarantine rather than write.
 *
 * Annual reports (suppliedQuarter === null) are out of scope (see module doc
 * comment) — always reported consistent, content check skipped entirely.
 */
export function checkPeriodContentConsistency(
  rawText: string,
  suppliedYear: number,
  suppliedQuarter: 1 | 2 | 3 | 4 | null,
): PeriodConsistencyResult {
  if (suppliedQuarter === null) {
    return { consistent: true, suppliedYear, suppliedQuarter, contentSignal: null };
  }

  const contentSignal = extractPeriodFromContent(rawText);
  if (contentSignal === null) {
    // Cannot determine from content — AC-3 negative control: proceed normally.
    return { consistent: true, suppliedYear, suppliedQuarter, contentSignal: null };
  }

  const consistent = contentSignal.year === suppliedYear && contentSignal.quarter === suppliedQuarter;
  return { consistent, suppliedYear, suppliedQuarter, contentSignal };
}

/**
 * Thrown by parseBctcReport.ts when checkPeriodContentConsistency finds a
 * confident content-derived period that contradicts the caller-supplied key.
 * The report is NEVER written under either period — this is a hard refusal,
 * not a fallback to one side or the other (see module doc comment / task row
 * "STRONG CAUTION AGAINST NAIVE [b]").
 */
export class BctcPeriodContentMismatchError extends Error {
  constructor(
    public readonly actionCode: string,
    public readonly suppliedSortKey: string,
    public readonly contentSignal: ContentPeriodSignal,
  ) {
    super(
      `[BCTC] Period mismatch for ${actionCode}: supplied period is ${suppliedSortKey}, but document ` +
        `content indicates ${contentSignal.year}-Q${contentSignal.quarter} ` +
        `(${contentSignal.matchCount} matching boundary-date occurrences vs ${contentSignal.runnerUpCount} runner-up). ` +
        `Refusing to store — quarantined under NEITHER period key.`,
    );
    this.name = "BctcPeriodContentMismatchError";
  }
}
