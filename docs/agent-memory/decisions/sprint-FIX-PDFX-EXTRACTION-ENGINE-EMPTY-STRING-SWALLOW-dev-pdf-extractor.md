# Decision Journal — Sprint FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW · dev-pdf-extractor

**Sprint goal:** Follow-up defect flagged in FIX-PDFX-TESSERACT-CONCURRENCY §10.3: extraction_engine.py swallows OCR failures into "" indistinguishable from a legitimate blank page.
**Agent:** dev-pdf-extractor
**Started:** 2026-07-30T00:00:00Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-30T00:00:00Z
**task-id:** FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW
**what-done:** Added `OcrPageFailedError(PDFProcessingError)` in domain/errors.py; `_ocr_page()`'s generic `except Exception` now raises it (wrapping the original exc) instead of `return ""`; `_extract_text_ocr_sync`'s propagation tuple extended to include it alongside the two existing transport signals.
**what-considered:**
- Raise/tag at the `_ocr_page` call site vs. abort whole multi-page doc on any single-page failure — chose raise (mirrors the already-shipped OcrCapacityExceededError/OcrDeadlineExceededError pattern from FIX-PDFX-TESSERACT-CONCURRENCY; zero new HTTP/services.py/usecases.py changes needed since `process_pdf()`'s `except PDFProcessingError` branch already exists and marks doc failed).
- New HTTP status code for this new error type vs. letting it fall into the existing generic `PDFProcessingError` → `status:"failed"` 200 response path — chose the latter (same treatment as PDFLowQualityError; deadline/capacity are the special transport-layer cases, a real tesseract crash is not).
- ImportError (`pytesseract` missing) left unchanged (not an OCR failure — no OCR attempted) per AC1's enumerated failure types (tesseract error / deadline / capacity), confirmed no test relies on the old catch-all-to-"" behavior for this branch.
**why-decision:** Minimal blast radius, reuses an already-proven propagation chain (process_pdf → doc.status="failed", store_extraction never reached), zero collision with FIX-ERRAUDIT-W3-PEK-P2 (grep-confirmed: that row's `parse_or_raise`/`validate_or_unknown` targets don't exist under those names; only overlap is same file, different method — `_extract_tables_sync` untouched).
**why-change:** no change from plan — router handoff scope matched exactly what was found in the file at execution time.
