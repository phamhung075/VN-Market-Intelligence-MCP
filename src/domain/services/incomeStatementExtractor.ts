/**
 * Income Statement Extractor — Task 043 / Task 288
 *
 * Parses raw Vietnamese BCTC text (Báo cáo KQHĐKD) and returns a typed
 * IncomeStatement object.
 *
 * FR-3 (Task 288): NFC normalization + ASCII diacritic-stripped fallback patterns.
 * - rawText is NFC-normalized before splitting into lines.
 * - Each field has a primary (diacritics) pattern and an ASCII fallback pattern.
 * - findValue tries primary first; if no match, tries fallback on diacritic-stripped lines.
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "./vnNumberParser";
import type { IncomeStatement } from "../../../bctc-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all number tokens from a line and return the first "large" one
 * (skipping BCTC item codes which are small integers like 01, 10, 20).
 * Falls back to the last number on the line if no large number found.
 *
 * Task 1114: OCR PDFs often have multi-column layouts where the current
 * period value is NOT the last number. Extracting the first large number
 * gets the "current period" column in most Vietnamese BCTC formats.
 */
function extractNumber(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Find all number-like tokens on the line
  const tokens = trimmed.match(/\(?\-?[\d.,]+\)?/g);
  if (!tokens || tokens.length === 0) return null;

  // Try to find the first large number (skip item codes)
  for (const token of tokens) {
    const val = parseVnNumber(token);
    if (val === null) continue;
    // Skip small integers that are likely BCTC item codes (01, 02, 10, 20, etc.)
    if (Number.isInteger(val) && val >= 0 && val <= 999) continue;
    return val;
  }

  // Fallback: return the last parseable number (even if small)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const val = parseVnNumber(tokens[i]!);
    if (val !== null) return val;
  }
  return null;
}

/**
 * Strip Vietnamese diacritics from a string, producing ASCII-only text.
 * Used to build fallback lines for corrupted pdf-parse output.
 */
function stripDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove combining diacritical marks
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D")); // handle đ/Đ separately
}

/**
 * Find the first line matching a primary pattern; if no match, try the ASCII
 * fallback pattern on diacritic-stripped lines.
 *
 * Task 1114: When a pattern matches a line but no number is found on it,
 * look ahead up to LOOKAHEAD_LINES following lines for a number. OCR text
 * from scanned PDFs often puts labels and values on separate lines.
 *
 * @param primaryLines  - NFC-normalized lines (original)
 * @param fallbackLines - NFC-normalized + diacritic-stripped lines
 * @param primary       - Regex pattern for Vietnamese text (with diacritics)
 * @param fallback      - Regex pattern for ASCII text (diacritics removed)
 * @returns Extracted number, or 0 if not found.
 */
const LOOKAHEAD_LINES = 3;

function findValue(
  primaryLines: string[],
  fallbackLines: string[],
  primary: RegExp,
  fallback: RegExp,
): number {
  // 1. Try primary pattern on NFC-normalized lines
  for (let i = 0; i < primaryLines.length; i++) {
    if (primary.test(primaryLines[i]!)) {
      const val = extractNumber(primaryLines[i]!);
      if (val !== null) return val;
      // Look-ahead: OCR may have numbers on next lines
      for (let j = 1; j <= LOOKAHEAD_LINES && i + j < primaryLines.length; j++) {
        const ahead = extractNumber(primaryLines[i + j]!);
        if (ahead !== null) return ahead;
      }
    }
  }
  // 2. Try ASCII fallback pattern on diacritic-stripped lines
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
  return 0;
}

// ---------------------------------------------------------------------------
// Keyword patterns — primary (Vietnamese with diacritics) + ASCII fallback
// ---------------------------------------------------------------------------

// Revenue
const P_GROSS_REVENUE = /doanh\s+thu\s+b[áa]n\s+h[àa]ng/i;
const F_GROSS_REVENUE = /doanh\s+thu\s+ban\s+hang/i;

const P_REVENUE_DEDUCTIONS = /gi[ảa]m\s+tr[ừu]\s+doanh\s+thu/i;
const F_REVENUE_DEDUCTIONS = /giam\s+tru\s+doanh\s+thu/i;

const P_NET_REVENUE = /doanh\s+thu\s+thu[ầa]n/i;
const F_NET_REVENUE = /doanh\s+thu\s+thuan/i;

const P_COGS = /gi[áa]\s+v[ốo]n\s+h[àa]ng\s+b[áa]n/i;
const F_COGS = /gia\s+von\s+hang\s+ban/i;

