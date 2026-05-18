/**
 * Cash Flow Extractor — Task 044 (expanded by Task 1909a)
 *
 * Parses raw Vietnamese BCTC text and returns a typed CashFlowStatement object.
 *
 * Task 1909a additions:
 *   - extractSplitBlockCashFlow: handles split-block layout PDFs (VNM-style)
 *     where all labels appear in one block and all values 60+ lines later.
 *   - detectUnitMultiplier: detects "Triệu đồng" vs "Tỷ đồng" header (shared helper).
 *   - Magnitude inference: when unit header missing, infer from operatingCF magnitude.
 *   - Positional-drift override on grand totals: if sum(operatingCF subtotals) /
 *     stated operatingCF > 5 AND both > 0 → override with subtotal sum + console.warn.
 *     Same 5× threshold as 1908c totalAssets guard.
 *   - computeCashFlowConfidence: returns confidence score + lowConfidence flag
 *     per BCTC-1345b policy (confidence=0 → skip insert, <0.2 → low_confidence flag).
 *   - Edge cases: page-split OCF (E-1), bank label variants (E-2),
 *     parenthesised negatives (E-3), legit OCF=0 both->0 guard (E-4).
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "../vnNumberParser.js";
import type { CashFlowStatement } from "../../../../bctc-schema";
import {
  LOOKAHEAD_LINES,
  extractNumber,
  detectUnitMultiplier,
  stripDiacritics,
} from "./extractorHelpers.js";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

/**
 * Confidence metadata for the extracted CashFlowStatement.
 *
 * Per BCTC-1345b:
 *   confidence = 0  → caller must skip insert entirely
 *   confidence < 0.2 → caller must set low_confidence flag before insert
 *   confidence ≥ 0.2 → normal insert path
 */
export interface CashFlowConfidence {
  /** Extraction confidence score in [0.0, 1.0] */
  confidence: number;
  /** true when 0 < confidence < 0.2 (flag but do not skip) */
  lowConfidence: boolean;
}

// ---------------------------------------------------------------------------
// Internal findValue helper
// ---------------------------------------------------------------------------

/**
 * Find the first line matching a primary pattern (with Vietnamese diacritics)
 * or a fallback pattern (ASCII-stripped) and extract its number.
 *
 * Returns 0 if not found (missing fields default to 0).
 * Look-ahead: scans up to LOOKAHEAD_LINES following lines when the label line
 * itself contains no number (OCR split-line artifact).
 */
