# Task Report — 1266

**Task:** Fix HUT false positive — Vietnamese word "hụt" triggering HUT ticker NER
**Status:** DONE
**Date:** 2026-04-15
**Sprint:** 081

---

## Problem

The direct ticker-code NER introduced in Task 1251 used a case-insensitive word-boundary match. Vietnamese words that phonetically resemble a ticker code after diacritic stripping would produce false positives. Specifically:

- Article: "Nguồn cung dầu sẽ càng thiếu hụt vì lệnh phong tỏa của Mỹ"
- "hụt" (Vietnamese: shortage/deficit) → normalised to "hut" → matched ticker `HUT` (Tasco, real-estate)
- Result: HUT incorrectly received a watchlistImpact for an article about oil supply shortages

Same pattern could affect other tickers (e.g. "BAN" from Vietnamese "bán", "CAN" from "cân").

## Root Cause

`isDirectTickerMention()` in `cascadeEngine.ts` matched `code.toLowerCase()` against the NFD-normalised, lowercased seed text (`seedTextNorm`). Diacritic stripping during normalisation caused "hụt" → "hut", creating a spurious match for the HUT ticker.

## Fix

Added `hasUppercaseWordBoundary()` guard that checks the **original, non-normalised** seed text for an all-caps occurrence of the ticker code at a word boundary. Vietnamese stock tickers are invariably written ALL-CAPS in news articles. Common Vietnamese words are never written all-caps. This gate eliminates the false-positive class without affecting true matches.

Logic flow:
1. `hasUppercaseWordBoundary(seedText, "HUT")` — requires "HUT" (all-caps) at a word boundary in the original text
2. If not found → `isDirectTickerMention` returns false immediately
3. If found → existing NFD-normalised word-boundary check continues as before

## Files Changed

- `src/domain/services/cascadeEngine.ts` — added `hasUppercaseWordBoundary()`, updated `isDirectTickerMention()` to use it
- `src/__tests__/1251-vndiamond-ner.test.ts` — added AC-6 (HUT not triggered by "hụt") and AC-7 (HUT triggered by all-caps "HUT")

## Test Results

```
7 pass, 0 fail
Ran 7 tests across 1 file. [67ms]
```

AC-6: HUT NOT triggered by Vietnamese word "hụt" — PASS
AC-7: HUT IS triggered when all-caps "HUT" appears explicitly — PASS

## Acceptance Criteria

- [x] "thiếu hụt" article does NOT produce HUT watchlistImpact
- [x] Article with "HUT tăng mạnh..." DOES produce HUT watchlistImpact
- [x] Existing AC-1 through AC-5 from task 1251 remain green
- [x] No regression in other tests
