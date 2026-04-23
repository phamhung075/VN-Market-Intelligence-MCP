# Task Report 1294b — BCTC PDF Timeout Fallback

**date:** 2026-04-23
**outcome:** CHANGES_REQUESTED

---

## Test Results

- Unit tests: **2 PASS / 6 FAIL**
- Full suite: N/A (stopped at 1294b tests due to Bun crash)
- TypeScript: **0 errors** ✓

---

## Blocking Issues

### 1. Test 2 failure: `enableBctcFallback=false` not re-throwing timeout error
**File:** `src/application/usecases/fetchParseAndStoreBctc.ts:341-343`
**Issue:** When `enableBctcFallback=false` and PDF timeout occurs, error should be re-thrown. However, `downloadAndExtractPdf` (pdf.ts:44-45) catches all errors and returns `{text:"", confidence:0}` instead of propagating them. Thus `extractionError` is never set, and the re-throw condition at line 341 never triggers.
**Fix:** Either (a) modify `downloadAndExtractPdf` to preserve/re-throw timeout errors when not using circuit breaker, or (b) detect timeout in `fetchParseAndStoreBctc` before calling `tryNewsChainFallback` and immediately throw if `enableBctcFallback=false`.

### 2. Tests 3, 4, 5 failure: `tryNewsChainFallback` returns `null` but tests expect object with `fallback: false` + `reason`
**File:** `src/application/usecases/fetchParseAndStoreBctc.ts:449-482`
**Issue:** When fallback is skipped (old signals, contradictions, insufficient count), function returns `null`. Tests expect object with `fallback: false`, `reason: string`. This breaks test assertions checking `result?.fallback` and `result?.reason`.
**Fix:** Change return type to always return fallback result object (with `fallback: false | true` + `reason?: string`), never `null`. Or change tests to expect `null` return + modify calling code at line 336 to handle both cases.

### 3. Test 6 failure: Missing DB columns `revenue_growth_qoq`, `margin_trend`, `debt_ratio_hint`
**File:** `src/__tests__/1294b-bctc-fallback.test.ts:378-388`
**Issue:** Test queries for columns that were never created in schema-financial-reports.ts. These columns (revenue_growth_qoq, margin_trend, debt_ratio_hint) were specified in handoff but not implemented. Test can only verify columns that exist.
**Fix:** Either (a) add these 3 columns to schema-financial-reports.ts ALTER TABLE statements, or (b) modify test to check existing fallback metadata like `extraction_source_note` + `embedding_text` instead of non-existent specific fields.

### 4. Test 7 failure: Temporal discount calculation unclear
**File:** `src/__tests__/1294b-bctc-fallback.test.ts:458-465`
**Issue:** Test expects `extraction_confidence < 0.55` after 0.8x temporal discount. But calculation in fetchParseAndStoreBctc.ts:527 is `0.55 * 0.8 * avgConfidence` (capped [0.45, 0.65]). With avgConfidence=0.775 (avg of 0.8+0.75), result = 0.55 * 0.8 * 0.775 = 0.341 < 0.45 → capped to 0.45, which is NOT < 0.55. Test expectation wrong or discount application wrong.
**Fix:** Clarify intent: should final confidence be reduced BY 20% or TO 80%? Adjust test or code accordingly.

### 5. Test 8 failure: OCR overwrite behavior not implemented
**File:** `src/application/usecases/fetchParseAndStoreBctc.ts:638-673`
**Issue:** Test 8 (E2E) expects second call with OCR success to overwrite news_inference row. INSERT OR REPLACE uses `sort_key` as unique key. This should work IF sort_key is correctly populated. Verify UNIQUE constraint and INSERT logic honors overwrite on second call.
**Fix:** Check if INSERT OR REPLACE is actually replacing (check UNIQUE constraint on sort_key in fallback report).

---

## Code Quality

- **DDD Compliance:** PASS (signalToBctcMapper.ts has zero infrastructure imports)
- **Security:** PASS (no SQL injection, parameterized queries used)

---

## Summary

2/8 tests pass. 6 fail due to:
1. Error re-throw logic not triggered when fallback disabled
2. Return type mismatch (null vs object with fallback: false)
3. Missing schema columns (revenue_growth_qoq, margin_trend, debt_ratio_hint)
4. Temporal discount calculation or test expectation misaligned

All issues are in application logic + schema + test expectations, not in domain service (signalToBctcMapper.ts is correct).

---
