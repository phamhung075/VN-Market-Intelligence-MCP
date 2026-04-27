# Task Report — TASK 1352a: Async Extraction Race Fix

**Date:** 2026-04-27
**Branch:** fix/1352a-async-extraction-race (merged to main)
**Commit:** 3f3a3e87
**Status:** COMPLETE

---

## Problem

`bctcPdfPullJob` used fire-and-forget for `triggerExtraction`. The queue row was marked
`done` at step 5, then extraction was fired without `await` at step 6. Any MCP tool call
(`read_bctc_pdf`) immediately after the job completed would see empty text because OCR had
not stored results yet.

Additionally:
- `bctcReparseJob` imported `extractAndStorePdfPagesWithRetry` but never wired it.
  Low-confidence (< 0.3) pages had no DPI 300 retry path.
- `fetchParseAndStoreBctc` always stamped `extraction_method = 'ocr_pdf'` regardless of
  which actual code path extracted the text.

---

## Changes

### 1. `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`

- Removed `.catch()` fire-and-forget pattern (lines 308-320).
- Replaced with `try { await deps.triggerExtraction(...) } catch {}` block.
- `updateDone.run(row.id)` now executes only after extraction completes (or fails non-fatally).
- Updated JSDoc to reflect the behaviour change.

### 2. `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`

- Added optional `extractHighDpiRetry` to `ReparseDeps` interface.
- `reparseSingleWithOcrFallback`: when OCR cache confidence < 0.3, now calls
  `deps.extractHighDpiRetry()` before inserting DA_NOP fallback.
- After DPI 300 retry, re-checks cache; if confidence >= 0.3, falls through to pipeline.
- Production `makeProductionDeps` now imports and wires `extractAndStorePdfPagesWithRetry`.

### 3. `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts`

- Added `resolvedExtractionMethod` variable tracking actual path:
  `pdf-parse` / `ocr-200` / `ocr-300`.
- OCR cache hit sets `ocr-200`; `extractAndStorePdfPagesWithRetry` result inspects
  `confidenceAfterRetry` to disambiguate `ocr-200` vs `ocr-300`.
- DB stamp now uses `resolvedExtractionMethod` instead of always `ocr_pdf`.
- Returned `FinancialReport` object also stamped with `extraction_method` for callers.

---

## Tests

**File:** `apps/mcp-server/src/__tests__/1352a-async-extraction-race.test.ts`

| ID  | Group | Description |
|-----|-------|-------------|
| A-1 | bctcPdfPullJob | Queue row is 'pending' while extraction runs, 'done' only after completion |
| A-2 | bctcPdfPullJob | Queue row still marked done when triggerExtraction throws (non-fatal) |
| A-3 | bctcPdfPullJob | Both PDFs in batch await extraction; extractionCount === downloaded count |
| A-4 | bctcPdfPullJob | PDF failing size guard does NOT trigger extraction |
| B-1 | bctcReparseJob | OCR cache confidence < 0.3 triggers fallback, pipeline not called |
| B-2 | bctcReparseJob | OCR cache confidence >= 0.3 proceeds to pipeline without retry |
| C-1 | fetchParseAndStoreBctc | pdfTextOverride path does not crash; extraction_method present |
| C-2 | fetchParseAndStoreBctc | extraction_method enum values stable (pdf-parse, ocr-200, ocr-300) |

**Result:** 8 pass / 0 fail

---

## Verification

- `bun tsc --noEmit`: 0 new errors introduced by this task
- 1352a + 1019 + 1068 combined: 31 pass / 0 fail
- Sprint 1352 batch (1350/1351/1352): 56 pass / 6 fail
  (6 failures are pre-existing 1350 infrastructure mock issues, unrelated to 1352a)