const P_GROSS_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+g[ộo]p/i;
const F_GROSS_PROFIT = /loi\s+nhuan\s+gop/i;

// Financial items
const P_FINANCIAL_INCOME = /doanh\s+thu\s+ho[ạa]t\s+[đd][ộo]ng\s+t[àa]i\s+ch[ía]nh/i;
const F_FINANCIAL_INCOME = /doanh\s+thu\s+hoat\s+dong\s+tai\s+chinh/i;

const P_FINANCIAL_EXPENSES = /chi\s+ph[ía]\s+t[àa]i\s+ch[ía]nh/i;
const F_FINANCIAL_EXPENSES = /chi\s+phi\s+tai\s+chinh/i;

const P_INTEREST_EXPENSES = /chi\s+ph[ía]\s+l[ãa]i\s+vay/i;
const F_INTEREST_EXPENSES = /chi\s+phi\s+lai\s+vay/i;

const P_SHARE_OF_ASSOCIATES = /ph[ầa]n\s+l[ãa]i[\/\s]l[ỗo]\s+.*li[êe]n\s+k[ếe]t/i;
const F_SHARE_OF_ASSOCIATES = /phan\s+lai[\/\s]lo\s+.*lien\s+ket/i;

// Operating expenses
const P_SELLING_EXPENSES = /chi\s+ph[ía]\s+b[áa]n\s+h[àa]ng/i;
const F_SELLING_EXPENSES = /chi\s+phi\s+ban\s+hang/i;

const P_ADMIN_EXPENSES = /chi\s+ph[ía]\s+qu[ảa]n\s+l[ýy]\s+doanh\s+nghi[ệe]p/i;
const F_ADMIN_EXPENSES = /chi\s+phi\s+quan\s+ly\s+doanh\s+nghiep/i;

// Operating profit
const P_OPERATING_PROFIT =
  /l[ợo]i\s+nhu[ậa]n\s+thu[ầa]n\s+t[ừu]\s+.*h[oọ][ạa]t\s+[đd][ộo]ng\s+kinh\s+doanh|l[ợo]i\s+nhu[ậa]n\s+thu[ầa]n\s+t[ừu]\s+H[ĐD]KD/i;
const F_OPERATING_PROFIT =
  /loi\s+nhuan\s+thuan\s+tu\s+.*hoat\s+dong\s+kinh\s+doanh|loi\s+nhuan\s+thuan\s+tu\s+HDKD/i;

// Other income/expenses
const P_OTHER_INCOME = /thu\s+nh[ậa]p\s+kh[áa]c/i;
const F_OTHER_INCOME = /thu\s+nhap\s+khac/i;

const P_OTHER_EXPENSES = /chi\s+ph[ía]\s+kh[áa]c/i;
const F_OTHER_EXPENSES = /chi\s+phi\s+khac/i;

const P_OTHER_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+kh[áa]c/i;
const F_OTHER_PROFIT = /loi\s+nhuan\s+khac/i;

// Tax
const P_PROFIT_BEFORE_TAX =
  /l[ợo]i\s+nhu[ậa]n\s+.*tr[ưu][ớo]c\s+thu[ếe]|t[ổo]ng\s+l[ợo]i\s+nhu[ậa]n\s+.*tr[ưu][ớo]c\s+thu[ếe]/i;
const F_PROFIT_BEFORE_TAX =
  /loi\s+nhuan\s+.*truoc\s+thue|tong\s+loi\s+nhuan\s+.*truoc\s+thue/i;

const P_INCOME_TAX_CURRENT =
  /thu[ếe]\s+TNDN\s+hi[ệe]n\s+h[àa]nh|thu[ếe]\s+.*hi[ệe]n\s+h[àa]nh/i;
const F_INCOME_TAX_CURRENT = /thue\s+TNDN\s+hien\s+hanh|thue\s+.*hien\s+hanh/i;

const P_INCOME_TAX_DEFERRED =
  /thu[ếe]\s+TNDN\s+ho[ãa]n\s+l[ạa]i|thu[ếe]\s+.*ho[ãa]n\s+l[ạa]i/i;
const F_INCOME_TAX_DEFERRED = /thue\s+TNDN\s+hoan\s+lai|thue\s+.*hoan\s+lai/i;

const P_TOTAL_INCOME_TAX = /t[ổo]ng\s+chi\s+ph[ía]\s+thu[ếe]\s+TNDN/i;
const F_TOTAL_INCOME_TAX = /tong\s+chi\s+phi\s+thue\s+TNDN/i;

