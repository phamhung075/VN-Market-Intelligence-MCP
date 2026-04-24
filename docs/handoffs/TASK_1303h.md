# Handoff: TASK-1303h — BCTC PDF Parser — Impossible Figures Guard

status: READY_FOR_DEVELOPER
tech_ref: docs/TECH_1303h.md
req_ref: docs/REQ_1303h.md
sprint: 1303

---

## [Architect] Brownfield Findings

interfaces_found:
- `src/domain/services/financial-reports/incomeStatementExtractor.ts:527–561`  # MODIFY — inline guard per field in return object
- `src/domain/services/financial-reports/balanceSheetExtractor.ts:604`          # MODIFY — wrap applyMultiplier() result

interfaces_to_create:
- `src/domain/services/financial-reports/extractorGuards.ts`   # NEW — guardFinancialField + guardBalanceSheet
- `src/__tests__/1303h-extractor-guards.test.ts`               # NEW — RED/GREEN test suite

decisions:
- "Post-multiplier guard: fires on final triệu value, not on raw extractNumber() token"
- "Balance sheet uses guardBalanceSheet() helper to avoid 20+ inline guard calls on nested struct"
- "Returns 0 (not null) on rejection — matches existing findValue() missing-field default"
- "EPS exempt by design — not in multiplier path, will never reach GUARD_MAX"

brownfield_scan_clean: true

---

## Step-by-Step Developer Checklist

### STEP 0 — Branch

```bash
git checkout main && git pull
git checkout -b task/1303h-impossible-figures-guard
```

---

### STEP 1 — RED: write failing test file first

Create `src/__tests__/1303h-extractor-guards.test.ts` with the structure below.
All tests that call `guardFinancialField` and `guardBalanceSheet` will fail (file does not exist yet).
Integration tests calling `extractIncomeStatement` / `extractBalanceSheet` will pass for now (guard not wired).

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  guardFinancialField,
  GUARD_MAX,
  GUARD_MIN,
} from "../domain/services/financial-reports/extractorGuards";
import { extractIncomeStatement } from "../domain/services/financial-reports/incomeStatementExtractor";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

