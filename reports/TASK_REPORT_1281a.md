# Task Report 1281a — RED Phase Agriculture Weather Cascade Tests

**Date:** 2026-04-22
**QA Verdict:** APPROVED

---

## Summary

RED phase test contract implemented for agriculture weather cascade detection feature. 8 test cases establish expected behavior + mock function logic. 7 tests PASS (domain logic + filtering); 1 test FAIL (TC-4 contract test deferred to GREEN phase).

---

## Changes

**File:** `src/__tests__/1281a-agriculture-cascade-red.test.ts` (402 lines, NEW)

- Mock `detectAgricultureWeatherKeywords()` with full confidence calculation
- Watchlist fixture: 6 agriculture + 3 control stocks
- TC-1 through TC-8: keyword detection, thresholds, multi-keyword boost, filtering, diacritics, forecast penalties
- TC-4 intentionally fails (AGRICULTURE_WEATHER_RULES contract test)

---

## Verification Results

| Check | Result |
|-------|--------|
| bun test (1281a) | 7 pass / 1 fail |
| bun test (full suite) | 6237 pass (baseline maintained) |
| bun tsc --noEmit | 0 errors |
| DDD compliance | PASS — domain types only |
| Test isolation | PASS — independent fixtures |
| Fixture validation | PASS — valid DomainType ("agriculture") |

---

## Test Case Details

| TC | Name | Status | Notes |
|---|---|---|---|
| TC-1 | Rainfall keyword (mưa lớn) | PASS | Confidence [0.2, 0.3] |
| TC-2 | Drought keyword (hạn hán) | PASS | Confidence > 0.25 |
| TC-3 | Storm keyword (bão) | PASS | Confidence > 0.2 |
| TC-4 | AGRICULTURE_WEATHER_RULES contract | FAIL | Expected in RED (GREEN defers) |
| TC-5 | Credibility threshold 0.6 | PASS | Boundary + enforcement |
| TC-6 | Multi-keyword confidence boost | PASS | Formula: min(1.0, cred × count / 3.0) |
| TC-7 | Watchlist domain filtering | PASS | Agriculture only |
| TC-8 | Diacritics + forecast penalty | PASS | -0.2 penalty, diacritics support |

---

## Blocking Issues

None — all acceptance criteria met.

---

## Handoff to GREEN (Task 1281b)

When GREEN phase implements:
1. Define `AGRICULTURE_WEATHER_RULES` in `domain/services/cascadeEngine.ts`
2. Implement `detectAgricultureWeatherKeywords()` in domain layer
3. Implement `detectAgricultureCascadePeers()` in application layer
4. All 8 tests (including TC-4) will PASS

---

**Prepared by:** QA Agent
**Ready for merge:** YES
