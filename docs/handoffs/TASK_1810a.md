# TASK_1810a — BCTC Income Statement: Scientific Notation + GUARD_MAX Tighten + Multi-Field Sentinel + HPG Short-Pattern

**Sprint:** 1810
**Type:** fix
**Priority:** high
**Owner:** developer
**Branch:** `task/1810a-income-stmt-guards`
**Estimated scope:** ~2h (single atomic task — all changes in the income statement extraction domain)

---

## Context

Three independent but co-located bugs in the BCTC income statement extractor, all surfaced by FPT Q4-2025 (magnitude explosion) and HPG Q4-2025 (zero-revenue). Fix all three in one branch.

---

## Files to Modify

1. `apps/mcp-server/src/domain/services/vnNumberParser.ts`
2. `apps/mcp-server/src/domain/services/financial-reports/extractorGuards.ts`
3. `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`
4. `apps/mcp-server/src/__tests__/041-vn-number-parser.test.ts` (extend)
5. `apps/mcp-server/src/__tests__/043-bctc-income-stmt.test.ts` (extend)

---

## Changes Required

### 1. vnNumberParser.ts — Scientific Notation Support

**Problem:** Numbers formatted in scientific notation (e.g. `1.23e12`) from PDF extraction bypass the parse block and return `NaN`, producing phantom magnitude explosions downstream.

**Fix:** Add a guard at the top of the main parse function, before the existing parse block:

```typescript
// Scientific notation guard — must come before existing parse block
if (/^-?[\d.]+[eE][+-]?\d+$/.test(raw.trim())) {
  return parseFloat(raw.trim());
}
```

Also extend `extractNumber` token regex in `incomeStatementExtractor.ts` to capture scientific notation tokens (see change 3 below).

### 2. extractorGuards.ts — Tighten GUARD_MAX

**Problem:** `GUARD_MAX = 500_000_000_000_000` (500 trillion VND) is 250× larger than Vietnam's GDP. Legitimate company revenue is under 2 trillion VND for large-caps.

**Fix:** Lower the constant:

```typescript
// Before:
const GUARD_MAX = 500_000_000_000_000;
// After:
const GUARD_MAX = 2_000_000_000_000; // 2 trillion VND — above any realistic large-cap revenue
```

### 3. incomeStatementExtractor.ts — Two fixes

**Fix A — Multi-field magnitude sentinel:**

Replace the current `netRevenue`-only magnitude guard with a multi-field max:

```typescript
// Before (single-field):
const sentinel = rawNetRevenue;

// After (multi-field):
const allRawFields = [rawNetRevenue, rawCOGS, rawGrossProfit, rawOperatingProfit].filter(
  (v): v is number => v !== null && !isNaN(v)
);
const sentinel = allRawFields.length > 0 ? Math.max(...allRawFields) : null;
```

**Fix B — HPG short-pattern fallback:**

Add a secondary regex for "Doanh thu thuần" without the trailing phrase that HPG's PDFs omit:

```typescript
// Primary pattern (existing):
/Doanh thu thuần về bán hàng/i

// Secondary fallback (new — add after primary fails):
/Doanh thu thuần\b/i
```

Apply the fallback only when the primary pattern returns no match.

### 4. Token regex for scientific notation in extractNumber

In `incomeStatementExtractor.ts`, extend the token regex used in `extractNumber` to capture scientific notation strings so they reach the parser:

```typescript
// Add to the existing token pattern alternatives:
| /-?[\d.,]+[eE][+-]?\d+/
```

---

## Tests to Add

### 041-vn-number-parser.test.ts — Add 3 cases

```typescript
describe("vnNumberParser — scientific notation", () => {
  it("parses positive sci notation", () => {
    expect(parseVnNumber("1.23e12")).toBeCloseTo(1.23e12);
  });
  it("parses negative sci notation", () => {
    expect(parseVnNumber("-4.5e9")).toBeCloseTo(-4.5e9);
  });
  it("parses sci notation with explicit + exponent", () => {
    expect(parseVnNumber("9.99e+10")).toBeCloseTo(9.99e10);
  });
});
```

### 043-bctc-income-stmt.test.ts — Add 2 fixtures

**FPT Q4 fixture (magnitude explosion):**
- Synthetic fixture where `netRevenue` raw value is `1.23e14` (triggers old GUARD_MAX pass-through)
- After fix: extractor returns `null` (rejected by tightened GUARD_MAX) or correct scaled value

**HPG Q4 fixture (zero-revenue / short-pattern):**
- Synthetic fixture with "Doanh thu thuần" line (no trailing phrase)
- After fix: `netRevenue` is non-null and non-zero

### extractorGuards.ts — Add 1 assertion test

```typescript
it("GUARD_MAX is under 3 trillion VND", () => {
  expect(GUARD_MAX).toBeLessThan(3_000_000_000_000);
});
```

---

## Acceptance Criteria

**Given** the 3 production file changes + test additions applied
**When** `bun test apps/mcp-server/src/__tests__/041-vn-number-parser.test.ts apps/mcp-server/src/__tests__/043-bctc-income-stmt.test.ts` runs
**Then:**
- 3 new sci-notation cases pass in 041
- FPT Q4 magnitude explosion fixture passes (blocked by GUARD_MAX or correctly scaled)
- HPG Q4 zero-revenue fixture passes (netRevenue non-null, non-zero via short-pattern fallback)
- GUARD_MAX assertion passes (< 3 trillion)
- `bun tsc --noEmit` → 0 errors
- Full suite: 0 new failures vs Sprint 1809 baseline

---

## Definition of Done

- [ ] `vnNumberParser.ts` sci-notation guard added
- [ ] `extractorGuards.ts` GUARD_MAX = 2_000_000_000_000
- [ ] `incomeStatementExtractor.ts` multi-field sentinel + HPG short-pattern fallback
- [ ] 3 sci-notation test cases in 041 pass
- [ ] FPT Q4 + HPG Q4 fixtures in 043 pass
- [ ] GUARD_MAX boundary assertion passes
- [ ] `bun tsc --noEmit` 0 errors
- [ ] No regression in full test suite
