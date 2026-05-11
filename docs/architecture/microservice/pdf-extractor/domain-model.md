# pdf-extractor — Domain Model

## Entities

### PDFDocument
```python
class PDFDocument:
    id: str                    # UUID
    url: str                   # Source PDF URL
    source_type: Literal["bctc", "weather", "utility_bill"]
    status: str                # pending → processing → success | failed
    extracted_at: Optional[datetime]

    def is_terminal(self) -> bool:
        return self.status in ("success", "failed")
```

## Value Objects

### ExtractedTable
```python
class ExtractedTable:
    table_index: int
    headers: list[str]
    rows: list[list[str]]
    page_number: int
```

### ExtractedContent
```python
class ExtractedContent:
    document_id: str
    tables: list[ExtractedTable]
    text_content: str
    ocr_confidence: float          # [0.0, 1.0]
    extraction_time_ms: int
    confidence_financial: float    # [0.0, 1.0], default 1.0
```

**Confidence scoring:**
- `ocr_confidence`: 1.0 (direct), 0.8 (OCR), 0.3 (partial), 0.0 (nothing)
- `confidence_financial`: from financial validation rules
- **Composite: `min(ocr_confidence, confidence_financial)`**

## Financial Validation Rules

**Function:** `validate_financial_figures(total_assets, total_equity, total_liabilities, operating_margin, net_revenue) -> float`

### Hard Violations (return 0.0 immediately)
| Rule | Condition | Example |
|------|-----------|---------|
| BCTC-VAL-01 | total_assets < total_equity | VNM Q4 2024: assets=957B, equity=18829B |
| BCTC-VAL-02 | total_assets < 0 | |
| BCTC-VAL-04 | total_liabilities < 0 | |

### Soft Violations (-0.2 each, floor 0.1)
| Rule | Condition | Example |
|------|-----------|---------|
| BCTC-VAL-03 | operating_margin outside (-5.0, +1.0) | VEA Q4 2024: margin=3.3 (330%) |
| BCTC-VAL-05 | net_revenue <= 0 | |
| BCTC-VAL-06 | total_equity < 0 | |

**Formula:** `confidence = max(1.0 - penalty, 0.1)` where penalty = 0.2 per soft violation

None values are skipped (partial extraction not penalized).

## Repository Ports

### PDFDocumentRepository
```python
async save(doc: PDFDocument) -> None      # upsert by id
async find_by_id(doc_id: str) -> Optional[PDFDocument]
async find_pending() -> list[PDFDocument]  # status='pending'
```

### PDFStorageRepository
```python
async fetch_pdf(url: str) -> bytes         # download via HTTP
async store_extraction(doc_id: str, content: ExtractedContent) -> str  # persist JSON
```

### PDFExtractionEngine
```python
async extract_tables(pdf_bytes: bytes) -> list[ExtractedTable]
async extract_text_ocr(pdf_bytes: bytes) -> tuple[str, float]  # (text, confidence)
```

## Domain Service

### ExtractPDFService
- **File:** `apps/pdf-extractor/domain/services.py`

**Method: `async process_pdf(doc_id: str) -> ExtractedContent`**

**Pipeline:**
1. Load document metadata (`doc_repo.find_by_id`)
2. Mark as `processing` and persist
3. Fetch raw PDF bytes (`storage_repo.fetch_pdf`)
4. Extract tables (`engine.extract_tables`)
5. Extract text with OCR fallback (`engine.extract_text_ocr`)
6. **Quality gate:** If `ocr_conf < 0.5 AND no tables` → raise `PDFLowQualityError`
7. Build `ExtractedContent` with composite confidence
8. Persist extraction JSON
9. Mark document `success` with `extracted_at = now()`

**Errors:** PDFNotFoundError, PDFLowQualityError, PDFProcessingError
