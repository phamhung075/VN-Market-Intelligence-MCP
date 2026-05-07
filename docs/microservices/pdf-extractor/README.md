# pdf-extractor

**Port:** 5001 | **Language:** Python/FastAPI | **Agent:** `dev-pdf-extractor`

BCTC (Vietnamese financial statement) PDF parsing with OCR via Tesseract.

## Architecture

- **Domain:** Extraction models, financial field definitions, confidence scoring rules
- **Application:** PDF extraction use cases, OCR pipeline orchestration
- **Infrastructure:** pdfplumber (table extraction), pytesseract (OCR), Pillow (image processing), SQLite (pdf_extractor.db — write)
- **Interface:** HTTP handlers via FastAPI

## Database

- **Owns:** `pdf_extractor.db` (read-write, isolated) — extraction state, OCR results, confidence tracking

## Dependencies

- VPS bridge for BCTC file download (PULL-based: mcp-server pulls from VPS:8765/bctc-files/)
- Tesseract OCR engine (system dependency)

## Confidence Handling

- `confidence = 0` → skip insert
- `confidence < 0.2` → insert with `low_confidence` flag
- `confidence >= 0.2` → normal insert
- All thresholds alert WORK channel

## Documentation

- `domain-model.md` — extraction models, financial field types, confidence rules
- `usecases.md` — extraction pipeline, OCR orchestration
- `infrastructure.md` — pdfplumber config, Tesseract setup, DB schema
- `api-reference.md` — HTTP endpoints
- `testing.md` — test strategy, fixtures, sample PDFs

> Docs populated incrementally by `dev-pdf-extractor` agent during implementation tasks.
