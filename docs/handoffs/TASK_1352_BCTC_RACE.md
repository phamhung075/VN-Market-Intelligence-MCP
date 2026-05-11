# TASK 1352-BCTC-RACE — Async Extraction Race Fix

**Sprint:** 1352
**Type:** Bug fix — HIGH severity
**Git commits:** 3f3a3e87 (fix) + c20209d2 (merge)
**Status: FULLY MERGED on main**
**Depends on:** nothing (first in sequence)

---

## Problem

`bctcPdfPullJob` fired `triggerExtraction` fire-and-forget. The queue row was
marked `done` before OCR completed. MCP tools read empty `pdf_extracted_text`.
When OCR confidence was < 0.3, no retry was attempted — the row was already done.

---

## What Is on main (verified against HEAD)

### bctcPdfPullJob.ts lines 304–326

`triggerExtraction` awaited in try-catch. `updateDone.run(row.id)` and
`result.downloaded++` execute only after extraction resolves or throws.
On throw: warn logged, row still marked done (bctcReparseJob recovers next cycle).

### bctcReparseJob.ts ReparseDeps + reparseSingleWithOcrFallback lines 163–470

- `extractHighDpiRetry` optional injectable dep (line 186–192).
- DPI 300 retry when OCR cache confidence < 0.3 (lines 273–301): re-checks cache,
  logs outcome either way.
- DA_NOP fallback record inserted on continued failure (lines 305–329).
- Production wiring via `makeProductionDeps()` (lines 438–440).

### fetchParseAndStoreBctc.ts lines 226–423

- `resolvedExtractionMethod` variable tracks `'pdf-parse'` | `'ocr-200'` | `'ocr-300'`.
- `extraction_method` stamped on `financial_reports` row via SQL UPDATE (lines 408–420).
- Field also attached to returned report object.

### Test coverage

`apps/mcp-server/src/__tests__/1352a-async-extraction-race.test.ts` — 12 cases.

---

## Acceptance Criteria — All Met

| Criterion | Met |
|-----------|-----|
| `triggerExtraction` awaited before `updateDone.run()` | YES |
| DPI 300 retry triggered at confidence < 0.3 | YES |
| `extraction_method` stamped: `pdf-parse`, `ocr-200`, `ocr-300` | YES |
| DA_NOP fallback record inserted on double-fail | YES |
| 8+ unit tests | YES (12) |

---

## DDD Layers — Clean

| File | Layer |
|------|-------|
| bctcPdfPullJob.ts | interface/scheduler |
| bctcReparseJob.ts | interface/scheduler |
| fetchParseAndStoreBctc.ts | application/usecases |

---

## files_to_read
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` lines 290–336
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` lines 163–470
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` lines 220–430

## files_to_modify
None — fully merged.

## files_to_create
None.

## depends_on
None.
