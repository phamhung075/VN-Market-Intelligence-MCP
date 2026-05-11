# Sprint 1352 — BCTC PDF Extraction Pipeline Bug Fixes

**Triage Status:** COMPLETE
**Current Baseline:** 7598 pass / 0 fail
**Related Issue:** 3 critical bugs in BCTC PDF extraction (async race, orphaned microservice, silent OCR failures)

---

## Bugs Identified & Triaged

### Bug 1352a: Async Extraction Race (HIGH — BLOCKING)

**Problem:** bctcPdfPullJob marks queue rows `done` before OCR extraction completes. Race condition allows MCP tools to read empty PDFs.

**Impact:** Low-confidence extracts (< 0.3) discarded silently; no retry attempted.

**Fix:** Await extraction before marking queue done. Add DPI 300 retry for confidence < 0.3.

**Task:** `docs/handoffs/TASK_1352a.md`

### Bug 1352b: pdf-extractor Orphaned (MEDIUM)

**Problem:** Python microservice (port 5001, pybctc) running but never called. Superior table detection unused.

**Impact:** BCTC financial tables extracted as text-only (suboptimal parsing).

**Fix:** Wire microservice fallback after OCR. Add health check at startup. Enable table-aware extraction.

**Task:** `docs/handoffs/TASK_1352b.md`

### Bug 1352c: OCR Health Silent (MEDIUM)

**Problem:** OCR availability checked once at startup, cached, never logged. Per-file extraction errors are silent.

**Impact:** Operators can't diagnose failed extractions. No per-file error retry.

**Fix:** Log OCR health at startup. Add per-file error logging + DPI 300 retry. Warn on low-char extracts.

**Task:** `docs/handoffs/TASK_1352c.md`

---

## Sprint Structure

| Task | Title | Type | Depends | Tests | Est. Lines |
|------|-------|------|---------|-------|-----------|
| **1352a** | Async extraction race | BUG FIX | — | 8+ | 40 edits + 200 test code |
| **1352b** | pdf-extractor wiring | FEATURE | 1352a | 12+ | 60 edits + 300 test code |
| **1352c** | OCR health logging | OBSERVABILITY | 1352a+1352b | 10+ | 50 edits + 250 test code |

**Total:** 3 tasks, 30 tasks worth of observability gains, 150 code edits, 750 test lines

---

## Triage Document

**Main:** `docs/handoffs/BCTC_EXTRACTION_BUGS_TRIAGE.md`

Covers:
- Root cause analysis for each bug
- Integration points across extraction flow
- Risk assessment + mitigation
- File-by-file edit list
- Testing strategy for each bug

---

## Why This Matters

BCTC (quarterly financial reports) is critical for **fundamental analysis signals** in the market intelligence platform. Current bugs create three failure modes:

1. **1352a:** PDFs downloaded but not extracted → financial data missing.
2. **1352b:** Tables in PDFs parsed as text → ratio parsing fails.
3. **1352c:** Silent failures → no visibility into why extraction failed.

Fixing all three ensures:
- End-to-end reliability (await extraction before marking done)
- Better data quality (table-aware parsing via pybctc)
- Observable health (startup health check + per-file error logging)

---

## Handoff Files

- **Triage:** `docs/handoffs/BCTC_EXTRACTION_BUGS_TRIAGE.md`
- **Task 1352a:** `docs/handoffs/TASK_1352a.md`
- **Task 1352b:** `docs/handoffs/TASK_1352b.md`
- **Task 1352c:** `docs/handoffs/TASK_1352c.md`

All files ready for developer pickup. Execute in order: 1352a → 1352b → 1352c.

---

## Next Steps

1. **Developer** reads triage + task handoffs
2. **Developer** implements 1352a (async race fix)
3. **QA** verifies 1352a tests (8+ new, baseline maintained)
4. **Developer** implements 1352b (pdf-extractor wiring)
5. **QA** verifies 1352b tests (12+ new, baseline maintained)
6. **Developer** implements 1352c (OCR logging)
7. **QA** verifies 1352c tests (10+ new, baseline maintained)
8. **All three merged** with final reports

---

**Triage Completed By:** PO (Product Owner)
**Date:** 2026-04-28
**Status:** Ready for developer pickup
