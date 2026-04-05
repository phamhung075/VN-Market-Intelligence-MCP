/**
 * Balance Sheet Extractor — Task 042 (extended by Task 287)
 *
 * Parses raw Vietnamese BCTC text and returns a typed BalanceSheet object.
 *
 * Task 287 additions:
 *   - NFC normalization before line splitting (FR-3 partial)
 *   - detectUnitMultiplier: detects "Triệu đồng" vs "Tỷ đồng" header (FR-1)
 *   - applyMultiplier: scales all monetary fields by detected multiplier (FR-1)
 *   - Row-code guard in findValue: skips multiples-of-10 in [10, 990] (FR-2)
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "./vnNumberParser";
import type {
  BalanceSheet,
  CurrentAssets,
  NonCurrentAssets,
  CurrentLiabilities,
  LongTermLiabilities,
  Equity,
} from "../../../bctc-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the last number on a line using parseVnNumber. */
function extractNumber(line: string): number | null {
  // Grab the last whitespace-delimited token(s) that look numeric.
  // Financial lines typically end with the amount, possibly with parentheses.
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try matching a trailing number token: handles 1.234.567 | (100.000) | 2,500,000 etc.
  const match = trimmed.match(/(\(?\-?[\d.,]+\)?)[\s]*$/);
  if (!match || !match[1]) return null;
  return parseVnNumber(match[1]);
}

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
 */
