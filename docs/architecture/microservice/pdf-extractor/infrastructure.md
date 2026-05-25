# pdf-extractor — Infrastructure

## SQLitePDFDocumentRepository
- **File:** `apps/pdf-extractor/infrastructure/repositories.py`

### Schema
```sql
CREATE TABLE IF NOT EXISTS pdf_documents (
    id           TEXT PRIMARY KEY,
    url          TEXT NOT NULL,
    source_type  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    extracted_at TEXT
);
```

### Operations
- `save(doc)`: INSERT OR REPLACE upsert
- `find_by_id(doc_id)`: Fetch by id, parse extracted_at as ISO datetime
- `find_pending()`: `SELECT * WHERE status = 'pending'`

## HTTPPDFStorageRepository
- **File:** `apps/pdf-extractor/infrastructure/repositories.py`

### fetch_pdf(url)
- Uses `aiohttp` with 60s timeout
- Validates HTTP 200
- Sets User-Agent header

### store_extraction(doc_id, content)
- Output path: `{storage_dir}/{doc_id}.json`
- Writes JSON with tables (headers + rows), text, ocr_confidence, extraction_time_ms

## PdfplumberExtractionEngine
- **File:** `apps/pdf-extractor/infrastructure/extraction_engine.py`

### extract_tables(pdf_bytes)
1. Opens PDF with `pdfplumber` from BytesIO
2. Iterates pages, calls `page.extract_tables()`
3. headers from row[0], rows from row[1:], None→""
4. Returns `list[ExtractedTable]` with page_number and table_index
5. Returns [] on corruption

### extract_text_ocr(pdf_bytes)
1. Opens PDF with `pdfplumber`
2. Per page:
   - Native text >=50 chars: append, confidence=1.0
   - Else OCR via `_ocr_page()`: confidence=0.8
   - Else sparse text: confidence=0.3
3. Joins pages with `"\n\n--- Page Break ---\n\n"`
4. Returns `(text, min_confidence)` — lowest across all pages

### _ocr_page(page)
1. `page.to_image(resolution=200)` (pdfplumber→PIL)
2. `pytesseract.image_to_string(img.original, lang="vie+eng")`
3. Returns text.strip() or "" on error

## System Dependencies
- `tesseract-ocr` + `tesseract-ocr-vie` + `tesseract-ocr-eng`
- `poppler-utils` (PDF rendering)

## TextTableExtractor (BT-3-A/C)
- **File:** `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- **Implements:** `TableAssemblerPort`

### OCR Layout Detection (BT-3-C)
The extractor auto-detects two page layouts per page:

**Block-column layout** (FPT pages 4-6): labels, codes, and values in separate OCR blocks.
- Detected by: ≥5 consecutive pure-code-only lines (`^\s*(\d{2,3})\s*(?:\d{1,2})?\s*$`).
- Reconstruction: `_extract_block_columns()` extracts code list + value lists, zipped positionally.
- Handles "Mã số" header, "Thuyết minh" note block, dual date blocks (current + prior).

**Inline layout** (FPT page 7, fixture text): code+label+values on the same line.
- 4 sub-layouts supported:
  1. Code-first (2+ spaces): `"100  TÀI SẢN NGẮN HẠN  58.102..."`
  2. Label-first (2+ spaces): `"A. TÀI SẢN  100  58.102..."`
  3. Code-value column: `"270 88.089.621.779.862"` (code + single-space + value)
  4. Label-code-value single-space: `"D. VỐN CHỦ SỞ HỮU 400 43.751.466.292.590 35.727..."`

### OCR Coercion
`_coerce_ocr_number()` fixes comma/period OCR artifacts:
- `"44,338.155.487.272"` → `"44.338.155.487.272"` (first separator comma→dot)

### FPT Golden Anchors (BT-0 regression)
| Code | Value (VND) |
|------|-------------|
| 100  | 58,102,970,741,619 |
| 270  | 88,089,621,779,862 |
| 300  | 44,338,155,487,272 |
| 400  | 43,751,466,292,590 |
| 440  | 88,089,621,779,862 |

balance_pass = True (delta = 0.0)

## PdfOcrAdapter (BT-3-D)
- **File:** `apps/pdf-extractor/infrastructure/ocr_adapter.py`
- **Implements:** `OcrPort` Protocol (domain/repositories.py)

### Purpose
Concrete OCR adapter that wires Tesseract into the production `/extract-tables` path.
Injected into `ExtractTablesUseCase` at the composition root (BT-3-D fix for the false-green
BT-3-C integration test, which pre-supplied OCR text and never exercised real Tesseract).

### locate_balance_sheet_pages(pdf_path) → list[int]
- Uses pdfplumber native text extraction (FAST — no Tesseract, no image rendering)
- Scans each page for Vietnamese BCTC balance-sheet markers (case-insensitive):
  - "bảng cân đối kế toán", "tài sản ngắn hạn", "tài sản dài hạn"
  - "nguồn vốn", "tổng cộng tài sản", "tổng cộng nguồn vốn"
  - Unaccented fallbacks for OCR-mangled text
- Allows 1-page gap within section (some pages are mostly numeric, no markers)
- Stops after 2 consecutive non-marker pages (section ended)
- Safety cap: max 8 pages collected
- Fallback to [4, 5, 6, 7] if no markers found (FPT heuristic — logged as warning)

### ocr_pages(pdf_path, page_numbers) → list[dict]
- D6 HOST SAFETY: converts ONE page at a time via `pdf2image.convert_from_path(first_page=n, last_page=n)`
- Tesseract via `pytesseract.image_to_string(img, lang="vie+eng")` (self-hosted)
- Sequential loop — no threading, no batching
- Returns `[{"page_number": int, "text": str}, ...]` — failed pages get `text=""`
- DPI=200 (same as integration test helper `_ocr_pdf_pages()`)

### DDD placement
- Infrastructure layer (correct — does I/O: pdfplumber, pdf2image, Tesseract subprocess)
- Domain never imports this; application layer only knows the `OcrPort` Protocol
- Fence-A/B: both KEPT (70 files, 126 deps, 2 kept 0 broken after BT-3-D)

### Privacy
- Self-hosted Tesseract only. Zero external API calls. Zero data leaves machine.

---

## TelegramAlertAdapter (BT-5)
- **File:** `apps/pdf-extractor/infrastructure/alert_adapter.py`
- **Implements:** `AlertPort` Protocol (domain/repositories.py)

### Purpose
Concrete WORK-channel Telegram alert adapter. Injected into `ExtractTablesUseCase` at the
composition root. Fires when the BT-5 cross-check gate blocks a push.

### Configuration (from environment)
```
TELEGRAM_BOT_TOKEN               — Telegram bot token
TELEGRAM_INFO_WORK_CHANNEL_ID    — WORK channel chat ID (negative for groups)
```

### Behaviour
- `send_work_alert(message)` — fire-and-forget POST to Telegram Bot API `/sendMessage`
- On failure (network, invalid token): logs error and returns normally — never disrupts caller
- If creds not set: logs warning and returns (safe default — no crash)

### DDD placement
- Infrastructure layer (correct — I/O, network, credentials)
- Domain never imports this file; application layer only knows the `AlertPort` Protocol

## Configuration
```python
class Config:
    db_path: str = "/app/data/pdf_extractor.db"
    storage_dir: str = "/app/data/extractions"
    host: str = "0.0.0.0"
    port: int = 5001
    log_level: str = "INFO"
    mcp_server_url: str = "http://mcp-server:3000"  # BT-3-A
```
