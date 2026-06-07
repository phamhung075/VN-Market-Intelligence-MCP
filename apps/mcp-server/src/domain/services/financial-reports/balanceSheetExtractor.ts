/**
 * Balance Sheet Extractor — Task 042 (extended by Task 287, Task 1120)
 *
 * Parses raw Vietnamese BCTC text and returns a typed BalanceSheet object.
 *
 * Task 287 additions:
 *   - NFC normalization before line splitting (FR-3 partial)
 *   - detectUnitMultiplier: detects "Triệu đồng" vs "Tỷ đồng" header (FR-1)
 *   - applyMultiplier: scales all monetary fields by detected multiplier (FR-1)
 *   - Row-code guard in findValue: skips multiples-of-10 in [10, 990] (FR-2)
 *
 * Task 1120 additions:
 *   - parseSplitBlockBalanceSheet: handles consolidated PDFs where all labels
 *     appear in one block and all values appear 60+ lines later (VNM format)
 *   - Per-page detection: splits at "31/12/2025 VND" header, extracts ordered
 *     item codes from the labels block and maps to ordered values from the
 *     value block by position
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "../vnNumberParser.js";
import { guardBalanceSheet } from "./extractorGuards.js";
import { LOOKAHEAD_LINES, extractNumber, detectUnitMultiplier } from "./extractorHelpers.js";
import type {
  BalanceSheet,
  CurrentAssets,
  NonCurrentAssets,
  CurrentLiabilities,
  LongTermLiabilities,
  Equity,
} from "../../../../bctc-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Case-insensitive check if a line contains a keyword pattern.
 * Uses Vietnamese diacritics-aware matching.
 */
function lineMatches(line: string, pattern: RegExp): boolean {
  return pattern.test(line);
}

/**
 * Find the first line matching a pattern and extract its number.
 * Returns 0 if not found (missing fields default to 0).
 *
 * Task 287 — FR-2: Row-code guard.
 * If the extracted value is a whole integer multiple of 10 in [10, 990],
 * it is treated as a BCTC row-code artifact (e.g. 100, 110, 270) and the
 * scan continues to the next matching line.
 *
 * Task 1114: Look-ahead for OCR text where numbers appear on separate lines.
 */

/**
 * Find a value by BCTC item code.
 *
 * Task 1416b: FPT Q4-2025 OCR produces two forms of code-bearing lines:
 *
 *   Form A (code-prefix): the line STARTS with the code, followed by the
 *   value — e.g. "270 88.089.621.779.862". The label is on a separate line.
 *
 *   Form B (code-inline): the code appears mid-line after the label and
 *   Thuyết minh reference, followed by the current-period value and
 *   (optionally) the prior-period value — e.g.
 *   "TONG CỘNG NGUON VỐN (440=300+400) 440 88.089.621.779.862 71.999..."
 *   or "D. VỐN CHỦ SỞ HỮU 400 43.751.466.292.590 35.727..."
 *   These lines are matched even when findValue fails due to uppercase
 *   Vietnamese diacritics not being covered by the /i flag.
 *
 * Strategy:
 *   1. Try Form A: line starts with "<code><non-digit>".
 *   2. Try Form B: line contains " <code> " (space-delimited) followed
 *      by a large number; the code must be preceded by a non-digit.
 *
 * The row-code guard applies in both cases.
 * Returns 0 if no matching line is found.
 */
function findValueByCode(lines: string[], code: number): number {
  const codeStr = String(code);
  // Form A: line starts with the code followed by a non-digit separator
  const prefixPattern = new RegExp(`^${codeStr}(?:\\s+|[^\\d])`, "");
  // Form B: code appears mid-line, preceded and followed by non-digits
  const inlinePattern = new RegExp(`(?:^|\\D)${codeStr}(?:\\s+|[^\\d])`, "");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Form A
    if (prefixPattern.test(trimmed)) {
      const rest = trimmed.slice(codeStr.length).trim();
      const val = extractNumber(rest);
      if (val === null) continue;
      if (Number.isInteger(val) && val >= 10 && val <= 990 && val % 10 === 0) continue;
      return val;
    }

    // Form B: only for 3-digit grand total codes to avoid false positives
    // (codes like 270, 300, 440 are unique enough; sub-item codes like 110
    // could match year fragments or other numbers).
    // Match " <code> <value>" where the code is surrounded by whitespace.
    // e.g. "TONG CỘNG NGUON VỐN (440=300+400) 440 88.089.621.779.862 ..."
    //       → code token " 440 " → value is first large number after it
    if (code >= 270) {
      // Find the last occurrence of " <code> " (space-bounded) in the line
      const spaceCodePattern = new RegExp(`\\s${codeStr}\\s`);
      const match = spaceCodePattern.exec(trimmed);
      if (match) {
        const afterCode = trimmed.slice(match.index + match[0].length);
        const val = extractNumber(afterCode);
        if (val === null) continue;
        if (Number.isInteger(val) && val >= 10 && val <= 990 && val % 10 === 0) continue;
        return val;
      }
    }
  }
  return 0;
}

