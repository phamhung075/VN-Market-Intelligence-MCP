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
    "rows_stored": int,      # DB-verified count from mcp-server (SELECT COUNT after write)
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

### BT-5 Cross-check Gate (added to ExtractTablesUseCase.execute())

After Step 2 (balance-check), before Step 3 (push), the gate runs if `statement_section == "balance_sheet"`:

**Blocking conditions (either triggers block):**
1. `balance_check.balance_pass == False` (identity fails beyond 1 VND tolerance)
2. `reconcile_figures(total_assets, liab_plus_equity, tol=1.0) == "shift"` (ratio >10× — decimal-shift anomaly)

**When BLOCKED:**
- `push_table()` is NOT called
- `blocked_reason = "cross_check_fail"` set in result
- WORK alert emitted via injected `AlertPort` (`TelegramAlertAdapter` in production)
- `rows_stored = 0`

**When PASSED:**
- Push proceeds normally
- `blocked_reason = None` in result

**BT-5 extended output shape:**
```python
{
    "rows_stored": int,
    "balance_pass": bool,
    "balance_delta": float,
    "blocked_reason": str | None,  # BT-5: "cross_check_fail" | None
}
```

**AlertPort (domain/repositories.py):**
- Pure `Protocol` — zero infra imports
- `send_work_alert(message: str) -> None`
- Concrete: `infrastructure/alert_adapter.TelegramAlertAdapter` (reads TELEGRAM_BOT_TOKEN + TELEGRAM_INFO_WORK_CHANNEL_ID from env)
- Test fake: `FakeAlertPort` in test files (records messages in list, no network)

### BT-3-D OCR Wiring (Production Path Fix)

**Bug diagnosed (BT-4b):** `execute()` built `pages=[{"page_number": 0, "path": pdf_path}]` with no `"text"` key. `TextTableExtractor.assemble()` reads `page.get("text", "")` → `""` → 0 rows. The BT-3-C integration test gave a FALSE-GREEN: it used `PreloadedTextTableExtractor` that ignored the pages arg entirely and pre-supplied OCR text.

**Fix (BT-3-D):** `OcrPort` injected. Priority order:
1. `pre_supplied_pages` with "text" (BT-4b-2 DEFERRED from mcp-server) → no OCR needed
2. `ocr_port` available → `locate_balance_sheet_pages()` + `ocr_pages()` (sequential, located pages only)
3. Neither → empty pages (backward-compat for unit tests with fake assemblers)

**New constructor param:** `ocr_port: Optional[OcrPort] = None` (backward-compat)

**New execute() param:** `pre_supplied_pages: Optional[list[dict]] = None` (for mcp-server pre-supply)

**BT-4b-2 DEFERRED:** mcp-server backfillBctcTables job should populate `pages` from `pdf_extracted_text` before calling `/extract-tables`, to avoid re-OCR on the 16GB Mac.

**OcrPort (domain/repositories.py):**
- Pure Protocol — `ocr_pages(pdf_path, page_numbers) -> list[dict]`
- Pure Protocol — `locate_balance_sheet_pages(pdf_path) -> list[int]`
- Concrete: `infrastructure/ocr_adapter.PdfOcrAdapter`

### BT-7 Path-A Section Filter + Period Detection Hardening

**Root cause (BT-EXIT partial):** Path A (pre-supplied pages from mcp-server backfill) fed ALL stored OCR pages to `TextTableExtractor.assemble()`. FPT Q4: 44 pages → 2170 rows (2074 noise). `period_current` picked `"26/01/2026"` from digital-signature timestamp on cover/signature pages.

**Fix (BT-7) — two changes:**

1. `select_balance_sheet_section(page_texts)` — NEW pure domain primitive (`domain/primitives/select_balance_sheet_section/primitive.py`). Scans each page's text for Vietnamese BS markers, returns only the contiguous BS section. Applied in `execute()` Path A BEFORE passing pages to the assembler (only for `balance_sheet` section). Mirrors the same logic as `PdfOcrAdapter.locate_balance_sheet_pages()` but operates on plain text.

2. `_detect_periods()` hardened in `TextTableExtractor` — two-pass approach:
   - Pass 1: find a line containing TWO dates (BS column header `"31/12/2025  31/12/2024"`) — strong signal, use those as current+prior.
   - Pass 2 fallback: scan non-signature lines (lines with HH:MM:SS time pattern are rejected as digital-signature timestamps).
   - `_is_signature_line(line)` helper: returns True if line contains `HH:MM:SS` pattern (signature timestamp context).

**Result after BT-7:** Path A with 44 noisy FPT Q4 pages → filtered to 4 BS pages → ~8 code rows stored → `period_current="31/12/2025"` → golden anchors 270/300/400 exact → `balance_pass=True`.

**DDD:** `select_balance_sheet_section` is a pure domain primitive (Fence-A safe — zero infra imports). Imported by `application/extract_tables_usecase.py` (application layer imports from domain — correct per DDD).

**FPT Q1 recovery:** FPT Q1's balance-sheet is on stored page 3 ("BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT"). The marker `"tình hình tài chính"` is in `_BS_STRONG_MARKERS` — the section filter selects page 3 and adjacent BS pages. Expected to recover from 0-row to valid extraction on next backfill.
  - `locate_balance_sheet_pages()`: uses pdfplumber native text (fast, no Tesseract) to scan for Vietnamese BS markers
  - `ocr_pages()`: pdf2image + pytesseract vie+eng, sequential, one page at a time (D6 host safety)
  - Falls back to pages 4-7 if no markers found (heuristic, logged as warning)

**Integration test (BT-3-D):** `__tests__/integration/test_extract_tables_bt3d_real_ocr.py` — drives real production wiring (no pre-supplied text, no fake extractor), asserts rows_stored≥80, balance_pass=True, golden anchors 270/300/400.

### DDD constraints
- Zero infra imports — only domain ports + stdlib + domain primitives (reconcile_figures)
- Concrete adapters injected via constructor (`alert_port: Optional[AlertPort] = None`, `ocr_port: Optional[OcrPort] = None` — backward-compat)
- No HTTP/DB knowledge
- `reconcile_figures` imported from `domain.primitives` (pure function, Fence-A safe)

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
