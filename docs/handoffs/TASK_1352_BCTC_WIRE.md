# TASK 1352-BCTC-WIRE — pdf-extractor Microservice Wiring

**Sprint:** 1352
**Type:** Feature — MEDIUM severity
**Git commit:** dd3b1713 (`task(1352b): wire pdf-extractor microservice into extraction pipeline`)
**Status: FULLY MERGED on main**
**Depends on:** TASK_1352_BCTC_RACE (DONE)

---

## Problem

`pdfExtractorClient.ts` exported `extractViaMicroservice` and `checkPdfExtractorHealth`
but neither was ever called from the pipeline. pybctc (port 5001, Docker) ran unused.
BCTC financial tables were parsed as raw text only.

---

## What Is on main (verified against HEAD)

### pdf.ts — full file (431 lines)

New exports:
- `PDF_CONFIDENCE_HIGH_THRESHOLD = 200`
- `PDF_MICROSERVICE_FALLBACK_THRESHOLD = 0.5`
- `PdfMicroserviceClient` port interface (lines 76–85)
- `PdfExtractionResult.extraction_method?: 'pybctc_tables' | 'pybctc_text'` (lines 60–67)

`downloadAndExtractPdf` gains an optional fourth parameter `microserviceClient`.
When `result.confidence < 0.5`, it calls `msClient.extract(url, "bctc")`.
On success with tables: returns `{ text, confidence, extraction_method: 'pybctc_tables' }`.
On success text-only: returns `extraction_method: 'pybctc_text'`.
On null / exception: falls through to pdf-parse result, never throws.

Production client lazy-loaded via `makeDefaultMicroserviceClient()` (lines 218–221)
to prevent test imports from loading `pdfExtractorClient` / `globalThis.fetch`.

### index.ts lines 117–138

Non-fatal block after Telegram webhook, before `startScheduler()`:
calls `checkPdfExtractorHealth()`, logs info if OK, warn if unreachable.
Server continues regardless.

### pdfExtractorClient.ts — no changes (pre-existing)

`extractViaMicroservice` and `checkPdfExtractorHealth` were already correct.

**Pre-existing standards violation:** line 18 uses `process.env.PDF_EXTRACTOR_URL`
instead of `Bun.env.PDF_EXTRACTOR_URL`. Log as cleanup; do not block.

### Test coverage

`apps/mcp-server/src/__tests__/1352b-pdf-extractor-wiring.test.ts` — 19 cases.

---

## Acceptance Criteria — All Met

| Criterion | Met |
|-----------|-----|
| Health check logged at server startup | YES (index.ts 117–138) |
| Microservice fallback wired at confidence < 0.5 | YES |
| `pybctc_tables` vs `pybctc_text` extraction_method stamped | YES |
| Graceful degradation when microservice unavailable | YES |
| `PdfMicroserviceClient` port for test injection | YES |
| 12+ tests | YES (19) |

---

## DDD Layers — Clean

| File | Layer |
|------|-------|
| pdf.ts | infrastructure/fetchers |
| pdfExtractorClient.ts | infrastructure/fetchers |
| index.ts | interface (server entry) |

`PdfMicroserviceClient` is a port (dependency inversion). Production impl
lazy-loaded. Tests inject mock. Correct ports+adapters pattern.

---

## files_to_read
- `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` — full file
- `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` — full file
- `apps/mcp-server/src/index.ts` lines 117–138

## files_to_modify
None — fully merged.

## files_to_create
None.

## depends_on
- TASK_1352_BCTC_RACE — DONE
