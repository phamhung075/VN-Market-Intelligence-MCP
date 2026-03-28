/**
 * Income Statement Extractor — Task 043
 *
 * Parses raw Vietnamese BCTC text (Báo cáo KQHĐKD) and returns a typed
 * IncomeStatement object.
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "./vnNumberParser";
import type { IncomeStatement } from "../../../bctc-schema";

// ---------------------------------------------------------------------------
// Helpers (same pattern as balanceSheetExtractor)
// ---------------------------------------------------------------------------

/** Extract the last number on a line using parseVnNumber. */
function extractNumber(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/(\(?\-?[\d.,]+\)?)[\s]*$/);
  if (!match || !match[1]) return null;
  return parseVnNumber(match[1]);
}

/**
 * Find the first line matching a pattern and extract its number.
 * Returns 0 if not found (missing fields default to 0).
 */
function findValue(lines: string[], pattern: RegExp): number {
  for (const line of lines) {
    if (pattern.test(line)) {
      const val = extractNumber(line);
      if (val !== null) return val;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Keyword patterns (case-insensitive, Vietnamese diacritics-tolerant)
// ---------------------------------------------------------------------------

// Revenue
const P_GROSS_REVENUE = /doanh\s+thu\s+b[áa]n\s+h[àa]ng/i;
const P_REVENUE_DEDUCTIONS = /gi[ảa]m\s+tr[ừu]\s+doanh\s+thu/i;
const P_NET_REVENUE = /doanh\s+thu\s+thu[ầa]n/i;
const P_COGS = /gi[áa]\s+v[ốo]n\s+h[àa]ng\s+b[áa]n/i;
const P_GROSS_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+g[ộo]p/i;

// Financial items
const P_FINANCIAL_INCOME = /doanh\s+thu\s+ho[ạa]t\s+[đd][ộo]ng\s+t[àa]i\s+ch[ía]nh/i;
const P_FINANCIAL_EXPENSES = /chi\s+ph[ía]\s+t[àa]i\s+ch[ía]nh/i;
const P_INTEREST_EXPENSES = /chi\s+ph[ía]\s+l[ãa]i\s+vay/i;
const P_SHARE_OF_ASSOCIATES = /ph[ầa]n\s+l[ãa]i[\/\s]l[ỗo]\s+.*li[êe]n\s+k[ếe]t/i;

// Operating expenses
const P_SELLING_EXPENSES = /chi\s+ph[ía]\s+b[áa]n\s+h[àa]ng/i;
const P_ADMIN_EXPENSES = /chi\s+ph[ía]\s+qu[ảa]n\s+l[ýy]\s+doanh\s+nghi[ệe]p/i;

// Operating profit
const P_OPERATING_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+thu[ầa]n\s+t[ừu]\s+.*h[oọ][ạa]t\s+[đd][ộo]ng\s+kinh\s+doanh|l[ợo]i\s+nhu[ậa]n\s+thu[ầa]n\s+t[ừu]\s+H[ĐD]KD/i;

// Other income/expenses
const P_OTHER_INCOME = /thu\s+nh[ậa]p\s+kh[áa]c/i;
const P_OTHER_EXPENSES = /chi\s+ph[ía]\s+kh[áa]c/i;
const P_OTHER_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+kh[áa]c/i;

// Tax
const P_PROFIT_BEFORE_TAX = /l[ợo]i\s+nhu[ậa]n\s+.*tr[ưu][ớo]c\s+thu[ếe]|t[ổo]ng\s+l[ợo]i\s+nhu[ậa]n\s+.*tr[ưu][ớo]c\s+thu[ếe]/i;
const P_INCOME_TAX_CURRENT = /thu[ếe]\s+TNDN\s+hi[ệe]n\s+h[àa]nh|thu[ếe]\s+.*hi[ệe]n\s+h[àa]nh/i;
const P_INCOME_TAX_DEFERRED = /thu[ếe]\s+TNDN\s+ho[ãa]n\s+l[ạa]i|thu[ếe]\s+.*ho[ãa]n\s+l[ạa]i/i;
const P_TOTAL_INCOME_TAX = /t[ổo]ng\s+chi\s+ph[ía]\s+thu[ếe]\s+TNDN/i;

// Net profit
const P_NET_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]/i;
const P_MINORITY_INTEREST = /l[ợo]i\s+[ía]ch\s+.*c[ổo]\s+[đd][ôo]ng\s+kh[ôo]ng\s+ki[ểe]m\s+so[áa]t/i;
const P_NET_PROFIT_PARENT = /LNST\s+c[ủu]a\s+c[ổo]\s+[đd][ôo]ng\s+c[ôo]ng\s+ty\s+m[ẹe]|l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]\s+c[ủu]a\s+c[ổo]\s+[đd][ôo]ng\s+c[ôo]ng\s+ty\s+m[ẹe]/i;

// EPS
const P_EPS = /l[ãa]i\s+c[ơo]\s+b[ảa]n\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u/i;
const P_DILUTED_EPS = /l[ãa]i\s+suy\s+gi[ảa]m\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u|l[ãa]i\s+pha\s+lo[ãa]ng\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u/i;

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract an IncomeStatement from raw Vietnamese financial report text.
 *
 * Numbers should be in triệu đồng (million VND), except EPS which is in VND.
 * Missing line items default to 0.
 */
export function extractIncomeStatement(rawText: string): IncomeStatement {
  const lines = rawText.split("\n");

  // --- Revenue ---
  const grossRevenue = findValue(lines, P_GROSS_REVENUE);
  const revenueDeductions = findValue(lines, P_REVENUE_DEDUCTIONS);
  const netRevenue = findValue(lines, P_NET_REVENUE);
  const cogs = findValue(lines, P_COGS);
  let grossProfit = findValue(lines, P_GROSS_PROFIT);
  // Fallback: compute grossProfit if not explicitly stated
  if (grossProfit === 0 && netRevenue > 0) {
    grossProfit = netRevenue - cogs;
  }

  // --- Financial items ---
  const financialIncome = findValue(lines, P_FINANCIAL_INCOME);
  const financialExpenses = findValue(lines, P_FINANCIAL_EXPENSES);
  const interestExpenses = findValue(lines, P_INTEREST_EXPENSES);
  const shareOfAssociates = findValue(lines, P_SHARE_OF_ASSOCIATES);

  // --- Operating expenses ---
  const sellingExpenses = findValue(lines, P_SELLING_EXPENSES);
  const adminExpenses = findValue(lines, P_ADMIN_EXPENSES);

  // --- Operating profit ---
  const operatingProfit = findValue(lines, P_OPERATING_PROFIT);

  // --- Other income/expenses ---
  const otherIncome = findValue(lines, P_OTHER_INCOME);
  const otherExpenses = findValue(lines, P_OTHER_EXPENSES);
  let otherProfit = findValue(lines, P_OTHER_PROFIT);
  // Fallback: compute otherProfit if not found
  if (otherProfit === 0 && (otherIncome > 0 || otherExpenses > 0)) {
    otherProfit = otherIncome - otherExpenses;
  }

  // --- Profit before tax ---
  const profitBeforeTax = findValue(lines, P_PROFIT_BEFORE_TAX);

  // --- Tax ---
  const incomeTaxCurrent = findValue(lines, P_INCOME_TAX_CURRENT);
  const incomeTaxDeferred = findValue(lines, P_INCOME_TAX_DEFERRED);
  let totalIncomeTax = findValue(lines, P_TOTAL_INCOME_TAX);
  // Fallback: compute total tax if not explicitly found
  if (totalIncomeTax === 0 && (incomeTaxCurrent > 0 || incomeTaxDeferred > 0)) {
    totalIncomeTax = incomeTaxCurrent + incomeTaxDeferred;
  }

  // --- Net profit ---
  const netProfit = findValue(lines, P_NET_PROFIT);
  const minorityInterest = findValue(lines, P_MINORITY_INTEREST);
  const netProfitParent = findValue(lines, P_NET_PROFIT_PARENT);

  // --- EPS ---
  // Diluted EPS pattern must be checked BEFORE basic EPS since basic EPS regex
  // would also match diluted lines. We search diluted first explicitly.
  const dilutedEps = findValue(lines, P_DILUTED_EPS);
  const eps = findValue(lines, P_EPS);

  // --- Computed fields ---
  const ebit = operatingProfit; // Approximation per bctc-schema.ts
  const ebitda = 0; // Cannot compute without depreciation (from cash flow statement)

  return {
    grossRevenue,
    revenueDeductions,
    netRevenue,
    cogs,
    grossProfit,

    financialIncome,
    financialExpenses,
    interestExpenses,
    shareOfAssociates,

    sellingExpenses,
    adminExpenses,

    operatingProfit,
    otherIncome,
    otherExpenses,
    otherProfit,

    profitBeforeTax,
    incomeTaxCurrent,
    incomeTaxDeferred,
    totalIncomeTax,

    netProfit,
    minorityInterest,
    netProfitParent,

    eps,
    dilutedEps,

    ebitda,
    ebit,
  };
}