function findValue(
  primaryLines: string[],
  fallbackLines: string[],
  primary: RegExp,
  fallback?: RegExp,
): number {
  // 1. Try primary pattern on NFC-normalized lines
  for (let i = 0; i < primaryLines.length; i++) {
    if (primary.test(primaryLines[i]!)) {
      const val = extractNumber(primaryLines[i]!);
      if (val !== null) return val;
      // Look-ahead for OCR text where numbers appear on separate lines
      for (let j = 1; j <= LOOKAHEAD_LINES && i + j < primaryLines.length; j++) {
        const ahead = extractNumber(primaryLines[i + j]!);
        if (ahead !== null) return ahead;
      }
    }
  }
  // 2. Try ASCII fallback pattern on diacritic-stripped lines
  if (fallback) {
    for (let i = 0; i < fallbackLines.length; i++) {
      if (fallback.test(fallbackLines[i]!)) {
        const val = extractNumber(fallbackLines[i]!);
        if (val !== null) return val;
        for (let j = 1; j <= LOOKAHEAD_LINES && i + j < fallbackLines.length; j++) {
          const ahead = extractNumber(fallbackLines[i + j]!);
          if (ahead !== null) return ahead;
        }
      }
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Keyword patterns — primary (Vietnamese) + ASCII fallback
// ---------------------------------------------------------------------------

// I. Operating activities
const P_PROFIT_BEFORE_TAX = /l[ợo]i\s+nhu[ậa]n\s+tr[ưu][ớo]c\s+thu[ếe]/i;
const F_PROFIT_BEFORE_TAX = /loi\s+nhuan\s+truoc\s+thue/i;

const P_DEPRECIATION = /kh[ấa]u\s+hao\s+TSC[ĐD]/i;
const F_DEPRECIATION = /khau\s+hao\s+TSCD/i;

const P_WORKING_CAPITAL_CHANGES = /thay\s+[đd][ổo]i\s+v[ốo]n\s+l[ưu]u\s+[đd][ộo]ng/i;
const F_WORKING_CAPITAL_CHANGES = /thay\s+doi\s+von\s+luu\s+dong/i;

const P_INTEREST_PAID = /ti[ềe]n\s+l[ãa]i\s+vay\s+[đd][ãa]\s+tr[ảa]/i;
const F_INTEREST_PAID = /tien\s+lai\s+vay\s+da\s+tra/i;

const P_INCOME_TAX_PAID = /thu[ếe]\s+TNDN\s+[đd][ãa]\s+n[ộo]p/i;
const F_INCOME_TAX_PAID = /thue\s+TNDN\s+da\s+nop/i;

// Operating CF total — covers "hoạt động kinh doanh" and abbreviation HĐKD
const P_OPERATING_CF =
  /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+(?:ho[ạa]t\s+[đd][ộo]ng\s+kinh\s+doanh|H[ĐD]KD)/i;
const F_OPERATING_CF =
  /luu\s+chuyen\s+tien\s+thuan\s+tu\s+(?:hoat\s+dong\s+kinh\s+doanh|HDKD)/i;
// E-2: bank label variants (luồng tiền thuần từ hoạt động kinh doanh)
const P_OPERATING_CF_BANK =
  /lu[ồo]ng\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+ho[ạa]t\s+[đd][ộo]ng\s+kinh\s+doanh/i;
const F_OPERATING_CF_BANK =
  /luong\s+tien\s+thuan\s+tu\s+hoat\s+dong\s+kinh\s+doanh/i;
// E-2b: steel/manufacturing label variant "sản xuất kinh doanh"
const P_OPERATING_CF_MFG =
  /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+ho[ạa]t\s+[đd][ộo]ng\s+s[ảa]n\s+xu[ấa]t\s+kinh\s+doanh/i;
const F_OPERATING_CF_MFG =
  /luu\s+chuyen\s+tien\s+thuan\s+tu\s+hoat\s+dong\s+san\s+xuat\s+kinh\s+doanh/i;

// II. Investing activities
const P_CAPEX = /ti[ềe]n\s+chi\s+mua\s+s[ắa]m\s+TSC[ĐD]/i;
const F_CAPEX = /tien\s+chi\s+mua\s+sam\s+TSCD/i;

const P_ASSET_SALES = /ti[ềe]n\s+thu\s+thanh\s+l[ýy]\s+TSC[ĐD]/i;
const F_ASSET_SALES = /tien\s+thu\s+thanh\s+ly\s+TSCD/i;

const P_INVESTMENT_PURCHASES = /ti[ềe]n\s+chi\s+mua\s+c[áa]c\s+kho[ảa]n\s+[đd][ầa]u\s+t[ưu]/i;
const F_INVESTMENT_PURCHASES = /tien\s+chi\s+mua\s+cac\s+khoan\s+dau\s+tu/i;

const P_INVESTMENT_PROCEEDS = /ti[ềe]n\s+thu\s+h[ồo]i\s+[đd][ầa]u\s+t[ưu]/i;
const F_INVESTMENT_PROCEEDS = /tien\s+thu\s+hoi\s+dau\s+tu/i;

const P_DIVIDENDS_RECEIVED = /c[ổo]\s+t[ứu]c\s+v[àa]\s+l[ãa]i\s+ti[ềe]n\s+g[ửu]i\s+[đd][ãa]\s+thu/i;
const F_DIVIDENDS_RECEIVED = /co\s+tuc\s+va\s+lai\s+tien\s+gui\s+da\s+thu/i;

const P_INVESTING_CF =
  /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+(?:ho[ạa]t\s+[đd][ộo]ng\s+[đd][ầa]u\s+t[ưu]|H[ĐD][ĐD]T)/i;
const F_INVESTING_CF =
  /luu\s+chuyen\s+tien\s+thuan\s+tu\s+(?:hoat\s+dong\s+dau\s+tu|HDDT)/i;
// E-2: bank investing label
const P_INVESTING_CF_BANK =
  /lu[ồo]ng\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+ho[ạa]t\s+[đd][ộo]ng\s+[đd][ầa]u\s+t[ưu]/i;
const F_INVESTING_CF_BANK =
  /luong\s+tien\s+thuan\s+tu\s+hoat\s+dong\s+dau\s+tu/i;

// III. Financing activities
const P_PROCEEDS_FROM_DEBT = /ti[ềe]n\s+vay\s+nh[ậa]n\s+[đd][ưu][ợo]c/i;
const F_PROCEEDS_FROM_DEBT = /tien\s+vay\s+nhan\s+duoc/i;

const P_DEBT_REPAYMENTS = /ti[ềe]n\s+tr[ảa]\s+n[ợo]\s+g[ốo]c\s+vay/i;
const F_DEBT_REPAYMENTS = /tien\s+tra\s+no\s+goc\s+vay/i;

const P_SHARE_ISSUANCE = /ti[ềe]n\s+thu\s+t[ừu]\s+ph[áa]t\s+h[àa]nh\s+c[ổo]\s+phi[ếe]u/i;
const F_SHARE_ISSUANCE = /tien\s+thu\s+tu\s+phat\s+hanh\s+co\s+phieu/i;

const P_DIVIDENDS_PAID = /c[ổo]\s+t[ứu]c\s+[đd][ãa]\s+tr[ảa]/i;
const F_DIVIDENDS_PAID = /co\s+tuc\s+da\s+tra/i;

const P_FINANCING_CF =
  /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+(?:ho[ạa]t\s+[đd][ộo]ng\s+t[àa]i\s+ch[ía]nh|H[ĐD]TC)/i;
const F_FINANCING_CF =
  /luu\s+chuyen\s+tien\s+thuan\s+tu\s+(?:hoat\s+dong\s+tai\s+chinh|HDTC)/i;
// E-2: bank financing label
const P_FINANCING_CF_BANK =
  /lu[ồo]ng\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+ho[ạa]t\s+[đd][ộo]ng\s+t[àa]i\s+ch[ía]nh/i;
const F_FINANCING_CF_BANK =
  /luong\s+tien\s+thuan\s+tu\s+hoat\s+dong\s+tai\s+chinh/i;

// Summary
const P_NET_CASH_FLOW = /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+trong\s+k[ỳy]/i;
const F_NET_CASH_FLOW = /luu\s+chuyen\s+tien\s+thuan\s+trong\s+ky/i;

const P_BEGINNING_CASH =
  /ti[ềe]n\s+v[àa]\s+t[ưu][ơo]ng\s+[đd][ưu][ơo]ng\s+ti[ềe]n\s+[đd][ầa]u\s+k[ỳy]/i;
const F_BEGINNING_CASH =
  /tien\s+va\s+tuong\s+duong\s+tien\s+dau\s+ky/i;

const P_ENDING_CASH =
  /ti[ềe]n\s+v[àa]\s+t[ưu][ơo]ng\s+[đd][ưu][ơo]ng\s+ti[ềe]n\s+cu[ốo]i\s+k[ỳy]/i;
const F_ENDING_CASH =
  /tien\s+va\s+tuong\s+duong\s+tien\s+cuoi\s+ky/i;

// ---------------------------------------------------------------------------
// Task 1909a — Split-block cash flow helpers (VNM consolidated PDF format)
// ---------------------------------------------------------------------------

/**
 * Cash flow item codes (Vietnamese BCTC Mẫu B03-DN):
 *
 *   I. Operating activities (01–30):
 *     01 = profit before tax
 *     02 = depreciation & amortization
 *     03 = provisions
 *     04 = FX losses
 *     05 = gains/losses from investing
 *     06 = interest expense
 *     07 = changes in receivables
 *     08 = changes in inventories
 *     09 = changes in payables
 *     10 = changes in prepaid expenses
 *     11 = interest paid
 *     12 = income tax paid
 *     13 = other
 *     20 = net cash from operating activities  ← grand total
 *
 *   II. Investing activities (21–30):
 *     21 = capex
 *     22 = proceeds from asset disposal
 *     23 = investment purchases
 *     24 = investment proceeds
 *     25 = dividends + interest received
 *     30 = net cash from investing activities  ← grand total
 *
 *   III. Financing activities (31–40):
 *     31 = proceeds from debt
 *     32 = debt repayments
 *     33 = share issuance proceeds
 *     34 = dividends paid
 *     40 = net cash from financing activities  ← grand total
 *
 *   50 = net change in cash
 *   60 = beginning cash
 *   70 = ending cash
 */

/** Detect and parse a split-block cash flow page.
 *
 * Split-block format: all labels appear first (with standalone item codes
 * 01–70), then a date+unit separator ("31/12/2025" + "Triệu VND"), then
 * the ordered monetary values.
 *
 * Returns a record mapping item codes to values, or null if not split-block.
 */
function parseSplitBlockCashFlow(lines: string[]): Record<string, number> | null {
  // Step 1: Find the date + unit separator
  const DATE_CONTAINS = /\d{1,2}\/\d{1,2}\/20\d\d/;
  const UNIT_CONTAINS = /tri[eệ]u\s+VND|(?<![\/\d])VND(?!\d)/i;

  let separatorIdx = -1;
  for (let i = 0; i < lines.length - 5; i++) {
    const line = lines[i]!;
    if (DATE_CONTAINS.test(line)) {
      if (UNIT_CONTAINS.test(line)) {
        separatorIdx = i;
        break;
      }
      for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
        if (UNIT_CONTAINS.test(lines[j]!)) {
          separatorIdx = j;
          break;
        }
      }
      if (separatorIdx !== -1) break;
    }
  }

  // Step 1b: Fallback — "Báo cáo lưu chuyển tiền tệ" repeated line (page-pair)
  if (separatorIdx < 20) {
    const PAGE_BOUNDARY = /[Bb][aá]o\s+c[aá]o\s+l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n/;
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (PAGE_BOUNDARY.test(lines[i]!)) {
        count++;
        if (count === 2 && i >= 10) {
          separatorIdx = i;
          break;
        }
      }
    }
  }

  // Step 2: require separator at position ≥ 10
  if (separatorIdx < 10) return null;

  const labelLines = lines.slice(0, separatorIdx);
  const valueLines = lines.slice(separatorIdx + 1);

  // Step 3: Extract item codes from label block (standalone 2-digit integers)
  // Cash flow codes: 01–70 (with leading zeros sometimes dropped in OCR)
  const VALID_CF_CODES = new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20,
    21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 40, 50, 60, 70,
  ]);

  const codeSet = new Set<number>();
  for (const line of labelLines) {
    const trimmed = line.trim();
    // Standalone: line is only a 1-2 digit integer (possibly zero-padded: "01", "20")
    if (/^\d{1,2}$/.test(trimmed)) {
      const code = parseInt(trimmed, 10);
      if (VALID_CF_CODES.has(code)) codeSet.add(code);
      continue;
    }
    // Inline formula: "(20 = ...)" or "(30 = ...)"
    const inlineMatch = trimmed.match(/\((\d{1,2})\s*=/);
    if (inlineMatch) {
      const code = parseInt(inlineMatch[1]!, 10);
      if (VALID_CF_CODES.has(code)) codeSet.add(code);
    }
  }

  if (codeSet.size < 3) return null; // insufficient code evidence — not split-block

  // Sort numerically (matches document order)
  const codes = [...codeSet].sort((a, b) => a - b);

  // Step 4: Extract ordered large numbers from value block
  const values: number[] = [];
  for (const line of valueLines) {
    const trimmed = line.trim();
    // Stop at second-period separator
    if (/^1\/1\/20\d\d/.test(trimmed) || /^31\/12\/20\d\d/.test(trimmed)) break;

    const tokens = trimmed.match(/\(?\-?[\d.,]+\s*[\d.,]*\)?/g);
    if (!tokens) continue;

    for (const token of tokens) {
      const cleaned = token.replace(/\s+/g, "");
      const val = parseVnNumber(cleaned);
      if (val === null) continue;
      // Skip small integers (item codes, row references)
      if (Number.isInteger(val) && Math.abs(val) <= 999) continue;
      // Skip year-like values
      if (val >= 2020 && val <= 2030) continue;
      values.push(val);
    }
  }

  if (values.length === 0) return null;

  // Step 5: Zip codes → values by position
  const result: Record<string, number> = {};
  const limit = Math.min(codes.length, values.length);
  for (let i = 0; i < limit; i++) {
    const code = String(codes[i]!);
    if (!(code in result)) {
      result[code] = values[i]!;
    }
  }

  return result;
}

