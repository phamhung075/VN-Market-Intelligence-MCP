/**
 * Income Statement Extractor — Task 043 / Task 288 / Task 1119
 *
 * Parses raw Vietnamese BCTC text (Báo cáo KQHĐKD) and returns a typed
 * IncomeStatement object.
 *
 * FR-3 (Task 288): NFC normalization + ASCII diacritic-stripped fallback patterns.
 * - rawText is NFC-normalized before splitting into lines.
 * - Each field has a primary (diacritics) pattern and an ASCII fallback pattern.
 * - findValue tries primary first; if no match, tries fallback on diacritic-stripped lines.
 *
 * Task 1119: Split-block fallback for consolidated PDFs (e.g. VNM Q4-2025).
 * - Consolidated PDFs produce OCR where labels and numbers are in separate blocks
 *   (100+ lines apart). After label-match fails within LOOKAHEAD_LINES, a
 *   split-block scan searches for a data block keyed by "Năm kết thúc ngày"
 *   (annual column header) and extracts values by item-code order.
 * - Magnitude inference (ported from balanceSheetExtractor): if netRevenue > 1B
 *   after extraction, values are in raw VND and are divided by 1,000,000.
 *
 * Domain layer — pure function, zero I/O.
 * Depends only on parseVnNumber (domain/services).
 */

import { parseVnNumber } from "../vnNumberParser.js";
import type { IncomeStatement } from "../../../../bctc-schema";
import { guardFinancialField } from "./extractorGuards.js";
import { stripDiacritics, detectUnitMultiplier } from "./extractorHelpers.js";
import { findValue } from "./lib/lineScan.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
//
// FACTORY-DOMAIN-extract-bctc-parsing-lib (2026-07-08): findValue relocated
// to ./lib/lineScan.ts (canonical, shared with balanceSheetExtractor /
// cashFlowExtractor). The call site below passes the ASCII fallback as
// `{ fallback: { lines: fallbackLines, pattern: fallback } }` — no
// rowCodeGuard (this extractor never had one), reproducing the original
// 4-arg behavior exactly.

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

// 1196: Banking sector uses "Thu nhập lãi thuần" as net revenue equivalent
const P_NET_REVENUE_BANKING = /thu\s+nh[ậa]p\s+l[ãa]i\s+thu[ầa]n/i;
const F_NET_REVENUE_BANKING = /thu\s+nhap\s+lai\s+thuan/i;

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
// Task 1870b: negative lookahead excludes "chưa phân phối" (retained earnings on
// balance sheet) which was poisoning detectUnitMultiplier sentinel in mixed-unit PDFs.
const P_NET_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe](?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)/i;
const F_NET_PROFIT = /loi\s+nhuan\s+sau\s+thue(?!\s+chua\s+phan\s+phoi)/i;

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
// Task 1119 — Split-block fallback helpers
// ---------------------------------------------------------------------------

/**
 * Extract the n-th large number (0-indexed) from a line containing multiple
 * space-separated number tokens. Returns null when the line has fewer than
 * (colIndex + 1) large numbers.
 *
 * Used to select the correct column in 4-column packed rows:
 *   "Q4-2025_val  Q4-2024_val  FY-2025_val  FY-2024_val"
 *   → colIndex=2 extracts FY-2025 (the annual current-period value).
 */
function extractColumnNumber(line: string, colIndex: number): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const tokens = trimmed.match(/\(?\-?[\d.,]+(?:[eE][+-]?\d+)?\)?/g);
  if (!tokens) return null;

  const largeNumbers: number[] = [];
  for (const token of tokens) {
    const val = parseVnNumber(token);
    if (val === null) continue;
    // Skip item codes (small integers ≤ 999)
    if (Number.isInteger(val) && val >= 0 && val <= 999) continue;
    largeNumbers.push(val);
  }

  if (largeNumbers.length <= colIndex) return null;
  return largeNumbers[colIndex]!;
}

/**
 * Detect whether the text uses a split-block layout (consolidated PDFs).
 *
 * A split-block layout is detected when:
 *   1. The text contains "Năm kết thúc ngày" (annual period column header)
 *   2. That header is more than 20 lines after "Doanh thu thuần"
 *      (labels and numbers are in separate blocks)
 *
 * Returns the index of the first 4-column data line (where FY-2025 is col 2),
 * or -1 if the layout is not split-block.
 */
