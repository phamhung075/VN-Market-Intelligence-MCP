/**
 * Cash Flow Extractor — Task 044
 *
 * Parses raw Vietnamese BCTC text and returns a typed CashFlowStatement object.
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "../vnNumberParser.js";
import type { CashFlowStatement } from "../../../../bctc-schema";

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

/** Case-insensitive check if a line contains a keyword pattern. */
function lineMatches(line: string, pattern: RegExp): boolean {
  return pattern.test(line);
}

/** Find the first line matching a pattern and extract its number. Returns 0 if not found. */
function findValue(lines: string[], pattern: RegExp): number {
  for (const line of lines) {
    if (lineMatches(line, pattern)) {
      const val = extractNumber(line);
      if (val !== null) return val;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Keyword patterns (case-insensitive, Vietnamese diacritics-tolerant)
// ---------------------------------------------------------------------------

// I. Operating activities
const P_PROFIT_BEFORE_TAX = /l[ợo]i\s+nhu[ậa]n\s+tr[ưu][ớo]c\s+thu[ếe]/i;
const P_DEPRECIATION = /kh[ấa]u\s+hao\s+TSC[ĐD]/i;
const P_WORKING_CAPITAL_CHANGES = /thay\s+[đd][ổo]i\s+v[ốo]n\s+l[ưu]u\s+[đd][ộo]ng/i;
const P_INTEREST_PAID = /ti[ềe]n\s+l[ãa]i\s+vay\s+[đd][ãa]\s+tr[ảa]/i;
const P_INCOME_TAX_PAID = /thu[ếe]\s+TNDN\s+[đd][ãa]\s+n[ộo]p/i;
const P_OPERATING_CF = /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+(?:ho[ạa]t\s+[đd][ộo]ng\s+kinh\s+doanh|H[ĐD]KD)/i;

// II. Investing activities
const P_CAPEX = /ti[ềe]n\s+chi\s+mua\s+s[ắa]m\s+TSC[ĐD]/i;
const P_ASSET_SALES = /ti[ềe]n\s+thu\s+thanh\s+l[ýy]\s+TSC[ĐD]/i;
const P_INVESTMENT_PURCHASES = /ti[ềe]n\s+chi\s+mua\s+c[áa]c\s+kho[ảa]n\s+[đd][ầa]u\s+t[ưu]/i;
const P_INVESTMENT_PROCEEDS = /ti[ềe]n\s+thu\s+h[ồo]i\s+[đd][ầa]u\s+t[ưu]/i;
const P_DIVIDENDS_RECEIVED = /c[ổo]\s+t[ứu]c\s+v[àa]\s+l[ãa]i\s+ti[ềe]n\s+g[ửu]i\s+[đd][ãa]\s+thu/i;
const P_INVESTING_CF = /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+(?:ho[ạa]t\s+[đd][ộo]ng\s+[đd][ầa]u\s+t[ưu]|H[ĐD][ĐD]T)/i;

// III. Financing activities
const P_PROCEEDS_FROM_DEBT = /ti[ềe]n\s+vay\s+nh[ậa]n\s+[đd][ưu][ợo]c/i;
const P_DEBT_REPAYMENTS = /ti[ềe]n\s+tr[ảa]\s+n[ợo]\s+g[ốo]c\s+vay/i;
const P_SHARE_ISSUANCE = /ti[ềe]n\s+thu\s+t[ừu]\s+ph[áa]t\s+h[àa]nh\s+c[ổo]\s+phi[ếe]u/i;
const P_DIVIDENDS_PAID = /c[ổo]\s+t[ứu]c\s+[đd][ãa]\s+tr[ảa]/i;
const P_FINANCING_CF = /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+(?:ho[ạa]t\s+[đd][ộo]ng\s+t[àa]i\s+ch[ía]nh|H[ĐD]TC)/i;

// Summary
const P_NET_CASH_FLOW = /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+trong\s+k[ỳy]/i;
const P_BEGINNING_CASH = /ti[ềe]n\s+v[àa]\s+t[ưu][ơo]ng\s+[đd][ưu][ơo]ng\s+ti[ềe]n\s+[đd][ầa]u\s+k[ỳy]/i;
const P_ENDING_CASH = /ti[ềe]n\s+v[àa]\s+t[ưu][ơo]ng\s+[đd][ưu][ơo]ng\s+ti[ềe]n\s+cu[ốo]i\s+k[ỳy]/i;

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract a CashFlowStatement from raw Vietnamese financial report text.
 *
 * Numbers should be in triệu đồng (million VND).
 * Missing line items default to 0.
 * FCF is computed as operatingCF + capex (capex is negative).
 */
export function extractCashFlow(rawText: string): CashFlowStatement {
  const lines = rawText.split("\n");

  // Operating
  const profitBeforeTax = findValue(lines, P_PROFIT_BEFORE_TAX);
  const depreciationAmortization = findValue(lines, P_DEPRECIATION);
  const workingCapitalChanges = findValue(lines, P_WORKING_CAPITAL_CHANGES);
  const interestPaid = findValue(lines, P_INTEREST_PAID);
  const incomeTaxPaid = findValue(lines, P_INCOME_TAX_PAID);
  const operatingCF = findValue(lines, P_OPERATING_CF);

  // Investing
  const capex = findValue(lines, P_CAPEX);
  const proceedsFromAssetSales = findValue(lines, P_ASSET_SALES);
  const investmentPurchases = findValue(lines, P_INVESTMENT_PURCHASES);
  const investmentProceeds = findValue(lines, P_INVESTMENT_PROCEEDS);
  const dividendsReceived = findValue(lines, P_DIVIDENDS_RECEIVED);
  const investingCF = findValue(lines, P_INVESTING_CF);

  // Financing
  const proceedsFromDebt = findValue(lines, P_PROCEEDS_FROM_DEBT);
  const debtRepayments = findValue(lines, P_DEBT_REPAYMENTS);
  const proceedsFromShareIssuance = findValue(lines, P_SHARE_ISSUANCE);
  const dividendsPaid = findValue(lines, P_DIVIDENDS_PAID);
  const financingCF = findValue(lines, P_FINANCING_CF);

  // Summary
  const netCashFlow = findValue(lines, P_NET_CASH_FLOW);
  const beginningCash = findValue(lines, P_BEGINNING_CASH);
  const endingCash = findValue(lines, P_ENDING_CASH);

  // Computed
  const freeCashFlow = operatingCF + capex;

  return {
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
}