/**
 * Split full OCR text into pages at cash flow section boundaries, apply
 * parseSplitBlockCashFlow to each page, and merge results.
 */
function extractSplitBlockAll(fullText: string): Record<string, number> | null {
  const PAGE_BOUNDARY =
    /[Bb][aá]o\s+c[aá]o\s+l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+t[ệe]/;
  const lines = fullText.split("\n");
  const pages: string[] = [];
  let pageStart = 0;

  for (let i = 1; i < lines.length; i++) {
    if (PAGE_BOUNDARY.test(lines[i]!) && i > pageStart + 10) {
      pages.push(lines.slice(pageStart, i).join("\n"));
      pageStart = i;
    }
  }
  pages.push(lines.slice(pageStart).join("\n"));

  // Labels-only page detection: merge with next page if no monetary values
  const mergedPages: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageLines = pages[i]!.split("\n");
    const hasItemCodes = pageLines.some((l) =>
      /^\s*\d{1,2}\s*$/.test(l) || /\(\d{1,2}\s*=/.test(l)
    );
    const hasMonetaryValues = pageLines.some((l) => {
      const tokens = l.match(/[\d.,]{7,}/g);
      return tokens !== null && tokens.length > 0;
    });
    if (hasItemCodes && !hasMonetaryValues && i + 1 < pages.length) {
      mergedPages.push(pages[i]! + "\n" + pages[i + 1]!);
      i++;
    } else {
      mergedPages.push(pages[i]!);
    }
  }

  const merged: Record<string, number> = {};
  let foundAny = false;

  for (const pageText of mergedPages) {
    const pageLines = pageText.split("\n");
    const result = parseSplitBlockCashFlow(pageLines);
    if (result) {
      foundAny = true;
      for (const [code, val] of Object.entries(result)) {
        if (!(code in merged)) merged[code] = val;
      }
    }
  }

  return foundAny ? merged : null;
}