function detectSplitBlockDataStart(lines: string[]): number {
  // Find the income section start
  let labelLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/doanh\s+thu\s+thu[ầa]n/i.test(lines[i]!) ||
        /doanh\s+thu\s+thuan/i.test(lines[i]!)) {
      labelLine = i;
      break;
    }
  }
  if (labelLine < 0) return -1;

  // Look for "Năm kết thúc" header
  for (let i = labelLine; i < Math.min(labelLine + 200, lines.length); i++) {
    if (/n[aă]m\s+k[eế]t\s+th[uú]c/i.test(lines[i]!)) {
      // Found the annual column header — scan past the sub-headers (31/12/2025, VND etc.)
      // to find the first 4-column data row
      for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
        const col3 = extractColumnNumber(lines[j]!, 2);
        if (col3 !== null && col3 > 1_000_000) {
          // This is a packed multi-column data line, return its index
          return j;
        }
      }
      break;
    }
  }
  return -1;
}

/**
 * Parse the income statement from a split-block layout.
 *
 * In VNM consolidated PDFs, the data block looks like:
 *   Lines for items 01, 02 (separated, individual FY values on their own lines)
 *   Then packed 4-column rows for items 10, 11, 20, 21, 22, 23(?), 24, 25, 26, 30, ...
 *   Col order: [Q4-2025, Q4-2024, FY-2025, FY-2024]
 *   FY-2025 = column index 2
 *
 * Returns a partial mapping of item codes to FY-current values (in raw VND).
 * Returns null if the split-block pattern is not detected.
 */