// Net profit
const P_NET_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]/i;
const F_NET_PROFIT = /loi\s+nhuan\s+sau\s+thue/i;

const P_MINORITY_INTEREST =
  /l[ợo]i\s+[ía]ch\s+.*c[ổo]\s+[đd][ôo]ng\s+kh[ôo]ng\s+ki[ểe]m\s+so[áa]t/i;
const F_MINORITY_INTEREST = /loi\s+ich\s+.*co\s+dong\s+khong\s+kiem\s+soat/i;

const P_NET_PROFIT_PARENT =
  /LNST\s+c[ủu]a\s+c[ổo]\s+[đd][ôo]ng\s+c[ôo]ng\s+ty\s+m[ẹe]|l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]\s+c[ủu]a\s+c[ổo]\s+[đd][ôo]ng\s+c[ôo]ng\s+ty\s+m[ẹe]/i;
const F_NET_PROFIT_PARENT =
  /LNST\s+cua\s+co\s+dong\s+cong\s+ty\s+me|loi\s+nhuan\s+sau\s+thue\s+cua\s+co\s+dong\s+cong\s+ty\s+me/i;

// EPS — diluted MUST come before basic to avoid greedy match on "lãi cơ bản"
const P_DILUTED_EPS =
  /l[ãa]i\s+suy\s+gi[ảa]m\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u|l[ãa]i\s+pha\s+lo[ãa]ng\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u/i;
const F_DILUTED_EPS =
  /lai\s+suy\s+giam\s+tren\s+co\s+phieu|lai\s+pha\s+loang\s+tren\s+co\s+phieu/i;

const P_EPS = /l[ãa]i\s+c[ơo]\s+b[ảa]n\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u/i;
const F_EPS = /lai\s+co\s+ban\s+tren\s+co\s+phieu/i;

// ---------------------------------------------------------------------------
// Task 1114 — Unit detection (ported from balanceSheetExtractor)
// ---------------------------------------------------------------------------

/**
 * Detect unit multiplier from PDF header. Same logic as balanceSheetExtractor
 * so both statements in the same report use consistent units.
 */