// ---------------------------------------------------------------------------
// Task 1909a — Drift override guard (same 5× threshold as 1908c totalAssets)
// ---------------------------------------------------------------------------

/**
 * Positional-drift override guard for a stated grand total.
 *
 * When OCR positional drift causes the "stated" grand total to actually be
 * a sub-item value (e.g. a sub-total from an adjacent column was captured
 * instead of the section total), the sum of extracted subtotals is
 * implausibly larger than the stated total.
 *
 * Override condition (mirrors 1908c pattern):
 *   subtotalSum / statedTotal > DRIFT_THRESHOLD AND both > 0
 *
 * E-4 guard: legit OCF = 0 — when EITHER value is 0, do not override
 * (a company can legitimately have zero operating cash flow).
 *
 * @param statedTotal   - The regex-extracted stated grand total
 * @param subtotalSum   - Sum of individually extracted sub-items
 * @param label         - Field label for console.warn
 * @returns The overridden total if drift detected, otherwise statedTotal
 */
const DRIFT_THRESHOLD = 5;

function applyDriftGuard(
  statedTotal: number,
  subtotalSum: number,
  label: string,
): number {
  // E-4: legit zero — both > 0 guard prevents false positives when OCF = 0
  if (statedTotal === 0 || subtotalSum === 0) return statedTotal;

  const ratio = Math.abs(subtotalSum) / Math.abs(statedTotal);
  if (ratio > DRIFT_THRESHOLD) {
    console.warn(
      `[cashFlowExtractor] Drift guard triggered on ${label}: ` +
        `stated=${statedTotal}, subtotalSum=${subtotalSum}, ratio=${ratio.toFixed(2)}. ` +
        `Overriding with subtotal sum.`,
    );
    return subtotalSum;
  }
  return statedTotal;
}