function parseSplitBlockIncomeStatement(
  lines: string[],
): Partial<Record<string, number>> | null {
  const firstPackedLine = detectSplitBlockDataStart(lines);
  if (firstPackedLine < 0) return null;

  // ── Collect all packed rows starting at firstPackedLine ──────────────────
  // Each packed row has >= 2 large numbers on a single line.
  // We collect them in order; the order matches the item code sequence:
  //   item 10 (net revenue), 11 (cogs), 20 (gross profit), 21 (fin income),
  //   22 (fin expenses), ~23 (interest), 24 (share of associates), 25 (selling),
  //   26 (admin), 30 (operating profit), ...
  const PACKED_ITEM_ORDER = [
    "10", "11", "20",          // items 10-20 (always packed together)
    "21", "22", "23", "24", "25", "26",  // financial + operating expenses
    "30",                       // operating profit
  ];

  const result: Partial<Record<string, number>> = {};
  let packedIdx = 0;

  // ── Look for individual rows BEFORE the packed section ────────────────────
  // Items 01 (gross revenue) and 02 (deductions) may appear as single values
  // in a "FY-2025" sub-column above the packed section.
  // Strategy: scan backwards from firstPackedLine for large isolated numbers
  // near "Năm kết thúc" / "31/12/2025" headers
  let annualHeaderLine = -1;
  for (let i = Math.max(0, firstPackedLine - 50); i < firstPackedLine; i++) {
    if (/n[aă]m\s+k[eế]t\s+th[uú]c/i.test(lines[i]!)) {
      annualHeaderLine = i;
      break;
    }
  }

  if (annualHeaderLine >= 0) {
    // Collect single-value lines between the annual header and the first packed row
    const singleValues: number[] = [];
    for (let i = annualHeaderLine + 1; i < firstPackedLine; i++) {
      const line = lines[i]!.trim();
      // Skip pure header lines (dates like "31/12/2025", "VND", empty)
      if (!line || /^\d{2}\/\d{2}\/\d{4}$/.test(line) || /^VND$/i.test(line)) continue;
      // Skip non-financial text
      if (/[a-zA-ZÀ-ỹ]{3,}/.test(line)) continue;
      const val = parseVnNumber(line);
      if (val !== null && val > 1_000_000) {
        singleValues.push(val);
      }
    }
    // singleValues[0] = FY-2025 gross revenue (item 01)
    // singleValues[1] = FY-2025 deductions (item 02)
    if (singleValues[0] !== undefined) result["01"] = singleValues[0]!;
    if (singleValues[1] !== undefined) result["02"] = singleValues[1]!;
  }

  // ── Parse packed rows in order ────────────────────────────────────────────
  for (let i = firstPackedLine; i < Math.min(firstPackedLine + 60, lines.length); i++) {
    if (packedIdx >= PACKED_ITEM_ORDER.length) break;
    const line = lines[i]!;

    // Check if this is a packed 4-column row (col 2 exists and is large)
    const col2 = extractColumnNumber(line, 2);
    if (col2 !== null && col2 > 1_000_000) {
      const code = PACKED_ITEM_ORDER[packedIdx]!;
      result[code] = col2;  // FY-2025 = col index 2
      packedIdx++;
    }
  }

  // Only return result if we found at least net revenue (item 10)
  if (!result["10"]) return null;
  return result;
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
 *
 * Task 1119: Split-block fallback for consolidated PDFs (VNM-style OCR where
 * all labels appear before any numbers). Magnitude inference added: if netRevenue
 * > 1B after extraction, values are raw VND and are divided by 1,000,000.
 */
export function extractIncomeStatement(rawText: string): IncomeStatement {
  // NFC normalization (FR-3): ensures precomposed Unicode characters match patterns
  const normalized = rawText.normalize("NFC");
  const primaryLines = normalized.split("\n");

  // Fallback lines: NFC + diacritic strip (for corrupted PDFs)
  const fallbackLines = primaryLines.map(stripDiacritics);

  // Task 1119: Try split-block extraction first for consolidated PDFs
  const splitBlock = parseSplitBlockIncomeStatement(primaryLines);

  // If split-block found net revenue, use it as an override for label-matched values
  const sbOverride = splitBlock ?? {};

  // Convenience wrapper that passes both line arrays, with split-block override
  const fv = (primary: RegExp, fallback: RegExp, sbKey?: string): number => {
    if (sbKey && sbOverride[sbKey] !== undefined) return sbOverride[sbKey]!;
    return findValue(primaryLines, primary, { fallback: { lines: fallbackLines, pattern: fallback } });
  };

  // --- Revenue ---
  const grossRevenue = fv(P_GROSS_REVENUE, F_GROSS_REVENUE, "01");
  const revenueDeductions = fv(P_REVENUE_DEDUCTIONS, F_REVENUE_DEDUCTIONS, "02");
  let netRevenue = fv(P_NET_REVENUE, F_NET_REVENUE, "10");
  // 1196: Banking sector fallback — "Thu nhập lãi thuần" maps to netRevenue
  if (netRevenue === 0) {
    netRevenue = fv(P_NET_REVENUE_BANKING, F_NET_REVENUE_BANKING);
  }
  const cogs = fv(P_COGS, F_COGS, "11");
  let grossProfit = fv(P_GROSS_PROFIT, F_GROSS_PROFIT, "20");
  // Fallback: compute grossProfit if not explicitly stated
  if (grossProfit === 0 && netRevenue > 0) {
    grossProfit = netRevenue - cogs;
  }

  // --- Financial items ---
  const financialIncome = fv(P_FINANCIAL_INCOME, F_FINANCIAL_INCOME, "21");
  const financialExpenses = fv(P_FINANCIAL_EXPENSES, F_FINANCIAL_EXPENSES, "22");
  const interestExpenses = fv(P_INTEREST_EXPENSES, F_INTEREST_EXPENSES, "23");
  const shareOfAssociates = fv(P_SHARE_OF_ASSOCIATES, F_SHARE_OF_ASSOCIATES, "24");

  // --- Operating expenses ---
  const sellingExpenses = fv(P_SELLING_EXPENSES, F_SELLING_EXPENSES, "25");
  const adminExpenses = fv(P_ADMIN_EXPENSES, F_ADMIN_EXPENSES, "26");

  // --- Operating profit ---
  const operatingProfit = fv(P_OPERATING_PROFIT, F_OPERATING_PROFIT, "30");

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

  // Task 1119: Magnitude inference (ported from balanceSheetExtractor).
  // If netRevenue exceeds 1 billion triệu after multiplier, the values are
  // almost certainly raw VND (đồng), not triệu or tỷ.
  // VN listed companies have net revenue in triệu between ~1,000 and ~200,000,000.
  // 1 triệu đồng = 1,000,000 đồng — divide raw VND by 1,000,000.
  //
  // Task 1810a (Fix A): Use the maximum of all core revenue/profit fields as the
  // sentinel instead of netRevenue alone. This catches cases where netRevenue OCR
  // produces a sci-notation token that inflates only one field while others look normal.
  const allRawFields = [netRevenue, cogs, grossProfit, operatingProfit, profitBeforeTax, netProfit].filter(
    (v): v is number => v !== null && !isNaN(v) && v > 0,
  );
  const sentinel = allRawFields.length > 0 ? Math.max(...allRawFields) : netRevenue;

  // JANITOR-014c: resolve sentinels (-1 bare đồng, -2 no unit found) before
  // the 1e14 guard. The canonical detectUnitMultiplier returns -1/-2 where the
  // old income statement version returned 1 as default. We resolve sentinels
  // here using the same magnitude heuristic as balanceSheetExtractor.
  let m = multiplier;
  if (m === -1 || m === -2) {
    m = sentinel > 1_000_000_000 ? 0.000001 : 1;
  }

  if (sentinel * m > 1e14) {
    m = 0.000001;
  } else if (m === 1 && sentinel > 1_000_000_000) {
    m = 0.000001;
  } else if (m > 1 && sentinel > 1_000_000_000) {
    // PDF header declares a unit multiplier (e.g. tỷ = 1000) but OCR values are
    // already raw VND integers (e.g. 14,324,284,500 đồng). Applying the multiplier
    // would produce quadrillions. Detect by: multiplier > 1 AND sentinel > 1e9
    // (realistic tỷ values fit in a few thousand, not billions).
    // Correct action: divide by 1,000,000 to convert raw VND → triệu.
    m = 0.000001;
  }

  return {
    grossRevenue:         guardFinancialField(grossRevenue * m,         "grossRevenue",         grossRevenue),
    revenueDeductions:    guardFinancialField(revenueDeductions * m,    "revenueDeductions",    revenueDeductions),
    netRevenue:           guardFinancialField(netRevenue * m,           "netRevenue",           netRevenue),
    cogs:                 guardFinancialField(cogs * m,                 "cogs",                 cogs),
    grossProfit:          guardFinancialField(grossProfit * m,          "grossProfit",          grossProfit),

    financialIncome:      guardFinancialField(financialIncome * m,      "financialIncome",      financialIncome),
    financialExpenses:    guardFinancialField(financialExpenses * m,    "financialExpenses",    financialExpenses),
    interestExpenses:     guardFinancialField(interestExpenses * m,     "interestExpenses",     interestExpenses),
    shareOfAssociates:    guardFinancialField(shareOfAssociates * m,    "shareOfAssociates",    shareOfAssociates),

    sellingExpenses:      guardFinancialField(sellingExpenses * m,      "sellingExpenses",      sellingExpenses),
    adminExpenses:        guardFinancialField(adminExpenses * m,        "adminExpenses",        adminExpenses),

    operatingProfit:      guardFinancialField(operatingProfit * m,      "operatingProfit",      operatingProfit),
    otherIncome:          guardFinancialField(otherIncome * m,          "otherIncome",          otherIncome),
    otherExpenses:        guardFinancialField(otherExpenses * m,        "otherExpenses",        otherExpenses),
    otherProfit:          guardFinancialField(otherProfit * m,          "otherProfit",          otherProfit),

    profitBeforeTax:      guardFinancialField(profitBeforeTax * m,      "profitBeforeTax",      profitBeforeTax),
    incomeTaxCurrent:     guardFinancialField(incomeTaxCurrent * m,     "incomeTaxCurrent",     incomeTaxCurrent),
    incomeTaxDeferred:    guardFinancialField(incomeTaxDeferred * m,    "incomeTaxDeferred",    incomeTaxDeferred),
    totalIncomeTax:       guardFinancialField(totalIncomeTax * m,       "totalIncomeTax",       totalIncomeTax),

    netProfit:            guardFinancialField(netProfit * m,            "netProfit",            netProfit),
    minorityInterest:     guardFinancialField(minorityInterest * m,     "minorityInterest",     minorityInterest),
    netProfitParent:      guardFinancialField(netProfitParent * m,      "netProfitParent",      netProfitParent),

    eps,           // EPS in VND/share — NOT scaled, NOT guarded
    dilutedEps,    // EPS in VND/share — NOT scaled, NOT guarded

    ebitda:               guardFinancialField(ebitda * m,               "ebitda",               ebitda),
    ebit:                 guardFinancialField(ebit * m,                 "ebit",                 ebit),
  };
}
