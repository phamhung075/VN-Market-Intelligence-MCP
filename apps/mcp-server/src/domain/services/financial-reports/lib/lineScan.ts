/**
 * lineScan.ts — Canonical shared line-scanning + scaling primitives for the
 * BCTC extractor family (balanceSheetExtractor / cashFlowExtractor /
 * incomeStatementExtractor) and bctcScalarAggregator.
 *
 * FACTORY-DOMAIN-extract-bctc-parsing-lib (2026-07-08 audit finding —
 * docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md):
 * findValue was re-implemented 3× (balanceSheet 2-arg, income/cashFlow 4-arg),
 * applyMultiplier was copy-pasted (balanceSheet + cashFlow), and
 * bctcScalarAggregator carried its own detectDivisor. This module is the
 * single source of truth for all four.
 *
 * RECONCILIATION NOTE (findValue):
 * balanceSheetExtractor's original 2-arg findValue(lines, pattern) and
 * income/cashFlow's original 4-arg findValue(primaryLines, fallbackLines,
 * primary, fallback) were NOT the same function — balanceSheet had a
 * row-code guard (skip whole-multiples-of-10 in [10,990] — see
 * VAS_ROW_CODE_MIN/MAX/STEP below, BCTC item-code artifacts) with no
 * ASCII-fallback pass; income/cashFlow had an ASCII
 * diacritic-stripped fallback pass with no row-code guard. The canonical
 * findValue below takes both behaviors as OPT-IN options so each call site
 * reproduces its pre-migration behavior exactly (see per-extractor migration
 * commits + decision journal for the byte-for-byte equivalence argument).
 *
 * Domain layer — pure functions, zero I/O.
 * Only allowed external import: extractNumber/LOOKAHEAD_LINES from the
 * sibling extractorHelpers.ts (JANITOR-014a canonical helpers).
 */

import { LOOKAHEAD_LINES, extractNumber } from "../extractorHelpers.js";

// ---------------------------------------------------------------------------
// VAS row-code guard bounds (FACTORY-DOMAIN-name-bctc-cascade-magic-numbers)
// ---------------------------------------------------------------------------

/**
 * VAS_ROW_CODE_MIN / VAS_ROW_CODE_MAX — VAS (Vietnamese Accounting Standard)
 * BCTC statement item codes live in this numeric range (e.g. "10"=net_revenue,
 * "100"=current_assets, "270"=long-term-other-assets-subtotal,
 * "440"=total-capital-sources). A scanned candidate number that is a whole
 * multiple of `VAS_ROW_CODE_STEP` inside [VAS_ROW_CODE_MIN, VAS_ROW_CODE_MAX]
 * is almost always a stray item-code digit-string picked up by the OCR/regex
 * scan, not a real financial value — the row-code guard skips it and keeps
 * scanning (see findValue's `rowCodeGuard` option and findValueByCode below).
 * Named separately from VAS_ROW_CODE_STEP even though both equal 10 — MIN is
 * the lower bound of the code range, STEP is the multiples-of increment;
 * they are distinct domain facts that happen to share a value.
 */
const VAS_ROW_CODE_MIN = 10;
const VAS_ROW_CODE_MAX = 990;
/** Item codes are issued in increments of 10 (e.g. 10, 20, ..., 440, ..., 990). */
const VAS_ROW_CODE_STEP = 10;

// ---------------------------------------------------------------------------
// findValue
// ---------------------------------------------------------------------------

export interface FindValueFallback {
  /** ASCII (diacritic-stripped) lines, tried only if the primary pass finds nothing. */
  lines: string[];
  /** ASCII pattern to test against `lines`. */
  pattern: RegExp;
}

