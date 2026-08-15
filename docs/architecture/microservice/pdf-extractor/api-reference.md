# pdf-extractor — API Reference

**Route wiring:** `apps/pdf-extractor/interface/handlers.py::register_routes()` —
delegates to one `register_*_routes()` module per endpoint group
(FACTORY-PDF-split-handlers, 2026-07-29):
`routes_health.py` (`/health`), `routes_extract.py` (`/extract`),
`routes_extract_tables.py` (`/extract-tables`),
`routes_md_tables.py` (`/extract-md-tables`),
`routes_layout_first.py` (`/extract-layout-first`),
`routes_pek.py` + `pek_run_helper.py` (`/pek-extract`),
`routes_rasterizer.py` (`/rasterize`), `routes_page_text.py` (`/page-text`).
Request schemas: `interface/schemas.py`. Statement-section allow-set:
`domain/constants.py::STATEMENT_SECTIONS`.

**Process-hygiene note (`/pek-extract`, FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-
HEADROOM, 2026-08-15):** `pek_run_helper.py::_run_pek_extract` calls a
guarded `_malloc_trim_or_noop()` (glibc `malloc_trim(0)`) in a `finally:`
block after every PEK job, success or failure — no request/response contract
change. PEK layout+table inference (PyTorch/PaddlePaddle) runs thread- not
process-isolated inside PID1 (unlike the `/extract` tesseract path, which is
a real `ProcessPoolExecutor` child); the trim call returns per-job native-
allocator growth to the OS. Evidence + full mechanism:
`docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-memory-burst-headroom.md`.

## GET /health
```json
{ "status": "ok", "service": "pdf-extractor" }
```

## POST /extract
Extract tables and text from a PDF document.

**Request (Pydantic validated):**
```json
{
  "url": "https://example.com/bctc_q4_2024.pdf",
  "source_type": "bctc",
  "priority": 0
}
```

**Validation:**
- `url`: non-empty string
- `source_type`: one of "bctc", "weather", "utility_bill" (default: "bctc")
- `priority`: integer (default: 0)

**Response (200 — success):**
```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "tables": [
    {
      "table_index": 0,
      "headers": ["Chi tieu", "Q4 2024", "Q4 2023"],
      "rows": [["Doanh thu", "15,000", "12,500"]],
      "page_number": 1
    }
  ],
  "text_content": "BAO CAO TAI CHINH QUY 4...",
  "ocr_confidence": 0.8,
  "extraction_time_ms": 3500,
  "status": "success",
  "confidence_financial": 0.8
}
```

**Response (200 — failed):**
```json
{
  "document_id": "...",
  "tables": [],
  "text_content": "",
  "ocr_confidence": 0.0,
  "extraction_time_ms": 0,
  "status": "failed",
  "confidence_financial": 1.0
}
```

**500:** `{ "detail": { "error": "..." } }`

## Data Flow
```
POST /extract → ExtractPDFUseCase → ExtractPDFService.process_pdf()
  → HTTPPDFStorageRepository.fetch_pdf(url) (60s timeout)
  → PdfplumberExtractionEngine.extract_tables(pdf_bytes)
  → PdfplumberExtractionEngine.extract_text_ocr(pdf_bytes)
  → validate_financial_figures() (confidence scoring)
  → store_extraction() → mark document success
```
