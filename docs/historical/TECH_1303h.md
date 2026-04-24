# TECH-1303h: BCTC PDF Parser — Impossible Figures Guard

status: APPROVED_BY_ARCHITECT
req_ref: REQ-1303h

---

## Brownfield Impact

- Files modified:
  - `src/domain/services/financial-reports/incomeStatementExtractor.ts` (return block lines 527–561)
  - `src/domain/services/financial-reports/balanceSheetExtractor.ts` (post-`applyMultiplier` call, line 604)
- Files created:
  - `src/domain/services/financial-reports/extractorGuards.ts`
  - `src/__tests__/1303h-extractor-guards.test.ts`
- Files deleted: none
- Breaking changes: no — return types unchanged; impossible values become `0` (same as missing-field default)

---

## Architecture Decision

Guard fires **post-multiplier**, not inside `extractNumber()`. This is the correct placement because:

- `extractNumber()` returns a raw token value before any unit scaling.
- A raw token of `999_999_999` with multiplier `0.000001` → `≈1 triệu` (valid). The same token with multiplier `1` → `999_999_999 triệu` (impossible).
- Pre-multiplier guard would fire false rejections on large raw VND tokens that are legitimately scaled down.
- Post-multiplier guard sees the final triệu value — the semantically correct number to bounds-check.

Income statement: guard wraps each field inline in the return object literal (lines 527–561). All fields are scalar, no nested structs.

Balance sheet: guard is applied via a helper `guardBalanceSheet(bs: BalanceSheet): BalanceSheet` called after `applyMultiplier()` returns. The balance sheet return is a nested struct (`currentAssets.cash`, etc.) — an inline guard per field would require duplicating 20+ assignments. The helper keeps the call site at one line.

Both paths return `0` (not `null`) for impossible values. This matches the existing caller contract: `findValue()` already defaults missing fields to `0`, so downstream ratio engine behaviour is unchanged.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `guardFinancialField` + `guardBalanceSheet` | domain | `src/domain/services/financial-reports/extractorGuards.ts` | NEW |
| Income extractor return block | domain | `src/domain/services/financial-reports/incomeStatementExtractor.ts` | MODIFY |
| Balance sheet extractor post-applyMultiplier | domain | `src/domain/services/financial-reports/balanceSheetExtractor.ts` | MODIFY |
| Test suite | tests | `src/__tests__/1303h-extractor-guards.test.ts` | NEW |

---

## Interface Contracts

### `src/domain/services/financial-reports/extractorGuards.ts`

```typescript
// Bounds (post-multiplier triệu đồng)
export const GUARD_MIN = -10_000_000_000_000;   // −10T triệu
export const GUARD_MAX = 500_000_000_000_000;   // 500T triệu

/**
 * Guards a single post-multiplier monetary field (triệu đồng).
 * Returns 0 and emits console.warn when value is outside [GUARD_MIN, GUARD_MAX].
 * Returns value unchanged otherwise.
 *
 * @param value     Post-multiplier field value (triệu đồng)
 * @param fieldName Field name for audit log (e.g. "netRevenue")
 * @param rawValue  Pre-multiplier token value — included in audit log for OCR debugging
 */
export function guardFinancialField(
  value: number,
  fieldName: string,
  rawValue: number,
): number

/**
 * Applies guardFinancialField to every monetary leaf in a BalanceSheet.
 * Returns a new BalanceSheet — does not mutate input.
 * rawValue passed as the same value (post-multiplier = pre-guard, single-step).
 */
export function guardBalanceSheet(bs: BalanceSheet): BalanceSheet
```

Import constraint: `extractorGuards.ts` imports only from `bctc-schema.ts` (for the `BalanceSheet` type). No imports from `infrastructure/` or `application/`. Pure functions only.

### Wire point — `incomeStatementExtractor.ts` return block

Replace every `field * m` with `guardFinancialField(field * m, "fieldName", field)`.

EPS fields are exempt — they are already excluded from multiplier scaling (`eps` and `dilutedEps` are returned as-is). EPS values in VND/share will never approach `GUARD_MAX` (500T triệu ≈ 500 quadrillion VND/share). No special handling needed.

### Wire point — `balanceSheetExtractor.ts`

Replace:
```typescript
return applyMultiplier(raw, effectiveMultiplier);
```
With:
```typescript
return guardBalanceSheet(applyMultiplier(raw, effectiveMultiplier));
```

---

## Acceptance Criteria Breakdown

| AC | Test type | What is verified |
|----|-----------|-----------------|
| AC-1 | RED unit | `guardFinancialField(600T, "netRevenue", 600B)` → returns `0`, `console.warn` contains `"netRevenue"` |
| AC-2 | GREEN unit | `guardFinancialField(9_500_000, ...)` → returns `9_500_000` |
| AC-3 | GREEN unit | `guardFinancialField(-800_000, ...)` → returns `-800_000` |
| AC-4 | RED unit | `guardFinancialField(-20T, ...)` → returns `0`, `console.warn` called |
| AC-5 | RED integration | `extractIncomeStatement` with OCR-corrupted revenue line → `result.netRevenue === 0` |
| AC-6 | RED integration | `extractBalanceSheet` with impossible totalAssets line → `result.totalAssets === 0` |
| AC-7 | GREEN integration | VNM-scale income statement — all fields pass, no `console.warn` |
| AC-8 | CI | `bun tsc --noEmit` clean, test count >= prior count |

Boundary edge cases (add to test suite):
- Exactly `GUARD_MAX` (500T) → passes (boundary inclusive)
- Exactly `GUARD_MIN` (−10T) → passes (boundary inclusive)
- `0` → passes (missing-field default must not be rejected)

---

## Task Breakdown

Atomic tasks in dependency order:

1. `[1303h-1]` Domain: create `extractorGuards.ts` — `guardFinancialField` + `guardBalanceSheet` (no dependencies)
2. `[1303h-2]` Tests: RED tests for guard unit + integration (depends on: 1303h-1 stubs)
3. `[1303h-3]` Domain: wire guard into `incomeStatementExtractor.ts` return block (depends on: 1303h-1)
4. `[1303h-4]` Domain: wire `guardBalanceSheet` into `balanceSheetExtractor.ts` (depends on: 1303h-1)
5. `[1303h-5]` CI: verify `bun tsc --noEmit` + full test suite green (depends on: 1303h-3, 1303h-4)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `applyMultiplier` returns nested struct — guard misses a leaf | Medium | High | `guardBalanceSheet` must enumerate all leaves; add unit test asserting every field in a mock BalanceSheet is guarded |
| EPS false-rejection if guard accidentally applied to EPS | Low | High | EPS exempt by design (not in multiplier path); test with EPS = 2500 to confirm no warn |
| `GUARD_MAX` too tight for future sovereign-scale companies | Low | Low | Constant is exported — can be tuned without touching extractor logic |
| `console.warn` in hot path causes perf regression on valid data | Low | Low | Guard is two comparisons; only fires on invalid data |

---

## Security Review

- SQL parameterized? N/A — no DB writes in this feature
- File paths validated? N/A
- External HTTP rate-limited? N/A
- Secrets via Bun.env only? N/A — pure domain function, no env access
- DDD boundary preserved? Yes — `extractorGuards.ts` imports only domain types, no infra
