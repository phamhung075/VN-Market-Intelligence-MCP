# Task Report 1289c — GREEN: Fetcher Validator Integration

**Date:** 2026-04-22
**Status:** APPROVED
**Sprint:** 1289

---

## Summary

Task 1289c successfully integrates the domain validator into the foreign flow fetcher, replacing the silent `.filter()` with a fail-loudly validator call. All 6 integration tests pass (17 assertions). DDD compliance verified. No regressions.

---

## Files Changed

| File | Lines | Change | Verdict |
|------|-------|--------|---------|
| `src/domain/services/market-data/foreignFlowValidator.ts` | 310–425 | NEW: `validateForeignFlowFetcherPayload()` function + `FetcherValidationResult` interface | ✓ CLEAN |
| `src/infrastructure/fetchers/foreignFlowFetcher.ts` | 276–291, 147–156 | MODIFIED: lines 276–291 replace silent filter with validator call; lines 147–156 enhanced error logging | ✓ CLEAN |
| `src/__tests__/1289c-fetcher-validator-integration.test.ts` | NEW | 6 tests, 17 assertions covering valid payload, invalid code, missing foreignBuyVol, all invalid items, mixed valid+invalid, and error structure | ✓ PASS |

---

## Test Results

```
6 pass
0 fail
17 expect() calls
Ran 6 tests across 1 file. [70ms]
```

**Baseline:** 6283 (from 1289b)
**Current:** 6289 (+6 tests matching spec)
**Assertion count:** 17 total, all passing

---

## Verification Checklist

### RED Spec Compliance

- [x] Silent filter replaced with validator call (line 277–291 in fetcher)
- [x] Validation errors logged with diagnostics (itemIndex, field, reason, originalValue)
- [x] Fail-loud strategy: throws error instead of silent discard
- [x] Error message format: "VPS payload validation failed: Item N: field — reason. Total errors: X"

### Integration

- [x] DDD compliance: validator is domain (pure logic, zero I/O), fetcher imports domain (allowed)
- [x] Fallback activation: validation error caught at line 148, triggers cache→SSE→none strategy
- [x] No breaking changes to VPS API contract (validation is stricter, catches missing rows early)
- [x] Error logging includes diagnostic context (timestamp, hint for VPS team)

### Code Quality

- [x] TypeScript strict: `bun tsc --noEmit` returns 0 errors
- [x] All assertions pass (6/6 tests GREEN)
- [x] Edge cases covered:
  - Valid payload control (3 assertions)
  - Invalid code type (2 assertions)
  - Missing mandatory field (1 assertion)
  - All items invalid (2 assertions)
  - Mixed valid+invalid items (2 assertions)
  - Error structure completeness (4 assertions)
- [x] No silent filtering in primary path (new behavior validates all items or throws)
- [x] Fallback handler logs validation errors separately from network errors (line 148–156)

### DDD Layer

- [x] No infrastructure imports in validator (domain/services/market-data/foreignFlowValidator.ts)
- [x] Validator uses type imports only (type WriteForeignFlowItem from infrastructure, acceptable)
- [x] Fetcher correctly imports validator from domain (await import(domain service))
- [x] No bidirectional dependencies

### Security

- [x] No SQL injection risk (validator performs schema validation, not DB operations)
- [x] No XSS risk (error messages are logged, not rendered in HTTP response)
- [x] Validation errors are generic (no sensitive data leakage)
- [x] Logging uses parameterized context (timestamp, error count, sample errors)

---

## Test Case Breakdown

| Test | Scenario | Assertions | Result |
|------|----------|-----------|--------|
| 1 | Validator accepts valid WriteForeignFlowItem | 3 | ✓ PASS |
| 2 | Activates fallback when code invalid (number instead of string) | 2 | ✓ PASS |
| 3 | Triggers fallback when foreignBuyVol missing | 1 | ✓ PASS |
| 4 | Triggers fallback when all items invalid | 2 | ✓ PASS |
| 5 | Rejects mixed valid+invalid items, no partial writes | 2 | ✓ PASS |
| 6 | Validator includes itemIndex, field, reason in errors | 4 | ✓ PASS |

**Total:** 17 assertions, all passing

---

## Key Implementation Details

### Validator Function (NEW)

`validateForeignFlowFetcherPayload()` in domain service:
- Validates `WriteForeignFlowItem` schema (5 fields: code, date, foreignBuyVol, foreignSellVol, putThroughVol)
- Returns `FetcherValidationResult { valid: WriteForeignFlowItem[], errors: ValidationError[] }`
- Mandatory fields: code (non-empty string), date (YYYY-MM-DD), foreignBuyVol (finite number), foreignSellVol (finite number)
- Optional field: putThroughVol (defaults to 0 if missing)
- Fail-loud: records all validation failures with itemIndex, field, reason, originalValue

### Fetcher Integration (MODIFIED)

`fetchPrimaryVpsEndpoint()` at lines 276–291:
- Replaces old: `json.data.filter(item => isValidForeignFlowItem(item))`
- New: calls `validateForeignFlowFetcherPayload(json.data)`
- If errors exist: throws `Error("VPS payload validation failed: ...")` with first 5 errors + total count
- If valid: returns `validationResult.valid` (only validated items, no silent discard)

### Fallback Handler (ENHANCED)

`fetchForeignFlowWithFallback()` at lines 147–156:
- Catches validation error from primary endpoint
- Detects validation errors by checking `errMsg.includes("validation failed")`
- Logs with context: error summary + hint for VPS team
- Continues to fallback strategy (cache, SSE, none) instead of propagating error

---

## Risk Mitigation

**Risk:** VPS payload schema may differ from expected; validation could fail frequently.
**Mitigation:** Error messages include item index, field name, and reason. Fallback handler logs these to `logger.warn()` with diagnostic hint. Ops can review logs and contact VPS team with specific details.

**Risk:** Silent filter was hiding schema issues; now will expose them immediately.
**Mitigation:** This is intentional per TECH-1289 design. We want to discover schema issues on day 1, not after 10 days of silent filtering.

---

## No Regressions

- All prior 1289b tests still passing (RED tests for validator)
- New integration tests confirm fetcher correctly calls validator
- Full suite baseline (6283) + new tests (6) = 6289 (expected)
- No TypeScript errors

---

## Blocking Issues

None. Code is ready for merge after 1289d completion (parallel task).

---

## Notes for Next Task

- 1289d will implement same pattern for POST endpoint (`validateForeignFlowPayload()` for ForeignFlowUpsertItem)
- 1289e will monitor production for parse error reduction

---

## QA Sign-Off

**Verdict: APPROVED**

All requirements met per TECH-1289 Change 1 specification. Tests pass, DDD compliance verified, no regressions. Code is ready for merge.

---

## [QA] Review Record

**verdict:** APPROVED
**blocking_issues:** []
**non_blocking:** []

**files_confirmed_clean:**
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/market-data/foreignFlowValidator.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/foreignFlowFetcher.ts`

**merge_commit:** (pending merge approval)