function findValue(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (lineMatches(lines[i]!, pattern)) {
      const val = extractNumber(lines[i]!);
      if (val !== null) {
        // Guard: skip row-code artifacts (multiples of 10 in [10, 990])
        if (Number.isInteger(val) && val >= 10 && val <= 990 && val % 10 === 0) continue;
        return val;
      }
      // Look-ahead: OCR may have numbers on next lines
      for (let j = 1; j <= LOOKAHEAD_LINES && i + j < lines.length; j++) {
        const ahead = extractNumber(lines[i + j]!);
        if (ahead === null) continue;
        if (Number.isInteger(ahead) && ahead >= 10 && ahead <= 990 && ahead % 10 === 0) continue;
        return ahead;
      }
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Task 287 — FR-1: Apply multiplier to all monetary fields
// ---------------------------------------------------------------------------

/**
 * Multiply every monetary leaf field in a BalanceSheet by the given multiplier.
 * When multiplier === 1, returns the same object unchanged (no allocation).
 *
 * NOTE: BalanceSheet has no EPS field, so no field needs to be skipped.
 *
 * @param bs - The extracted BalanceSheet (values in the declared unit).
 * @param m  - Multiplier from detectUnitMultiplier (1 or 1000).
 * @returns BalanceSheet with all values in triệu đồng.
 */
function applyMultiplier(bs: BalanceSheet, m: number): BalanceSheet {
  if (m === 1) return bs;

  return {
    currentAssets: {
      cash: bs.currentAssets.cash * m,
      shortTermInvestments: bs.currentAssets.shortTermInvestments * m,
      accountsReceivable: bs.currentAssets.accountsReceivable * m,
      inventory: bs.currentAssets.inventory * m,
      otherCurrentAssets: bs.currentAssets.otherCurrentAssets * m,
      total: bs.currentAssets.total * m,
    },
    nonCurrentAssets: {
      longTermReceivables: bs.nonCurrentAssets.longTermReceivables * m,
      fixedAssets: bs.nonCurrentAssets.fixedAssets * m,
      investmentProperty: bs.nonCurrentAssets.investmentProperty * m,
      longTermInvestments: bs.nonCurrentAssets.longTermInvestments * m,
      goodwill: bs.nonCurrentAssets.goodwill * m,
      otherLongTermAssets: bs.nonCurrentAssets.otherLongTermAssets * m,
      total: bs.nonCurrentAssets.total * m,
    },
    totalAssets: bs.totalAssets * m,
    currentLiabilities: {
      shortTermDebt: bs.currentLiabilities.shortTermDebt * m,
      accountsPayable: bs.currentLiabilities.accountsPayable * m,
      advancesFromCustomers: bs.currentLiabilities.advancesFromCustomers * m,
      taxPayable: bs.currentLiabilities.taxPayable * m,
      payablesToEmployees: bs.currentLiabilities.payablesToEmployees * m,
      otherCurrentLiabilities: bs.currentLiabilities.otherCurrentLiabilities * m,
      total: bs.currentLiabilities.total * m,
    },
    longTermLiabilities: {
      longTermDebt: bs.longTermLiabilities.longTermDebt * m,
      deferredTaxLiabilities: bs.longTermLiabilities.deferredTaxLiabilities * m,
      otherLongTermLiabilities: bs.longTermLiabilities.otherLongTermLiabilities * m,
      total: bs.longTermLiabilities.total * m,
    },
    totalLiabilities: bs.totalLiabilities * m,
    equity: {
      shareCapital: bs.equity.shareCapital * m,
      sharePremium: bs.equity.sharePremium * m,
      treasuryShares: bs.equity.treasuryShares * m,
      retainedEarnings: bs.equity.retainedEarnings * m,
      otherEquityFunds: bs.equity.otherEquityFunds * m,
      minorityInterest: bs.equity.minorityInterest * m,
      total: bs.equity.total * m,
    },
    totalLiabilitiesAndEquity: bs.totalLiabilitiesAndEquity * m,
  };
}

// ---------------------------------------------------------------------------
// Keyword patterns (case-insensitive, Vietnamese)
// ---------------------------------------------------------------------------

// Current assets
const P_CURRENT_ASSETS_TOTAL = /t[àa]i\s+s[ảa]n\s+ng[ắa]n\s+h[ạa]n/i;
const P_CASH = /ti[ềe]n\s+v[àa]\s+.*t[ưu][ơo]ng\s+[đd][ưu][ơo]ng/i;
const P_SHORT_TERM_INVESTMENTS = /[đd][ầa]u\s+t[ưu]\s+t[àa]i\s+ch[ía]nh\s+ng[ắa]n\s+h[ạa]n/i;
const P_ACCOUNTS_RECEIVABLE = /ph[ảa]i\s+thu\s+ng[ắa]n\s+h[ạa]n/i;
const P_INVENTORY = /h[àa]ng\s+t[ồo]n\s+kho/i;
const P_OTHER_CURRENT_ASSETS = /t[àa]i\s+s[ảa]n\s+ng[ắa]n\s+h[ạa]n\s+kh[áa]c/i;

// Non-current assets
const P_NON_CURRENT_ASSETS_TOTAL = /t[àa]i\s+s[ảa]n\s+d[àa]i\s+h[ạa]n/i;
const P_LONG_TERM_RECEIVABLES = /ph[ảa]i\s+thu\s+d[àa]i\s+h[ạa]n/i;
const P_FIXED_ASSETS = /t[àa]i\s+s[ảa]n\s+c[ốo]\s+[đd][ịi]nh/i;
const P_INVESTMENT_PROPERTY = /b[ấa]t\s+[đd][ộo]ng\s+s[ảa]n\s+[đd][ầa]u\s+t[ưu]/i;
const P_LONG_TERM_INVESTMENTS = /[đd][ầa]u\s+t[ưu]\s+t[àa]i\s+ch[ía]nh\s+d[àa]i\s+h[ạa]n/i;
const P_GOODWILL = /l[ợo]i\s+th[ếe]\s+th[ưu][ơo]ng\s+m[ạa]i/i;
const P_OTHER_LONG_TERM_ASSETS = /t[àa]i\s+s[ảa]n\s+d[àa]i\s+h[ạa]n\s+kh[áa]c/i;

// Total assets
const P_TOTAL_ASSETS = /t[ổo]ng\s+(?:c[ộo]ng\s+)?t[àa]i\s+s[ảa]n/i;

// Liabilities
const P_TOTAL_LIABILITIES = /n[ợo]\s+ph[ảa]i\s+tr[ảa]/i;
const P_CURRENT_LIABILITIES = /n[ợo]\s+ng[ắa]n\s+h[ạa]n/i;
// P_SHORT_TERM_DEBT: matches code 321 "Vay và nợ thuê tài chính ngắn hạn" (current VAS standard)
const P_SHORT_TERM_DEBT = /vay\s+v[àa]\s+n[ợo]\s+thu[êe]\s+t[àa]i\s+ch[ía]nh\s+ng[ắa]n\s+h[ạa]n/i;
// P_SHORT_TERM_DEBT_ALT: matches code 319 "Vay ngắn hạn" (older VAS layout, still used by some issuers).
// This label hint ensures we only pick up borrowings rows, NOT "Phải trả ngắn hạn khác" rows
// that also use code 319 on some issuers. (FIX-DE-4)
const P_SHORT_TERM_DEBT_ALT = /vay\s+ng[ắa]n\s+h[ạa]n/i;
const P_ACCOUNTS_PAYABLE = /ph[ảa]i\s+tr[ảa]\s+ng[ưu][ờo]i\s+b[áa]n\s+ng[ắa]n\s+h[ạa]n/i;
const P_ADVANCES_FROM_CUSTOMERS = /ng[ưu][ờo]i\s+mua\s+tr[ảa]\s+ti[ềe]n\s+tr[ưu][ớo]c/i;
const P_TAX_PAYABLE = /thu[ếe]\s+v[àa]\s+c[áa]c\s+kho[ảa]n\s+ph[ảa]i\s+n[ộo]p/i;
const P_PAYABLES_TO_EMPLOYEES = /ph[ảa]i\s+tr[ảa]\s+ng[ưu][ờo]i\s+lao\s+[đd][ộo]ng/i;
const P_OTHER_CURRENT_LIABILITIES = /n[ợo]\s+ng[ắa]n\s+h[ạa]n\s+kh[áa]c/i;

const P_LONG_TERM_LIABILITIES = /n[ợo]\s+d[àa]i\s+h[ạa]n/i;
const P_LONG_TERM_DEBT = /vay\s+v[àa]\s+n[ợo]\s+thu[êe]\s+t[àa]i\s+ch[ía]nh\s+d[àa]i\s+h[ạa]n/i;
const P_DEFERRED_TAX_LIABILITIES = /thu[ếe]\s+.*ho[ãa]n\s+l[ạa]i\s+ph[ảa]i\s+tr[ảa]/i;
const P_OTHER_LONG_TERM_LIABILITIES = /n[ợo]\s+d[àa]i\s+h[ạa]n\s+kh[áa]c/i;

// Equity
const P_EQUITY_TOTAL = /v[ốo]n\s+ch[ủu]\s+s[ởo]\s+h[ữu]u/i;
const P_SHARE_CAPITAL = /v[ốo]n\s+g[óo]p\s+c[ủu]a\s+ch[ủu]\s+s[ởo]\s+h[ữu]u/i;
const P_SHARE_PREMIUM = /th[ặa]ng\s+d[ưu]\s+v[ốo]n\s+c[ổo]\s+ph[ầa]n/i;
const P_TREASURY_SHARES = /c[ổo]\s+phi[ếe]u\s+qu[ỹy]/i;
const P_RETAINED_EARNINGS = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i/i;
const P_OTHER_EQUITY_FUNDS = /qu[ỹy]\s+kh[áa]c\s+thu[ộo]c\s+.*v[ốo]n\s+ch[ủu]\s+s[ởo]\s+h[ữu]u/i;
const P_MINORITY_INTEREST = /l[ợo]i\s+[ía]ch\s+c[ổo]\s+[đd][ôo]ng\s+kh[ôo]ng\s+ki[ểe]m\s+so[áa]t/i;

// Grand total liabilities + equity
const P_TOTAL_LIABILITIES_AND_EQUITY = /t[ổo]ng\s+(?:c[ộo]ng\s+)?ngu[ồo]n\s+v[ốo]n/i;

// ---------------------------------------------------------------------------
// Task 1120 — Split-block balance sheet parser
// ---------------------------------------------------------------------------

/**
 * Detects and parses a split-block balance sheet page.
 *
 * Split-block format: All labels appear first, then standalone item codes
 * (100–440 as standalone integers), then "Thuyết minh" notes, then a
 * date + unit header, then the actual monetary values in the same order
 * as the item codes.
 *
 * Three supported date/unit header formats:
 *   - VNM standalone: "31/12/2025" on its own line, "Triệu VND" on next line
 *   - VCB Q4 inline: "Thuyết 31/12/2025 31/12/2024" mid-line,
 *     "minh Triệu VND Triệu VND" on the next line (multi-column OCR header)
 *   - VCB Q1 page-pair: labels on one page, values on the next page;
 *     extractSplitBlockAll detects the labels-only page and concatenates
 *     the two pages before calling this function.
 *
 * Strategy:
 *   1. Find the date + unit separator using contains-based search (not anchored).
 *      Date: any line that contains \d{1,2}\/\d{1,2}\/20\d\d anywhere.
 *      Unit: the same line OR any of the next 5 lines contains "Triệu VND" or "VND".
 *      separatorIdx points to the line where the unit is confirmed.
 *   2. Require separator to be at least 20 lines in (confirms split-block)
 *   3. Extract ordered item codes from the labels block (standalone 2-3 digit
 *      integers in [100, 440] range, also detect inline codes like "(200 = ...)")
 *   4. Extract ordered large numbers from the value block
 *   5. Zip codes[i] → values[i] and return as a Record<string, number>
 *
 * Returns null if not split-block format (normal inline format should be used).
 */
function parseSplitBlockBalanceSheet(lines: string[]): Record<string, number> | null {
  // Step 1: Find the date + unit separator.
  // Contains-based: matches "31/12/2025" anywhere in a line (e.g., mid-column header).
  // This handles VCB Q4 where date and unit appear on the same OCR-merged line.
  const DATE_CONTAINS = /\d{1,2}\/\d{1,2}\/20\d\d/;
  // Contains-based: matches "Triệu VND" or bare "VND" (not preceded by / or digits
  // to avoid matching decree fractions like "93/2017/NĐ-CP").
  const UNIT_CONTAINS = /tri[eệ]u\s+VND|(?<![\/\d])VND(?!\d)/i;
  // FIX-BCTC-LIAB-PRIOR-PERIOD: collect ALL date+unit header positions and their
  // associated dates, then pick the one with the MOST RECENT date as the separator.
  //
  // Root cause: HPG parent-company ("Báo cáo tài chính riêng") OCR places the
  // PRIOR period date header (31/12/2024 or 01/01/2025) before the CURRENT period
  // header (31/12/2025) in the liabilities/equity section. The original first-match
  // strategy picked the prior-period separator, causing ALL liabilities codes to zip
  // against prior-period values (e.g. totalLiabilities = 1,012,889.94M instead of
  // correct 4,239,852.22M). Fix: prefer the separator whose parsed date is LATEST.
  //
  // Date sort key: YYYY * 10000 + MM * 100 + DD  (numeric, comparable, descending-safe)
  const DATE_PARSE = /(\d{1,2})\/(\d{1,2})\/(20\d\d)/;
  function dateSortKey(line: string): number {
    const m = DATE_PARSE.exec(line);
    if (!m) return 0;
    const dd = parseInt(m[1]!, 10);
    const mm = parseInt(m[2]!, 10);
    const yyyy = parseInt(m[3]!, 10);
    return yyyy * 10000 + mm * 100 + dd;
  }

  const candidates: Array<{ idx: number; sortKey: number }> = [];

  for (let i = 0; i < lines.length - 5; i++) {
    const line = lines[i]!;
    if (DATE_CONTAINS.test(line)) {
      const sortKey = dateSortKey(line);

      // Check if unit declaration is on the same line (VCB Q4 single-line header)
      if (UNIT_CONTAINS.test(line)) {
        candidates.push({ idx: i, sortKey });
        continue;
      }
      // Look for unit header within next 5 lines (VNM standalone two-line header)
      for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
        if (UNIT_CONTAINS.test(lines[j]!)) {
          candidates.push({ idx: j, sortKey });
          break;
        }
      }
    }
  }

  // Pick the candidate with the HIGHEST sort key (most recent date = current period).
  // When tied (same date), prefer the FIRST occurrence in text order.
  let separatorIdx = -1;
  if (candidates.length > 0) {
    let best = candidates[0]!;
    for (let k = 1; k < candidates.length; k++) {
      const c = candidates[k]!;
      if (c.sortKey > best.sortKey) {
        best = c;
      }
    }
    separatorIdx = best.idx;
  }

  // Step 1b: Fallback separator for VCB Q1 page-pair format.
  // When labels and values are on separate pages (no date+unit separator present),
  // the merged text contains a second "Báo cáo tình hình tài chính" line at the
  // page boundary. Use that as the separator if Step 1 found nothing.
  if (separatorIdx < 20) {
    const PAGE_BOUNDARY_PAT = /[Bb][aá]o\s+c[aá]o\s+t[iì]nh\s+h[iì]nh\s+t[aà]i\s+ch[ií]nh/;
    // The first occurrence is always at index 0 (page title). We need the second.
    let boundaryCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (PAGE_BOUNDARY_PAT.test(lines[i]!)) {
        boundaryCount++;
        if (boundaryCount === 2 && i >= 10) {
          separatorIdx = i;
          break;
        }
      }
    }
  }

  // Step 1c: FIX-BCTC-MAGNITUDE-NORMALIZE — unit-header-only separator.
  // PPC Q4-2025 pattern: the BS date is written in Vietnamese text
  // ("Tại ngày 31 tháng 12 năm 2025") rather than numeric form ("31/12/2025"),
  // so DATE_CONTAINS never fires. The column header row is the unit declaration
  // line "Bon vi: VND" (OCR-corrupted "Đơn vị: VND") followed by large monetary
  // values.
  //
  // Guard against income-statement false-positives: the label block (lines 0..i-1)
  // before the separator MUST contain a balance-sheet anchor label such as
  // "TỔNG CỘNG TÀI SẢN" or "TÀI SẢN NGẮN HẠN". Income statement sections
  // also begin with "Don vi: VND" but their label block contains "CHỈ TIÊU" /
  // "Doanh thu" — never the BS-specific labels below.
  if (separatorIdx < 10) {
    const UNIT_ONLY_PAT = /[đdĐD][oơoO]n\s+v[iị]\s*[:.]?\s*(VND|[đd][oồ]ng)|[Bb]on\s+vi\s*[:.]\s*VND/i;
    const LARGE_VALUE_PAT = /\d{1,3}\.\d{3}\.\d{3}/;
    const BS_LABEL_PAT = /[Tt][ổo]ng\s+c[ộo]ng\s+t[àa]i\s+s[ảa]n|[Tt][àa]i\s+s[ảa]n\s+ng[ắa]n\s+h[ạa]n|BANG\s+CAN\s+DOI|b[ảa]ng\s+c[âa]n\s+[đd][ốo]i/i;
    for (let i = 15; i < lines.length - 5; i++) {
      if (UNIT_ONLY_PAT.test(lines[i]!)) {
        // Guard 1: the label block before i must contain a BS-specific anchor.
        // Checks only labels before i to avoid checking the full (potentially
        // large) slice; slices up to i lines from the start of this page.
        const labelBlock = lines.slice(0, i);
        const hasBsLabels = labelBlock.some(l => BS_LABEL_PAT.test(l));
        if (!hasBsLabels) continue; // income-statement or other section — skip

        // Guard 2: within next 8 lines there must be large monetary values.
        let confirmed = false;
        for (let j = i + 1; j <= Math.min(i + 8, lines.length - 1); j++) {
          if (LARGE_VALUE_PAT.test(lines[j]!)) {
            confirmed = true;
            break;
          }
        }
        if (confirmed) {
          separatorIdx = i;
          console.warn("[parseSplitBlockBalanceSheet] Step 1c: unit-header-only separator at line", i);
          break;
        }
      }
    }
  }

  // Step 2: Require separator at position ��� 10 (relaxed for page-pair; usual threshold is 20)
  if (separatorIdx < 10) return null;

  const labelLines = lines.slice(0, separatorIdx);
  const valueLines = lines.slice(separatorIdx + 1);

  // Step 3: Extract all item codes from labels block, then sort numerically.
  //
  // Balance sheet item codes are 3-digit integers: 100-153 (current assets),
  // 200-260 (non-current), 270 (total assets), 300-337 (liabilities), 400-440 (equity)
  //
  // Two sources of codes:
  //   A) Standalone lines: a line whose entire content is a 3-digit integer
  //   B) Inline formula labels: "(200 = 210 + ...)" or "NỢ PHẢI TRẢ (300 = ...)"
  //
  // Sorting numerically produces the same order as the value block, because BCTC
  // item codes are assigned in document order (100 < 110 < 120 < ... < 270 < 300 < ... < 440).
  const codeSet = new Set<number>();

  for (const line of labelLines) {
    const trimmed = line.trim();

    // Standalone item code: line is ONLY the code (e.g. "100", "110", "270")
    if (/^\d{3}$/.test(trimmed)) {
      const code = parseInt(trimmed, 10);
      if (code >= 100 && code <= 440) {
        codeSet.add(code);
      }
      continue;
    }

    // Inline code in formula label: "(200 = 210 + ...)" or "(270 = 100 + 200)"
    // Also "NỢ PHẢI TRẢ (300 = ...)" etc.
    const inlineMatch = trimmed.match(/\((\d{3})\s*=/);
    if (inlineMatch) {
      const code = parseInt(inlineMatch[1]!, 10);
      if (code >= 100 && code <= 440) {
        codeSet.add(code);
      }
    }
  }

  // Step 3b: Banking-label fallback for VCB/bank BCTCs that use no item codes.
  // Vietnamese banking BCTCs (Mẫu B02a/TCTD-HN) omit the 100-440 code scheme.
  // When no codes are found, detect the three grand-total label lines and derive
  // codes 300/400/440 from the last three large numbers in the value block.
  //
  // Structure of VCB page 2 value block:
  //   - Single-column period-1 sub-items
  //   - A second-period date+unit header (31/12/2024 / Triệu VND)
  //   - Single-column period-2 sub-items
  //   - Two-column lines with BOTH periods' values (including the grand totals)
  // We must process the full value block (do NOT stop at the second period header)
  // and collect first-column values from every numeric line. The last 3 are the
  // total_liabilities, total_equity, and grand_total of the current period.
  if (codeSet.size === 0) {
    const hasBankLabels = labelLines.some(l => {
      const t = l.replace(/\s+/g, " ").toUpperCase();
      return /TONG\s*(NO|NỢ)\s*(PHAI|PHẢI)\s*(TRA|TRẢ)|TONG\s*(VON|VỐN)\s*(CHU|CHỦ)\s*(SO|SỞ)\s*(HUU|HỮU)/i.test(t);
    });
    if (!hasBankLabels) return null;

    // Collect first-column values from the full value block.
    // Skip prose lines (starting with a letter). For two-column lines
    // (e.g. "2.214.393.069 1.889.664.354") take only the first number.
    const bankValues: number[] = [];
    for (const line of valueLines) {
      const trimmed = line.trim();
      if (!trimmed || /^[A-Za-zÀ-ỹ\(\[]/.test(trimmed)) continue;
      // Take the first large number token on the line
      const firstToken = trimmed.match(/^\-?[\d.,]+/);
      if (!firstToken) continue;
      const cleaned = firstToken[0].replace(/\s+/g, "");
      const val = parseVnNumber(cleaned);
      if (val === null) continue;
      if (Number.isInteger(val) && Math.abs(val) <= 9999) continue;
      if (val >= 2020 && val <= 2030) continue;
      bankValues.push(val);
    }

    if (bankValues.length < 3) return null;

    // Find the accounting triple: grandTotal ≈ liabilities + equity (within 1%).
    // Strategy: the grand total is the largest value. Among the remaining values
    // (in document order), liabilities comes before equity and liabilities > equity
    // for Vietnamese banks. We search for the best-matching triple starting from
    // the largest value as candidate grand total.
    const sorted = [...bankValues].sort((a, b) => b - a);
    for (const grandTotal of sorted) {
      // Find a liabilities + equity pair that sums within 1% of grandTotal
      for (let i = 0; i < bankValues.length; i++) {
        const liab = bankValues[i]!;
        if (liab <= 0 || liab >= grandTotal) continue;
        for (let j = i + 1; j < bankValues.length; j++) {
          const eq = bankValues[j]!;
          if (eq <= 0 || eq >= grandTotal) continue;
          const sum = liab + eq;
          const mismatch = Math.abs(sum - grandTotal) / grandTotal;
          if (mismatch < 0.01 && liab > eq) {
            return { "270": grandTotal, "300": liab, "400": eq, "440": grandTotal };
          }
        }
      }
    }
    return null;
  }

  // Sort numerically — this matches the order values appear in the value block
  const codes = [...codeSet].sort((a, b) => a - b);

  // Step 4: Extract ordered large numbers from value block
  // Stop collecting when we hit the "1/1/2025 VND" second-period block
  const values: number[] = [];
  let hitSecondPeriod = false;

  for (const line of valueLines) {
    const trimmed = line.trim();

    // Stop at second period separator (e.g. 1/1/2025, 01/01/2025, 31/12/2024).
    // FIX-BCTC-LIAB-PRIOR-PERIOD: extended to match DD/MM/YYYY with optional leading zeros
    // (01/01/YYYY was not caught by the original /^1\/1\/20\d\d/ pattern).
    if (/^0?1\/0?1\/20\d\d/.test(trimmed) || /^31\/12\/20\d\d/.test(trimmed)) {
      hitSecondPeriod = true;
    }
    if (hitSecondPeriod) continue;

    // Extract large numbers (skip item codes and small values)
    const tokens = trimmed.match(/\(?\-?[\d.,]+\s*[\d.,]*\)?/g);
    if (!tokens) continue;

    for (const token of tokens) {
      // Clean the token: remove spaces within number (OCR artifact like "34.591.520.458 638")
      const cleaned = token.replace(/\s+/g, "");
      const val = parseVnNumber(cleaned);
      if (val === null) continue;

      // Skip small integers (item codes, V.x references)
      if (Number.isInteger(val) && Math.abs(val) <= 9999) continue;

      // Skip year-like numbers
      if (val >= 2020 && val <= 2030) continue;

      values.push(val);
    }
  }

  if (values.length === 0) return null;

  // Step 5: Zip codes[i] → values[i] by position
  // Note: there may be more values than codes (sub-items without separate codes)
  // The codes list has the MAJOR item codes; we map each to its first value.
  //
  // Key observation: the codes are in the SAME ORDER as the values.
  // Some codes (inline totals like 100, 200, 270) appear BEFORE the sub-item
  // codes, but their VALUES also appear before the sub-item values.
  // So position-based mapping is correct.

  const result: Record<string, number> = {};
  const limit = Math.min(codes.length, values.length);
  for (let i = 0; i < limit; i++) {
    const code = codes[i]!;
    const val = values[i]!;
    // Only store if not already present (first occurrence wins for duplicate codes)
    if (!(String(code) in result)) {
      result[String(code)] = val;
    }
  }

  // Validate: we need at least one plausible value (should be raw VND scale or triệu scale)
  const sampleVal = result["270"] ?? result["100"] ?? result["440"] ?? 0;
  if (sampleVal === 0) return null;

  return result;
}

/**
 * Split the full multi-page OCR text into individual pages, apply
 * parseSplitBlockBalanceSheet to each, and merge the results.
 *
 * Pages are identified by the repeated header pattern
 * "Báo cáo tình hình tài chính hợp nhất" which appears on each page.
 */
function extractSplitBlockAll(fullText: string): Record<string, number> | null {
  // Split on page boundaries (report title repeated on continuation pages)
  // or simply process the full text as a single pass, collecting multiple
  // "31/12/2025 VND" anchors (one per page)
  const pages: string[] = [];

  // Page split: split at "Báo cáo tình hình tài chính" OR "NGUON VON" lines
  // Both patterns indicate a new logical page/section of the balance sheet.
  // NGUON VON marks the liabilities+equity section which starts a new column group.
  const PAGE_BOUNDARY = /([Bb][aá]o\s+c[aá]o\s+t[iì]nh\s+h[iì]nh\s+t[aà]i\s+ch[ií]nh|NGUON\s+VON|NGU[ỒO]N\s+V[ỐO]N)/;
  const lines = fullText.split("\n");
  let pageStart = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (PAGE_BOUNDARY.test(line) && i > pageStart + 10) {
      pages.push(lines.slice(pageStart, i).join("\n"));
      pageStart = i;
    }
  }
  pages.push(lines.slice(pageStart).join("\n"));

  // Detect labels-only pages (have item codes 100–440, zero monetary values)
  // and merge them with the following page before parsing.
  // This handles VCB Q1 where labels and values are on physically separate pages
  // with no separator line between them.
  const mergedPages: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageLines = pages[i]!.split("\n");
    const hasItemCodes = pageLines.some(
      l => /^\s*(100|110|120|130|140|150|200|210|220|230|250|260|270|300|310|330|400|410|430|440)\s*$/.test(l)
        || /\(\d{3}\s*=/.test(l)
    );
    const hasMonetaryValues = pageLines.some(l => {
      const tokens = l.match(/[\d.,]{7,}/g); // 7+ char numeric token = at least 1,000,000
      return tokens !== null && tokens.length > 0;
    });
    if (hasItemCodes && !hasMonetaryValues && i + 1 < pages.length) {
      // Labels-only page: concatenate with the next page (page-pair strategy)
      mergedPages.push(pages[i]! + "\n" + pages[i + 1]!);
      i++; // skip next page — already consumed
    } else {
      mergedPages.push(pages[i]!);
    }
  }

  const merged: Record<string, number> = {};
  let foundAny = false;

  for (const pageText of mergedPages) {
    const pageLines = pageText.split("\n");
    const result = parseSplitBlockBalanceSheet(pageLines);
    if (result) {
      foundAny = true;
      // Merge: earlier pages take precedence (don't override existing keys)
      for (const [code, val] of Object.entries(result)) {
        if (!(code in merged)) {
          merged[code] = val;
        }
      }
    }
  }

  return foundAny ? merged : null;
}

// ---------------------------------------------------------------------------
// Task 1416b — Balance-sheet window detector
// ---------------------------------------------------------------------------

/**
 * Trim a multi-page OCR text to the balance-sheet section only.
 *
 * Prevents findValue from matching patterns in thuyết minh / subsidiary
 * tables that appear after the balance sheet in long consolidated PDFs.
 *
 * Returns the original array unchanged when no anchor is found (unknown
 * format — existing behaviour is preserved).
 *
 * Task 1416b: fixes FPT Q4-2025 where pages 42-46 (thuyết minh) shadowed
 * the correct total_assets value on page 5.
 */
function trimToBalanceSheetWindow(lines: string[]): string[] {
  const P_BS_ANCHOR =
    /[Mm][aẫâ][ụu]\s*[Ss][ốo]\s*B\s*0[12]|[Bb][áa]o\s+c[áa]o\s+t[iì]nh\s+h[iì]nh\s+t[àa]i\s+ch[ií]nh/i;
  const P_BS_END =
    /[Tt]huy[ếe]t\s+minh\s+(?:b[áa]o\s+c[áa]o|c[áa]c\s+ch[ỉi]\s+ti[eê]u)|[Bb][áa]o\s+c[áa]o\s+k[ếe]t\s+qu[ảa]|[Ll][ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+t[ệe]/i;
  const MIN_BS_LINES = 80;

  let windowStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (P_BS_ANCHOR.test(lines[i]!)) {
      windowStart = i;
      break;
    }
  }
  if (windowStart === -1) return lines; // unknown format — no change

  let windowEnd = -1;
  for (let i = windowStart + MIN_BS_LINES; i < lines.length; i++) {
    if (P_BS_END.test(lines[i]!)) {
      windowEnd = i;
      break;
    }
  }

  return windowEnd === -1
    ? lines.slice(windowStart)
    : lines.slice(windowStart, windowEnd);
}

/**
 * Extract a BalanceSheet from raw Vietnamese financial report text.
 *
 * Numbers are returned in triệu đồng (million VND). The function
 * automatically detects the declared unit in the PDF header and converts
 * tỷ đồng values to triệu đồng before returning (Task 287 — FR-1).
 *
 * Missing line items default to 0.
 */
export function extractBalanceSheet(rawText: string): BalanceSheet {
  // Task 287 — FR-3 partial: NFC normalization (resolves NFD decomposition artifacts)
  const normalized = rawText.normalize("NFC");
  // Task 1416b — scope findValue calls to the balance-sheet window only.
  // extractSplitBlockAll continues to receive the full text (handles its own
  // page-splitting internally).
  const allLines = normalized.split("\n");
  const lines = trimToBalanceSheetWindow(allLines);

  // Task 287 — FR-1: detect unit multiplier BEFORE any findValue calls
  const multiplier = detectUnitMultiplier(lines);

  // Task 1120 — split-block override: try to parse consolidated PDFs where
  // all labels appear in one block and all values appear 60+ lines later
  const sbMap = extractSplitBlockAll(normalized);
  // Helper: prefer split-block value if available, else fall back to findValue.
  // Task 1416b: when both fail (sbKey miss + findValue returns 0), try
  // findValueByCode as a tertiary strategy — handles FPT Q4-2025 OCR format
  // where the BCTC item code and value appear on the same line ("270 88.089…")
  // but the Vietnamese label is on a completely separate, non-adjacent line.
  //
  // Safety check: if sbMap returns a value for a key but findValueByCode returns
  // a value that is MORE THAN 10× larger, the sbMap value is likely from a
  // thuyết minh section (e.g. a prior-period or subsidiary value). In that case,
  // trust findValueByCode instead. This protects against FPT Q4-2025 page 3
  // where extractSplitBlockAll parses deep thuyết minh pages and returns
  // wrong values for codes like 440 that appear inline in those pages.
  const fv = (pattern: RegExp, sbKey?: string, codeNum?: number): number => {
    const fromLabel = findValue(lines, pattern);
    const fromCode = codeNum !== undefined ? findValueByCode(lines, codeNum) : 0;

    if (sbKey && sbMap && sbMap[sbKey] !== undefined) {
      const sbVal = sbMap[sbKey]!;
      // Cross-check: if a code-based lookup finds a value much larger than sbMap,
      // the sbMap value is suspect (likely from thuyết minh, not the balance sheet).
      const candidate = fromLabel !== 0 ? fromLabel : fromCode;
      if (candidate !== 0 && Math.abs(candidate) > Math.abs(sbVal) * 10) {
        // sbMap value is implausibly small — fall through to label/code result
      } else {
        return sbVal;
      }
    }

    if (fromLabel !== 0) return fromLabel;
    return fromCode;
  };

  // --- Current assets ---
  const currentAssets: CurrentAssets = {
    cash: fv(P_CASH, "110", 110),
    shortTermInvestments: fv(P_SHORT_TERM_INVESTMENTS, "120", 120),
    accountsReceivable: fv(P_ACCOUNTS_RECEIVABLE, "130", 130),
    inventory: fv(P_INVENTORY, "140", 140),
    otherCurrentAssets: fv(P_OTHER_CURRENT_ASSETS, "150", 150),
    total: fv(P_CURRENT_ASSETS_TOTAL, "100", 100),
  };

  // --- Non-current assets ---
  const nonCurrentAssets: NonCurrentAssets = {
    longTermReceivables: fv(P_LONG_TERM_RECEIVABLES, "210", 210),
    fixedAssets: fv(P_FIXED_ASSETS, "220", 220),
    investmentProperty: fv(P_INVESTMENT_PROPERTY, "230", 230),
    longTermInvestments: fv(P_LONG_TERM_INVESTMENTS, "250", 250),
    goodwill: fv(P_GOODWILL, "269", 269),
    otherLongTermAssets: fv(P_OTHER_LONG_TERM_ASSETS, "260", 260),
    total: fv(P_NON_CURRENT_ASSETS_TOTAL, "200", 200),
  };

  // --- Total assets ---
  let totalAssets = fv(P_TOTAL_ASSETS, "270", 270);
  // Fallback: compute from sub-totals if explicit total not found
  if (totalAssets === 0 && (currentAssets.total > 0 || nonCurrentAssets.total > 0)) {
    totalAssets = currentAssets.total + nonCurrentAssets.total;
  }

  // BCTC-1908c: Plausibility override — positional extraction drift on code 270.
  // When extractSplitBlockAll captures a sub-item value instead of the grand total,
  // computedFromSubtotals will be >> totalAssets (ratio > 5). Discard and recompute.
  const computedFromSubtotals = currentAssets.total + nonCurrentAssets.total;
  if (totalAssets > 0 && computedFromSubtotals > 0 && computedFromSubtotals / totalAssets > 5) {
    console.warn("[balanceSheetExtractor] BCTC-1908c: totalAssets positional drift detected; overriding with sub-total sum.");
    totalAssets = computedFromSubtotals;
  }

  // FIX-BCTC-MAGNITUDE-NORMALIZE — totalAssets from identity (path A).
  // BCTC identity: totalAssets ≡ totalLiabilitiesAndEquity (both sides of the
  // balance sheet must equal the same total). When the split-block extractor
  // pairs code 270 with a wrong value (e.g. prior-year value due to interleaved
  // columns), totalAssets disagrees with totalLiabilitiesAndEquity by >5%.
  // In that case, override totalAssets with the NGUỒN VỐN total (sources side),
  // which is more reliably extracted from the inline-format page 10.
  //
  // This fires for BOTH:
  //   - totalAssets === 0 (extraction failed)
  //   - totalAssets > 0 but disagrees with totalLiabilitiesAndEquity by >5%
  //     (split-block zip picked prior-year or wrong-row value)
  //
  // NOTE: totalLiabilitiesAndEquity is computed later at line ~860; this forward
  // read using fv is intentional and safe (fv is pure/deterministic).
  const totalSourcesSideFwd = fv(P_TOTAL_LIABILITIES_AND_EQUITY, "440", 440);
  if (totalSourcesSideFwd > 0) {
    const disagreement =
      totalAssets === 0 ||
      (Math.abs(totalAssets - totalSourcesSideFwd) / totalSourcesSideFwd > 0.05);
    if (disagreement) {
      console.warn(
        `[balanceSheetExtractor] FIX-BCTC-MAGNITUDE-NORMALIZE (path A): ` +
        `totalAssets(${totalAssets}) disagrees with sources-side(${totalSourcesSideFwd}); ` +
        `overriding with identity.`
      );
      totalAssets = totalSourcesSideFwd;
    }
  }

  // --- Current liabilities ---
  // FIX-DE-4: shortTermDebt — use code 321 (current VAS standard: "Vay và nợ thuê tài chính ngắn hạn")
  // as the primary lookup. Fall back to code 319 label-only via P_SHORT_TERM_DEBT_ALT ("Vay ngắn hạn")
  // for older VAS layouts (e.g. VNM).
  //
  // IMPORTANT: the code-319 fallback is label-only (no code number passed to fv). This is intentional —
  // code 319 is mapped to "Phải trả ngắn hạn khác" (other payables, NOT borrowings) on some issuers.
  // The label pattern P_SHORT_TERM_DEBT_ALT only matches lines containing "vay ngắn hạn", which excludes
  // those payables rows. Passing codeNum=319 to fv would defeat this guard (findValueByCode has no label
  // filter). Mirror of FIX-DE-1 /vay/i label-hint logic in bctcScalarAggregator.ts.
  //
  // Code 311 ("Phải trả người bán" — accounts payable) MUST NOT map to shortTermDebt.
  const shortTermDebt =
    fv(P_SHORT_TERM_DEBT, "321", 321) ||
    fv(P_SHORT_TERM_DEBT_ALT); // label-only fallback — no code number (safety: see note above)

  const currentLiabilities: CurrentLiabilities = {
    shortTermDebt,
    accountsPayable: fv(P_ACCOUNTS_PAYABLE, "311", 311),
    advancesFromCustomers: fv(P_ADVANCES_FROM_CUSTOMERS, "312", 312),
    taxPayable: fv(P_TAX_PAYABLE, "313", 313),
    payablesToEmployees: fv(P_PAYABLES_TO_EMPLOYEES, "314", 314),
    otherCurrentLiabilities: fv(P_OTHER_CURRENT_LIABILITIES, "319", 319),
    total: fv(P_CURRENT_LIABILITIES, "310", 310),
  };

  // --- Long-term liabilities ---
  // FIX-DE-4: longTermDebt — use code 339 (current VAS standard: "Vay và nợ thuê tài chính dài hạn")
  // as primary lookup. Fall back to code 334 ("Vay dài hạn") for older VAS layouts.
  // Mirror of FIX-DE-1 logic in bctcScalarAggregator.ts.
  const longTermDebt =
    fv(P_LONG_TERM_DEBT, "339", 339) ||
    fv(P_LONG_TERM_DEBT, "334", 334);

  const longTermLiabilities: LongTermLiabilities = {
    longTermDebt,
    deferredTaxLiabilities: fv(P_DEFERRED_TAX_LIABILITIES, "337", 337),
    otherLongTermLiabilities: fv(P_OTHER_LONG_TERM_LIABILITIES, "338", 338),
    total: fv(P_LONG_TERM_LIABILITIES, "330", 330),
  };

  // --- Total liabilities ---
  let totalLiabilities = fv(P_TOTAL_LIABILITIES, "300", 300);
  // If explicit total equals a sub-total (because regex matched the sub-total line first),
  // fall back to sum of current + long-term
  if (totalLiabilities === 0 && (currentLiabilities.total > 0 || longTermLiabilities.total > 0)) {
    totalLiabilities = currentLiabilities.total + longTermLiabilities.total;
  }

  // --- Equity ---
  const equity: Equity = {
    shareCapital: fv(P_SHARE_CAPITAL, "411", 411),
    sharePremium: fv(P_SHARE_PREMIUM, "412", 412),
    treasuryShares: fv(P_TREASURY_SHARES, "419", 419),
    retainedEarnings: fv(P_RETAINED_EARNINGS, "421", 421),
    otherEquityFunds: fv(P_OTHER_EQUITY_FUNDS, "418", 418),
    minorityInterest: fv(P_MINORITY_INTEREST, "429", 429),
    total: fv(P_EQUITY_TOTAL, "400", 400),
  };

  // --- Grand total ---
  const totalLiabilitiesAndEquity = fv(P_TOTAL_LIABILITIES_AND_EQUITY, "440", 440);

  // Task 1416b: final fallback for totalLiabilities when direct extraction fails
  // but both the grand total and equity total are known (e.g. FPT Q4-2025 where
  // the liabilities value block is interleaved in a column that findValue cannot
  // reach, but the grand total line is extractable inline).
  // Trigger when: totalLiabilities is zero OR implausibly small compared to
  // totalLiabilitiesAndEquity (ratio < 0.001 signals a bad match like "2").
  const liabPlausible =
    totalLiabilities > 0 &&
    totalLiabilitiesAndEquity > 0 &&
    totalLiabilities / totalLiabilitiesAndEquity >= 0.001;
  if (
    !liabPlausible &&
    totalLiabilitiesAndEquity > 0 &&
    equity.total > 0 &&
    totalLiabilitiesAndEquity > equity.total
  ) {
    totalLiabilities = totalLiabilitiesAndEquity - equity.total;
  }

  // FIX-BCTC-MAGNITUDE-NORMALIZE — totalAssets from identity (path B).
  // Derives totalAssets from BCTC identity (totalLiabilities + equity.total) when:
  //   (a) totalAssets === 0 (extraction completely failed), OR
  //   (b) totalAssets > 0 but diverges from identity by > 30% (split-block zip
  //       picked a wrong value, e.g. PPC Q4-2025: split-block code 270 paired
  //       with prior-year or non-grand-total value).
  //
  // PPC Q4-2025 scenario:
  //   totalLiabilities = 780,223,778,402 VND (inline code 300 on page 10)
  //   equity.total     = 4,466,380,796,968 VND (inline code 400 on page 10)
  //   sbMap["270"]     = 2,730,492,704,426 VND (wrong — zip hit prior-year value)
  //   identityDerived  = 5,246,604,575,370 VND → matches real TỔNG CỘNG TÀI SẢN.
  //
  // Guard: both values must be > 0, plausible (neither > 20× the other), and the
  // identity-derived total must be positive. 30% divergence threshold avoids
  // false-triggering on small legitimate rounding differences.
  if (totalLiabilities > 0 && equity.total > 0 && totalLiabilities < equity.total * 20) {
    const identityDerived = totalLiabilities + equity.total;
    const shouldOverride =
      totalAssets === 0 ||
      (identityDerived > 0 &&
       Math.abs(totalAssets - identityDerived) / identityDerived > 0.3);
    if (shouldOverride) {
      console.warn(
        `[balanceSheetExtractor] FIX-BCTC-MAGNITUDE-NORMALIZE (path B): ` +
        `totalAssets(${totalAssets}) diverges from identity(${identityDerived}); ` +
        `overriding with liab(${totalLiabilities}) + equity(${equity.total}).`
      );
      totalAssets = identityDerived;
    }
  }

  const raw: BalanceSheet = {
    currentAssets,
    nonCurrentAssets,
    totalAssets,
    currentLiabilities,
    longTermLiabilities,
    totalLiabilities,
    equity,
    totalLiabilitiesAndEquity,
  };

  // Task 287 — FR-1: apply unit multiplier (converts tỷ → triệu when needed)
  // Task 1088a — magnitude inference when unit header missing or bare "đồng".
  // FIX-BCTC-MAGNITUDE-NORMALIZE — catch-22 fix: when split-block extraction
  // fails (totalAssets=0 due to scrambled column layout), magnitude inference
  // was silently skipped because the old check only looked at totalAssets.
  // PPC Q4-2025 pattern: equity and totalLiabilitiesAndEquity ARE extracted
  // from inline-format page 10 (label+value on same line), but totalAssets=0
  // (labels and values are in separate OCR columns on page 9). The guard then
  // rejected the raw VND equity (4.47e12) as > GUARD_MAX. Fix: scan ALL raw
  // fields for a large value when totalAssets=0 to determine raw VND correctly.
  //
  // Sentinels:
  //   -1 = bare "đồng/VND" found without qualifier → infer from magnitude
  //   -2 = no unit declaration found at all → infer from magnitude
  //    1 = EXPLICITLY detected "triệu" → do NOT override with magnitude inference
  //       (large banks legitimately have totalAssets > 1_000_000_000 triệu)
  // Safety: only apply magnitude inference for sentinels, never for explicit
  // triệu/tỷ detection (multiplier > 0).
  let effectiveMultiplier = multiplier;
  if (multiplier === -1 || multiplier === -2) {
    // Primary probe: totalAssets — most reliable anchor for scale.
    // Fallback probe: scan ALL monetary fields for the largest absolute value.
    // If any field > 1 billion, the statement is in raw VND.
    // 1 triệu = 1,000,000 đồng → divide by 1,000,000.
    const RAW_VND_THRESHOLD = 1_000_000_000;
    const primaryProbe = totalAssets;
    const fallbackProbe =
      primaryProbe === 0
        ? Math.max(
            Math.abs(equity.total),
            Math.abs(totalLiabilitiesAndEquity),
            Math.abs(totalLiabilities),
            Math.abs(currentAssets.total),
            Math.abs(nonCurrentAssets.total),
          )
        : 0;

    if (primaryProbe > RAW_VND_THRESHOLD || fallbackProbe > RAW_VND_THRESHOLD) {
      effectiveMultiplier = 0.000001;
      console.warn("[balanceSheetExtractor] Inferred raw VND (đồng) from magnitude; applying ÷1,000,000.");
    } else {
      // Sentinel but small numbers — treat as triệu already
      effectiveMultiplier = 1;
    }
  }

  return guardBalanceSheet(applyMultiplier(raw, effectiveMultiplier));
}