// ---------------------------------------------------------------------------
// Task 1909a — Unit multiplier application
// ---------------------------------------------------------------------------

function applyMultiplier(cf: CashFlowStatement, m: number): CashFlowStatement {
  if (m === 1) return cf;
  return {
    profitBeforeTax:          cf.profitBeforeTax          * m,
    depreciationAmortization: cf.depreciationAmortization * m,
    workingCapitalChanges:    cf.workingCapitalChanges    * m,
    interestPaid:             cf.interestPaid             * m,
    incomeTaxPaid:            cf.incomeTaxPaid            * m,
    operatingCF:              cf.operatingCF              * m,
    capex:                    cf.capex                    * m,
    proceedsFromAssetSales:   cf.proceedsFromAssetSales   * m,
    investmentPurchases:      cf.investmentPurchases      * m,
    investmentProceeds:       cf.investmentProceeds       * m,
    dividendsReceived:        cf.dividendsReceived        * m,
    investingCF:              cf.investingCF              * m,
    proceedsFromDebt:         cf.proceedsFromDebt         * m,
    debtRepayments:           cf.debtRepayments           * m,
    proceedsFromShareIssuance:cf.proceedsFromShareIssuance* m,
    dividendsPaid:            cf.dividendsPaid            * m,
    financingCF:              cf.financingCF              * m,
    netCashFlow:              cf.netCashFlow              * m,
    beginningCash:            cf.beginningCash            * m,
    endingCash:               cf.endingCash               * m,
    freeCashFlow:             cf.freeCashFlow             * m,
  };
}

