# pdf-extractor — Use Cases

## FinancialReportsModule.process_report() — BT-3-C additive keys

BT-3-C adds two optional return keys to `process_report()` when `table_assembler` is wired:

| Key | Type | Description |
|-----|------|-------------|
| `structured_table_rows` | `list[dict] \| None` | Structured BCTC table rows (code, label, value_current, value_prior, unit, is_summary_row) |
| `balance_check` | `dict \| None` | `{total_assets, total_liabilities, total_equity, balance_delta, balance_pass}` |

All 14 existing keys are preserved (backward-compat). New keys return `None` when `table_assembler` is not wired.

New optional `__init__` param: `table_assembler: Optional[TableAssemblerPort] = None`

New optional `process_report()` params:
- `pages: Optional[list] = None` — page list for table assembler `[{page_number, text}]`
- `statement_section: str = "balance_sheet"` — BCTC section for balance-check

Integration test: `__tests__/integration/test_extract_tables_fpt.py` — real FPT PDF, 4 tests, ≥70 rows, balance_pass=True.

---

## ExtractTablesUseCase (BT-3-B)
- **File:** `apps/pdf-extractor/application/extract_tables_usecase.py`
- **Route:** `POST /extract-tables` (wired in `interface/handlers.py`)
- **Composition root:** `main.py` — `TextTableExtractor` + `TablePushClient` injected

### Input
```python
report_id: str        # UUID matching financial_reports.id on mcp-server
pdf_path: str         # Absolute path to PDF on disk
statement_section: str  # "balance_sheet" | "income_statement" | "cash_flow"
```

### Output
```python
{
    "rows_stored": int,      # echoed from mcp-server push response
    "balance_pass": bool,    # True when Total Assets == Liab + Equity within 1 VND
    "balance_delta": float,  # assets - (liab + equity); 0.0 when N/A
}
```

### Flow
1. Call `TableAssemblerPort.assemble(pages, statement_section)` → `{rows, period_current, period_prior}`
2. For `balance_sheet`: compute `_compute_balance_check(rows)` — pure logic, searches codes 270/300/400
3. Call `TablePushClientPort.push_table(report_id, section, rows, balance_check, periods)`
4. Return `{rows_stored, balance_pass, balance_delta}`

### Balance-check logic
- Code "270" = Total Assets, "300" = Total Liabilities, "400"/"440" = Total Equity
- Tolerance: 1 VND absolute (`|delta| <= 1.0`)
- Returns `None` if no BS codes found (income-statement / cash-flow docs)
- FPT golden anchor: 88,089,621,779,862 == 44,338,155,487,272 + 43,751,466,292,590 → delta=0.0, pass=True

### DDD constraints
- Zero infra imports — only domain ports + stdlib
- Concrete adapters injected via constructor
- No HTTP/DB knowledge

---

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