function findValue(lines: string[], pattern: RegExp): number {
  for (const line of lines) {
    if (lineMatches(line, pattern)) {
      const val = extractNumber(line);
      if (val === null) continue;
      // Guard: skip row-code artifacts (multiples of 10 in [10, 990])
      if (Number.isInteger(val) && val >= 10 && val <= 990 && val % 10 === 0) continue;
      return val;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Task 287 — FR-1: Unit header detection
// ---------------------------------------------------------------------------

/**
 * Scan PDF lines for a unit-declaration header and return the appropriate
 * multiplier to convert reported values to triệu đồng (million VND).
 *
 * - "Đơn vị tính: Triệu đồng" → multiplier = 1  (already in triệu)
 * - "Đơn vị tính: Tỷ đồng"    → multiplier = 1000 (1 tỷ = 1000 triệu)
 * - Not found                  → multiplier = 1  (default; caller logs warning)
 *
 * @param lines - Array of lines from the NFC-normalized rawText.
 * @returns Numeric multiplier (1 or 1000).
 */
function detectUnitMultiplier(lines: string[]): number {
  const P_UNIT_TRIEU =
    /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*(tri[eệ]u|trieu)/i;
  const P_UNIT_TY =
    /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*t[yỷ]/i;

  for (const line of lines) {
    if (P_UNIT_TRIEU.test(line)) return 1;
    if (P_UNIT_TY.test(line)) return 1000;
  }

  // No header found — default to 1 (assume triệu đồng)
  console.warn("[balanceSheetExtractor] No unit header found; defaulting multiplier to 1.");
  return 1;
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
const P_TOTAL_ASSETS = /t[ổo]ng\s+c[ộo]ng\s+t[àa]i\s+s[ảa]n/i;

// Liabilities
const P_TOTAL_LIABILITIES = /n[ợo]\s+ph[ảa]i\s+tr[ảa]/i;
const P_CURRENT_LIABILITIES = /n[ợo]\s+ng[ắa]n\s+h[ạa]n/i;
const P_SHORT_TERM_DEBT = /vay\s+v[àa]\s+n[ợo]\s+thu[êe]\s+t[àa]i\s+ch[ía]nh\s+ng[ắa]n\s+h[ạa]n/i;
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
const P_TOTAL_LIABILITIES_AND_EQUITY = /t[ổo]ng\s+c[ộo]ng\s+ngu[ồo]n\s+v[ốo]n/i;

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

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
  const lines = normalized.split("\n");

  // Task 287 — FR-1: detect unit multiplier BEFORE any findValue calls
  const multiplier = detectUnitMultiplier(lines);

  // --- Current assets ---
  const currentAssets: CurrentAssets = {
    cash: findValue(lines, P_CASH),
    shortTermInvestments: findValue(lines, P_SHORT_TERM_INVESTMENTS),
    accountsReceivable: findValue(lines, P_ACCOUNTS_RECEIVABLE),
    inventory: findValue(lines, P_INVENTORY),
    otherCurrentAssets: findValue(lines, P_OTHER_CURRENT_ASSETS),
    total: findValue(lines, P_CURRENT_ASSETS_TOTAL),
  };

  // --- Non-current assets ---
  const nonCurrentAssets: NonCurrentAssets = {
    longTermReceivables: findValue(lines, P_LONG_TERM_RECEIVABLES),
    fixedAssets: findValue(lines, P_FIXED_ASSETS),
    investmentProperty: findValue(lines, P_INVESTMENT_PROPERTY),
    longTermInvestments: findValue(lines, P_LONG_TERM_INVESTMENTS),
    goodwill: findValue(lines, P_GOODWILL),
    otherLongTermAssets: findValue(lines, P_OTHER_LONG_TERM_ASSETS),
    total: findValue(lines, P_NON_CURRENT_ASSETS_TOTAL),
  };

  // --- Total assets ---
  let totalAssets = findValue(lines, P_TOTAL_ASSETS);
  // Fallback: compute from sub-totals if explicit total not found
  if (totalAssets === 0 && (currentAssets.total > 0 || nonCurrentAssets.total > 0)) {
    totalAssets = currentAssets.total + nonCurrentAssets.total;
  }

  // --- Current liabilities ---
  const currentLiabilities: CurrentLiabilities = {
    shortTermDebt: findValue(lines, P_SHORT_TERM_DEBT),
    accountsPayable: findValue(lines, P_ACCOUNTS_PAYABLE),
    advancesFromCustomers: findValue(lines, P_ADVANCES_FROM_CUSTOMERS),
    taxPayable: findValue(lines, P_TAX_PAYABLE),
    payablesToEmployees: findValue(lines, P_PAYABLES_TO_EMPLOYEES),
    otherCurrentLiabilities: findValue(lines, P_OTHER_CURRENT_LIABILITIES),
    total: findValue(lines, P_CURRENT_LIABILITIES),
  };

  // --- Long-term liabilities ---
  const longTermLiabilities: LongTermLiabilities = {
    longTermDebt: findValue(lines, P_LONG_TERM_DEBT),
    deferredTaxLiabilities: findValue(lines, P_DEFERRED_TAX_LIABILITIES),
    otherLongTermLiabilities: findValue(lines, P_OTHER_LONG_TERM_LIABILITIES),
    total: findValue(lines, P_LONG_TERM_LIABILITIES),
  };

  // --- Total liabilities ---
  let totalLiabilities = findValue(lines, P_TOTAL_LIABILITIES);
  // If explicit total equals a sub-total (because regex matched the sub-total line first),
  // fall back to sum of current + long-term
  if (totalLiabilities === 0 && (currentLiabilities.total > 0 || longTermLiabilities.total > 0)) {
    totalLiabilities = currentLiabilities.total + longTermLiabilities.total;
  }

  // --- Equity ---
  const equity: Equity = {
    shareCapital: findValue(lines, P_SHARE_CAPITAL),
    sharePremium: findValue(lines, P_SHARE_PREMIUM),
    treasuryShares: findValue(lines, P_TREASURY_SHARES),
    retainedEarnings: findValue(lines, P_RETAINED_EARNINGS),
    otherEquityFunds: findValue(lines, P_OTHER_EQUITY_FUNDS),
    minorityInterest: findValue(lines, P_MINORITY_INTEREST),
    total: findValue(lines, P_EQUITY_TOTAL),
  };

  // --- Grand total ---
  const totalLiabilitiesAndEquity = findValue(lines, P_TOTAL_LIABILITIES_AND_EQUITY);

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
  return applyMultiplier(raw, multiplier);
}
