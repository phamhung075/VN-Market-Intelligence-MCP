# DDD Phase 1a: PDF Extractor Microservice

## Summary

Phase 1a extracts BCTC PDF processing into a standalone Python/FastAPI microservice (`apps/pdf-extractor/`) following the DDD pattern defined in `docs/MICROSERVICES_DDD.md`.

## What was built

### New service: `apps/pdf-extractor/`

Full DDD structure:

| Layer | File | Purpose |
|-------|------|---------|
| domain | `models.py` | PDFDocument, ExtractedTable, ExtractedContent |
| domain | `repositories.py` | PDFDocumentRepository, PDFStorageRepository, PDFExtractionEngine (ports) |
| domain | `services.py` | ExtractPDFService — pure pipeline logic |
| domain | `errors.py` | PDFProcessingError, PDFNotFoundError, PDFLowQualityError, PDFDownloadError |
| application | `dtos.py` | ExtractPDFRequest, ExtractPDFResponse, ExtractedTableDTO |
| application | `usecases.py` | ExtractPDFUseCase — orchestrates domain service + repo init |
| infrastructure | `repositories.py` | SQLitePDFDocumentRepository, HTTPPDFStorageRepository |
| infrastructure | `extraction_engine.py` | PdfplumberExtractionEngine (pdfplumber + pytesseract) |
| infrastructure | `config.py` | Config.from_env() |
| interface | `handlers.py` | FastAPI route handlers (thin) |
| interface | `serializers.py` | Pydantic request/response schemas |
| root | `main.py` | App factory, dependency wiring, uvicorn entrypoint |

### New TS client: `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts`

- `extractViaMicroservice(url, sourceType)` → PdfExtractorResult | null
- `checkPdfExtractorHealth()` → boolean
- Graceful null return on any failure (mcp-server falls back to in-process pipeline)

### Updated: `docker-compose.yml`

Uncommented and fully configured `pdf-extractor` service:
- Port 5001
- Health check: `GET /health`
- Depends on mcp-server health

### Updated: `docs/ARCHITECTURE.md`

Added Services table, pdf-extractor section, updated monorepo tree.

## Test gate results

### Python (pytest): 20/20 PASS

```
__tests__/unit/test_extract_pdf_service.py    — 11 tests (domain logic, AsyncMock ports)
__tests__/integration/test_extract_pdf_usecase.py — 9 tests (real SQLite, mocked HTTP/engine)
```

### TypeScript (bun test): 11/11 PASS

```
src/__tests__/1323-pdf-extractor-client.test.ts — 11 tests (mock fetch, all paths)
```

### TypeScript compilation: 0 errors

```
bun tsc --noEmit
```

### No regressions

```
bun test src/__tests__/042-bctc-balance-sheet.test.ts  → 36 pass
```

## DDD invariants maintained

- `domain/` imports nothing from `infrastructure/` or `interface/`
- All ports (repositories/engines) are abstract base classes
- Infrastructure implements ports; domain only sees ABCs
- Tests use AsyncMock for all ports (unit) + real SQLite with mocked HTTP (integration)

## Branch

`feature/ddd-phase-1a` (branched from `feature/ddd-phase-0`)

## Next phase

Phase 1b: RAG Service extraction (Python/FastAPI, port 5002)
