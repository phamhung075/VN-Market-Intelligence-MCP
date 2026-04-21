# Task Report 240b — GREEN: Price Backfill Service & Watchdog

**date:** 2026-04-21
**outcome:** CHANGES_REQUESTED

---

## Summary

Task 240b implementation has **critical blockers** preventing approval:

1. **DDD layer violation** in `priceBackfillService.ts:11` — imports `logger` from infrastructure
2. **Test regression** — full suite dropped 17 tests (6121 → 6104); expected 6127+
3. **Low test pass rate** — 5/13 passing (38%), not 6/13 as claimed
4. **TypeScript errors** — 7 type errors remain in test file

---

## Test Results

**Full suite:**
- Pass: 6104 (expected 6127+)
- Fail: 9 (was 8 on 240a)
- Skip: 21
- **Verdict:** REGRESSION (−17 tests)

**Task 240 tests (src/__tests__/240-price-pipeline-recovery.test.ts):**
- Pass: 5/13 (38%)
- Fail: 8/13
- **Failing ACs:** AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-13

---

## TypeScript Check

**Status:** FAIL — 7 errors

```
src/__tests__/240-price-pipeline-recovery.test.ts(62,5): error TS2578: Unused '@ts-expect-error' directive.
src/__tests__/240-price-pipeline-recovery.test.ts(75,11): error TS2322: Type 'BackfillResult | {...}' not assignable —
  exactOptionalPropertyTypes: firstInsertedAt cannot be undefined
src/__tests__/240-price-pipeline-recovery.test.ts(458,7): error TS2307: Cannot find module
  '../infrastructure/db/jobRunsStore.js'
... (4 more similar errors)
```

---

## DDD Compliance

**Status:** FAIL

**Blocking issue:**
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/priceBackfillService.ts:11`
  **Violation:** `import { logger } from "../../infrastructure/logger.js"`

  **Rule:** Domain services must NEVER import from infrastructure layer. Logger calls violate pure domain logic principle.

  **Fix:** Remove logger calls or move to application layer wrapper.

---

## Code Review

### ✓ PASS: Watchdog Implementation
- SSH restart state tracking (lines 23-24)
- Dual-channel alerts (WORK + MARKET)
- 30-min cooldown respected
- Proper dependency injection for tests

### ✓ PASS: Freshness Gates
- `isPriceFresh()` checks max(updated_at) ≤ 24h
- assembleBriefing suppresses MARKET send if stale
- assembleEveningSummary mirrors logic
- WORK alert sent with diagnostic timestamp

### ✓ PASS: Barrel Export
- `src/domain/services/index.ts` line 79 exports priceBackfillService

### ✓ PASS: recordJobRun Wrapper
- `src/scheduler/jobs.ts:670-677` wraps priceUpdateWatchdog
- Consistent with Sprint 234 pattern

### ✗ FAIL: Backfill Service DDD Design
- **Line 11:** Infrastructure import violates domain layer boundary
- **Lines 93-95:** `fetchOhlcvData()` is a mock; mentions resilientFetcher but doesn't use it
- **Lines 113-132:** Direct DB.prepare() calls are OK (dependency-injected `db` param)
- **Issue:** Logger import makes code untestable in domain context

---

## Blocking Issues

| File:Line | Issue | Impact |
|-----------|-------|--------|
| `priceBackfillService.ts:11` | Infrastructure import (`logger`) in domain layer | DDD violation, fails layer boundary test |
| `240-price-pipeline-recovery.test.ts:458` | Missing jobRunsStore import | TS2307 error, blocks compile |
| `BackfillResult` interface | Optional fields with `exactOptionalPropertyTypes` | 3× TS2322 errors in tests |

---

## Test Failure Analysis

**AC-1: PASS** ✓
Deduplication by (ticker, date) works.

**AC-2: FAIL** ✗
OHLCV validation errors not properly collected. Test expects `result.errors.length > 0`, got 0.

**AC-3: PASS** ✓
Fallback behavior tested (mock returns data).

**AC-4,5,6,7,8: FAIL** ✗
Root cause: Test sets `eightHoursAgo = new Date(Date.now() - 8*3600_000)` but watchdog code compares against fresh now. Timestamp mismatch makes prices appear fresh when test expects stale. Also: mock notify function not invoked (`undefined`).

**AC-9: FAIL** ✗
Slow execution (5s timeout); execution time check missing.

**AC-10: PASS** ✓
JSON persistence works.

**AC-11: PASS** ✓
Freshness gate logic correct.

**AC-12: PASS** ✓
recordJobRun wrapper logs to cron_job_runs.

**AC-13: FAIL** ✗
Large dataset (20 tickers × 5 days) generates only 80 rows, expects ≥100. `fetchOhlcvData()` skips weekends; date range may not have enough trading days.

---

## Non-Blocking Issues

1. **Low test coverage on watchdog:** 40% line coverage on SSH restart code (design uses mock notify, not real SSH)
2. **Missing resilientFetcher integration:** fetchOhlcvData() is a stub; spec calls for resilientFetcher pattern
3. **Test comments claim 6 pass, actual is 5 pass** — handoff record out of sync with reality

---

## Files Reviewed

- ✓ `src/domain/services/priceBackfillService.ts` — 224 lines (NEW, has DDD violation)
- ✓ `src/domain/services/index.ts` — barrel export added (line 79)
- ✓ `src/scheduler/market-data/priceUpdateWatchdogJob.ts` — watchdog enhanced (lines 96-103, 208-228)
- ✓ `src/scheduler/jobs.ts` — recordJobRun wrapper (lines 670-677)
- ✓ `src/application/usecases/assembleBriefing.ts` — freshness gate (lines 566-593, 1269-1283)
- ✓ `src/application/usecases/assembleEveningSummary.ts` — freshness gate (lines 309-336, 811-827)

---

## Merge Status

**BLOCKED** — Do not merge to main.

Required actions:
1. Remove logger import from priceBackfillService.ts (move logging to wrapper or remove)
2. Add jobRunsStore.ts or mock in test file
3. Fix BackfillResult optional fields to satisfy exactOptionalPropertyTypes
4. Debug watchdog test timestamp logic — ensure mock.now() is used consistently
5. Verify mock notify callbacks are invoked (currently undefined in AC-4-8)
6. Re-run full test suite after fixes; must achieve 6127+ pass (no regression)

---

## Appendix: Coverage Summary

| Module | Coverage | Status |
|--------|----------|--------|
| priceBackfillService.ts | 80% | Acceptable (logger line uncovered due to removal) |
| watchdog SSH restart | 40% | Low (mock-only design) |
| freshness gates | 90% (indirect via briefing tests) | Good |
| Full suite | 6104/6134 pass | **REGRESSION** |

