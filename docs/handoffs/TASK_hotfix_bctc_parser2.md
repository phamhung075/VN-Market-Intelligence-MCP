# Handoff: TASK_hotfix_bctc_parser2

## Status: DONE

## What was fixed

### Bug 1 (CRITICAL): DIG / SHB — ticker code case mismatch in scanDiskForStrandedPdfs
- **File:** `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`
- **Root cause:** Watchlist codes from the DB can be stored lowercase or mixed-case
  (e.g. `"dig"`, `"Shb"`). The regex was built from the raw code value and tested
  against `filename.toUpperCase()`, so `/dig/` never matched `"...DIG..."`.
- **Fix:** Uppercase `c` when building the regex pattern → `c.toUpperCase()`.
  Also normalise the returned `ticker` field to uppercase for consistency downstream.

### Bug 2 (CRITICAL): FPT — raw VND × tỷ multiplier = quadrillions
- **File:** `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`
- **Root cause:** The magnitude inference guard only fired when `m === 1` (triệu declared).
  When `detectUnitMultiplier` returned `1000` (tỷ declared) but OCR extracted raw VND
  integers, the scaled result became `rawValue × 1000 triệu` — catastrophically large.
- **Fix:** Changed the guard to fire for any multiplier when `netRevenue * m > 1e14`
  (which is physically impossible for a VN listed company). Kept the original
  `m === 1 && netRevenue > 1_000_000_000` branch as a belt-and-suspenders fallback.

### Bug 3 (HIGH): DGC / BSR — phantom confidence on zero-core data
- **File:** `apps/mcp-server/src/application/usecases/parseBctcReport.ts`
- **Root cause:** `computeConfidence` counted non-zero fields linearly over 16 key fields.
  Cash flow sub-fields (`beginningCash`, `endingCash`) could be non-zero even when
  netRevenue, totalAssets, and netProfit were all zero — yielding 13–63% phantom confidence.
- **Fix:** After computing `rawConfidence`, add a zero-core guard: when all three core
  fields (`totalAssets`, `netRevenue`, `netProfit`) are simultaneously zero, cap
  confidence at `0.05`. The existing `storeReport` guards (skip insert at 0, low_confidence
  at < 0.2) then handle the capped record correctly.

## Test coverage
- `apps/mcp-server/src/__tests__/hotfix-bctc-parser2.test.ts` — 7 new tests (all pass)
- Full suite: 7939 pass (was 7937), 123 fail (was 125) — net +2 pass, -2 fail, 0 regressions

## QA checklist
- [ ] Trigger reparse for DIG, SHB (filenames with Vietnamese long names)
- [ ] Trigger reparse for FPT (tỷ-declared PDF with raw VND OCR output)
- [ ] Verify DGC and BSR now show extraction_confidence ≤ 0.05 and validation_status = low_confidence
- [ ] Confirm `get_bctc_full('DIG')` and `get_bctc_full('SHB')` return data after reparse
- [ ] Confirm `get_bctc_full('FPT')` returns net_profit in plausible triệu range (not quadrillions)