describe("1303h: extractorGuards", () => {
  describe("guardFinancialField", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    // AC-1: above GUARD_MAX
    it("RED: rejects value above GUARD_MAX", () => {
      const result = guardFinancialField(600_000_000_000_000, "netRevenue", 600_000_000_000);
      expect(result).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("netRevenue"),
      );
    });

    // AC-4: below GUARD_MIN
    it("RED: rejects value below GUARD_MIN", () => {
      const result = guardFinancialField(-20_000_000_000_000, "equity", -20_000_000_000);
      expect(result).toBe(0);
      expect(console.warn).toHaveBeenCalled();
    });

    // Boundary: exactly GUARD_MAX passes
    it("GREEN: passes value at GUARD_MAX boundary", () => {
      const result = guardFinancialField(GUARD_MAX, "totalAssets", GUARD_MAX);
      expect(result).toBe(GUARD_MAX);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // Boundary: exactly GUARD_MIN passes
    it("GREEN: passes value at GUARD_MIN boundary", () => {
      const result = guardFinancialField(GUARD_MIN, "equity", GUARD_MIN);
      expect(result).toBe(GUARD_MIN);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // AC-2: valid positive
    it("GREEN: passes valid positive value", () => {
      const result = guardFinancialField(9_500_000, "netRevenue", 9_500_000);
      expect(result).toBe(9_500_000);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // AC-3: valid negative
    it("GREEN: passes valid negative value", () => {
      const result = guardFinancialField(-800_000, "retainedEarnings", -800_000);
      expect(result).toBe(-800_000);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // Zero is the missing-field default — must pass
    it("GREEN: passes zero", () => {
      const result = guardFinancialField(0, "cogs", 0);
      expect(result).toBe(0);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("extractIncomeStatement guard integration", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    // AC-5: OCR-corrupted revenue
    it("RED: impossible netRevenue → 0", () => {
      const rawText = `
        Doanh thu bán hàng và cung cấp dịch vụ  999.999.999.999.999
        Các khoản giảm trừ doanh thu  0
        Doanh thu thuần về bán hàng  999.999.999.999.999
        Giá vốn hàng bán  100.000
        Lợi nhuận gộp  100.000
      `;
      const result = extractIncomeStatement(rawText);
      expect(result.netRevenue).toBe(0);
    });

    // AC-7: VNM-scale (all valid, no warn)
    it("GREEN: VNM-scale revenue passes", () => {
      const rawText = `
        Đơn vị tính: triệu đồng
        Doanh thu bán hàng và cung cấp dịch vụ  14.000.000
        Các khoản giảm trừ doanh thu  50.000
        Doanh thu thuần về bán hàng  13.950.000
        Giá vốn hàng bán  8.000.000
        Lợi nhuận gộp  5.950.000
      `;
      const result = extractIncomeStatement(rawText);
      expect(result.netRevenue).toBeGreaterThan(0);
      // console.warn must not have been called for any guard rejection
      const warnCalls = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls;
      const guardWarns = warnCalls.filter(args =>
        String(args[0]).includes("[extractorGuards]"),
      );
      expect(guardWarns).toHaveLength(0);
    });
  });

  describe("extractBalanceSheet guard integration", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    // AC-6: impossible totalAssets
    it("RED: impossible totalAssets → 0", () => {
      const rawText = `
        Đơn vị tính: triệu đồng
        TỔNG CỘNG TÀI SẢN  888.888.888.888.888
        Tài sản ngắn hạn  444.444.444.444.444
        Tài sản dài hạn  444.444.444.444.444
      `;
      const result = extractBalanceSheet(rawText);
      expect(result.totalAssets).toBe(0);
    });

    // AC-7: valid totalAssets passes
    it("GREEN: valid totalAssets passes", () => {
      const rawText = `
        Đơn vị tính: triệu đồng
        TỔNG CỘNG TÀI SẢN  5.000.000
        Tài sản ngắn hạn  2.500.000
        Tài sản dài hạn  2.500.000
        TỔNG CỘNG NGUỒN VỐN  5.000.000
      `;
      const result = extractBalanceSheet(rawText);
      expect(result.totalAssets).toBeGreaterThan(0);
    });
  });
});
```

Run `bun test src/__tests__/1303h-extractor-guards.test.ts` — expect compile errors / import failures on guard functions. That is the RED state.

---

### STEP 2 — GREEN: create `extractorGuards.ts`

Create `src/domain/services/financial-reports/extractorGuards.ts`:

```typescript
import type { BalanceSheet } from "../../../../bctc-schema";

// ---------------------------------------------------------------------------
// Bounds — post-multiplier triệu đồng
// ---------------------------------------------------------------------------

/** Deepest plausible negative equity / loss for any VN listed company */
export const GUARD_MIN = -10_000_000_000_000;   // −10T triệu

/** ~43× VCB total assets — physically impossible ceiling */
export const GUARD_MAX = 500_000_000_000_000;   // 500T triệu

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
      otherNonCurrentAssets:  g(bs.nonCurrentAssets.otherNonCurrentAssets, "nonCurrentAssets.otherNonCurrentAssets"),
      total:                  g(bs.nonCurrentAssets.total,               "nonCurrentAssets.total"),
    },
    totalAssets: g(bs.totalAssets, "totalAssets"),
    currentLiabilities: {
      shortTermLoans:         g(bs.currentLiabilities.shortTermLoans,    "currentLiabilities.shortTermLoans"),
      accountsPayable:        g(bs.currentLiabilities.accountsPayable,   "currentLiabilities.accountsPayable"),
      advancesFromCustomers:  g(bs.currentLiabilities.advancesFromCustomers, "currentLiabilities.advancesFromCustomers"),
      taxesPayable:           g(bs.currentLiabilities.taxesPayable,      "currentLiabilities.taxesPayable"),
      otherCurrentLiabilities: g(bs.currentLiabilities.otherCurrentLiabilities, "currentLiabilities.otherCurrentLiabilities"),
      total:                  g(bs.currentLiabilities.total,             "currentLiabilities.total"),
    },
    longTermLiabilities: {
      longTermLoans:          g(bs.longTermLiabilities.longTermLoans,    "longTermLiabilities.longTermLoans"),
      otherLongTermLiabilities: g(bs.longTermLiabilities.otherLongTermLiabilities, "longTermLiabilities.otherLongTermLiabilities"),
      total:                  g(bs.longTermLiabilities.total,            "longTermLiabilities.total"),
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
```

IMPORTANT: verify the `BalanceSheet` type import path matches `bctc-schema.ts` location. Check with:
```bash
grep -r "export.*BalanceSheet" /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/bctc-schema.ts
```
Adjust the import path if the type is exported from a barrel index instead.

Run tests — unit guard tests now pass. Integration tests still fail (guard not wired yet). Expected.

---

### STEP 3 — Wire guard into `incomeStatementExtractor.ts`

File: `src/domain/services/financial-reports/incomeStatementExtractor.ts`

Add import at top of file (alongside existing imports):
```typescript
import { guardFinancialField } from "./extractorGuards";
```

Replace the return block (lines 527–561). Pattern: `field * m` → `guardFinancialField(field * m, "fieldName", field)`.

Full replacement:

```typescript
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
```

---

### STEP 4 — Wire guard into `balanceSheetExtractor.ts`

File: `src/domain/services/financial-reports/balanceSheetExtractor.ts`

Add import at top of file:
```typescript
import { guardBalanceSheet } from "./extractorGuards";
```

Replace line 604:
```typescript
// BEFORE
return applyMultiplier(raw, effectiveMultiplier);

// AFTER
return guardBalanceSheet(applyMultiplier(raw, effectiveMultiplier));
```

That is the only change to this file.

---

### STEP 5 — Verify BalanceSheet type leaves match

`guardBalanceSheet` enumerates every leaf field. If `BalanceSheet` has fields not listed in the handoff (e.g. added in a later sprint), TypeScript will flag them as missing on the return type. Fix: add `g(bs.missingField, "missingField")` entries to match.

Check current schema:
```bash
grep -A 60 "export interface BalanceSheet" /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/bctc-schema.ts
```

---

### STEP 6 — Run full test suite

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1303h-extractor-guards.test.ts
bun tsc --noEmit
bun test
```

All 1303h tests must pass. Total test count must be >= prior count. No TypeScript errors.

---

### STEP 7 — Branch hygiene + merge

```bash
git add src/domain/services/financial-reports/extractorGuards.ts
git add src/domain/services/financial-reports/incomeStatementExtractor.ts
git add src/domain/services/financial-reports/balanceSheetExtractor.ts
git add src/__tests__/1303h-extractor-guards.test.ts
git commit -m "feat(1303h): add impossible-figures guard to BCTC extractors"
git checkout main
git merge task/1303h-impossible-figures-guard
git branch -d task/1303h-impossible-figures-guard
```

---

## Confirmed Injection Locations

| File | Line | Action |
|------|------|--------|
| `src/domain/services/financial-reports/incomeStatementExtractor.ts` | 527–561 | Replace return block — wrap each `field * m` with `guardFinancialField(...)` |
| `src/domain/services/financial-reports/balanceSheetExtractor.ts` | 604 | Replace `return applyMultiplier(raw, effectiveMultiplier)` with `return guardBalanceSheet(applyMultiplier(...))` |
| `src/domain/services/financial-reports/extractorGuards.ts` | — | New file — create from scratch |
| `src/__tests__/1303h-extractor-guards.test.ts` | — | New file — create from scratch |

---

## [Developer] Implementation Record

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/financial-reports/extractorGuards.ts`   # new: guardFinancialField + guardBalanceSheet + GUARD_MIN/MAX constants
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/financial-reports/incomeStatementExtractor.ts`   # added import + wrapped all 20 fields in return block with guardFinancialField
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/financial-reports/balanceSheetExtractor.ts`   # added import + wrapped applyMultiplier() result with guardBalanceSheet()
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1303h-extractor-guards.test.ts`   # new: 11 tests (unit + integration)

tests_written:
- `src/__tests__/1303h-extractor-guards.test.ts`   # 11 assertions, all GREEN

deviation_from_handoff:
- Used `bun:test` imports (not `vitest`) — matches rest of test suite
- Integration tests use `tỷ đồng` unit with 6×10^11 raw number instead of triệu with 999T figure. Reason: magnitude inference in both extractors divides any triệu value > 1B by 1e6, making it impossible for the guard to fire post-inference. The `tỷ` multiplier (×1000) bypasses magnitude inference and allows post-multiplier value to exceed GUARD_MAX. This is the real production scenario the guard protects against.
- `guardBalanceSheet` uses corrected field names from actual bctc-schema.ts (shortTermDebt not shortTermLoans; taxPayable not taxesPayable; payablesToEmployees added; longTermDebt not longTermLoans; deferredTaxLiabilities added; goodwill + otherLongTermAssets instead of otherNonCurrentAssets).

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 6592 pass, 16 fail (all 16 pre-existing, none are 1303h)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- newsNormalizer.ts:23 DDD violation (TC-1) is pre-existing, not introduced by 1303h

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/financial-reports/extractorGuards.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/financial-reports/incomeStatementExtractor.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/financial-reports/balanceSheetExtractor.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1303h-extractor-guards.test.ts

merge_commit: f0b169b3
