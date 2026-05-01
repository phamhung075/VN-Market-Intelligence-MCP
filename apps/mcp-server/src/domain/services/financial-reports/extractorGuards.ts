import type { BalanceSheet } from "../../../../bctc-schema";

// ---------------------------------------------------------------------------
// Bounds — post-multiplier triệu đồng
// ---------------------------------------------------------------------------

/** Deepest plausible negative equity / loss for any VN listed company */
export const GUARD_MIN = -10_000_000_000_000;   // −10T triệu

/** 10× VCB annual revenue ceiling — physically impossible for any VN listed company */
export const GUARD_MAX = 2_000_000_000_000;     // 2T triệu

// ---------------------------------------------------------------------------
// guardFinancialField
// ---------------------------------------------------------------------------

/**
 * Guards a single post-multiplier monetary field (triệu đồng).
 *
 * @param value     Post-multiplier value (triệu đồng) — the number to bounds-check
 * @param fieldName Field name for audit log
 * @param rawValue  Pre-multiplier token — included in audit log for OCR debugging
 * @returns value unchanged if within [GUARD_MIN, GUARD_MAX]; 0 otherwise
 */
export function guardFinancialField(
  value: number,
  fieldName: string,
  rawValue: number,
): number {
  if (value < GUARD_MIN || value > GUARD_MAX) {
    console.warn(
      `[extractorGuards] Impossible value rejected: field=${fieldName} value=${value} raw='${rawValue}'`,
    );
    return 0;
  }
  return value;
}

// ---------------------------------------------------------------------------
// guardBalanceSheet
// ---------------------------------------------------------------------------

/**
 * Applies guardFinancialField to every monetary leaf in a BalanceSheet.
 * Returns a new BalanceSheet — does not mutate input.
 */
export function guardBalanceSheet(bs: BalanceSheet): BalanceSheet {
  const g = (v: number, field: string) => guardFinancialField(v, field, v);
  return {
    currentAssets: {
      cash:                   g(bs.currentAssets.cash,                   "currentAssets.cash"),
      shortTermInvestments:   g(bs.currentAssets.shortTermInvestments,   "currentAssets.shortTermInvestments"),
      accountsReceivable:     g(bs.currentAssets.accountsReceivable,     "currentAssets.accountsReceivable"),
      inventory:              g(bs.currentAssets.inventory,              "currentAssets.inventory"),
      otherCurrentAssets:     g(bs.currentAssets.otherCurrentAssets,     "currentAssets.otherCurrentAssets"),
      total:                  g(bs.currentAssets.total,                  "currentAssets.total"),
    },
    nonCurrentAssets: {
      longTermReceivables:    g(bs.nonCurrentAssets.longTermReceivables, "nonCurrentAssets.longTermReceivables"),
      fixedAssets:            g(bs.nonCurrentAssets.fixedAssets,         "nonCurrentAssets.fixedAssets"),
      investmentProperty:     g(bs.nonCurrentAssets.investmentProperty,  "nonCurrentAssets.investmentProperty"),
      longTermInvestments:    g(bs.nonCurrentAssets.longTermInvestments, "nonCurrentAssets.longTermInvestments"),
      goodwill:               g(bs.nonCurrentAssets.goodwill,            "nonCurrentAssets.goodwill"),
      otherLongTermAssets:    g(bs.nonCurrentAssets.otherLongTermAssets, "nonCurrentAssets.otherLongTermAssets"),
      total:                  g(bs.nonCurrentAssets.total,               "nonCurrentAssets.total"),
    },
    totalAssets: g(bs.totalAssets, "totalAssets"),
    currentLiabilities: {
      shortTermDebt:           g(bs.currentLiabilities.shortTermDebt,           "currentLiabilities.shortTermDebt"),
      accountsPayable:         g(bs.currentLiabilities.accountsPayable,         "currentLiabilities.accountsPayable"),
      advancesFromCustomers:   g(bs.currentLiabilities.advancesFromCustomers,   "currentLiabilities.advancesFromCustomers"),
      taxPayable:              g(bs.currentLiabilities.taxPayable,              "currentLiabilities.taxPayable"),
      payablesToEmployees:     g(bs.currentLiabilities.payablesToEmployees,     "currentLiabilities.payablesToEmployees"),
      otherCurrentLiabilities: g(bs.currentLiabilities.otherCurrentLiabilities, "currentLiabilities.otherCurrentLiabilities"),
      total:                   g(bs.currentLiabilities.total,                   "currentLiabilities.total"),
    },
    longTermLiabilities: {
      longTermDebt:             g(bs.longTermLiabilities.longTermDebt,             "longTermLiabilities.longTermDebt"),
      deferredTaxLiabilities:   g(bs.longTermLiabilities.deferredTaxLiabilities,   "longTermLiabilities.deferredTaxLiabilities"),
      otherLongTermLiabilities: g(bs.longTermLiabilities.otherLongTermLiabilities, "longTermLiabilities.otherLongTermLiabilities"),
      total:                    g(bs.longTermLiabilities.total,                    "longTermLiabilities.total"),
    },
    totalLiabilities: g(bs.totalLiabilities, "totalLiabilities"),
    equity: {
      shareCapital:           g(bs.equity.shareCapital,                  "equity.shareCapital"),
      sharePremium:           g(bs.equity.sharePremium,                  "equity.sharePremium"),
      treasuryShares:         g(bs.equity.treasuryShares,                "equity.treasuryShares"),
      retainedEarnings:       g(bs.equity.retainedEarnings,              "equity.retainedEarnings"),
      otherEquityFunds:       g(bs.equity.otherEquityFunds,              "equity.otherEquityFunds"),
      minorityInterest:       g(bs.equity.minorityInterest,              "equity.minorityInterest"),
      total:                  g(bs.equity.total,                         "equity.total"),
    },
    totalLiabilitiesAndEquity: g(bs.totalLiabilitiesAndEquity, "totalLiabilitiesAndEquity"),
  };
}
