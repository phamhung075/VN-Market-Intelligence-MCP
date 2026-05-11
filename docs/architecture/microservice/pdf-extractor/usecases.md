# pdf-extractor — Use Cases

## ExtractPDFUseCase
- **File:** `apps/pdf-extractor/application/usecases.py`

### Input DTO
```python
class ExtractPDFRequest:
    url: str
    source_type: Literal["bctc", "weather", "utility_bill"]
    priority: int = 0
```

### Output DTO
```python
class ExtractPDFResponse:
    document_id: str
    tables: list[ExtractedTableDTO]
    text_content: str
    ocr_confidence: float
    extraction_time_ms: int
    status: Literal["success", "failed"]
    confidence_financial: float = 1.0
```

### Flow
1. Assign new UUID as `doc_id`
2. Create `PDFDocument(id=doc_id, status='pending', ...)`
3. Persist via `extract_service.doc_repo.save(doc)`
4. Call `extract_service.process_pdf(doc_id)`
5. Map `ExtractedContent` → `ExtractPDFResponse(status='success')`
6. On `PDFProcessingError`: Return `ExtractPDFResponse(status='failed', tables=[])`