export interface FindValueOptions {
  /**
   * BCTC row-code guard (balanceSheetExtractor origin): skip a candidate value
   * when it is a whole integer multiple of VAS_ROW_CODE_STEP in
   * [VAS_ROW_CODE_MIN, VAS_ROW_CODE_MAX] — these are BCTC item-code artifacts
   * (e.g. "100", "270"), not real financial values. When a guarded value is
   * hit, the scan CONTINUES (does not return 0 early).
   */
  rowCodeGuard?: boolean;
  /**
   * ASCII diacritic-stripped fallback (income/cashFlow origin): only tried
   * after the primary lines+pattern pass is fully exhausted without a match.
   */
  fallback?: FindValueFallback;
}

/**
 * Find the first line matching `pattern` and extract its number, with
 * optional row-code guard and optional ASCII-fallback pass.
 *
 * Look-ahead: when a matching line carries no extractable number, scans up
 * to LOOKAHEAD_LINES following lines (OCR PDFs frequently split label and
 * value across lines).
 *
 * Returns 0 if no match is found in either pass (missing fields default to 0).
 */
export function findValue(
  lines: string[],
  pattern: RegExp,
  opts: FindValueOptions = {},
): number {
  const { rowCodeGuard = false, fallback } = opts;

  const isGuarded = (val: number): boolean =>
    rowCodeGuard &&
    Number.isInteger(val) &&
    val >= VAS_ROW_CODE_MIN &&
    val <= VAS_ROW_CODE_MAX &&
    val % VAS_ROW_CODE_STEP === 0;

  const scan = (scanLines: string[], scanPattern: RegExp): number | null => {
    for (let i = 0; i < scanLines.length; i++) {
      if (scanPattern.test(scanLines[i]!)) {
        const val = extractNumber(scanLines[i]!);
        if (val !== null) {
          if (isGuarded(val)) continue;
          return val;
        }
        for (let j = 1; j <= LOOKAHEAD_LINES && i + j < scanLines.length; j++) {
          const ahead = extractNumber(scanLines[i + j]!);
          if (ahead === null) continue;
          if (isGuarded(ahead)) continue;
          return ahead;
        }
      }
    }
    return null;
  };

  const primaryResult = scan(lines, pattern);
  if (primaryResult !== null) return primaryResult;

  if (fallback) {
    const fallbackResult = scan(fallback.lines, fallback.pattern);
    if (fallbackResult !== null) return fallbackResult;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// findValueByCode
// ---------------------------------------------------------------------------

/**
 * Find a value by BCTC item code (balanceSheetExtractor origin — Task 1416b).
 *
 * FPT Q4-2025 OCR produces two forms of code-bearing lines:
 *
 *   Form A (code-prefix): the line STARTS with the code, followed by the
 *   value — e.g. "270 88.089.621.779.862". The label is on a separate line.
 *
 *   Form B (code-inline): the code appears mid-line after the label and
 *   Thuyết minh reference, followed by the current-period value — e.g.
 *   "TONG CỘNG NGUON VỐN (440=300+400) 440 88.089.621.779.862 71.999...".
 *   Only tried for grand-total codes (>= 270) to avoid false positives on
 *   sub-item codes.
 *
 * The row-code guard (skip whole multiples of VAS_ROW_CODE_STEP in
 * [VAS_ROW_CODE_MIN, VAS_ROW_CODE_MAX]) applies in both forms. Returns 0 if
 * no matching line is found.
 */
export function findValueByCode(lines: string[], code: number): number {
  const codeStr = String(code);
  // Form A: line starts with the code followed by a non-digit separator
  const prefixPattern = new RegExp(`^${codeStr}(?:\\s+|[^\\d])`, "");
  // (Form B's actual matcher is spaceCodePattern below. The original
  // balanceSheetExtractor.ts also declared an `inlinePattern` regex here that
  // was never referenced — dead code, dropped during the FACTORY-DOMAIN
  // relocation; Form B behavior is unchanged, still driven by spaceCodePattern.)

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Form A
    if (prefixPattern.test(trimmed)) {
      const rest = trimmed.slice(codeStr.length).trim();
      const val = extractNumber(rest);
      if (val === null) continue;
      if (
        Number.isInteger(val) &&
        val >= VAS_ROW_CODE_MIN &&
        val <= VAS_ROW_CODE_MAX &&
        val % VAS_ROW_CODE_STEP === 0
      ) continue;
      return val;
    }

    // Form B: only for 3-digit grand total codes to avoid false positives
    // (codes like 270, 300, 440 are unique enough; sub-item codes like 110
    // could match year fragments or other numbers).
    if (code >= 270) {
      const spaceCodePattern = new RegExp(`\\s${codeStr}\\s`);
      const match = spaceCodePattern.exec(trimmed);
      if (match) {
        const afterCode = trimmed.slice(match.index + match[0].length);
        const val = extractNumber(afterCode);
        if (val === null) continue;
        if (
          Number.isInteger(val) &&
          val >= VAS_ROW_CODE_MIN &&
          val <= VAS_ROW_CODE_MAX &&
          val % VAS_ROW_CODE_STEP === 0
        ) continue;
        return val;
      }
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// scaleNumericFields (canonical applyMultiplier)
// ---------------------------------------------------------------------------

/**
 * Recursively multiply every numeric leaf field of `obj` by `m`. Non-numeric,
 * non-object leaves (there are none in BalanceSheet/CashFlowStatement — both
 * are 100% numeric fields, verified against bctc-schema.ts) pass through
 * unchanged. When m === 1, returns the SAME object reference (no allocation),
 * matching both original applyMultiplier implementations' fast path.
 *
 * This is a pure generalisation of balanceSheetExtractor's and
 * cashFlowExtractor's hand-written, field-by-field applyMultiplier — every
 * leaf in both types is scaled unconditionally in the originals (no field is
 * ever skipped), so the recursive walk below is provably equivalent.
 *
 * NOT used for IncomeStatement: that extractor deliberately excludes
 * eps/dilutedEps from scaling (EPS is VND/share, not a scale-dependent
 * aggregate) via explicit per-field code — a generic recursive scaler would
 * incorrectly scale those two fields, so incomeStatementExtractor keeps its
 * inline per-field multiplication untouched.
 */
export function scaleNumericFields<T extends object>(obj: T, m: number): T {
  if (m === 1) return obj;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number") {
      result[key] = v * m;
    } else if (v !== null && typeof v === "object") {
      result[key] = scaleNumericFields(v as Record<string, unknown>, m);
    } else {
      result[key] = v;
    }
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// detectDivisor
// ---------------------------------------------------------------------------

export interface DivisorProbeRow {
  value_current: number | null;
}

/**
 * Detect the unit divisor from a row set's maximum absolute value
 * (bctcScalarAggregator origin — FU-6c).
 *
 * NOTE: this is distinct from the 3 extractors' own raw-OCR-text magnitude
 * inference blocks (balanceSheetExtractor/incomeStatementExtractor/
 * cashFlowExtractor each infer a multiplier from different probe fields and
 * different thresholds — 1e12/1e14/1e9 respectively — against extracted
 * statement values, not against a DB row set). Those three blocks are
 * deliberately NOT unified here — see decision journal
 * FACTORY-DOMAIN-extract-bctc-parsing-lib for the "reconciliation, not a
 * straight merge" rationale (same principle as the findValue split above).
 *
 * @param rows       Rows exposing `value_current` (AggregatorRow satisfies this structurally).
 * @param threshold  Absolute-value threshold above which values are raw VND (default 1e11).
 * @returns 1_000_000 when values are raw VND, 1 when already in million VND.
 */
export function detectDivisor(rows: DivisorProbeRow[], threshold = 1e11): number {
  let maxAbs = 0;
  for (const row of rows) {
    if (row.value_current !== null) {
      const abs = Math.abs(row.value_current);
      if (abs > maxAbs) maxAbs = abs;
    }
  }
  return maxAbs > threshold ? 1_000_000 : 1;
}
