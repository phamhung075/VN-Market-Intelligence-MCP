# Task 1349d: BCTC Validation Edge Cases + Test Expansion

**Sprint:** 1349
**Type:** Testing/Reliability
**Size:** S (1h)
**Priority:** LOW

---

## Problem Statement

Sprint 1345b added `confidence_financial` field to BCTC validation logic (src/domain/services/bctcValidator.ts). Validation rules:
- BCTC-VAL-01 through BCTC-VAL-06 check fields for realistic ranges
- Low-confidence (≤0.3) records are skipped

However, edge cases are untested:
1. **All-zero fields:** revenue=0, profit=0, assets=0, liabilities=0 (what confidence score?)
2. **Invalid reportDate:** malformed date, null, or future date
3. **Boundary violations:** operating margin = 999%, total liabilities > total assets by 10x
4. **Null values:** Some fields undefined while others populated

**Impact:** Edge cases could crash production or silently accept garbage data. Missing test coverage.

---

## Solution

Add 4 test cases to existing test file `src/__tests__/1345b-bctc-financial-validation.test.ts`:

### Test Case 1: All Zero Fields

```typescript
describe('BCTC edge case: all-zero financials', () => {
  it('should mark all-zero fields as low-confidence', async () => {
    const record = {
      stock_code: 'VNM',
      reportDate: '2025-Q4',
      revenue: 0,
      profit: 0,
      assets: 0,
      liabilities: 0,
      equity: 0
    };
    const result = await validateBCTC(record);
    expect(result.confidence_financial).toBeLessThanOrEqual(0.3);
  });
});
```

### Test Case 2: Invalid Report Date

```typescript
describe('BCTC edge case: invalid reportDate', () => {
  it('should reject malformed reportDate', async () => {
    const record = {
      stock_code: 'VEA',
      reportDate: 'invalid-date',
      revenue: 100,
      profit: 10
    };
    const result = await validateBCTC(record);
    expect(result.confidence_financial).toBeLessThanOrEqual(0.3);
  });

  it('should reject future reportDate', async () => {
    const record = {
      stock_code: 'VEA',
      reportDate: '2030-Q1', // future
      revenue: 100,
      profit: 10
    };
    const result = await validateBCTC(record);
    expect(result.confidence_financial).toBeLessThanOrEqual(0.3);
  });
});
```

### Test Case 3: Margin Boundary Violation

```typescript
describe('BCTC edge case: impossible margins', () => {
  it('should flag margin > 100% as low-confidence', async () => {
    const record = {
      stock_code: 'VNM',
      reportDate: '2025-Q4',
      revenue: 100,
      profit: 999, // 999% margin
      assets: 500,
      liabilities: 100
    };
    const result = await validateBCTC(record);
    expect(result.confidence_financial).toBeLessThanOrEqual(0.3);
  });

  it('should flag liabilities > assets by 10x as low-confidence', async () => {
    const record = {
      stock_code: 'VEA',
      reportDate: '2025-Q4',
      revenue: 100,
      profit: 10,
      assets: 100,
      liabilities: 1000 // liab = 10x assets
    };
    const result = await validateBCTC(record);
    expect(result.confidence_financial).toBeLessThanOrEqual(0.3);
  });
});
```

### Test Case 4: Null/Undefined Fields

```typescript
describe('BCTC edge case: missing fields', () => {
  it('should handle null fields gracefully', async () => {
    const record = {
      stock_code: 'HPG',
      reportDate: '2025-Q4',
      revenue: null,
      profit: 10,
      assets: undefined,
      liabilities: 50
    };
    const result = await validateBCTC(record);
    expect(result.confidence_financial).toBeLessThanOrEqual(0.3);
  });
});
```

---

## Acceptance Criteria

- [ ] 4 new test cases added to `1345b-bctc-financial-validation.test.ts`
- [ ] All 4 tests passing (each verifies confidence_financial ≤ 0.3 for edge case)
- [ ] No exceptions thrown (edge cases handled gracefully)
- [ ] Full test suite still passes (≥7371 baseline)
- [ ] Test file covers realistic failure scenarios

---

## Files Changed

- `src/__tests__/1345b-bctc-financial-validation.test.ts` (added 4 test cases)
- Possibly `src/domain/services/bctcValidator.ts` (if edge case handling needs fixes)

---

## Notes

- Tests are minimal-effort additions to existing test file
- No new dependencies needed
- Validates robustness of Sprint 1345b validation logic
