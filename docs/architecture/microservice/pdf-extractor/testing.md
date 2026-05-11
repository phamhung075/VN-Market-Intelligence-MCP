# pdf-extractor — Testing

## Unit Tests — Domain Service
**File:** `apps/pdf-extractor/__tests__/unit/test_extract_pdf_service.py`

- Mocks: `doc_repo`, `storage_repo`, `engine` (all AsyncMock)
- Happy path: extraction succeeds, document marked success
- Error: PDFNotFoundError when doc_id not in repo
- Error: PDFLowQualityError when ocr_conf < 0.5 AND no tables
- Status transitions: pending→processing→success/failed
- Order: fetch_pdf called before extract_tables
- Timing: extraction_time_ms measured

## Unit Tests — Financial Validation
**File:** `apps/pdf-extractor/__tests__/unit/test_financial_validation.py`

| Rule | Test Case | Expected |
|------|-----------|----------|
| BCTC-VAL-01 | total_assets=957B < equity=18829B (VNM) | 0.0 |
| BCTC-VAL-02 | total_assets < 0 | 0.0 |
| BCTC-VAL-04 | total_liabilities < 0 | 0.0 |
| BCTC-VAL-03 | operating_margin=3.3 (VEA 330%) | -0.2 penalty |
| BCTC-VAL-05 | net_revenue <= 0 | -0.2 penalty |
| BCTC-VAL-06 | total_equity < 0 | -0.2 penalty |
| 3 soft violations stacked | | confidence=0.4 (floor 0.1) |
| Composite confidence | min(ocr=0.8, financial=0.6) | 0.6 |
| All None values | Partial extraction | 1.0 (not penalized) |

## Integration Tests
**File:** `apps/pdf-extractor/__tests__/integration/test_extract_pdf_usecase.py`

- Real SQLite database (tmp_path fixture)
- Mocked engine + storage_repo
- End-to-end: document creation → extraction → response DTO
- Multiple extractions produce independent document IDs
- Error responses return status='failed' (no exception raised)

## Run Commands
```bash
cd apps/pdf-extractor && python -m pytest
cd apps/pdf-extractor && python -m mypy . --ignore-missing-imports
```
