# Handoff: 1954c/G5b BCTC Consolidation — IMPL DONE → QA Gate

**From:** dev-mcp-server
**To:** qa
**Date:** 2026-05-24
**Status:** IMPL_DONE — Tasks 1-6 committed on main. Task 7 (QA gate) is yours.

---

## Summary

The architect-designed BCTC consolidation (1954c + G5b) is fully implemented.
The pdf-extractor service (port 5001) is now the SINGLE BCTC extraction owner.
All 4 callers delegate to `pdfExtractorClient.extractViaMicroservice`.

---

## Commit SHAs (Tasks 1-6)

| Task | Description | SHA |
|------|-------------|-----|
| Task 1 | Backfill column fix | `2a5cc2a7` (pre-existing — already shipped) |
| Task 2 | pdf.ts service-first inversion | `9c22c915` |
| Task 3 | bctcPdfPullJob.triggerExtraction → service | `09e2cd70` |
| Task 4 | pushBctcExtraction deps → service | `70e75cbd` |
| Task 5 | bctcReparseJob.ReparseDeps → service Tier 1 | `0ae87b9d` |
| Task 6 | Deprecation + offline integration test | `372fbc91` |

**Pre-revert tag:** `bctc-pre-g5b-consolidation`

---

## QA Gate Checklist (Task 7 — yours)

1. Run `cd apps/mcp-server && bun test` — expect green, compare with 9315/9697 baseline.
2. Grep: `extractAndStorePdfPagesWithRetry` calls outside deprecated module (`pdfOcrWorker.ts`) and test files → expect 0 new production calls.
   - NOTE: `fetchParseAndStoreBctc.ts` retains a legacy import (UNTOUCHED per architect directive). That code path is unreachable post-consolidation (all 4 callers pass `pdfTextOverride`). QA should confirm the dead-path caveat is acceptable.
3. Grep: `ocrPdfBuffer` calls outside `pdf.ts` → expect 0.
4. Confirm offline integration test passes: `bun test src/__tests__/bctc-consolidation.test.ts` → 3/3.
5. Confirm `fetchParseAndStoreBctc.ts` UNTOUCHED (last commit: `d29da3a8`).
6. Confirm `pdfExtractorClient.ts` UNTOUCHED (last commit: `c34ab25f`).

---

## Service-First Inversion Evidence

`apps/mcp-server/src/infrastructure/fetchers/pdf.ts` — `downloadAndExtractPdf`:
- Step 1: `msClient.extract(url, "bctc")` — PRIMARY
- Step 2: `client.get(url)` → pdf-parse — FALLBACK on service null

---

## 4 Callers → Service Delegation

| Caller | Before | After |
|--------|--------|-------|
| `bctcPdfPullJob.triggerExtraction` | `extractAndStorePdfPagesWithRetry` + `getCachedPdfText` | `extractViaMicroservice(pdfUrl)` |
| `pushBctcExtraction.triggerPushBctcExtraction` | `extractPages` + `getCache` (OCR) | `extractViaService(pdfUrl)` |
| `bctcReparseJob.reparseSingleWithOcrFallback` | extractText (pdf-parse) as Tier 1 | `extractViaService` as Tier 1; pdf-parse as Tier 2; OCR cache as Tier 3 |
| `checkSscReports` | `enableLocalBctcFetch=false` (disabled) | Unmodified; would route via service via `downloadAndExtractPdf` service-first inversion if enabled |

---

## Deprecated (not deleted)

- `pdfOcrWorker.ts::extractAndStorePdfPagesWithRetry` — `@deprecated` JSDoc
- `pdf.ts::ocrPdfBuffer` — `@deprecated` JSDoc

---

## When QA PASS

Architect emits:
- `docs/signals/architect-bctc-consolidation-1954c-clearance-<UTC>.json`
- `docs/signals/architect-pdf-extractor-g5b-clearance-<UTC>.json` (verdict: GO)

PO emits:
- freeze-lift → `pilot-status-pdf-extractor.json bctc_freeze_gate.lift_status = LIFTED`

G5a DONE + G5c PASS + G5b DONE → G5 → YES → 12/12 → PO terminal grade.
