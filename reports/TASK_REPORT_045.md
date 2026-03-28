# Task Report — Task 045: Ratio Computation

> **Branch**: `task/045-bctc-ratios`
> **Date started**: 2026-03-26
> **Date merged**: 2026-03-26
> **Final status**: APPROVED
> **DDD layer**: domain

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-26 | Dependencies 042, 043, 044 cleared |
| Todo → In Progress | 2026-03-26 | Assigned to Developer |
| In Progress → Review | 2026-03-26 | Developer submitted |
| Review → Done | 2026-03-26 | Approved by QA — merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: implement `computeFinancialRatios(params)` covering all 22 FinancialRatios from bctc-schema.ts
- Identified dependencies: Task 042 (balance sheet), 043 (income statement), 044 (cash flow)
- DDD layer assigned: domain
- Context injection: bctc-schema.ts FinancialRatios interface, BalanceSheet, IncomeStatement, CashFlowStatement types

### Developer
- Files created: `src/domain/services/ratioComputer.ts`, `src/__tests__/045-bctc-ratios.test.ts`
- Files modified: `src/domain/services/index.ts` (barrel export)
- TDD cycle followed: YES (test file and implementation in single commit — minor deviation from separate Red commit)
- Tests written: `src/__tests__/045-bctc-ratios.test.ts`, 13 tests, 37 expect() calls
- Assumptions made: `shares` param is actual count (not millions); `price` is in VND; division by zero returns null throughout

### QA — Review 1
- Date: 2026-03-26
- Outcome: APPROVED
- `bun test src/__tests__/045-bctc-ratios.test.ts` result: PASS (13 tests, 0 failures)
- `bun test` full regression result: PASS (144 pass, 1 pre-existing fail in Task 001 unrelated to 045)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 2 non-blocking

---

## Test Results

```
bun test src/__tests__/045-bctc-ratios.test.ts

  Task 045 — computeFinancialRatios
  (pass) should compute all profitability ratios correctly
  (pass) should compute ROE and ROA with average equity/assets (prevEquity provided)
  (pass) should compute ROE using current equity when no prevBs provided
  (pass) should compute currentRatio = currentAssets / currentLiabilities
  (pass) should compute leverage ratios
  (pass) should compute efficiency ratios and cash conversion cycle
  (pass) should compute per-share ratios
  (pass) should compute valuation ratios when price is provided
  (pass) should return null for valuation ratios when no price provided
  (pass) should return null (not Infinity, not NaN) when denominator is zero
  (pass) should compute ROIC = NOPAT / invested capital
  (pass) should compute dividendYieldPct when price and dividendsPaid are available
  (pass) should compute cashConversionCycle correctly

Tests: 13 passed, 0 failed
Coverage: 100% functions, 100% lines (ratioComputer.ts)
```

---

## Issues Discovered During Review

### Blocking Issues

None.

---

### Non-Blocking Issues

#### Issue 045-01
- **Type**: Code smell / redundant computation
- **File**: `src/domain/services/ratioComputer.ts:69-100`
- **Description**: The pattern for percentage ratios calls `safeDivide()` twice — once to test for null, then again with `!` assertion to extract the value. Example: `safeDivide(a, b) !== null ? safeDivide(a, b)! * 100 : null`. This doubles the computation.
- **Fix applied**: Deferred — no correctness impact, performance negligible for pure math functions. A cleaner approach would be `const raw = safeDivide(a,b); const pct = raw !== null ? raw * 100 : null;`
- **Status**: Deferred (tech debt)

#### Issue 045-02
- **Type**: TDD process
- **File**: commit `100b589`
- **Description**: Test file and implementation were committed in a single commit. Strict TDD requires a failing Red commit before the Green implementation commit. The commit message does note "TDD Red → Green → Refactor" in the test file header but the git log does not show a separate Red commit.
- **Fix applied**: Won't fix (post-hoc). Tests are comprehensive and meaningful; process deviation does not affect code quality.
- **Status**: Non-blocking observation

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| — | — | Pure math function, no I/O, no SQL, no HTTP | None | N/A |

**Security verdict**: CLEAN

DDD scan: ZERO imports from `infrastructure/` or `application/` in `src/domain/`.
No `process.env` usage. No `any` types. No unguarded non-null assertions (all `!` uses are within guarded ternary patterns).

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `computeFinancialRatios(params)` exists and is exported | PASS | Exported from `src/domain/services/ratioComputer.ts` and barrel `index.ts` |
| All 22 ratios populated (profitability, liquidity, leverage, efficiency, per-share, valuation) | PASS | 22 ratio fields computed; valuation ratios return null when price not provided |
| ROE = netProfit / avgEquity × 100 | PASS | Uses average when prevBs provided, current otherwise — tested |
| currentRatio = currentAssets / currentLiabilities | PASS | Tested with fixture values, result matches 1.9167 |
| Division by zero returns null, never Infinity or NaN | PASS | Tested exhaustively — all 20+ ratio fields verified null or finite |
| ROIC = NOPAT / (Equity + NetDebt) | PASS | NOPAT = operatingProfit × (1 - effectiveTaxRate); guards zero operatingProfit |
| CashConversionCycle = invDays + recDays - payDays | PASS | Tested with explicit expected value 67.7857 |

---

## Merge Summary

```bash
git merge --no-ff task/045-bctc-ratios -m "merge(045): financial ratio computation"
```

- Commits in branch: 2 (task commit + review/TASKS.md commit)
- Files changed: 3
- Lines added: +609 (418 test, 189 implementation, 2 barrel export)
- Lines removed: 0
- Tests added: 13 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 046 (Period delta QoQ/YoY) can now start — depends on 042, 043, 044 all Done
- Task 047 (BCTC orchestrator) now has 045 cleared; still needs 046 and 030
- Recommendation for Task 046: follow same `safeDivide` null pattern for zero-denominator handling (prevValue = 0 → null, not Infinity)
- The `ComputeRatiosParams` type is exported from the barrel for use in Task 047 orchestrator