// ---------------------------------------------------------------------------
// Task 1909a — Confidence scoring (per BCTC-1345b)
// ---------------------------------------------------------------------------

/**
 * Compute confidence score for a CashFlowStatement.
 *
 * Strategy: count non-zero values among 5 key fields.
 *   5/5 → 1.0, 4/5 → 0.8, 3/5 → 0.6, 2/5 → 0.4, 1/5 → 0.2, 0/5 → 0.0
 *
 * Per BCTC-1345b:
 *   confidence = 0   → skip insert
 *   confidence < 0.2 → insert with low_confidence flag
 *   confidence ≥ 0.2 → normal insert
 */
export function computeCashFlowConfidence(cf: CashFlowStatement): CashFlowConfidence {
  const keyFields: number[] = [
    cf.operatingCF,
    cf.investingCF,
    cf.financingCF,
    cf.netCashFlow,
    cf.endingCash,
  ];

  const nonZeroCount = keyFields.filter((v) => v !== 0).length;
  const confidence = nonZeroCount / keyFields.length;

  return {
    confidence,
    lowConfidence: confidence > 0 && confidence < 0.2,
  };
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract a CashFlowStatement from raw Vietnamese financial report text.
 *
 * Numbers are returned in triệu đồng (million VND). The function:
 *   1. Normalises to NFC and strips diacritics for fallback matching
 *   2. Detects the unit header (triệu/tỷ) via detectUnitMultiplier
 *   3. Tries split-block extraction (extractSplitBlockAll) for consolidated PDFs
 *   4. Falls back to inline label-matching with look-ahead
 *   5. Applies drift override guard on all three section totals (1909a)
 *   6. Applies unit multiplier (converts tỷ → triệu)
 *   7. Applies magnitude inference when unit header is missing
 *
 * Missing line items default to 0.
 * FCF is computed as operatingCF + capex (capex is negative).
 */
export function extractCashFlow(rawText: string): CashFlowStatement {
  // NFC normalisation (resolves NFD decomposition artifacts from pdfplumber)
  const normalized = rawText.normalize("NFC");
  const primaryLines = normalized.split("\n");
  // ASCII fallback for corrupted OCR output
  const fallbackLines = primaryLines.map(stripDiacritics);

  // Detect unit multiplier before any extraction
  const multiplier = detectUnitMultiplier(primaryLines);

  // Try split-block extraction for consolidated PDFs (VNM-style)
  const sbMap = extractSplitBlockAll(normalized);

  // Convenience wrapper: prefer split-block value if available, else label-match
  const fv = (
    primary: RegExp,
    fallback: RegExp,
    sbKey?: string,
    ...altPatterns: Array<[RegExp, RegExp]>
  ): number => {
    // 1. Split-block override
    if (sbKey && sbMap && sbMap[sbKey] !== undefined) return sbMap[sbKey]!;

    // 2. Primary label match (with look-ahead + fallback)
    const v = findValue(primaryLines, fallbackLines, primary, fallback);
    if (v !== 0) return v;

    // 3. Alternative patterns (E-2 bank variants)
    for (const [altP, altF] of altPatterns) {
      const alt = findValue(primaryLines, fallbackLines, altP, altF);
      if (alt !== 0) return alt;
    }

    return 0;
  };

  // --- Operating activities ---
  const profitBeforeTax = fv(P_PROFIT_BEFORE_TAX, F_PROFIT_BEFORE_TAX, "1");
  const depreciationAmortization = fv(P_DEPRECIATION, F_DEPRECIATION, "2");
  const workingCapitalChanges = fv(P_WORKING_CAPITAL_CHANGES, F_WORKING_CAPITAL_CHANGES, "7");
  const interestPaid = fv(P_INTEREST_PAID, F_INTEREST_PAID, "11");
  const incomeTaxPaid = fv(P_INCOME_TAX_PAID, F_INCOME_TAX_PAID, "12");

  // Stated operating CF (from "Lưu chuyển tiền thuần từ HĐKD" line)
  let operatingCF = fv(
    P_OPERATING_CF, F_OPERATING_CF, "20",
    [P_OPERATING_CF_BANK, F_OPERATING_CF_BANK],
    [P_OPERATING_CF_MFG, F_OPERATING_CF_MFG],   // E-2b: steel/manufacturing sector
  );

  // Drift override on operatingCF: subtotal sum = profitBeforeTax + D&A + WC changes + interestPaid + incomeTaxPaid
  // Only apply when we have ≥ 2 non-zero subtotals (weak sub-total evidence)
  const ocfSubtotals = [
    profitBeforeTax, depreciationAmortization, workingCapitalChanges,
    interestPaid, incomeTaxPaid,
  ];
  const ocfSubtotalSum = ocfSubtotals.reduce((a, b) => a + b, 0);
  // Guard: only fire when we have meaningful subtotal evidence (≥ 2 non-zero)
  const ocfSubtotalCount = ocfSubtotals.filter((v) => v !== 0).length;
  if (ocfSubtotalCount >= 2) {
    operatingCF = applyDriftGuard(operatingCF, ocfSubtotalSum, "operatingCF");
  }

  // --- Investing activities ---
  const capex = fv(P_CAPEX, F_CAPEX, "21");
  const proceedsFromAssetSales = fv(P_ASSET_SALES, F_ASSET_SALES, "22");
  const investmentPurchases = fv(P_INVESTMENT_PURCHASES, F_INVESTMENT_PURCHASES, "23");
  const investmentProceeds = fv(P_INVESTMENT_PROCEEDS, F_INVESTMENT_PROCEEDS, "24");
  const dividendsReceived = fv(P_DIVIDENDS_RECEIVED, F_DIVIDENDS_RECEIVED, "25");

  let investingCF = fv(
    P_INVESTING_CF, F_INVESTING_CF, "30",
    [P_INVESTING_CF_BANK, F_INVESTING_CF_BANK],
  );

  const invSubtotals = [capex, proceedsFromAssetSales, investmentPurchases, investmentProceeds, dividendsReceived];
  const invSubtotalSum = invSubtotals.reduce((a, b) => a + b, 0);
  const invSubtotalCount = invSubtotals.filter((v) => v !== 0).length;
  if (invSubtotalCount >= 2) {
    investingCF = applyDriftGuard(investingCF, invSubtotalSum, "investingCF");
  }

  // --- Financing activities ---
  const proceedsFromDebt = fv(P_PROCEEDS_FROM_DEBT, F_PROCEEDS_FROM_DEBT, "31");
  const debtRepayments = fv(P_DEBT_REPAYMENTS, F_DEBT_REPAYMENTS, "32");
  const proceedsFromShareIssuance = fv(P_SHARE_ISSUANCE, F_SHARE_ISSUANCE, "33");
  const dividendsPaid = fv(P_DIVIDENDS_PAID, F_DIVIDENDS_PAID, "34");

  let financingCF = fv(
    P_FINANCING_CF, F_FINANCING_CF, "40",
    [P_FINANCING_CF_BANK, F_FINANCING_CF_BANK],
  );

  const finSubtotals = [proceedsFromDebt, debtRepayments, proceedsFromShareIssuance, dividendsPaid];
  const finSubtotalSum = finSubtotals.reduce((a, b) => a + b, 0);
  const finSubtotalCount = finSubtotals.filter((v) => v !== 0).length;
  if (finSubtotalCount >= 2) {
    financingCF = applyDriftGuard(financingCF, finSubtotalSum, "financingCF");
  }

  // --- Summary ---
  const netCashFlow = fv(P_NET_CASH_FLOW, F_NET_CASH_FLOW, "50");
  const beginningCash = fv(P_BEGINNING_CASH, F_BEGINNING_CASH, "60");
  const endingCash = fv(P_ENDING_CASH, F_ENDING_CASH, "70");

  // Computed
  const freeCashFlow = operatingCF + capex;

  const raw: CashFlowStatement = {
    profitBeforeTax,
    depreciationAmortization,
    workingCapitalChanges,
    interestPaid,
    incomeTaxPaid,
    operatingCF,
    capex,
    proceedsFromAssetSales,
    investmentPurchases,
    investmentProceeds,
    dividendsReceived,
    investingCF,
    proceedsFromDebt,
    debtRepayments,
    proceedsFromShareIssuance,
    dividendsPaid,
    financingCF,
    netCashFlow,
    beginningCash,
    endingCash,
    freeCashFlow,
  };

  // Unit multiplier + magnitude inference
  // Sentinels: -1 (bare đồng/VND), -2 (no unit found) → infer from magnitude
  let effectiveMultiplier = multiplier;
  if (multiplier === -1 || multiplier === -2) {
    // VN listed companies have operatingCF in triệu between ~-100,000,000 and +100,000,000.
    // If the extracted operatingCF (or ending cash) exceeds 1 billion, values are in raw VND.
    const magnitudeSentinel =
      Math.abs(operatingCF) ||
      Math.abs(endingCash) ||
      Math.abs(beginningCash) ||
      0;
    if (magnitudeSentinel > 1_000_000_000) {
      effectiveMultiplier = 0.000001;
      console.warn(
        "[cashFlowExtractor] Inferred raw VND (đồng) from magnitude; applying ÷1,000,000.",
      );
    } else {
      effectiveMultiplier = 1;
    }
  }

  return applyMultiplier(raw, effectiveMultiplier);
}