function detectUnitMultiplier(lines: string[]): number {
  const P_UNIT_TRIEU = /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*(tri[eệ]u|trieu)/i;
  const P_UNIT_TY = /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*t[yỷ]/i;

  for (const line of lines) {
    if (P_UNIT_TRIEU.test(line)) return 1;
    if (P_UNIT_TY.test(line)) return 1000;
  }

  // Loose fallback on first ~50 lines
  const head = lines.slice(0, 50);
  const P_TRIEU_LOOSE = /tri[eệ]u\s*[đd][oồ]ng|trieu\s*dong/i;
  const P_TY_LOOSE = /t[yỷ]\s*[đd][oồ]ng|ty\s*dong/i;

  for (const line of head) {
    if (P_TRIEU_LOOSE.test(line)) return 1;
    if (P_TY_LOOSE.test(line)) return 1000;
  }

  return 1; // default: assume triệu
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract an IncomeStatement from raw Vietnamese financial report text.
 *
 * Numbers are returned in triệu đồng (million VND), except EPS which is in VND.
 * Missing line items default to 0.
 *
 * Task 1114: Added unit detection (tỷ → triệu conversion), look-ahead for
 * OCR text where numbers appear on lines after their labels, and multi-number
 * extraction to handle current-period column in multi-column layouts.
 */
export function extractIncomeStatement(rawText: string): IncomeStatement {
  // NFC normalization (FR-3): ensures precomposed Unicode characters match patterns
  const normalized = rawText.normalize("NFC");
  const primaryLines = normalized.split("\n");

  // Fallback lines: NFC + diacritic strip (for corrupted PDFs)
  const fallbackLines = primaryLines.map(stripDiacritics);

  // Convenience wrapper that passes both line arrays
  const fv = (primary: RegExp, fallback: RegExp): number =>
    findValue(primaryLines, fallbackLines, primary, fallback);

  // --- Revenue ---
  const grossRevenue = fv(P_GROSS_REVENUE, F_GROSS_REVENUE);
  const revenueDeductions = fv(P_REVENUE_DEDUCTIONS, F_REVENUE_DEDUCTIONS);
  const netRevenue = fv(P_NET_REVENUE, F_NET_REVENUE);
  const cogs = fv(P_COGS, F_COGS);
  let grossProfit = fv(P_GROSS_PROFIT, F_GROSS_PROFIT);
  // Fallback: compute grossProfit if not explicitly stated
  if (grossProfit === 0 && netRevenue > 0) {
    grossProfit = netRevenue - cogs;
  }

  // --- Financial items ---
  const financialIncome = fv(P_FINANCIAL_INCOME, F_FINANCIAL_INCOME);
  const financialExpenses = fv(P_FINANCIAL_EXPENSES, F_FINANCIAL_EXPENSES);
  const interestExpenses = fv(P_INTEREST_EXPENSES, F_INTEREST_EXPENSES);
  const shareOfAssociates = fv(P_SHARE_OF_ASSOCIATES, F_SHARE_OF_ASSOCIATES);

  // --- Operating expenses ---
  const sellingExpenses = fv(P_SELLING_EXPENSES, F_SELLING_EXPENSES);
  const adminExpenses = fv(P_ADMIN_EXPENSES, F_ADMIN_EXPENSES);

  // --- Operating profit ---
  const operatingProfit = fv(P_OPERATING_PROFIT, F_OPERATING_PROFIT);

  // --- Other income/expenses ---
  const otherIncome = fv(P_OTHER_INCOME, F_OTHER_INCOME);
  const otherExpenses = fv(P_OTHER_EXPENSES, F_OTHER_EXPENSES);
  let otherProfit = fv(P_OTHER_PROFIT, F_OTHER_PROFIT);
  // Fallback: compute otherProfit if not found
  if (otherProfit === 0 && (otherIncome > 0 || otherExpenses > 0)) {
    otherProfit = otherIncome - otherExpenses;
  }

  // --- Profit before tax ---
  const profitBeforeTax = fv(P_PROFIT_BEFORE_TAX, F_PROFIT_BEFORE_TAX);

  // --- Tax ---
  const incomeTaxCurrent = fv(P_INCOME_TAX_CURRENT, F_INCOME_TAX_CURRENT);
  const incomeTaxDeferred = fv(P_INCOME_TAX_DEFERRED, F_INCOME_TAX_DEFERRED);
  let totalIncomeTax = fv(P_TOTAL_INCOME_TAX, F_TOTAL_INCOME_TAX);
  // Fallback: compute total tax if not explicitly found
  if (totalIncomeTax === 0 && (incomeTaxCurrent > 0 || incomeTaxDeferred > 0)) {
    totalIncomeTax = incomeTaxCurrent + incomeTaxDeferred;
  }

  // --- Net profit ---
  const netProfit = fv(P_NET_PROFIT, F_NET_PROFIT);
  const minorityInterest = fv(P_MINORITY_INTEREST, F_MINORITY_INTEREST);
  const netProfitParent = fv(P_NET_PROFIT_PARENT, F_NET_PROFIT_PARENT);

  // --- EPS ---
  // Diluted EPS pattern must be checked BEFORE basic EPS since basic EPS regex
  // would also match diluted lines. We search diluted first explicitly.
  const dilutedEps = fv(P_DILUTED_EPS, F_DILUTED_EPS);
  const eps = fv(P_EPS, F_EPS);

  // --- Computed fields ---
  const ebit = operatingProfit; // Approximation per bctc-schema.ts
  const ebitda = 0; // Cannot compute without depreciation (from cash flow statement)

  // Task 1114: unit conversion (tỷ → triệu). EPS stays in VND (not scaled).
  const multiplier = detectUnitMultiplier(primaryLines);
  const m = multiplier;

  return {
    grossRevenue: grossRevenue * m,
    revenueDeductions: revenueDeductions * m,
    netRevenue: netRevenue * m,
    cogs: cogs * m,
    grossProfit: grossProfit * m,

    financialIncome: financialIncome * m,
    financialExpenses: financialExpenses * m,
    interestExpenses: interestExpenses * m,
    shareOfAssociates: shareOfAssociates * m,

    sellingExpenses: sellingExpenses * m,
    adminExpenses: adminExpenses * m,

    operatingProfit: operatingProfit * m,
    otherIncome: otherIncome * m,
    otherExpenses: otherExpenses * m,
    otherProfit: otherProfit * m,

    profitBeforeTax: profitBeforeTax * m,
    incomeTaxCurrent: incomeTaxCurrent * m,
    incomeTaxDeferred: incomeTaxDeferred * m,
    totalIncomeTax: totalIncomeTax * m,

    netProfit: netProfit * m,
    minorityInterest: minorityInterest * m,
    netProfitParent: netProfitParent * m,

    eps,          // EPS is in VND per share, NOT scaled
    dilutedEps,   // EPS is in VND per share, NOT scaled

    ebitda: ebitda * m,
    ebit: ebit * m,
  };
}
