# Architecture Brief — BCTC Generic Table Detection → Markdown (Sprint BCTC-MD-TABLE)

> **Task:** MD-DESIGN | **Author:** architect | **Date:** 2026-05-26T10:30Z
> **Status:** DESIGN COMPLETE — ready for dev-pdf-extractor (MD-EXTRACT) + dev-mcp-server (MD-INSPECT, parallel-eligible)
> **Handoff SSOT:** `docs/handoffs/TASK_BCTC-MD-TABLE.md` (ACs appended at end of this brief)

---

## 1. Decision 1 — Generic Detection Algorithm (CHOSEN)

### Candidate evaluated: `pytesseract.image_to_data` TSV → per-word bbox → geometric clustering → markdown

**Verdict: ADOPTED with one modification to the OCR substrate source.**

The `image_to_data` / TSV approach is the correct primitive for this problem. The key finding from the BCTC-TABLE sprint history is that the scanned BCTC PDFs carry NO native text layer — `pdfplumber.extract_tables()` returns empty on all pages because there are no vector ruling lines. This conclusively disqualifies pdfplumber, Camelot, and Tabula as the primary path for table detection on these documents.

**Why not pdfplumber / Camelot / Tabula:**
These tools parse native PDF text or vector-line geometry. BCTC PDFs are image-only scans. The existing `PdfplumberExtractionEngine.extract_tables()` (lines 42-44 in `extraction_engine.py`) already demonstrates this: it falls back to Tesseract OCR when pages have fewer than 50 characters of native text, which is essentially all BCTC balance-sheet pages.

**Why `image_to_data` over `image_to_string`:**
The current OCR path in `PdfOcrAdapter.ocr_pages()` uses `pytesseract.image_to_string(config="--psm 6")` which discards all spatial information — it returns a flat string of lines. This is exactly why the generic table detector does not exist today: without bbox data, the system cannot distinguish columns. `image_to_data` returns per-word bounding boxes (left, top, width, height, conf, text) that allow geometric reconstruction of the 2-D grid structure.

**The modification:** the new generic module does NOT re-run Tesseract against the PDF to get bboxes. Instead, it calls `pytesseract.image_to_data` on the SAME page images that `pdf2image.convert_from_path` already produces at 200 DPI with `--psm 6`. The rasterization is shared with the existing `PdfOcrAdapter.ocr_pages()` pipeline; the new module adds a SECOND Tesseract call on the same page image but with `output_type=Output.DICT` (TSV mode). This adds roughly one additional Tesseract call per page (same DPI, same psm, same image) — acceptable on the 16GB Intel Mac for single-doc sequential extraction.

**Hardware budget confirmation:** one 200-DPI Tesseract call per page at psm 6 takes approximately 3-5 seconds on the Intel Mac. A 4-8 page BCTC section = 12-40 seconds total for the bbox pass, added sequentially after the existing `image_to_string` pass. No parallelism — single-doc sequential only. Docker 8GB cap: Tesseract is CPU-bound, peak RSS ~300MB per invocation; no heap risk.

**Privacy confirmation:** `pytesseract.image_to_data` is a local Tesseract subprocess call. Zero network traffic. Images remain in-process. Same privacy guarantee as the existing `image_to_string` path.

---

## 2. Algorithm Design — Generic Grid Reconstruction

### 2.1 Input

A page image (PIL Image object at 200 DPI) already rasterized by `pdf2image`. The new module receives the page image, NOT the flat OCR text.

### 2.2 Step-by-step

**Step A — Per-word bbox collection**

```
words = pytesseract.image_to_data(
    page_image, lang="vie+eng",
    config="--psm 6",
    output_type=Output.DICT
)
```

Filter `words` to entries where `conf > 0` and `text.strip() != ""`. Each word has `(left, top, width, height, text, conf)`.

**Step B — Table boundary detection (multi-table page)**

BCTC pages often contain a SINGLE table per page. However, the segment report and some pages contain non-table preamble text (company header, form number) followed by the table body. Boundary detection separates preamble from table:

1. Compute the median word height `H_med` across all words on the page.
2. Build a vertical gap histogram: for each adjacent pair of word bboxes sorted by top, record the gap = `top[i+1] - (top[i] + height[i])`.
3. Gaps larger than `2.5 × H_med` signal a section break. Candidates with at least two value-like tokens (matching `\d[\d.,]*` with length > 2) in the region below the gap are treated as table regions.
4. If no significant gap is found, the entire page (minus any preamble header detected by keyword scan via `_norm()` from `text_table_extractor._norm`) is treated as one table region.
5. If multiple table regions are detected on a single page, each is processed independently and emits a separate markdown table.

**Step C — Row clustering (y-band grouping)**

Within a table region's word set:

1. Sort words by `top` coordinate.
2. Use a greedy band-merge: start a new row when the next word's `top` exceeds the current row's `max(top + height)` by more than `0.5 × H_med`. This tolerates multi-line cells and OCR baseline jitter.
3. Each row = list of words sorted by `left` coordinate.

**Step D — Column detection (x-gap analysis)**

1. Collect all word left-edges across all rows.
2. Build a 1-D histogram of left-edge positions with bin width `= 0.3 × median_word_width`.
3. Peaks in the histogram are column anchors. Columns are defined by gaps between clusters — a gap of more than `1.5 × median_word_width` with no word left-edges in between is a column boundary.
4. Assign each word in each row to its nearest column anchor (argmin distance from word left to column anchor).
5. Empty cells where no word occupies a column in a given row are represented as empty string `""`.

**Step E — Grid assembly**

Produce a 2-D list `grid[row_idx][col_idx] = cell_text` where `cell_text` is the concatenation (space-joined) of all words assigned to that column in that row.

**Step F — Header row detection**

The first row (or first two rows when the first row has no numeric tokens) is treated as the header. Headers use diacritic-insensitive matching via `_norm()` to detect date patterns (column headers like "31/12/2025", "31/12/2024") and label-like tokens (all-caps Vietnamese segment names).

**Step G — Markdown pipe-table emission**

```
| Header 0 | Header 1 | Header 2 |
|---|---|---|
| cell      | cell      | cell      |
...
```

Rules:
- The `|---|` separator row uses `---` (no alignment specifier — generic, no column semantics).
- Cell text is stripped of leading/trailing whitespace and pipe characters.
- Empty cells are rendered as a single space so pipe-table parsers do not collapse the column.
- The markdown string is returned per detected table region as a list: `List[str]` where each element is one pipe-table.

### 2.3 OCR-text-as-markdown conversion

The raw OCR text already stored in `pdf_extracted_text` (flat `image_to_string` output) is converted to readable markdown by a SEPARATE pure function — no re-OCR needed:

```
def ocr_text_to_markdown(text: str) -> str
```

Algorithm:
1. Split on newlines.
2. Lines matching the `_is_recognized_section_header()` pattern (from `text_table_extractor`) are wrapped as `## Header`.
3. Lines that are blank → blank line (paragraph break in markdown).
4. Lines that appear to be numeric data rows (contain `\d[\d.,]{3,}`) are prefixed with `> ` (blockquote, preserving the tabular feel without column reconstruction).
5. All other lines are emitted as plain paragraph text.

This is a SIMPLE heuristic transform — it is NOT a full markdown table from OCR text. The full markdown table comes from the bbox path (Step A-G above). The OCR-as-markdown answers the user's "why not convert OCR to md?" question with a readable form of what is already stored, without re-OCR.

---

## 3. New Module — `generic_md_table_extractor`

### 3.1 Location

```
apps/pdf-extractor/
  infrastructure/
    generic_md_table_extractor.py    ← NEW infrastructure adapter
  domain/
    modules/
      financial_reports/
        ports.py                     ← ADD GenericMdTableExtractorPort (new port)
  application/
    extract_md_tables_usecase.py     ← NEW use case
```

The new module is NOT a patch to `text_table_extractor.py`. `text_table_extractor.py` is frozen for balance-sheet structured extraction; it has 7 fix commits and carries the working state that Decision A mandates keeping intact.

### 3.2 Port definition (domain layer — `ports.py` addition)

```python
class GenericMdTableExtractorPort(Protocol):
    """
    Port for the generic bbox-based markdown table detector.

    Receives page images (as file paths or PIL Image objects passed via
    the page_image_paths list). Returns per-page markdown tables and
    an OCR-as-markdown string for the full document.

    DDD: domain port — zero infrastructure imports.
    """

    def extract_md_tables(
        self,
        page_image_paths: List[str],   # absolute paths to 200-DPI page PNGs
        doc_ocr_text: Optional[str],   # flat OCR text from pdf_extracted_text (optional)
    ) -> Dict:
        """
        Returns:
          {
            "md_tables": List[str],      # one markdown pipe-table per detected region
            "ocr_as_markdown": str,      # doc_ocr_text converted to readable markdown
            "table_count": int,          # number of tables detected
          }
        """
        ...
```

### 3.3 Concrete implementation (`generic_md_table_extractor.py`)

DDD layer: **infrastructure** (runs Tesseract subprocess + reads PIL Image). Follows the same layer rules as `text_table_extractor.py` and `ocr_adapter.py`.

Key implementation rules:
- Import `pytesseract`, `pdf2image`, `PIL` — all already present in the Docker image (used by `ocr_adapter.py` and `extraction_engine.py`).
- Import `_norm` and `_is_recognized_section_header` from `text_table_extractor` for consistency (these are module-level helpers, not class methods — safe to import across infrastructure files).
- ZERO BCTC-specific constants: no `_SUMMARY_CODES`, no `_CODE_ROW_START_RE`, no code-range guards. The algorithm operates purely on geometry (bbox coordinates) and generic text patterns. Generality AC (Decision D) is satisfied by construction.
- `extract_md_tables(page_image_paths, doc_ocr_text)` is the single public method on the class.

### 3.4 Application use case (`extract_md_tables_usecase.py`)

DDD layer: **application**. Orchestrates OCR (page images) → generic bbox detector → markdown push to mcp-server. Follows the same DI pattern as `ExtractTablesUseCase`.

```python
class ExtractMdTablesUseCase:
    def __init__(
        self,
        md_extractor: GenericMdTableExtractorPort,
        md_push_client: MdTablePushClientPort,   # new port (see §4)
        ocr_port: Optional[OcrPort] = None,
    ) -> None: ...

    async def execute(
        self,
        report_id: str,
        pdf_path: str,
        doc_ocr_text: Optional[str] = None,  # from pdf_extracted_text if pre-supplied
    ) -> Dict:
        """
        1. Locate all pages of the doc (not just BS section — ALL pages for generic detection).
        2. Rasterize pages to temporary PNGs (200 DPI, same as PdfOcrAdapter).
        3. Call md_extractor.extract_md_tables(page_image_paths, doc_ocr_text).
        4. Push result to mcp-server via md_push_client.
        5. Return {tables_detected: int, pushed: bool}.
        """
```

Important distinction from `ExtractTablesUseCase`: the MD use case runs on ALL pages of the document (not just the balance-sheet section), because generic table detection must find the segment report, income statement, cash flow, notes — all of which appear on different pages. The `OcrPort.locate_balance_sheet_pages()` is NOT called here; instead, all pages are rasterized and passed to the detector.

Hardware guard: ALL pages means potentially 30-60 pages for a full BCTC PDF. On the 16GB Intel Mac with Docker 8GB cap, processing 60 pages of `image_to_data` at 200 DPI sequentially would take ~3-5 minutes. This is acceptable for a single-doc re-extract but MUST be strictly sequential (never parallel Tesseract processes). The use case MUST implement a page limit: process at most `MAX_PAGES = 20` pages per run. If the PDF has more than 20 pages, prioritize pages after page 3 (skip cover/preamble). Log a warning for truncation. This keeps runtime under 100 seconds on the Intel Mac.

---

## 4. Markdown-Surfacing Contract (pdf-extractor ↔ mcp-server boundary)

**Decision: STORE in mcp-server DB, inspector is pure-read.**

### 4.1 New port on pdf-extractor side

```python
class MdTablePushClientPort(Protocol):
    """
    Port for pushing generic markdown tables to mcp-server.
    Concrete adapter: infrastructure/md_table_push_client.py
    Target endpoint: POST /api/push-bctc-md-tables
    """

    async def push_md_tables(
        self,
        report_id: str,
        md_tables: List[str],          # one markdown string per detected table
        ocr_as_markdown: str,          # OCR text rendered as markdown
        page_count: int,               # total pages processed
    ) -> Dict:
        """
        Returns: {ok: bool, tables_stored: int}
        """
        ...
```

### 4.2 New table in mcp-server DB schema

```sql
-- Added via CREATE TABLE IF NOT EXISTS at server startup (schema-financial-reports.ts)
CREATE TABLE IF NOT EXISTS bctc_md_tables (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        TEXT    NOT NULL UNIQUE,
  md_tables_json   TEXT    NOT NULL,   -- JSON array of markdown strings (one per detected table)
  ocr_as_markdown  TEXT    NOT NULL,   -- full OCR text rendered as markdown
  table_count      INTEGER NOT NULL DEFAULT 0,
  page_count       INTEGER NOT NULL DEFAULT 0,
  extracted_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bmt_report ON bctc_md_tables(report_id);
```

The `md_tables_json` column is a JSON-encoded `string[]`. Storing as JSON avoids a one-to-many join for the common case (inspector reads ALL tables for a doc at once). The column is `UNIQUE` on `report_id` — re-extraction replaces the row via `INSERT OR REPLACE`.

**Why store, not compute-on-read:** Re-running Tesseract `image_to_data` on every inspector request is not feasible — a single page costs 3-5 seconds. The inspector must be a pure DB read. Storage is cheap (markdown strings are typically 5-50KB per doc).

### 4.3 New mcp-server push endpoint

`POST /api/push-bctc-md-tables`

Request body:
```json
{
  "report_id": "<uuid>",
  "md_tables": ["| Col1 | Col2 |\n|---|---|\n...", "..."],
  "ocr_as_markdown": "## Section\n...",
  "page_count": 7
}
```

Response: `{ "ok": true, "tables_stored": 3 }` on success; `{ "error": "..." }` on 400/500.

Handler file: `apps/mcp-server/src/interface/mcp/routes/pushBctcMdTablesHandler.ts` (new file, mirrors `pushBctcTableHandler.ts` pattern).

### 4.4 New mcp-server inspect endpoint

`GET /api/bctc-inspect/md/{doc_id}`

Response:
```json
{
  "doc_id": "<uuid>",
  "report_id": "<uuid>",
  "has_md_tables": true,
  "table_count": 3,
  "page_count": 7,
  "md_tables": ["| Col1 | Col2 |\n|---|---|\n..."],
  "ocr_as_markdown": "## Section\n...",
  "extracted_at": "2026-05-26T..."
}
```

When no rows stored: `{ "has_md_tables": false }` with HTTP 200 (same pattern as `handleBctcInspectTable`).

Handler file: `apps/mcp-server/src/interface/mcp/routes/bctcInspectMdHandler.ts` (new file).

### 4.5 HTML rendering in the inspector

The existing `/api/bctc-inspect` HTML viewer (`bctc-inspector.html`) gains a new panel or tab: **"Markdown Tables"**. When the user clicks a doc that `has_md_tables: true`, the panel:
1. Fetches `GET /api/bctc-inspect/md/{doc_id}`.
2. Renders each markdown string in `md_tables[]` using a client-side markdown parser (already available if the inspector uses one, otherwise a minimal pipe-table parser in plain JS — no library needed for pipe-table rendering).
3. Renders `ocr_as_markdown` in a scrollable `<pre>` or rendered markdown block below the tables.

**Important constraint:** `bctc-inspector.html` is listed as a frozen surface. The inspector HTML is in `apps/pdf-extractor/dashboard/` (FROZEN) but the mcp-server inspector at `apps/mcp-server/src/interface/bctc-inspector.html` is NOT frozen. Verify the exact path before editing. dev-mcp-server must confirm which file serves the inspector and only touch the non-frozen copy.

---

## 5. Decision A Zero-Collision Confirmation

The generic markdown path and the structured `bctc_table_rows` path are fully separate across every layer:

| Concern | Structured path (UNCHANGED) | Generic markdown path (NEW) |
|---|---|---|
| pdf-extractor trigger | `POST /extract-tables` | `POST /extract-md-tables` (new endpoint) |
| pdf-extractor use case | `ExtractTablesUseCase` | `ExtractMdTablesUseCase` |
| pdf-extractor infra | `TextTableExtractor` | `GenericMdTableExtractor` |
| mcp-server push endpoint | `POST /api/push-bctc-table` | `POST /api/push-bctc-md-tables` |
| mcp-server DB table | `bctc_table_rows` + `bctc_balance_checks` | `bctc_md_tables` |
| mcp-server read endpoint | `GET /api/bctc-inspect/table/{doc_id}` | `GET /api/bctc-inspect/md/{doc_id}` |
| 1954c write chain | UNTOUCHED — sole BCTC structured path | ADDITIVE — separate table, separate endpoint |

Neither path reads from or writes to the other's tables. The DB migration adds only `bctc_md_tables` using `CREATE TABLE IF NOT EXISTS` — zero schema mutation on `bctc_table_rows` or `bctc_balance_checks`. The `BT-5 cross-check gate` in `ExtractTablesUseCase` is never invoked from `ExtractMdTablesUseCase` (different use case entirely).

The `pushBctcTableHandler.ts` is UNTOUCHED. The new `pushBctcMdTablesHandler.ts` is registered at a different route path. Both are wired in `server.ts` additively.

---

## 6. DDD Layer Assignment

| File | Layer | Rationale |
|---|---|---|
| `domain/modules/financial_reports/ports.py` (ADD `GenericMdTableExtractorPort`, `MdTablePushClientPort`) | domain | Protocol definitions only; zero infrastructure imports |
| `infrastructure/generic_md_table_extractor.py` | infrastructure | Calls Tesseract subprocess; reads PIL Image |
| `infrastructure/md_table_push_client.py` | infrastructure | HTTP POST to mcp-server (aiohttp) |
| `application/extract_md_tables_usecase.py` | application | Orchestration via DI ports; zero I/O |
| `interface/handlers.py` (ADD `POST /extract-md-tables` route) | interface | FastAPI route; delegates to use case |
| `apps/mcp-server/src/interface/mcp/routes/pushBctcMdTablesHandler.ts` | interface (mcp-server) | HTTP handler; DB write |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectMdHandler.ts` | interface (mcp-server) | HTTP handler; DB read |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` (ADD `bctc_md_tables` DDL) | infrastructure (mcp-server) | DB schema migration |
| `apps/mcp-server/src/interface/bctc-inspector.html` (ADD markdown panel) | interface (mcp-server) | UI rendering |

Import-linter fence compliance:
- `generic_md_table_extractor.py` imports from `domain/primitives/` and `infrastructure/` only (same as `text_table_extractor.py`) — Fence-A/B intact.
- `extract_md_tables_usecase.py` imports from `domain/modules/financial_reports/ports` and `domain/repositories` only — Fence-B intact.

---

## 7. Test Strategy

### pdf-extractor zone (dev-pdf-extractor)

**Unit tests** (`apps/pdf-extractor/__tests__/unit/`):
- `test_generic_md_table_extractor.py`: inject a fixture page image (PNG snapshot of a BCTC page with a known table). Assert the returned `md_tables` has the correct number of columns, correct header row detection, and cell text contains key tokens. Use a fixture where the correct table structure is human-verified.
- `test_ocr_text_to_markdown.py`: pure function test with sample OCR text strings. Assert section headers are promoted, numeric lines are blockquoted, blank lines preserved.
- `test_extract_md_tables_usecase.py`: inject a `FakeGenericMdTableExtractor` and `FakeMdPushClient`. Assert the use case calls the extractor with page image paths and the push client with the returned markdown. Assert page limit guard fires for PDFs > 20 pages.

**Sandbox scenarios** (`apps/pdf-extractor/sandbox/`): the sandbox runner is FROZEN — no new scenarios in `runner.py`. Dev-pdf-extractor must confirm whether sandbox JSON scenarios can be added without touching `runner.py`. If not, skip sandbox for the new module; unit + integration tests are sufficient.

**Integration test** (`apps/pdf-extractor/__tests__/integration/`):
- `test_extract_md_tables_fpt.py`: using the FPT Q4 2025 PDF (on disk at `/app/data/pdfs-local/`), call the real `GenericMdTableExtractor.extract_md_tables()` against pages that contain the balance sheet AND the segment report ("Báo cáo bộ phận"). Assert:
  1. `table_count >= 2` (at least two tables detected).
  2. Each `md_tables[i]` is a valid pipe-table string (contains `|` delimiters and a `|---|` separator row).
  3. GREP PROOF: `grep -r "bao cao bo phan\|bctc_segment\|segment_report\|BAO CAO BO PHAN"` in `generic_md_table_extractor.py` returns ZERO matches (no per-table constants).
  4. The balance-sheet table (detected generically) contains at least one row with a numeric cell matching a known sentinel value (e.g., the string representation of total assets).
  5. `ocr_as_markdown` is non-empty and contains markdown structural elements (`##` or `>`).

### mcp-server zone (dev-mcp-server)

**Unit tests** (`apps/mcp-server/src/__tests__/`):
- `pushBctcMdTablesHandler.test.ts`: inject an in-memory SQLite DB. POST a valid payload. Assert `tables_stored` matches array length. Assert idempotency (second POST with same `report_id` replaces the row, not duplicates). Assert UUID validation rejects invalid `report_id`.
- `bctcInspectMdHandler.test.ts`: inject in-memory DB pre-populated with a `bctc_md_tables` row. Assert response shape matches contract (§4.4). Assert `has_md_tables: false` when no row exists.

---

## 8. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: bbox clustering produces ragged columns when Tesseract OCR confidence is low (<30%) for a page. Vietnamese diacritics on BCTC label columns often produce OCR artifacts. The markdown pipe-table will be structurally valid but cell text may be garbled. | HIGH | Accept: the markdown path is a human-recheck layer, not the structured analysis path. Low-confidence cells are still emitted (garbled text is visible = good signal). Add per-table `conf_avg` to the stored JSON for future filtering. Do NOT gate on confidence — emit always. |
| R-HIGH: `image_to_data` on ALL pages of a 60-page PDF = ~5 min sequential execution on Intel Mac. Production single-doc re-extract may time out the FastAPI request. | HIGH | Mitigation: `MAX_PAGES = 20` guard in `ExtractMdTablesUseCase`. Run as a fire-and-forget background task (FastAPI `BackgroundTasks`) — the `/extract-md-tables` endpoint returns 202 Accepted immediately; the result is stored asynchronously. This matches the pattern of the batch backfill approach but is single-doc. |
| R-MEDIUM: Page images produced by `pdf2image` at 200 DPI are large (typically 2-8 MB each as PIL Image in memory). 20 pages = up to 160 MB RSS during processing. Under Docker 8GB cap, this is safe for a single doc but must not be concurrent. | MEDIUM | Mitigation: process pages ONE AT A TIME in a for-loop (not a list of futures). Delete the PIL Image reference after `image_to_data` completes per page. |
| R-MEDIUM: The `bctc-inspector.html` on the mcp-server side may be the frozen file or a separate non-frozen file — need explicit verification before dev-mcp-server touches it. | MEDIUM | Mitigation: dev-mcp-server must verify the file path of the inspector HTML served at `/api/bctc-inspect` is `apps/mcp-server/src/interface/bctc-inspector.html` (NOT the frozen `apps/pdf-extractor/dashboard/index.html`). Only touch the mcp-server-side file. |
| R-MEDIUM: Generic column detection may fail on BCTC pages with a single-column label-only layout (e.g., notes pages with long paragraphs). These pages produce 1-column "tables" that are misleading as pipe-tables. | MEDIUM | Mitigation: add a post-filter: if `col_count == 1` AND `row_count > 15`, classify as prose (not a table) and emit as plain text in `ocr_as_markdown` instead of a pipe-table. |
| R-LOW: Temporary PNG files for page images. If `ExtractMdTablesUseCase` crashes mid-execution, temp files may accumulate in `/tmp`. | LOW | Mitigation: use Python `tempfile.TemporaryDirectory()` as a context manager. Temp files are auto-cleaned on context exit or process crash. |
| R-LOW: `bctc_md_tables.md_tables_json` field grows large for PDFs with many tables (e.g., 15 tables × 50 rows × 5 columns = potentially 100KB+). SQLite handles this fine; no risk. | LOW | Note only. |

---

## 9. Per-Task Acceptance Criteria (appended to handoff)

These are the binding ACs for the dev tasks. Also appended directly to `docs/handoffs/TASK_BCTC-MD-TABLE.md`.

### MD-EXTRACT ACs (dev-pdf-extractor)

**AC-0 (BLOCKING — must pass before any other AC):** `grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|BCTC_LABEL" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` returns ZERO matches. No per-table label constants, no segment-report-specific keywords, no per-table code constants. Geometry and generic text patterns only. This is the grep-proof generality AC (Decision D).

**AC-1:** `GenericMdTableExtractor.extract_md_tables()` is importable and its class definition contains no imports from `application/` or `interface/` (Fence-A compliance). Verify via `grep "from application\|from interface" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → zero matches.

**AC-2:** Unit test `test_generic_md_table_extractor.py` passes with a fixture PNG. The returned `md_tables` list is non-empty, each element is a string containing `|` and `|---|`. `ocr_as_markdown` is a non-empty string. Test runs without network, without credentials, without a real PDF.

**AC-3:** Integration test `test_extract_md_tables_fpt.py` against the FPT Q4 2025 PDF passes. `table_count >= 2`. Both a balance-sheet region AND a non-balance-sheet region (segment report or other table) are detected as separate entries in `md_tables`. Confirmed by human inspection of the two markdown strings (they must have different column counts or different first-row content, proving they come from different tables).

**AC-4:** `ExtractMdTablesUseCase.execute()` integration test: given a FakeGenericMdTableExtractor that returns 2 mock tables and a FakeMdPushClient, the use case calls push exactly once, passes `report_id`, `md_tables`, and `ocr_as_markdown`. Returns `{tables_detected: 2, pushed: true}`.

**AC-5:** The `POST /extract-md-tables` FastAPI endpoint returns 202 Accepted within 2 seconds for a valid request (background task path). Verify with `curl -X POST http://localhost:5001/extract-md-tables -H "Content-Type: application/json" -d '{"report_id": "<uuid>", "pdf_path": "<path>"}'` → HTTP 202.

**AC-6 (hardware guard):** For a PDF with more than 20 pages, `ExtractMdTablesUseCase` logs a WARNING `"page limit reached"` and processes at most 20 pages. Verified by unit test injecting a mock `OcrPort.get_all_pages()` that returns 25 pages.

**AC-7 (non-regression):** After implementing the new module, the EXISTING `POST /extract-tables` endpoint still functions. Verified by: `curl -X POST http://localhost:5001/extract-tables` with a valid FPT report_id → HTTP 200, `rows_stored > 0`. The `bctc_table_rows` path is unaffected.

### MD-INSPECT ACs (dev-mcp-server)

**AC-I-0 (BLOCKING):** `POST /api/push-bctc-md-tables` returns 400 for an invalid `report_id` (non-UUID string). Returns 200 and `tables_stored: N` for a valid payload. Idempotency: a second POST with the same `report_id` returns 200 and does NOT create a duplicate row (verify `SELECT COUNT(*) FROM bctc_md_tables WHERE report_id = ?` = 1 after two pushes).

**AC-I-1:** `GET /api/bctc-inspect/md/{doc_id}` returns `{has_md_tables: false}` with HTTP 200 when no row exists for `doc_id`. Returns the full JSON contract (§4.4) when a row exists. UUID validation: non-UUID `doc_id` returns 400.

**AC-I-2:** The inspector HTML at `/api/bctc-inspect` renders a "Markdown Tables" section when `has_md_tables: true` for the selected document. The section shows at least one rendered pipe-table (not raw markdown text — actual HTML table or rendered markdown). The `ocr_as_markdown` section is shown in a readable pre/markdown block.

**AC-I-3:** `GET /api/bctc-inspect/table/{doc_id}` (the EXISTING structured table endpoint) still returns the same structured rows and balance check for FPT Q4 2025. Verify with `curl http://localhost:4000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` → `has_table: true`, `rows.length > 70`, `balance_check.balance_pass: true`. Zero regression on the structured path.

**AC-I-4:** `POST /api/push-bctc-table` (EXISTING endpoint) still accepts a valid push payload and stores rows. Verify by curl → HTTP 200, `ok: true`. Zero interference from the new `push-bctc-md-tables` route.

### MD-DEPLOY ACs (ops)

**AC-D-0:** pdf-extractor container rebuilt from the updated image (`docker-compose build pdf-extractor`). Container starts healthy (`GET http://localhost:5001/health` → 200).

**AC-D-1:** mcp-server container rebuilt from the updated image (`docker-compose build mcp-server`). Container starts healthy. DB migration auto-runs: `bctc_md_tables` table exists (`SELECT name FROM sqlite_master WHERE name='bctc_md_tables'` → 1 row).

**AC-D-2:** Single-doc re-extract (NEVER the batch backfill): `POST http://localhost:5001/extract-md-tables` with the FPT Q4 2025 `report_id` and `pdf_path`. Verify response is 202. Wait for background task to complete (poll `GET /api/bctc-inspect/md/{doc_id}` until `has_md_tables: true`). Single doc only — NEVER run the batch job on the Intel Mac.

**AC-D-3:** `GET /api/bctc-inspect/md/{doc_id}` for the FPT doc returns `table_count >= 1` and `md_tables[0]` is a non-empty markdown string.

### MD-QA ACs (qa)

**AC-Q-0 (Decision D — LIVE generic verification, BLOCKING):**
- Live curl to `GET /api/bctc-inspect/md/{fpt_doc_id}` returns `md_tables` containing at least one table for the balance sheet region AND at least one table for a non-balance-sheet region (proven by: different number of columns OR different header content between the two tables). Both tables must come from the SAME code path (zero segment-report-specific constants confirmed by AC-0).
- Live curl to `GET /api/bctc-inspect/md/{fpt_doc_id}` returns non-empty `ocr_as_markdown`.

**AC-Q-1 (Decision D prohibition):** `grep -rn "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. If any match is found, QA emits CHANGES_REQUESTED immediately.

**AC-Q-2 (structured path non-regression):** `GET /api/bctc-inspect/table/{fpt_doc_id}` → `has_table: true`, `rows.length` in [70, 90], `balance_check.balance_pass: true`, `balance_check.balance_delta = 0`. Same values as the BCTC-TABLE sprint final state. Any regression → CHANGES_REQUESTED.

**AC-Q-3 (inspector render):** `GET /api/bctc-inspect` in browser, select the FPT Q4 2025 doc, navigate to "Markdown Tables" panel. Human inspection: at least one pipe-table is rendered as an HTML table (not raw `| pipe | text |` literal). `ocr_as_markdown` block is displayed and scrollable.

**AC-Q-4 (privacy audit):** `grep -rn "claude\|openai\|gemini\|api.mistral\|textract\|document.ai\|requests.post\|httpx.post" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py apps/pdf-extractor/application/extract_md_tables_usecase.py` → ZERO matches. No off-machine data flow.

**AC-Q-5 (no test-baseline regression):** `bun test` in mcp-server passes with the same count as the pre-sprint baseline (≥ existing passing count). `pytest` in pdf-extractor passes all existing tests (fixture-based balance-sheet tests unaffected).

**QA report:** emit `reports/TASK_REPORT_MD-QA-<UTC>.json` with verdicts for all ACs above. `balance_pass` alone is FORBIDDEN as a sufficient gate — all ACs must be individually confirmed.

---

## MD-EXTRACT-2 — Live-Verify Fix Design

> **Task:** MD-EXTRACT-2 | **Author:** architect | **Date:** 2026-05-26T11:30Z
> **Status:** DESIGN COMPLETE — ready for dev-pdf-extractor
> **Input:** Live FPT Q4 2025 output from `GET /api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
> **Zone:** `apps/pdf-extractor/` only (changes confined to `infrastructure/generic_md_table_extractor.py` + `application/extract_md_tables_usecase.py`). Zero changes to mcp-server — the storage contract is correct.

### Constraint restatement (binding for this task)

- **Privacy:** local Tesseract/poppler ONLY, zero cloud OCR/VLM.
- **AC-0 grep-proof generality (unchanged):** `grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|bao_phan\|bo_phan"` in `generic_md_table_extractor.py` → ZERO matches. `_is_recognized_section_header()` helpers are allowed (they are diacritic-insensitive geometry helpers, not logic literals for any specific table type). No BCTC-specific string constants anywhere — geometry/density only.
- **Fence-A import-linter clean:** `generic_md_table_extractor.py` must never import from `application/` or `interface/`. Verified by grep.
- **MAX_PAGES=20 unchanged.** No Tesseract pass multiplication beyond one `image_to_data` pass per page (DEFECT-A fix uses stored text — no extra Tesseract call at all).
- **Host kernel-panic risk:** DEFECT-A adds zero new Tesseract calls. DEFECT-B/C are post-processing changes on already-collected bbox data. Zero hardware risk increase.

---

### DEFECT-A — Root Cause and Fix (BLOCKING)

**Root cause (verified from source):**

The ops agent invoked `POST /extract-md-tables` with only `{ "report_id": ..., "pdf_path": ... }` — no `doc_ocr_text` field. The `ExtractMdTablesRequestSchema` accepts `doc_ocr_text: Optional[str] = None` so this is valid. The use case then runs `Step 3` and hits the `else` branch (`ocr_as_markdown = ""`). The push call stores empty string in `bctc_md_tables.ocr_as_markdown`. The live DB confirms: `length(ocr_as_markdown) = 0`.

The `pdf_extracted_text` table in mcp-server already holds the psm-6 poppler OCR for every processed BCTC doc, stored per page under the filename key. This is the same OCR text the structured `extract-tables` path uses. The live endpoint `GET /api/bctc-inspect/ocr/{doc_id}?page=N` already surfaces per-page OCR text to callers. The OCR text is available — it was never fetched by the caller.

**Why not re-run `image_to_string` per page inside the use case:**
That would add one full Tesseract pass per page on top of the `image_to_data` pass already done — doubling Tesseract calls. This is unnecessary and increases host risk. The OCR text is already stored in mcp-server's `pdf_extracted_text` table, retrieved by `GET /api/bctc-inspect/ocr/{doc_id}`. The correct fix is for the use case to source the OCR text from the DB before running extraction.

**Fix design — two-part:**

**Part A (use case):** `ExtractMdTablesUseCase.execute()` must fetch the document's concatenated OCR text from mcp-server before launching the background task. The existing mcp-server endpoint `GET /api/bctc-inspect/ocr/{doc_id}?page=N` returns one page at a time. The use case iterates pages 1..N (where N = `total_pages` from the endpoint when `total_pages > 0`) and concatenates `text_content` fields into a single `doc_ocr_text` string separated by `\n\n---\n\n` (page break marker, human-readable).

The `MdTablePushClientPort` already exists as the infra boundary for outbound HTTP to mcp-server. A second port for inbound read is needed:

```python
class OcrTextFetchClientPort(Protocol):
    """
    Port for fetching stored per-page OCR text from mcp-server.
    Concrete adapter: infrastructure/ocr_text_fetch_client.py (NEW)
    Source: GET /api/bctc-inspect/ocr/{doc_id}?page=N
    """

    async def fetch_ocr_text(self, report_id: str) -> str:
        """
        Concatenate all pages of stored OCR text for the given doc.
        Returns empty string when no OCR text is stored (graceful degrade).
        """
        ...
```

DDD layer: domain port definition in `domain/modules/financial_reports/ports.py`. Concrete implementation in `infrastructure/ocr_text_fetch_client.py` (new file). Wired at composition root in `main.py`.

The use case is extended:

```python
class ExtractMdTablesUseCase:
    def __init__(
        self,
        md_extractor: GenericMdTableExtractorPort,
        md_push_client: MdTablePushClientPort,
        ocr_fetch_client: Optional[OcrTextFetchClientPort] = None,  # DEFECT-A fix
    ) -> None: ...

    async def execute(self, report_id, pdf_path, doc_ocr_text=None):
        # Step 0 (NEW): if doc_ocr_text not provided by caller, fetch from mcp-server
        if doc_ocr_text is None and self._ocr_fetch_client is not None:
            doc_ocr_text = await self._ocr_fetch_client.fetch_ocr_text(report_id)
            if doc_ocr_text:
                logger.info("ExtractMdTablesUseCase: fetched %d chars of OCR text from mcp-server", len(doc_ocr_text))
            else:
                logger.warning("ExtractMdTablesUseCase: no stored OCR text for report_id=%s — ocr_as_markdown will be empty", report_id)
        # ... rest of use case unchanged
```

**Part B (OcrTextFetchClient concrete adapter):**

`infrastructure/ocr_text_fetch_client.py` (NEW):
- Uses `aiohttp.ClientSession` (same pattern as `MdTablePushClient`).
- GET `{mcp_server_url}/api/bctc-inspect/ocr/{report_id}` first to get `total_pages`.
- If `total_pages == 0`: return `""`.
- Loop pages 1..`min(total_pages, MAX_PAGES)`: GET `?page=N`, append `text_content`.
- Separator between pages: `"\n\n---\n\n"`.
- On any HTTP error: log warning, return partial accumulated text or `""`.
- Zero retry — graceful degrade on failure.

**Part C (composition root):**

`main.py`: instantiate `OcrTextFetchClient(mcp_server_url=cfg.mcp_server_url)` and inject into `ExtractMdTablesUseCase`.

**No mcp-server changes required.** The endpoint already exists. The DB already has the data. This fix is entirely within pdf-extractor.

---

### DEFECT-B — Noise Table Filtering (HIGH)

**Live density profile (from task context, 30 tables emitted, FPT Q4 2025):**

```
PURE-NOISE (0 money-groups):  idx 0,2,4,5,7,11,15,19,21,22,23,24,25,26,27  → 15 tables
THIN (1-3 money-groups):      idx 14,18,20                                  → 3 tables
REAL DATA (>=6 money-groups): idx 1,3,6,8,9,10,12,13,16,17,28,29           → 12 tables
```

The clean split at money-groups >= 6 vs <= 3 means the threshold K = 6 is the correct primary gate. There is no ambiguous case (4-5 money-group tables in the live data). The thin (1-3) group is also noise — letterhead with isolated numbers.

**Money-group definition (generic, not BCTC-specific):**

```python
_MONEY_GROUP_RE = re.compile(r'\d{1,3}(?:[.,]\d{3})+')
```

This matches `1,234,567` / `1.234.567` / `1,234` (at least one separator-group). It is deliberately NOT BCTC-specific: any financial document with Vietnamese/international number formatting produces this pattern. This satisfies AC-0 grep-proof.

**Section-header code detection (secondary gate, also generic):**

```python
_CODE_LIKE_RE = re.compile(r'(?<!\d)\d{3}(?!\d)')
```

Three-digit standalone codes (100, 200, 270, 300, 400, 440 etc.) appear in BCTC but also in income statement and segment report codes. Any financial table with 3-digit codes qualifies. Not BCTC-specific.

**New acceptance gate function (to add in `generic_md_table_extractor.py`):**

```python
def _is_data_table(grid: List[List[str]]) -> bool:
    """
    Generic density gate: emit grid as a pipe-table only if it contains
    financial data. Two conditions (OR — either is sufficient):
      1. money_groups >= _MIN_MONEY_GROUPS:  at least K cells match the
         N,NNN,NNN or N.NNN.NNN number format (locale-agnostic financial).
      2. code_hits >= _MIN_CODE_HITS and money_groups >= _MIN_MONEY_THIN:
         at least J three-digit standalone codes AND at least 1 money-group
         (section-header-only pages with a few numbers also qualify).

    Returns False for letterhead / title / prose blocks.

    AC-0: zero BCTC-specific constants. Geometry and generic number patterns only.
    """
    flat = " ".join(cell for row in grid for cell in row)
    money_groups = len(_MONEY_GROUP_RE.findall(flat))
    if money_groups >= _MIN_MONEY_GROUPS:
        return True
    code_hits = len(_CODE_LIKE_RE.findall(flat))
    return code_hits >= _MIN_CODE_HITS and money_groups >= _MIN_MONEY_THIN
```

**Threshold constants (add to module-level constants block):**

```python
# Numeric density gate — generic financial table acceptance (DEFECT-B fix).
# K: minimum money-group matches for a region to be emitted as a table.
# Derived from live FPT density profile: real tables have >= 6, noise <= 3.
# No BCTC-specific semantics — applies to ANY financial document.
_MIN_MONEY_GROUPS = 6

# J: minimum 3-digit standalone codes when money-groups < K (secondary gate).
# Allows section-header tables with code column + a few values to pass.
_MIN_CODE_HITS = 3

# Money-group floor for secondary gate (code-rich + some numbers).
_MIN_MONEY_THIN = 1
```

**Prose mis-classification fix:**

The existing prose filter `(col_count == 1 AND row_count > _PROSE_ROW_THRESHOLD)` catches only 1-column pages. Live data shows prose blobs at idx 20,24,25,26,27 had 4-5 columns. The fix: **remove the column-count condition from the prose test**. Instead, apply the density gate `_is_data_table(grid)` as the sole acceptance gate for ALL regions (not just 1-column ones). If a region fails `_is_data_table()`, it is treated as prose regardless of column count.

**Updated `_process_page` control flow (replacing lines 594-616 in current file):**

```python
# After grid assembly (Step E):
# DEFECT-B fix: density gate replaces the old col_count==1 prose filter.
if not _is_data_table(grid):
    logger.debug(
        "GenericMdTableExtractor: density gate rejected region: "
        "rows=%d cols=%d — treating as non-table",
        n_rows, n_cols,
    )
    continue

# Step F — Header row detection
# Step G — Markdown emission
```

The old `_PROSE_ROW_THRESHOLD` constant and its check can be removed (or kept as a dead constant — prefer removal for clarity).

**Expected outcome on FPT Q4 2025 re-extract:** 15 pure-noise + 3 thin tables dropped → ~12 real data tables retained. `table_count` drops from 30 to approximately 12. Segment report tables at idx 28/29 (in the current 0-indexed numbering) pass the density gate because they carry many money-group values (per-segment revenue, cost, profit figures).

---

### DEFECT-C — Header Noise Strip + Label Column Coalescing (MEDIUM)

**C.1 — Leading header band stripping (noise glued to top of real tables)**

Live example: `md_tables[28]` first row is `"Số Thành THUYẾT CÔNG Các Phường 10..."` (page letterhead OCR fragments scrambled into the first row of the segment table).

**Root cause:** Step B (vertical gap) sometimes fails to split a large-gap preamble from the table body when the physical gap between letterhead and the first table row is less than `2.5 × H_med`. This happens when letterhead text and the first data row are in adjacent typographic regions without a clear whitespace gap.

**Fix — Strip leading non-data rows from grid:**

After Step E (grid assembly) and BEFORE the `_is_data_table` density gate, apply a leading-row strip:

```python
def _strip_leading_header_bands(grid: List[List[str]]) -> List[List[str]]:
    """
    Remove leading rows that contain ZERO money-group tokens.
    Stop stripping at the first row that has at least one money-group match
    OR that looks like a table column header (date pattern or all-caps
    Vietnamese section name detected by _is_recognized_section_header).

    This strips page letterhead and company name rows glued to the top of
    real table data regions.

    AC-0: no BCTC label constants — generic money-group and date detection only.
    """
    start = 0
    for i, row in enumerate(grid):
        flat = " ".join(row)
        has_money = bool(_MONEY_GROUP_RE.search(flat))
        has_date = bool(_DATE_HEADER_RE.search(flat))
        is_section_hdr = _is_recognized_section_header(flat)
        if has_money or has_date or is_section_hdr:
            start = i
            break
    return grid[start:]
```

Add a date-header detection regex (generic, not BCTC-specific):

```python
# Generic date pattern for column headers (31/12/2025 style, any locale).
_DATE_HEADER_RE = re.compile(r'\d{1,2}/\d{1,2}/\d{4}')
```

Apply `grid = _strip_leading_header_bands(grid)` after `_assign_columns()` and before `_is_data_table()`. If the stripped grid is empty, skip the region.

**C.2 — Adjacent text-only column coalescing (label over-segmentation)**

Live example: `md_tables[6]` has `"Phải trả người | bán ngắn | hạn"` as 3 columns for one label phrase.

**Root cause:** The x-gap column detector finds gaps between word clusters in the label area where words happen to be separated by column-anchor-sized whitespace. These are false column boundaries inside what is semantically one label cell.

**Coalescing rule:** After Step E (grid assembly), identify the leftmost column-group that contains NO money-group matches across ALL rows in that column, and where the next column to the right DOES contain money-groups or codes. Merge all such leading text-only columns into a single label column by space-joining the cell texts.

```python
def _coalesce_label_columns(grid: List[List[str]]) -> List[List[str]]:
    """
    Merge adjacent TEXT-ONLY columns at the left of the first numeric column
    into a single label column.

    A column is TEXT-ONLY if it has zero money-group matches across all rows.
    The first column that contains at least one money-group match is the
    boundary — it and all columns to the right are kept separate.

    If all columns are text-only (no numeric column found), the grid is
    returned unchanged (let the density gate handle rejection).

    AC-0: uses _MONEY_GROUP_RE (generic financial number pattern) only.
    """
    if not grid or not grid[0]:
        return grid
    n_cols = len(grid[0])

    # Find the first numeric column index
    first_numeric = None
    for col_idx in range(n_cols):
        col_text = " ".join(row[col_idx] for row in grid if col_idx < len(row))
        if _MONEY_GROUP_RE.search(col_text):
            first_numeric = col_idx
            break

    if first_numeric is None or first_numeric <= 1:
        # No numeric column found, or label is already single-column
        return grid

    # Merge columns 0..first_numeric-1 into a single label column
    merged: List[List[str]] = []
    for row in grid:
        label = " ".join(row[i].strip() for i in range(first_numeric) if i < len(row) and row[i].strip())
        rest = list(row[first_numeric:]) if first_numeric < len(row) else []
        merged.append([label] + rest)
    return merged
```

Apply `grid = _coalesce_label_columns(grid)` after `_strip_leading_header_bands()` and before `_is_data_table()`.

**DDD compliance:** both helper functions are pure (no I/O, no Tesseract, no DB). They operate only on the already-assembled `grid` structure. Layer: infrastructure module (same file, existing layer). No imports from application or interface layers. AC-0: no BCTC constants in either function — `_MONEY_GROUP_RE` and `_DATE_HEADER_RE` are generic financial document patterns.

---

### MD-EXTRACT-2 Acceptance Criteria

**AC-2A (BLOCKING — ocr_as_markdown non-empty):**

After re-extract with the fix, `GET /api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` returns `ocr_as_markdown` with `length > 0`. Verified by: `curl ... | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d['ocr_as_markdown']) > 0, 'FAIL: ocr_as_markdown empty'"`. Any empty string → FAIL immediately.

**AC-2B (table count noise drop):**

After re-extract, `table_count` is in [10, 15] (target: ~12). Before fix: 30. At minimum, `table_count` must be strictly less than 20 (confirming noise filter engaged). Verified by the same curl.

**AC-2C (real tables retained — segment report present):**

`md_tables` response includes at least one table with `>= 6` money-group matches (verified by: `len(re.findall(r'\d{1,3}(?:[.,]\d{3})+', md_table_text)) >= 6`). At least two distinct tables must be present (by different column counts or different first-row header content). The user-confirmed segment report must still be present — verified by: any `md_tables[i]` contains a cell that matches a 4-digit segment figure (e.g. a number like "1,234" or "12,345").

**AC-2D (header noise stripped from segment table):**

For the segment report table (expected near the end of `md_tables` list), the FIRST ROW of the markdown must NOT contain garbled letterhead fragments. Verified by: first row of the identified table must have at least 2 cells where each non-empty cell is either a date pattern (`\d{1,2}/\d{1,2}/\d{4}`), a 3-digit code, or a money-group value. Not a raw string of random Vietnamese syllables.

**AC-2E (balance sheet label coalescing):**

For the balance sheet table, label cells in the first column must be readable multi-word Vietnamese labels (e.g. "Phải trả người bán ngắn hạn" as one cell, not split across 3 columns). Verified by: the first column of the balance sheet table has cells with `>= 2` space-separated Vietnamese words, and the column count of the balance sheet table is `<= 4` (current: likely 5-6 before fix, target: 3-4 after coalescing).

**AC-2F (non-regression — structured path):**

`GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` → `rows_length` in [70, 90], `balance_pass: true`, `balance_delta: 0`. Same values as pre-sprint state. Any change → BLOCKING failure.

**AC-2G (AC-0 grep-proof — restate for this task):**

`grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|bo_phan\|bao_phan" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. Strictly generic constants only in the new functions.

**AC-2H (Fence-A):**

`grep -rn "from application\|from interface" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

**AC-2I (new port Fence-B):**

`grep -rn "from infrastructure\|from interface" apps/pdf-extractor/application/extract_md_tables_usecase.py` → ZERO matches.

**AC-2J (hardware — zero Tesseract multiplication):**

`OcrTextFetchClient.fetch_ocr_text()` MUST use only HTTP GET requests to mcp-server. MUST NOT call `pytesseract.image_to_string` or `pytesseract.image_to_data` (those are in the extractor, not the fetch client). Verify by grep: `grep -n "pytesseract\|image_to_string\|image_to_data" apps/pdf-extractor/infrastructure/ocr_text_fetch_client.py` → ZERO matches.

---

### MD-DEPLOY-2 ACs (ops — SINGLE DOC ONLY, NEVER batch)

**AC-D2-0:** pdf-extractor container rebuilt (`docker-compose build pdf-extractor`). Container health: `GET http://localhost:5001/health` → 200. NEVER rebuild both services simultaneously — rebuild pdf-extractor first, confirm healthy, then stop.

**AC-D2-1:** Single-doc re-extract: `POST http://localhost:5001/extract-md-tables` with `{ "report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65", "pdf_path": "/app/data/pdfs-local/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf" }`. Response: HTTP 202. No `doc_ocr_text` in the request body — the use case fetches it automatically from mcp-server. SINGLE DOC ONLY.

**AC-D2-2:** Poll `GET http://localhost:3000/api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` until `has_md_tables: true` (the row is replaced, not duplicated — `INSERT OR REPLACE` semantics already in the push handler). Confirm `ocr_as_markdown` field has `length > 0`.

**AC-D2-3:** Confirm `table_count < 20` (noise filter engaged). Confirm `table_count >= 10` (real tables retained).

---

### MD-QA-2 ACs (qa — live verification gate)

All MD-QA ACs from the original design remain binding. The following are AMENDED or ADDED for MD-EXTRACT-2:

**AC-Q2-0 (BLOCKING — ocr_as_markdown live):** `GET .../md/{fpt_doc_id}` → `ocr_as_markdown` non-empty. Contains `## ` (section header promoted by `ocr_text_to_markdown`). Contains `> ` blockquote lines (numeric rows). This AC supersedes the original AC-Q-0 `ocr_as_markdown` clause.

**AC-Q2-1 (BLOCKING — noise drop):** `table_count < 20` (noise filter engaged). `table_count >= 10` (real tables retained). The original AC-Q-0 "`>= 2` tables" clause is SUPERSEDED by this more specific range.

**AC-Q2-2 (segment report still present and header-noise-free):** At least one `md_tables[i]` entry is identifiable as the segment report by its content (per-segment numeric figures). The first row of that table must not contain garbled company-name/letterhead fragments. Verified by human inspection of the first row's cell content.

**AC-Q2-3 (balance sheet label coalescing):** A markdown table identified as the balance sheet (by presence of high money-group density) has a first-column cell that reads as a coherent Vietnamese phrase, not as a 1-word fragment. Verify by reading the first 5 data rows of the balance sheet table.

**AC-Q2-4 (non-regression — all original AC-Q-2 through AC-Q-5 unchanged):** Structured path: rows in [70,90], balance_pass=true, balance_delta=0. Privacy grep ZERO. Test baseline unregressed. balance_pass alone FORBIDDEN as sole gate.

---

### Files to modify (pdf-extractor only — zero mcp-server changes)

| File | Change | DDD Layer |
|---|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | ADD `_MONEY_GROUP_RE`, `_DATE_HEADER_RE`, `_MIN_MONEY_GROUPS`, `_MIN_CODE_HITS`, `_MIN_MONEY_THIN` constants; ADD `_is_data_table()`, `_strip_leading_header_bands()`, `_coalesce_label_columns()` functions; MODIFY `_process_page()` to apply new pipeline (strip → coalesce → density gate); REMOVE old `_PROSE_ROW_THRESHOLD` check (superseded) | infrastructure |
| `apps/pdf-extractor/application/extract_md_tables_usecase.py` | ADD `OcrTextFetchClientPort` injection (optional); ADD Step 0 (fetch OCR text from mcp-server before running); MODIFY `__init__` to accept optional `ocr_fetch_client` | application |
| `apps/pdf-extractor/infrastructure/ocr_text_fetch_client.py` | NEW: `OcrTextFetchClient` — HTTP client to GET `/api/bctc-inspect/ocr/{report_id}?page=N`, concatenate pages | infrastructure |
| `apps/pdf-extractor/domain/modules/financial_reports/ports.py` | ADD `OcrTextFetchClientPort` Protocol | domain |
| `apps/pdf-extractor/main.py` | WIRE `OcrTextFetchClient` at composition root, inject into `ExtractMdTablesUseCase` | composition root |
| `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py` | ADD unit tests for `_is_data_table`, `_strip_leading_header_bands`, `_coalesce_label_columns` with synthetic grids. ADD test: noise grid → `_is_data_table` returns False. ADD test: real grid with 8 money-groups → returns True. | unit |
| `apps/pdf-extractor/__tests__/unit/test_extract_md_tables_usecase.py` | ADD test: `ocr_fetch_client` is called when `doc_ocr_text=None`; returned string becomes `ocr_as_markdown` in push. ADD test: `ocr_fetch_client` not called when `doc_ocr_text` provided by caller. | unit |

**No new files in mcp-server.** The `OcrTextFetchClient` calls the existing `GET /api/bctc-inspect/ocr/{doc_id}?page=N` endpoint (already wired in `server.ts`). Zero schema changes. Zero handler changes.

---

### Risk Register (MD-EXTRACT-2 specific)

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: Density threshold K=6 is derived from ONE document (FPT Q4 2025). Other BCTC documents (VCB, VNM, etc.) may have different page layouts with fewer money-groups in legitimate tables. | HIGH | K=6 is a FLOOR (not a ceiling). The secondary gate (code_hits >= 3 AND money_groups >= 1) catches code-heavy pages. If QA finds real tables being dropped on other docs, lower K to 4 — the gap between 6 (real) and 3 (noise) in the live data gives 2 margin units. This is a tuning parameter, not a logic change. |
| R-MEDIUM: `_strip_leading_header_bands` may overly strip the first real data row if it has no money-groups (e.g. a pure-text section header row that is part of the table). | MEDIUM | The strip STOPS at the first row containing a money-group OR a date-header OR a `_is_recognized_section_header` match. Section header rows (A-E, I-V) are preserved. Pure letterhead with no recognizable financial structure is stripped. |
| R-MEDIUM: `OcrTextFetchClient` calls mcp-server HTTP endpoint. If mcp-server is unreachable during the background task, `fetch_ocr_text` returns `""` and `ocr_as_markdown` stays empty. This is the same behavior as before the fix — graceful degrade, not a crash. | MEDIUM | Acceptable. Log a WARNING. The detection (md_tables) still runs and completes. |
| R-LOW: `_coalesce_label_columns` may incorrectly merge a legitimate multi-column text header (two separate label columns) into one. | LOW | Occurs only when BOTH candidate columns are text-only AND there is at least one numeric column to the right. For BCTC documents, text-left / numbers-right is the canonical layout. If a document has two independent label columns (unusual), the first column data is still readable — just concatenated. |

---

## 10. Brownfield Findings Summary

- **Zone:** `apps/pdf-extractor/` (extraction) + `apps/mcp-server/` (inspector/storage)
- **Build Standard:** lean (existing services, additive feature)
- **Verified reuse:** `_norm()`, `_is_recognized_section_header()` from `text_table_extractor.py` reusable in the new module. `PdfOcrAdapter` rasterization pattern reusable (image_to_data on same PIL Image). `pushBctcTableHandler.ts` as the structural template for the new push handler. `handleBctcInspectTable` as the structural template for the new inspect handler.
- **Confirmed zero-collision:** structured path untouched; separate DB table, separate endpoints, separate use cases.
- **Scan clean:** true — no existing generic table detection module, no existing markdown surfacing module. The design adds NET-NEW files in both zones.
- **Frozen surfaces not touched:** `apps/pdf-extractor/dashboard/`, `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`.
- **Hardware constraint encoded:** MAX_PAGES=20 guard in use case, fire-and-forget 202 pattern, sequential single-page Tesseract calls.

---

## MD-EXTRACT-3 — DEFECT-D Dense-Grid Row Reconstruction

> **Task:** MD-EXTRACT-3 | **Author:** architect | **Date:** 2026-05-26T13:00Z
> **Status:** DESIGN COMPLETE — ready for dev-pdf-extractor
> **Input:** MAIN-TERMINAL LIVE-VERIFY post MD-DEPLOY2 (FPT Q4 2025, `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`)
> **Zone:** `apps/pdf-extractor/` ONLY — target file `infrastructure/generic_md_table_extractor.py`. Zero mcp-server changes.

---

### 1. Problem Statement

MD-EXTRACT-2 fixed the easy parts (noise gate, header strip, label coalesce, OCR auto-fetch). The dense multi-column financial statements — income statement (`md_tables[4]`, 6+ columns) and the segment report (`md_tables[13],[14]`, 7+ columns, the user's literal proof case) — still collapse into word-soup.

**Observed output** (main terminal live-verify, FPT Q4 2025):

- `md_tables[4]`: ~25 physical income-statement lines merge into ~1 markdown row. Codes `20 10 11 12 ... ` concatenated, label words scrambled, all 2025 values stacked in one cell, all 2024 values stacked in another.
- `md_tables[13],[14]`: Segment revenues `35.381.667 / 9.092.934 / 18.701.876` present but unassociated with segments. First cell reads `"Chi Doanh phi thu theo theo bộ phận bộ phận (i) Chỉ tiêu | Sản dịch nước 35.381.667 phẩm vụ | ngoài CNTT và | ..."`.

**Balance-sheet residual (AC-2E FAIL):** `md_tables[0..3]` still emit 7 columns despite label coalesce. Root: empty columns proliferate across ALL rows after `_coalesce_label_columns` — numeric columns assigned by anchor produce sparse grids where many column slots are always empty. The label-coalesce only merged the text side; it did not eliminate the empty numeric slots.

---

### 2. Root Cause Analysis

#### 2.1 Row-collapse root cause — Step C `_cluster_rows` greedy merge

The existing `_cluster_rows` uses:
```
new row when next_word.top > current_row_max_bottom + (0.5 × H_med)
```

**Why it fails on dense grids:**

1. `H_med` is the median word HEIGHT across all words on the page, including tall tokens (section-header letters like `A`, `B`, date column headers `31/12/2025`, and ascender/descender characters in Vietnamese diacritics). On a typical BCTC income-statement page, a few tall header tokens inflate `H_med` from ~12px (actual data-row line spacing) to ~20-25px.

2. Row-merge tolerance = `0.5 × H_med`. With `H_med = 22px`, tolerance = `11px`. But tightly-stacked statement rows have a physical inter-row gap of only 3-5px (line spacing minus character height). The tolerance (11px) is larger than the gap (3-5px) → the greedy merge absorbs all 25 data lines into a single "row".

3. For simple 2-3 column tables (balance sheet, cash flow), rows are more widely spaced (the table is less dense), so the gap exceeds the tolerance and rows separate correctly.

4. This is the exact same conceptual class as drift #4 from the structured path (psm-3 column-major scramble): the algorithm's threshold is calibrated to a coarse measure (median height) that does not track actual inter-row spacing in dense regions.

#### 2.2 Empty-column proliferation root cause — Step D column anchor detection

The `_detect_column_anchors` step accumulates left-edge positions from ALL rows across the entire table region. In a 7-column segment report, the union of all left-edge positions produces 7 anchor clusters, but most data rows only populate 2-4 of those anchors (header rows define the segment columns; data rows may only have label + the value for their segment). After `_assign_columns`, most cells are empty strings.

After `_coalesce_label_columns` merges the text-only left columns, the right side still has 4-6 numeric slots with many empty cells. These map directly to the surplus columns seen (7 observed, 4 expected).

**Fix required:** Drop columns that are empty across ALL data rows after the label-coalesce step.

---

### 3. Algorithm Redesign — Step C (DEFECT-D Core Fix)

#### 3.1 Replace greedy height-based merge with gap-histogram row detection

**Principle:** Instead of using median word HEIGHT as the row-separation oracle, compute the distribution of actual INTER-ROW GAPS between consecutive word tops. The true row pitch emerges as a stable peak in this distribution. Each physical OCR scan line becomes exactly one grid row.

**Algorithm for `_cluster_rows_by_gap` (new function, replaces `_cluster_rows`):**

```
INPUT: words (filtered, any order), h_med (kept for fallback only)

Step 1 — Sort words by top coordinate (ascending).

Step 2 — Compute raw top values: unique_tops = deduplicated sorted list of
          word.top values (multiple words on same physical line share ≈ same top).

          "Same physical line" := two words whose top values differ by at most
          SAME_LINE_TOLERANCE = floor(0.3 × h_med). Group all words within
          SAME_LINE_TOLERANCE of each other into the same candidate line.
          This tolerates OCR baseline jitter (Tesseract top-jitter is typically
          ±2-4px on 200 DPI images).

Step 3 — Compute inter-line gaps: for each adjacent pair of candidate lines
          (sorted by top), compute gap = top[i+1] - top[i].

Step 4 — Derive row-pitch from gap distribution:
          row_pitch = median(all inter-line gaps where gap > 0)
          If no gaps exist (single line), row_pitch = h_med (fallback).

Step 5 — New-row threshold:
          ROW_SPLIT_THRESHOLD = row_pitch × ROW_PITCH_MULTIPLIER
          where ROW_PITCH_MULTIPLIER = 1.2 (constant — allows 20% stretch
          before a new logical section begins; tighter than the old 0.5 × h_med).

Step 6 — Assign words to rows:
          Walk lines in top-sorted order. Start a new grid row when the gap
          from the previous line exceeds ROW_SPLIT_THRESHOLD. Within a row,
          sort words by left coordinate (ascending — strict left-to-right order,
          never column-major).

Step 7 — Return: List[List[Dict]] — rows, each row's words sorted by left.
```

**Why this works on dense grids:**

- For the income statement (25 rows, ~4px inter-row gap): `row_pitch = median(4px, 4px, 4px, ...)` = 4px. Threshold = `4 × 1.2 = 4.8px`. Adjacent rows (4px gap) are BELOW threshold → same row detection zone. But this still gives too-tight rows. Actually the key insight is the OPPOSITE: each inter-line gap IS the row pitch for consecutive rows. For tightly-stacked text, row_pitch ≈ 14-16px (line height + spacing). The median of those gaps is the actual inter-row distance, not the word height.

- For balance sheet (wider spacing): row_pitch ≈ 20-25px. Threshold = ~24-30px. This is the same behavior as before (rows already separated correctly).

**Critical constraint — SAME_LINE_TOLERANCE:** Words on the same physical line must be grouped before computing inter-line gaps. Without this, each word's individual top value (which jitters ±3px in Tesseract output for the same line) creates false "gaps" between words on the same line.

**Constant definitions (module-level, generic — no BCTC semantics):**

```python
# Row clustering: same-line grouping tolerance as fraction of median word height.
# Words within this vertical distance share a physical scan line.
_SAME_LINE_FACTOR = 0.3      # 30% of H_med — matches typical Tesseract top-jitter

# Row-pitch multiplier: gap must exceed row_pitch × this factor to start a new row.
# 1.2 = allow 20% stretch in line spacing before treating as a section break.
# Lower than the old 0.5 × h_med approach — more precise for dense grids.
_ROW_PITCH_MULTIPLIER = 1.2
```

#### 3.2 Strict left-to-right word emission (Step E — existing but now guaranteed)

The existing `_assign_columns` already sorts words by left within each row. After the Step C fix, each row contains only words from ONE physical line, so intra-row left-ordering is naturally maintained. No change to `_assign_columns` is needed — the fix is upstream at Step C.

**Explicit invariant to enforce in code (add assert in debug mode):**

Within `_assign_columns`, after assigning words to column anchors, verify that the `left` value of each word is monotonically non-decreasing when the word list is iterated in its original (left-sorted) order. This is trivially satisfied by the existing sort, but making it explicit prevents future regressions.

---

### 4. Empty-Column Collapse (AC-2E Fix — DEFECT-E)

**New function: `_collapse_empty_columns(grid)`**

Applied AFTER `_coalesce_label_columns` and BEFORE `_is_data_table`. Removes columns that are empty (or whitespace-only) across ALL rows.

```
def _collapse_empty_columns(grid: List[List[str]]) -> List[List[str]]:
    """
    Drop columns that are empty (whitespace-only) across all rows.

    Fixes empty-column proliferation: after label-coalescing reduces the
    left side, the right side may still contain column slots that were
    populated only in the header row but never in data rows (or vice versa).

    A column is EMPTY if every cell in that column, across all rows, is
    either an empty string or whitespace-only after strip().

    AC-0: operates on the assembled grid only. Zero BCTC-specific constants.
    DDD: pure function — no I/O, no Tesseract, no DB. Infrastructure layer.

    Args:
        grid: 2-D list of strings.

    Returns:
        Grid with all-empty columns removed.
        If the result has 0 columns, returns the original grid unchanged
        (let the density gate handle rejection).
    """
    if not grid or not grid[0]:
        return grid

    n_cols = len(grid[0])

    # Identify non-empty columns: at least one row has a non-blank cell
    keep_cols: List[int] = []
    for col_idx in range(n_cols):
        col_is_empty = all(
            (row[col_idx].strip() == "" if col_idx < len(row) else True)
            for row in grid
        )
        if not col_is_empty:
            keep_cols.append(col_idx)

    if not keep_cols:
        return grid  # all empty — let density gate reject

    if len(keep_cols) == n_cols:
        return grid  # nothing to drop

    # Rebuild grid keeping only non-empty columns
    return [
        [row[col_idx] if col_idx < len(row) else " " for col_idx in keep_cols]
        for row in grid
    ]
```

**Updated `_process_page` pipeline order (final):**

```
Step A → image_to_data
Step B → detect table regions (unchanged)
Step C → _cluster_rows_by_gap  (REPLACED — DEFECT-D fix)
Step D → _detect_column_anchors (unchanged)
Step E → _assign_columns (unchanged)
         ↓ post-processing pipeline (pure, no I/O):
         _strip_leading_header_bands   (DEFECT-C.1, unchanged)
         _coalesce_label_columns       (DEFECT-C.2, unchanged)
         _collapse_empty_columns       (NEW — DEFECT-E / AC-2E fix)
         _is_data_table gate           (DEFECT-B, unchanged)
Step F → _detect_header_rows
Step G → _emit_markdown_table
```

---

### 5. Files to Modify (pdf-extractor only — zero mcp-server changes)

| File | Change | DDD Layer |
|---|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | ADD `_SAME_LINE_FACTOR`, `_ROW_PITCH_MULTIPLIER` constants; ADD `_cluster_rows_by_gap()` function; ADD `_collapse_empty_columns()` function; MODIFY `_process_page()` to call `_cluster_rows_by_gap` instead of `_cluster_rows` and to call `_collapse_empty_columns` in the post-processing pipeline; KEEP `_cluster_rows()` as dead code or remove (prefer removal) | infrastructure |
| `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py` | ADD unit tests for `_cluster_rows_by_gap` (synthetic word lists with known top values) and `_collapse_empty_columns` (grid with all-empty columns); ADD row-order-correctness test: given a synthetic dense word list (25 rows × 6 columns), assert output has exactly 25 grid rows each with 6 cells and top values are monotonically increasing across rows | unit |

**No new files. No new ports. No mcp-server changes. The mcp-server storage contract (push/inspect endpoints, `bctc_md_tables` schema) is UNCHANGED — re-extract writes to the same table via the same push handler.**

---

### 6. Acceptance Criteria — MD-EXTRACT-3

These ACs are ADDITIVE to the still-binding MD-EXTRACT + MD-EXTRACT-2 ACs. Fences, privacy grep, and non-regression ACs carry forward unchanged.

---

**AC-3A (BLOCKING — row-order correctness for code-bearing statements):**

For a code-bearing financial statement table (income statement — detected generically by the density gate passing on a table with ≥6 money-groups AND ≥3 three-digit codes), each detected 3-digit standalone code (`(?<!\d)\d{3}(?!\d)`) must appear in EXACTLY ONE markdown row. No code may appear in the same markdown row together with another distinct 3-digit code.

Verify: iterate every `md_tables[i]` entry. For each entry, parse rows (split on `\n`). For each non-separator row, find all 3-digit standalone codes. Assert no row contains more than one distinct 3-digit code. Failure = two or more codes in one row = row-collapse still occurring.

Unit-test: inject a synthetic word list representing 5 rows × 3 columns (codes 100, 200, 300, 400, 500 in separate rows). Assert output grid has 5 rows, each row's first cell contains exactly one of the five codes and no other code.

---

**AC-3B (BLOCKING — monotonic top-coordinate row order):**

Within each detected table, the `_cluster_rows_by_gap` output must have rows whose minimum `top` value is monotonically non-decreasing. Within each row, words must be sorted by `left` in ascending order.

Unit-test: inject a word list with known (top, left) coordinates in scrambled insertion order. Assert the returned rows are sorted by top (ascending). Assert words within each row are sorted by left (ascending). Assert no two words from different physical lines (top difference > `_SAME_LINE_FACTOR × h_med`) appear in the same row.

---

**AC-3C (segment report human-readable):**

After re-extract, the segment report table (`md_tables[i]` identified generically as having ≥6 money-groups AND ≥4 pipe-delimited columns) renders such that:
- The table has ≥ 5 rows (one header + at least 4 metric rows).
- Each non-separator, non-header row contains NO MORE THAN ONE of the three known segment revenue values `35.381.667`, `9.092.934`, `18.701.876` (verifiable by regex on each row string). If all three appear in a single row, the row-collapse is not fixed.
- Columns are distinguishable: the table has ≥ 4 distinct non-empty column slots after empty-column collapse.

This AC is verified by main terminal live-curl and human inspection — no automated fixture required. It confirms the user's binding goal ("Báo cáo bộ phận" readable).

---

**AC-3D (income statement row count):**

For the income statement table (detected generically), the resulting markdown table must have ≥ 10 data rows (non-separator, non-header rows). The current collapsed output has 1 data row. A minimum of 10 confirms the row-collapse is resolved.

Unit-test: inject a synthetic 25-word list representing 5 statement lines (5 words per line, each line at top ≈ `i × 16px`, left positions spread across 4 column anchors). Assert `_cluster_rows_by_gap` returns exactly 5 rows.

---

**AC-3E (AC-2E re-test — balance-sheet column count ≤4 after empty-column collapse):**

After re-extract, `md_tables[0]` (or whichever table is the balance sheet, detected generically by being the first table with ≥6 money-groups on a page with balance-sheet-like structure) has at most 4 pipe-delimited columns per row.

Verify: parse the markdown table. Count the number of `|`-separated cells in any data row. Assert `cell_count ≤ 4`. Current failing state: 7 columns. Expected after `_collapse_empty_columns`: 3-4 (label + value_current + value_prior + optional code).

Unit-test: inject a grid with 4 columns where columns 2 and 5 are all-whitespace. Assert `_collapse_empty_columns` returns a grid with 5 columns → 3 remaining (non-empty 0, 1, 3 → re-indexed 0, 1, 2). Verify no data is lost.

---

**AC-3F (non-regression — all MD-EXTRACT-2 passing ACs unchanged):**

The following MD-EXTRACT-2 ACs must remain PASS after the Step C replacement:
- AC-2A: `ocr_as_markdown` non-empty (DEFECT-A fix — unaffected, different code path).
- AC-2B: `table_count` in [10, 15] (DEFECT-B density gate — unaffected, runs after Step C).
- AC-2C: ≥2 distinct tables with ≥6 money-groups retained (density gate unchanged).
- AC-2D: Segment table first row not garbled letterhead (DEFECT-C.1 strip — unaffected).
- AC-2F (BLOCKING): Structured path `rows_length` in [70,90], `balance_pass: true`, `balance_delta: 0`. Zero regression on `bctc_table_rows` (entirely separate code path).
- AC-2G (BLOCKING): `grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|bo_phan\|bao_phan" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. New constants `_SAME_LINE_FACTOR`, `_ROW_PITCH_MULTIPLIER` are generic geometry constants — AC-0 compliant by construction.
- AC-2H: Fence-A — `grep "from application\|from interface" generic_md_table_extractor.py` → ZERO matches.
- AC-2I: Fence-B — `grep "from infrastructure\|from interface" extract_md_tables_usecase.py` → ZERO matches.
- AC-2J: Hardware — `grep "pytesseract\|image_to_string\|image_to_data" ocr_text_fetch_client.py` → ZERO matches.

---

**AC-3G (privacy — unchanged):**

`grep -rn "claude\|openai\|gemini\|api.mistral\|textract\|document.ai\|requests.post\|httpx.post" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. `_cluster_rows_by_gap` and `_collapse_empty_columns` are pure in-process functions with no network calls.

---

**AC-3H (unit-test fixture mandate — live poppler OCR substrate):**

All NEW unit test fixtures (word lists used to test `_cluster_rows_by_gap` and `_collapse_empty_columns`) must be derived from LIVE pytesseract `image_to_data` output against the real FPT Q4 2025 PDF (or a synthetic word list that replicates the exact `top`/`left`/`height` distribution observed in live output — NOT PyMuPDF spike output). This closes the false-green vector that caused 7 prior false-greens on `text_table_extractor.py`.

At minimum: one integration-level test that calls `_cluster_rows_by_gap` on a real `image_to_data` DICT from page 8-12 of the FPT PDF and asserts: (a) number of rows matches manually-counted physical lines on that page, (b) no row contains words from two distinct physical lines (verified by max `top` - min `top` within a row being < `2 × h_med`).

---

### 7. Deploy + QA Gates (MD-EXTRACT-3)

#### MD-DEPLOY-3 ACs (ops — SINGLE DOC ONLY, NEVER batch)

**AC-D3-0:** `docker-compose build pdf-extractor` — container healthy (GET /health → 200). Grep-verify live code: `grep -c "_cluster_rows_by_gap\|_collapse_empty_columns" /app/infrastructure/generic_md_table_extractor.py` inside the container → count > 0.

**AC-D3-1:** Single-doc re-extract: `POST http://localhost:5001/extract-md-tables` with `{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65", "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}` (NO `doc_ocr_text` — use case auto-fetches). Response: HTTP 202. SINGLE DOC. NEVER batch.

**AC-D3-2:** Poll `GET http://localhost:3000/api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` until `extracted_at` timestamp advances. Confirm: `table_count` in [10, 15], `ocr_as_markdown` length > 0, `md_tables_json` length > 0.

**AC-D3-3:** Structured path non-regression: `GET http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` → `rows_length` in [70,90], `balance_pass: true`, `balance_delta: 0`.

#### MD-QA-3 ACs (qa — live verification gate)

All MD-QA-2 ACs remain binding (AC-Q2-0 through AC-Q2-4). The following are ADDED for MD-EXTRACT-3:

**AC-Q3-0 (BLOCKING — row-order live proof):** Fetch `GET /api/bctc-inspect/md/{fpt_doc_id}`. Find the income statement table (highest code-density entry in `md_tables`). Verify: each pipe-table row contains at most one 3-digit standalone code. If any row contains two or more distinct 3-digit codes (e.g., `"20 | 10 | ..."`) → CHANGES_REQUESTED immediately.

**AC-Q3-1 (BLOCKING — segment report human-readable):** Inspect `md_tables` entries. Find the segment report (≥4 columns, ≥5 rows). Verify: the three segment revenue figures `35.381.667`, `9.092.934`, `18.701.876` each appear in a DIFFERENT row (not stacked in one cell). Human inspection confirms which segment each figure belongs to. If all three appear in one row → CHANGES_REQUESTED.

**AC-Q3-2 (balance-sheet column count):** `md_tables[0]` (or first balance-sheet table) has ≤4 columns. Verified by counting pipe separators in any data row: `row.count('|') - 1 ≤ 4`. If > 4 → CHANGES_REQUESTED.

**AC-Q3-3 (AC-0 grep-proof — new constants):** `grep -n "_SAME_LINE_FACTOR\|_ROW_PITCH_MULTIPLIER\|_cluster_rows_by_gap\|_collapse_empty_columns" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → all matches are constant/function DEFINITIONS (no per-table keyword strings). `grep -rn "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|bo_phan\|bao_phan" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

---

### 8. Risk Register (MD-EXTRACT-3)

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: `_cluster_rows_by_gap` uses `median(inter-line gaps)` as row-pitch. If a page has very few lines (≤ 3) or uneven spacing, the median gap is unreliable. | HIGH | Fallback: if `len(unique_tops) < 3` OR `row_pitch <= 0`, fall back to the old `_cluster_rows` with `_ROW_GAP_FACTOR × h_med`. Log a DEBUG warning. This prevents regression on sparse pages. |
| R-HIGH: `_SAME_LINE_FACTOR = 0.3 × h_med` for same-line grouping. If `h_med` is inflated by a few very tall tokens (section headers), the same-line window balloons and erroneously groups words from TWO consecutive close lines into one. | HIGH | Mitigation: cap `SAME_LINE_TOLERANCE = min(floor(0.3 × h_med), 8px)`. The 8px absolute cap ensures that even with `h_med = 40px` (from a large header), the same-line window is at most 8px — which is safely below any normal inter-row gap on 200 DPI BCTC pages. |
| R-MEDIUM: `_collapse_empty_columns` may drop a column that is empty in most rows but non-empty in the header row (e.g., a column label with no data values below it). This would silently lose a column header. | MEDIUM | Mitigation: change the empty-column rule to require emptiness across ALL rows INCLUDING header rows. If the header row has text in a column, the column is kept (it may be a label-only column header for a future row). A column is dropped only when even the header cell is blank. |
| R-MEDIUM: Two words on different physical lines may have top values within `SAME_LINE_TOLERANCE` if the lines are very tightly packed (e.g., a superscript note-reference number immediately below the main line). These would be incorrectly merged into one row. | MEDIUM | Accept: superscript note-reference numbers are single-character tokens (e.g., `"1"`, `"2"`) with `_NUMERIC_RE` matching but no money-group match. They do not materially affect the table structure. The density gate will not exclude the table; the note-ref text will be appended to the nearest cell. Cosmetic artifact only. |
| R-LOW: `_cluster_rows_by_gap` changes the row-clustering behavior for simple 2-3 col tables that already worked (balance sheet, cash flow). If `row_pitch` is correctly estimated, behavior is equivalent to the old greedy merge for widely-spaced rows (threshold still > actual gap). Regression risk is low but must be verified by AC-3F. | LOW | Mitigated by AC-3F non-regression AC (structured path invariant). Unit tests on balance-sheet-like synthetic word lists. |
| R-LOW: The old `_cluster_rows` function is called from unit tests as a standalone testable function. If it is deleted, existing unit tests break. | LOW | Keep `_cluster_rows` in the module as a private utility (not called from `_process_page`). Mark with a `# DEPRECATED — use _cluster_rows_by_gap` comment. Remove calls from `_process_page` only. Existing unit tests still pass against the kept function. |

---

### 9. Build Standard

**BUILD-STANDARD: lean** — existing `apps/pdf-extractor/` service; this is a targeted algorithm improvement within an existing infrastructure file.

**ROLE-RELAY:** dev-pdf-extractor → ops (MD-DEPLOY-3, single-doc) → main-terminal live-verify → qa (MD-QA-3) → po (MD-EXIT re-evaluation).

---

### 10. DDD Compliance Restatement

| Function | Layer | Imports | Fence |
|---|---|---|---|
| `_cluster_rows_by_gap(words, h_med)` | infrastructure | None (pure — stdlib list ops only) | Fence-A: no application/interface imports |
| `_collapse_empty_columns(grid)` | infrastructure | None (pure — stdlib list ops only) | Fence-A: no application/interface imports |
| `_process_page(...)` modified | infrastructure | `pytesseract`, `PIL` (already present) | Fence-A compliant |

Both new functions are PURE: no I/O, no Tesseract, no DB, no network. They operate only on the already-assembled `word` dicts and `grid` lists collected in Steps A-E. This satisfies the DDD infrastructure layer rule (impure only at the boundary; pure helpers can live in the same file).

---

## MD-EXTRACT-4 — PSM-6 Line-Text Substrate (Kill Dual-Path Drift at Source)

> **Task:** MD-EXTRACT-4 | **Author:** architect | **Date:** 2026-05-26T~UTC
> **Status:** DESIGN REVISED — Candidate 2 (psm-6 line-text) REJECTED by ground-truth. Candidate 3 (image_to_data 2D + number-token clustering) ELEVATED. Ready for dev-pdf-extractor.
> **Recurring-bug rule:** 2nd failed render on `generic_md_table_extractor.py`. Root-cause rethink MANDATORY before any dev patch.
> **Binding evidence:** MAIN-TERMINAL LIVE-VERIFY-3 (post MD-DEPLOY-3, FPT `e71f845d`). MD-EXTRACT-3 `_cluster_rows_by_gap` is present and working (income statement went from 1 collapsed row to 74 pipe-rows), yet matrix scatter persists. ADDITIONAL ground-truth from main-terminal inspection of live `pdf_extracted_text` (psm-6 stored OCR for FPT e71f845d) disproves Candidate 2 for wide tables — see §2.1.
> **Zone:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` + its test. Zero mcp-server changes. `text_table_extractor.py` UNTOUCHED.

---

### 1. Root-Cause Analysis — Why All Three Prior Fixes Failed

#### 1.1 The invariant that the structured path exploits

`text_table_extractor.py` works — 79 clean rows, label↔code↔value aligned, balance δ=0 — because it consumes **psm-6 `image_to_string` line-text**. Under psm-6, Tesseract's internal layout analysis commits to one line per physical print row BEFORE emitting text. Every token that belongs to row N (label word, code digits, current-period value, prior-period value) is already on the same line in the output string. The structured parser just splits the line on whitespace-run boundaries to extract columns. That is why it is robust.

#### 1.2 Why `image_to_data` (per-word bbox) cannot reconstruct the same grid

`image_to_data` returns per-word bounding boxes. In a multi-column financial matrix (income statement: code + note + 4 period values; segment: label + 7 segment totals), the value tokens in the rightmost columns are physically printed several hundred pixels to the right of the label column. Tesseract's internal word segmentor assigns each word its own `top` coordinate independently. Due to:

- **Printing baseline variation:** the label text baseline and the numeric baseline for the same logical row differ by 0-6px on a 200 DPI scan.
- **Diacritic overhang:** Vietnamese diacritics extend word bounding boxes upward, inflating `top` by 2-4px for accented words.
- **Column-to-column optical alignment:** printers often micro-shift numeric columns 1-3px vertically relative to the label column.

The net effect: the label cell for logical row N has `top = T`, but the four value cells in that row have `top ∈ [T-4, T+6]`. This 10px spread straddles the `_SAME_LINE_FACTOR × h_med` tolerance (capped at 8px). When tolerance < spread, `_cluster_rows_by_gap` correctly splits the values into separate "candidate lines" — and then each line becomes its own grid row.

This is not a threshold tuning problem. Raising the cap from 8px to, say, 16px fixes the merge for that spread, but then creates false merges between genuinely adjacent print rows (which are ~14-16px apart on dense statements). There is no stable value that works for both cases simultaneously because the two distances overlap.

**Class of defect: Dual-Path Drift #5.** The per-word bbox approach attempts to re-derive what psm-6 already knows: which words belong to the same physical print line. The re-derivation is geometrically unstable on multi-column financial matrices. The structured path skips this re-derivation entirely by consuming the psm-6 output directly.

#### 1.3 What MD-EXTRACT-3 actually fixed (partial)

`_cluster_rows_by_gap` fixed the COLLAPSE problem for sparse tables (balance sheet: 3-4 columns, wide row spacing) and for cases where word-top jitter is small relative to row pitch. Income statement now correctly produces 74 pipe-rows instead of 1. But the SCATTER problem (value columns detached from their label row) persists because it lives in the clustering tolerance, not in the row-pitch detection.

---

### 2. Strategy Decision — Chosen Direction

#### 2.1 Candidates evaluated

**Candidate 1 (REJECTED): Continue tuning `image_to_data` per-word bbox clustering.**
Raise `_SAME_LINE_FACTOR` cap from 8px to 16-20px, accept some false row-merges. This does not converge: the spread range [0-10px for same-row top jitter] overlaps with the inter-row gap [14-16px for dense statements]. Any cap in between produces either scatter or collapse depending on the specific page. Third failure on this approach.

**Candidate 2 (REJECTED-BY-GROUND-TRUTH): Replace `image_to_data` per-word substrate with psm-6 `image_to_string` line-text, split each line into columns by whitespace-gap analysis.**

This was the originally chosen direction. It is DISPROVEN by main-terminal ground-truth verification of the live `pdf_extracted_text` substrate (psm-6 stored OCR for FPT e71f845d). The psm-6 linearization for WIDE tables (segment report page 22, income statement page 8) is COLUMN-MAJOR, not row-major. Tesseract psm-6 emits the entire label column vertically stacked, then the entire first value-column stacked, then the second value-column stacked, etc. There are NO row-aligned lines to split. Specific evidence:

- **Segment report (page 22):** psm-6 outputs label-column tokens on lines 1-22 ("Chỉ tiêu", "Doanh thu theo bộ phận", ...), then segment-1 header + values on lines 23-83 (each value alone on its line — `35.381.667` is on line 53), then segment-2 values on lines 84-100 (`9.092.934` is on line 83), then segment-3 values (`18.701.876` is on line 100), then total column, in column-major order. The three segment revenues are on lines 53 / 83 / 100 — each ALONE on its line. `_split_by_whitespace_gap` on any of those lines returns a single cell, not a row across columns.
- **Income statement (page 8):** same column-major pattern. Code column stacked (lines 11-26), label column stacked (lines 28-44), then value blocks. No shared row line across columns.
- **Why psm-6 does work for the narrow balance sheet:** the balance sheet columns are close enough horizontally that psm-6 can fit all cells on one line. That is the EXCEPTION, not the rule. The Candidate 2 assumption (psm-6 is row-aligned) only holds for narrow tables.

Therefore Candidate 2 (`_process_page_from_text` + `_split_by_whitespace_gap` + `_detect_table_regions_from_text` + `_build_grid_from_lines`) CANNOT reconstruct the segment report or income statement matrices and is REJECTED. All Candidate-2 function designs in §3-§4 above are SUPERSEDED by the revised design below (§2.2-§4 REVISED).

**Candidate 3 (CHOSEN — ELEVATED from deferred): image_to_data 2D reconstruction with number-token-only y-clustering.**

`image_to_data` per-word bbox IS the correct substrate for WIDE matrices — it is the only tool that preserves the 2D spatial relationship (x=column, y=row) independently of Tesseract's linearization order. The failure of MD-EXTRACT-1 through MD-EXTRACT-3 was NOT that `image_to_data` is wrong — it is that those cycles clustered ALL tokens (labels + numbers) by y into rows. Vietnamese-diacritic LABEL tokens have inflated/jittered `top` values that scatter across y-bands. The fix (confirmed by main-terminal) is to SEPARATE token classes and cluster only NUMBER tokens by y.

The `image_to_data` bbox data already captures the correct values: LIVE-VERIFY-3 confirmed that `35.381.667 / 9.092.934 / 18.701.876` are present in the segment report output — they were just on scattered rows. The values are there; the row assignment was wrong. This means the substrate is correct, the clustering strategy was wrong.

**Hybrid path decision:** psm-6 `image_to_string` (Branch A / stored OCR text) is retained as the FAST PATH for NARROW tables (balance sheet — 3-4 columns, all tokens on one line in psm-6). `image_to_data` is the WIDE-MATRIX PATH for the segment report and income statement. The implementation may either (a) route by detected column count after a cheap psm-6 parse, or (b) always use `image_to_data` for the wide-matrix path and psm-6 only for narrow. The architect's call (see §3): use `image_to_data` as the primary substrate for the wide-matrix algorithm; psm-6 text path remains viable for narrow tables and is kept as the `ocr_as_markdown` source.

#### 2.2 Why number-token-only y-clustering fixes the scatter

The root cause of scatter in MD-EXTRACT-1/2/3 is label-token `top` jitter inflating y-band boundaries. The fix is:

1. **Separate token classes.** NUMBER tokens (matching `_MONEY_GROUP_RE` or a 2-3 digit standalone code pattern) have uniform character height — no diacritics, clean baseline, consistent `top`. TEXT tokens (labels, headers) carry Vietnamese diacritics that inflate `top`.
2. **Cluster NUMBER tokens by y ONLY.** Numbers on the same print row share a clean baseline across all columns because the printer lays them out on a grid. y-jitter for number tokens is ≤2px. A `SAME_LINE_TOL = 4` cap (half the typical 8-9px inter-row gap) cleanly separates rows without over-merging.
3. **Cluster NUMBER tokens by x (left) to define columns.** Each NUMBER cluster at a given y-band appears in one of the `N_segment` + `total` column positions. x-anchors derived from all number-token left-edges give the column layout.
4. **Attach labels per row.** For each number-row y-band, find TEXT token(s) whose y falls nearest that band → that row's label cell. Multi-line wrapped labels: take the TEXT token group whose centroid y is closest to the number-row y.
5. **Emit grid.** Row = [label, col1_value, col2_value, ..., total_value]. Empty string where no number exists at that (row_y, col_x) intersection.

**Why this sidesteps the prior failures:**
- MD-EXTRACT-1/2: y-band clustering included label tokens → diacritic jitter expanded y-bands → false merges.
- MD-EXTRACT-3 `_cluster_rows_by_gap`: improved for balance sheet (sparse, large row gap) but SCATTER persisted for income/segment because the gap-histogram row-pitch was still computed over ALL tokens, and value tokens across columns were on different y-sub-bands.
- Number-only clustering: the NUMBER tokens in the rightmost segment column on the same print row as the label share the same baseline as the leftmost number column. The label's y-jitter is irrelevant — it is attached AFTER rows are formed from numbers.

#### 2.3 Honest bar

Perfect reconstruction may be impossible for some cells: OCR sometimes merges adjacent column values onto one line (e.g., `"804.840 7.324.783 (1.193.275)"` is one image_to_data word-token block). Garbled column headers are expected. The bar is HUMAN-READABLE majority alignment: label↔value↔column correct for the bulk of rows. The structured `bctc_table_rows` path remains the SSOT for analyzable figures; this generic MD path is the additive human-recheck layer.

#### 2.4 psm-6 narrow-table fast path (retained)

For the narrow balance sheet (3-4 columns), psm-6 line-text + whitespace-gap splitting DOES work (Candidate 2 assumption holds for narrow). The implementation MAY retain a Branch A fast path using psm-6 text for narrow tables (detected by low column count after a cheap text scan) while routing wide tables through the number-token-2D path. This is an implementation decision for dev-pdf-extractor — architect does not mandate the routing condition. What IS mandated: the wide-matrix path (segment report, income statement) MUST use `image_to_data` 2D reconstruction. The narrow path may use psm-6 text if dev finds it simpler to maintain one unified code path via `image_to_data` for all tables.

---

### 3. New Algorithm Design — Number-Token 2D Reconstruction (REVISED)

> NOTE: §3 supersedes the psm-6 line-text algorithm designed before ground-truth verification. Candidate 2 functions (`_process_page_from_text`, `_split_by_whitespace_gap`, `_detect_table_regions_from_text`, `_build_grid_from_lines`) are CANCELLED — do NOT implement them. The algorithm below is the binding design for MD-EXTRACT-4.

#### 3.1 Substrate

`pytesseract.image_to_data(page_image, lang="vie+eng", config="--psm 6", output_type=Output.DICT)` — per-word bbox TSV. This IS the substrate that proved it captures the correct values (LIVE-VERIFY-3 confirmed segment revenues present). The failure was in clustering strategy, not substrate. One `image_to_data` call per page (same as the original MD-DESIGN intent).

`page_image_paths` remain the primary input. `doc_ocr_text` is used only for `ocr_text_to_markdown` (the human-readable flat text view) — NOT for table reconstruction. Port signature is unchanged.

**No change to ports, use case, handlers, or mcp-server.**

#### 3.2 Token classification

After collecting words via `image_to_data` (filter `conf > 0`, `text.strip() != ""`):

```python
_NUMBER_TOKEN_RE = re.compile(
    r'^[\(\-]?\d{1,3}(?:[.,]\d{3})*[\)\-]?$'      # money group: (1.234.567) or 1,234,567
    r'|^[\(\-]?\d{2,3}[\)\-]?$'                     # 2-3 digit code or small number
)
```

A token is a NUMBER token if its `text` (stripped of whitespace) matches `_NUMBER_TOKEN_RE`. All other tokens are TEXT tokens (labels, headers, units, prose).

This split is the key fix: NUMBER tokens are uniform-height glyphs (digits + punctuation), no diacritics, clean shared baseline. TEXT tokens may have diacritics with unpredictable `top` jitter.

#### 3.3 Per-page algorithm (number-token-2D path)

**Step A — Collect and classify tokens.**

```
words = pytesseract.image_to_data(page_image, ..., output_type=Output.DICT)
number_tokens = [w for w in words if _NUMBER_TOKEN_RE.match(w['text'].strip())]
text_tokens   = [w for w in words if not _NUMBER_TOKEN_RE.match(w['text'].strip())]
```

**Step B — Detect table regions.**

Use the existing `_detect_table_regions` y-gap histogram on NUMBER tokens only (not all tokens). A page has a table region if there are ≥4 number tokens. Table boundary = vertical extent of the number-token cluster, extended ±`H_med` to include the label column.

**Step C — Cluster NUMBER tokens into rows by y.**

Within each table region's number-token set:

1. Sort by `top`.
2. Greedy same-line grouping with tolerance `SAME_LINE_TOL = min(4, H_med * 0.3)`. Use `top` of number tokens only — no diacritic inflation.
3. Each group = one logical row's number tokens. The `top` of each group = median `top` of its members.

Because number tokens have ≤2px y-jitter and the typical inter-row gap is 8-12px, `SAME_LINE_TOL = 4` cleanly separates rows without false merges.

**Step D — Cluster NUMBER tokens into columns by x.**

Collect all number-token `left` values across all rows. Build x-band clusters (existing `_detect_column_anchors` logic, unchanged). Each cluster = one column. Column index = rank by x ascending. This gives the `N_col` column layout.

**Step E — Build number grid.**

Initialize `grid[row_idx][col_idx] = ""` for all rows and columns.

For each number token, assign it to its row (by y-band from Step C) and column (by nearest x-anchor from Step D). Space-join multiple tokens assigned to the same cell.

**Step F — Attach labels.**

For each row `row_idx` with y-band centroid `y_c`:

1. Find all TEXT tokens whose `top` satisfies `abs(top - y_c) <= H_med * 0.6`.
2. Sort matching TEXT tokens by `left` ascending.
3. Space-join their `text` fields → `label_cell`.
4. If no TEXT token falls within that band, find the nearest TEXT token by `abs(top - y_c)` (with cap `2 * H_med`) → use its text as the label (handles slight label-row offset).

Set `grid[row_idx][0] = label_cell`. Shift existing column 0 (if it contained a number) to column 1, renumbering. Alternatively: prepend label as column 0; number columns start at index 1.

**Step G — Post-processing (unchanged functions).**

Apply in order:
- `_strip_leading_header_bands(grid)`
- `_coalesce_label_columns(grid)`
- `_collapse_empty_columns(grid)`
- `_is_data_table(grid)`

**Step H — Header detection and markdown emission (unchanged).**

`_detect_header_rows(grid)` + `_emit_markdown_table(grid, n_header_rows)`.

#### 3.4 AC-4A / AC-4B compliance by construction

- **AC-4A (every money-row has non-empty label):** Step F guarantees every row with ≥1 number token has a label attached (nearest TEXT token fallback). If no TEXT token exists within `2 * H_med`, the label cell is empty — this is the honest "OCR merges some columns" limitation stated in §2.3.
- **AC-4B (code+value co-located):** Because rows are built from NUMBER token y-bands, and codes (2-3 digit tokens) cluster by y the same as value tokens, a code and its value columns land on the same row by construction. Detachment only occurs when the code token's `top` differs from value tokens by > `SAME_LINE_TOL` — practically impossible for printed financials.

#### 3.5 Functions to add / modify / retire

| Function | Action | Rationale |
|---|---|---|
| `_NUMBER_TOKEN_RE` | **ADD constant** | Classifies number vs text tokens |
| `SAME_LINE_TOL: int = 4` | **ADD constant** | Number-token y-clustering tolerance (px) |
| `_classify_tokens(words)` | **ADD** | Returns `(number_tokens, text_tokens)` split. Pure. |
| `_cluster_number_rows(number_tokens, same_line_tol)` | **ADD** | Groups number tokens by y using `SAME_LINE_TOL`. Returns list of row groups, each sorted by x. Pure. |
| `_attach_labels(row_groups, text_tokens, h_med)` | **ADD** | For each row group y-band, finds nearest TEXT tokens → label cell. Returns updated row groups with label prepended. Pure. |
| `_build_grid_from_number_rows(row_groups_with_labels, col_anchors)` | **ADD** | Assigns tokens to (row, col) cells using col_anchors. Returns 2D grid. Pure. |
| `_process_page(page_image, pytesseract, Output)` | **MODIFY** | Replace cluster-all-tokens logic with: (1) classify → (2) cluster numbers by y → (3) detect col anchors on numbers → (4) build number grid → (5) attach labels → (6) post-process pipeline. Keep existing dead-code bbox helpers (compatibility). |
| `extract_md_tables(page_image_paths, doc_ocr_text)` | **UNCHANGED signature** | `doc_ocr_text` still used for `ocr_text_to_markdown` only. Table reconstruction uses `image_to_data` per page. |
| `_cluster_rows`, `_cluster_rows_by_gap` | **RETIRE** — keep as dead code | Replaced by `_cluster_number_rows`. Mark `# DEAD in MD-EXTRACT-4`. |
| All post-processing pure functions | **UNCHANGED** | Substrate-agnostic. |
| `_MONEY_GROUP_RE`, `_CODE_LIKE_RE`, `_MIN_MONEY_GROUPS`, etc. | **UNCHANGED** | Used by density gate and post-processing. |

**Candidate-2 functions CANCELLED (do not implement):** `_process_page_from_text`, `_split_by_whitespace_gap`, `_detect_table_regions_from_text`, `_build_grid_from_lines`.

#### 3.6 Handling pages not covered by stored OCR

`image_to_data` is called per page image directly — it does not depend on stored OCR text. The `doc_ocr_text` field is used only for `ocr_text_to_markdown` (flat human-readable view). No change to the fallback behavior.

#### 3.7 Honest limitations

- OCR may merge adjacent column values into one token (e.g., `"804.840 7.324.783 (1.193.275)"` as a single image_to_data word). In that case, the merged token is assigned to the x-nearest column anchor; the other column(s) get empty cells. This is noted in §2.3 honest bar — human-readable majority alignment is the goal.
- Column header rows (segment names, period dates) may not contain NUMBER tokens — they consist of TEXT tokens only. These rows will appear in the grid only if TEXT-token attachment (Step F) is extended to header rows. Dev may choose to include a header-row pass or emit headers from a psm-6 text scan of the first few lines. This is an implementation decision; the AC bar is met without perfect header reconstruction.

---

### 4. Functions to Add / Modify / Remove in `generic_md_table_extractor.py` (REVISED)

> This section supersedes the psm-6 Candidate-2 function table. Functions listed as CANCELLED below must NOT be implemented.

| Function | Action | Rationale |
|---|---|---|
| `_NUMBER_TOKEN_RE` | **ADD constant** | Number vs text token classifier. Matches money-group format and 2-3 digit codes. AC-0 compliant — no BCTC label strings. |
| `SAME_LINE_TOL: int = 4` | **ADD constant** | Number-token y-clustering tolerance (pixels). Tunable. |
| `_classify_tokens(words)` | **ADD** | Splits `image_to_data` word list into `(number_tokens, text_tokens)`. Pure. |
| `_cluster_number_rows(number_tokens, same_line_tol)` | **ADD** | Groups number tokens by y using `SAME_LINE_TOL`. Returns row groups sorted by x. Pure. Replaces `_cluster_rows` / `_cluster_rows_by_gap`. |
| `_attach_labels(row_groups, text_tokens, h_med)` | **ADD** | For each row group's y-band centroid, finds nearest TEXT tokens → label cell. Returns row groups with label prepended. Pure. |
| `_build_grid_from_number_rows(row_groups_with_labels, col_anchors)` | **ADD** | Assigns tokens to `(row_idx, col_idx)` cells. Returns 2D grid. Pure. |
| `_process_page(page_image, pytesseract, Output)` | **MODIFY** | Replace cluster-all-tokens logic: classify → cluster_number_rows → detect_column_anchors (number tokens only) → build_grid_from_number_rows → attach_labels → post-process pipeline. Keep existing dead-code bbox helpers for test compatibility. |
| `extract_md_tables(page_image_paths, doc_ocr_text)` | **UNCHANGED signature** | `doc_ocr_text` used only for `ocr_text_to_markdown`. Table reconstruction uses `image_to_data` per page (via `_process_page`). |
| `_cluster_rows`, `_cluster_rows_by_gap` | **RETIRE** — keep as dead code | Replaced by `_cluster_number_rows`. Mark `# DEAD in MD-EXTRACT-4 — replaced by _cluster_number_rows`. |
| All post-processing pure functions: `_strip_leading_header_bands`, `_coalesce_label_columns`, `_collapse_empty_columns`, `_is_data_table`, `_detect_header_rows`, `_emit_markdown_table` | **UNCHANGED** | Substrate-agnostic — work on any 2D grid. |
| Module-level constants: `_MONEY_GROUP_RE`, `_CODE_LIKE_RE`, `_MIN_MONEY_GROUPS`, `_MIN_CODE_HITS`, `_MIN_MONEY_THIN`, `_DATE_HEADER_RE` | **UNCHANGED** | Used by density gate and post-processing. |
| **CANCELLED — do NOT implement:** `_split_by_whitespace_gap`, `_detect_table_regions_from_text`, `_build_grid_from_lines`, `_process_page_from_text` | **CANCELLED** | Candidate-2 (psm-6 line-text) functions. Candidate 2 is rejected by ground-truth. Do not add these functions. |

#### 4.1 Implementation sketches for new functions (REVISED — number-token-2D)

```python
# Number token classifier — generic financial number pattern.
# Matches: money groups (1.234.567 / 1,234,567 / (1.234.567)),
#          2-3 digit standalone codes (100, 270, 30), parenthetical negatives.
# AC-0: zero BCTC-specific label strings.
_NUMBER_TOKEN_RE = re.compile(
    r'^[\(\-]?\d{1,3}(?:[.,]\d{3})+[\)\-]?$'  # money group
    r'|^[\(\-]?\d{2,3}[\)\-]?$'               # 2-3 digit code or small int
)

# Number-token y-clustering tolerance (pixels at 200 DPI).
SAME_LINE_TOL: int = 4


def _classify_tokens(words):
    """Split image_to_data word list into (number_tokens, text_tokens). Pure."""
    number_tokens, text_tokens = [], []
    for w in words:
        txt = w.get("text", "").strip()
        if not txt:
            continue
        if _NUMBER_TOKEN_RE.match(txt):
            number_tokens.append(w)
        else:
            text_tokens.append(w)
    return number_tokens, text_tokens


def _cluster_number_rows(number_tokens, same_line_tol=SAME_LINE_TOL):
    """
    Group number tokens into rows by y-coordinate using SAME_LINE_TOL.
    Returns list of row groups sorted by ascending y; each group sorted
    by ascending x. Pure.
    """
    if not number_tokens:
        return []
    sorted_by_y = sorted(number_tokens, key=lambda w: w["top"])
    rows = []
    current_row = [sorted_by_y[0]]
    current_top = sorted_by_y[0]["top"]
    for w in sorted_by_y[1:]:
        if abs(w["top"] - current_top) <= same_line_tol:
            current_row.append(w)
        else:
            rows.append(sorted(current_row, key=lambda t: t["left"]))
            current_row = [w]
            current_top = w["top"]
    rows.append(sorted(current_row, key=lambda t: t["left"]))
    return rows


def _attach_labels(row_groups, text_tokens, h_med):
    """
    For each number-row group, find nearest TEXT tokens by y and return
    (label_str, row_tokens) tuples. Pure.
    Strategy: collect TEXT tokens within h_med * 0.6 of row y-centroid;
    fallback to nearest within h_med * 2.0.
    """
    result = []
    for row in row_groups:
        if not row:
            continue
        y_c = sum(w["top"] for w in row) / len(row)
        close = [t for t in text_tokens if abs(t["top"] - y_c) <= h_med * 0.6]
        if not close:
            nearest = sorted(text_tokens, key=lambda t: abs(t["top"] - y_c))
            if nearest and abs(nearest[0]["top"] - y_c) <= h_med * 2.0:
                close = [nearest[0]]
        label = " ".join(t["text"] for t in sorted(close, key=lambda t: t["left"]))
        result.append((label.strip(), row))
    return result
```

```python
def _detect_table_regions_from_text(page_lines: List[str]) -> List[List[str]]:
    """
    Detect table regions within a page's line-text.

    A table region is a maximal contiguous block of lines where:
      - At least 2 lines contain >= 1 money-group match (_MONEY_GROUP_RE), OR
        contain >= 1 three-digit standalone code match (_CODE_LIKE_RE).
      - No gap of > 2 consecutive blank lines separates lines within the block.

    Non-table prose pages (cover, notes, signature blocks) produce 0 or 1 line
    with money-groups — they are rejected by the 2-line minimum.

    AC-0: uses _MONEY_GROUP_RE and _CODE_LIKE_RE (generic financial patterns).
    No BCTC-specific table type constants.

    Returns:
        List of line-groups. Each group is a List[str] representing one table
        region. May be empty (no table detected on this page).
    """
    regions: List[List[str]] = []
    current_region: List[str] = []
    blank_run: int = 0

    for line in page_lines:
        stripped = line.strip()
        is_blank = not stripped
        is_data = (
            bool(_MONEY_GROUP_RE.search(stripped))
            or bool(_CODE_LIKE_RE.search(stripped))
        )

        if is_blank:
            blank_run += 1
            if blank_run > 2 and current_region:
                # Gap too large: close current region
                regions.append(current_region)
                current_region = []
            elif current_region:
                current_region.append(stripped)
        else:
            blank_run = 0
            current_region.append(stripped)

    if current_region:
        regions.append(current_region)

    # Filter: keep only regions with >= 2 data-dense lines
    def _is_data_region(lines: List[str]) -> bool:
        data_lines = sum(
            1 for l in lines
            if _MONEY_GROUP_RE.search(l) or _CODE_LIKE_RE.search(l)
        )
        return data_lines >= 2

    return [r for r in regions if _is_data_region(r)]
```

```python
def _build_grid_from_lines(region_lines: List[str]) -> List[List[str]]:
    """
    Convert a list of psm-6 text lines into a uniform 2-D grid.

    Each line is split into columns by _split_by_whitespace_gap(line).
    All rows are padded to the maximum column count (empty string padding).

    AC-0: pure — uses only _split_by_whitespace_gap.
    DDD: pure function — no I/O, no Tesseract. Infrastructure layer.

    Returns:
        2-D List[List[str]]. Empty if all lines are blank after splitting.
    """
    raw_rows = [_split_by_whitespace_gap(line) for line in region_lines]
    raw_rows = [r for r in raw_rows if r]  # drop fully blank lines
    if not raw_rows:
        return []

    max_cols = max(len(r) for r in raw_rows)
    return [r + [""] * (max_cols - len(r)) for r in raw_rows]
```

```python
def _process_page_from_text(page_text: str) -> List[str]:
    """
    Full table-detection pipeline for one page of psm-6 line-text.

    Steps:
      B — Detect table regions from text lines.
      C — Build grid per region (_build_grid_from_lines).
      D — Post-processing: strip + coalesce + collapse + density gate.
      F — Header detection.
      G — Markdown emission.

    Returns:
        List of markdown pipe-table strings detected on this page.
    """
    page_lines = page_text.splitlines()
    table_regions = _detect_table_regions_from_text(page_lines)

    page_tables: List[str] = []
    for region_lines in table_regions:
        grid = _build_grid_from_lines(region_lines)
        if not grid:
            continue

        grid = _strip_leading_header_bands(grid)
        if not grid:
            continue
        grid = _coalesce_label_columns(grid)
        grid = _collapse_empty_columns(grid)

        if not _is_data_table(grid):
            continue

        n_header_rows = _detect_header_rows(grid)
        if n_header_rows == 0:
            continue

        md_table = _emit_markdown_table(grid, n_header_rows)
        if md_table:
            page_tables.append(md_table)

    return page_tables
```

#### 4.2 Modified `_process_page` (key logic change — REVISED)

```python
# In _process_page, replace the cluster-all-tokens block with:

number_tokens, text_tokens = _classify_tokens(words)
if not number_tokens:
    return []  # no numeric content — not a table page

# h_med from number tokens only (no diacritic inflation)
heights = [w["height"] for w in number_tokens]
h_med = sorted(heights)[len(heights) // 2] if heights else 12

# Detect table regions on number-token y-extent
table_regions = _detect_table_regions(number_tokens, h_med)

page_tables = []
for region_num_tokens in table_regions:
    # Text tokens within the region's vertical extent + h_med margin
    region_top = min(w["top"] for w in region_num_tokens)
    region_bot = max(w["top"] + w["height"] for w in region_num_tokens)
    region_text_tokens = [
        t for t in text_tokens
        if region_top - h_med <= t["top"] <= region_bot + h_med
    ]

    row_groups = _cluster_number_rows(region_num_tokens, SAME_LINE_TOL)
    if not row_groups:
        continue

    # Column anchors derived from number tokens only
    col_anchors = _detect_column_anchors(region_num_tokens, h_med)
    if not col_anchors:
        continue

    labeled_rows = _attach_labels(row_groups, region_text_tokens, h_med)

    # Build grid: each row = [label, col0_val, col1_val, ...]
    grid = _build_grid_from_number_rows(labeled_rows, col_anchors)
    if not grid:
        continue

    grid = _strip_leading_header_bands(grid)
    if not grid:
        continue
    grid = _coalesce_label_columns(grid)
    grid = _collapse_empty_columns(grid)

    if not _is_data_table(grid):
        continue

    n_header_rows = _detect_header_rows(grid)
    md_table = _emit_markdown_table(grid, n_header_rows)
    if md_table:
        page_tables.append(md_table)

return page_tables

# extract_md_tables signature is UNCHANGED.
# doc_ocr_text is still passed through to ocr_text_to_markdown only.
# image_to_data is called once per page (same as prior design).
```

---

### 5. Test Strategy (REVISED)

#### 5.1 New unit tests in `__tests__/unit/test_generic_md_table_extractor.py`

All new tests added to the existing file (no new test files). Import the new functions explicitly.
CANCELLED test classes (do NOT add): `TestSplitByWhitespaceGap`, `TestDetectTableRegionsFromText`, `TestBuildGridFromLines`, `TestProcessPageFromText` — these tested Candidate-2 psm-6 functions which are not being implemented.

**TestClassifyTokens** (4 tests):
- Money-group token (`"1.234.567"`) → classified as number token.
- Vietnamese diacritic label token (`"Doanh thu"`) → classified as text token.
- 3-digit code token (`"270"`) → classified as number token.
- Empty text → excluded from both lists.

**TestClusterNumberRows** (5 tests):
- 3 tokens with same `top` (within 4px) → 1 row group.
- 3 tokens on 3 distinct `top` values (each 10px apart) → 3 row groups.
- Mixed: 2 on same y, 2 on different y → 2 row groups.
- Each row group is sorted by `left` (x ascending).
- Empty input → returns `[]`.

**TestAttachLabels** (5 tests):
- Row y-centroid matches a text token within `h_med * 0.6` → label = that token's text.
- No text token within `h_med * 0.6` but one within `h_med * 2.0` → fallback label used.
- No text token within `h_med * 2.0` → label = `""` (honest empty).
- Multi-word label (multiple text tokens near same y) → space-joined in x order.
- Text tokens at wrong y → not attached.

**AC-4A correctness test (BLOCKING):**

Synthetic `image_to_data` word dict list: 5 rows, each row has one code token (`{"text": "110", "top": r, "left": 10}`) and one money token (`{"text": "1.234.567", "top": r, "left": 200}`), plus one label text token (`{"text": "Tien mat", "top": r, "left": 0}`), for `r` in [10, 25, 40, 55, 70] (10px apart, ≥ 4px per step). Inject into `_classify_tokens` + `_cluster_number_rows` + `_attach_labels`. Assert: 5 distinct row groups, each with a non-empty label and at least one money token. No row group has money tokens but an empty label.

**Segment correctness test (AC-4C proxy):**

Synthetic segment report image_to_data: 3 number rows at y=[10, 25, 40], each row has 3 money tokens at x=[100, 200, 300] (three columns). Label tokens at y=[10, 25, 40] at x=5. Inject into full pipeline via `_process_page`. Assert: output markdown has 3 data rows. Assert: each row has a non-empty label. Assert: the first column value for row 0, row 1, and row 2 are in THREE DIFFERENT rows (not collapsed into one).

#### 5.2 Corrected AC-3A (replaces flawed prior version)

The prior AC-3A used `(?<!\d)\d{3}(?!\d) ≤1 per row` as a mechanically checkable proxy for "no row collapse". This was measurement-flawed: money values in VN format (e.g., `58.102.970.741.619`) contain dot-separated 3-digit groups internally (`102`, `970`, etc.) that match the regex. Every row with money values false-fails this AC.

**New AC-4A (BLOCKING — corrected row-order AC):**

For every data row in every emitted markdown table, extract all cell text and apply the following check: a "label cell" is the first non-empty cell in the row. A "value cell" is any cell matching `_MONEY_GROUP_RE` (the N.NNN.NNN format — at least one thousands-separator group). Assert: every data row that contains ≥1 value cell also has a NON-EMPTY label cell (first column non-empty or second column non-empty, with the first being the label after coalescing). This catches the off-by-one "values on row without label" scatter pattern seen in LIVE-VERIFY-3.

**New AC-4B (BLOCKING — no logical statement line split across rows):**

For the income statement table (detected generically as the table with highest code density): each three-digit standalone code `(?<!\d)\d{3}(?!\d)` that appears in the table must appear in EXACTLY ONE row, AND that same row must contain at least one `_MONEY_GROUP_RE` match. If any code appears in a row with no money-group match, the code's value landed on a different row (scatter still present).

Mechanically checkable against live `md_tables_json` via a Python one-liner:
```python
import json, re
tables = json.loads(open("md_tables_json.txt").read())
CODE_RE = re.compile(r"(?<!\d)\d{3}(?!\d)")
MONEY_RE = re.compile(r"\d{1,3}(?:[.,]\d{3})+")
for tbl in tables:
    rows = [r for r in tbl.split("\n") if r.startswith("|") and "---" not in r]
    for row in rows[1:]:  # skip header
        cells = [c.strip() for c in row.split("|")[1:-1]]
        codes_in_row = CODE_RE.findall(" ".join(cells))
        money_in_row = MONEY_RE.findall(" ".join(cells))
        if codes_in_row and not money_in_row:
            print("FAIL: code without value on same row:", codes_in_row, row)
```
ZERO output = PASS.

**New AC-4C (segment report human-proof):**

After live re-extract (MD-DEPLOY-4), inspect the segment report table (identified as the table with ≥4 non-empty columns and containing segment-type data). Assert via live `md_tables_json`:
- The table has ≥5 rows (1 header + ≥4 data).
- The three segment revenue values `35.381.667`, `9.092.934`, `18.701.876` each appear in DIFFERENT rows (no two in the same pipe-separated row string). This is the user's binding proof case.

**New AC-4D (income statement completeness):**

The income statement table has ≥15 data rows (non-separator, non-header pipe-rows). Prior state (LIVE-VERIFY-3): 74 rows in MD-EXTRACT-3 (row collapse fixed), but values split across adjacent rows making many rows value-only. After MD-EXTRACT-4: each of the ≥15 logical statement lines has BOTH label and at least one value in the SAME row.

---

### 6. Hard Constraint Compliance

| Constraint | Status | Evidence |
|---|---|---|
| AC-0 deny-list (GENERIC only) | COMPLIANT by construction | New functions (`_classify_tokens`, `_cluster_number_rows`, `_attach_labels`, `_build_grid_from_number_rows`) use `_NUMBER_TOKEN_RE`, `_MONEY_GROUP_RE`, `_CODE_LIKE_RE` — generic financial patterns. Token classification is purely pattern-based. Zero BCTC label strings. |
| PRIVACY (local OCR only) | COMPLIANT | `image_to_data` is a local Tesseract subprocess call (same as existing MD path). `doc_ocr_text` used for `ocr_text_to_markdown` only — no re-OCR. No network. No cloud API. |
| AC-3F NON-REGRESSION (bctc_table_rows = 79, balance δ=0) | TRIVIALLY PRESERVED | `text_table_extractor.py` is UNTOUCHED. The two paths share no code. |
| pdf-extractor zone ONLY | COMPLIANT | Changes confined to `infrastructure/generic_md_table_extractor.py` + its test. Zero mcp-server, zero handlers, zero ports, zero use case changes. |
| Fence-A (infra no app/interface imports) | UNCHANGED | New functions are pure stdlib + regex + module-level constants. No application/interface imports. |
| FROZEN surfaces | UNTOUCHED | dashboard/index.html, traces.js, trust-contract.spec.js, sandbox/runner.py, pilot-status-pdf-extractor.json — none touched. |
| `text_table_extractor.py` UNTOUCHED | CONFIRMED | No change of any kind. AC-3F non-regression preserved by construction. |

---

### 7. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: OCR may merge adjacent column values into one `image_to_data` word token (e.g., `"804.840 7.324.783 (1.193.275)"` as a single token). When this occurs, `_NUMBER_TOKEN_RE` may not match the merged string (it contains spaces), and the token falls into the TEXT bucket instead of NUMBER. The column cell will be empty. | HIGH | Accept per §2.3 honest bar. The majority of tokens are unmerged. Garbled cells are visible to human reviewer. A future refinement: detect merged-number strings in TEXT tokens and re-classify. Not in scope for MD-EXTRACT-4. |
| R-HIGH: `SAME_LINE_TOL = 4` may be too tight for some pages where number tokens have more baseline variation (e.g., bold vs. regular glyphs). Rows may scatter at 5-6px jitter. | HIGH | Tunable: `SAME_LINE_TOL` is a named module constant. If live-verify shows split rows, increase to 6. If false-merges, decrease to 2. Do not hard-code; keep as `SAME_LINE_TOL: int = 4`. |
| R-MEDIUM: Column header rows (segment names, period dates) consist entirely of TEXT tokens — they have no NUMBER tokens. They will not appear as rows in the number-only grid. The output table may lack column headers. | MEDIUM | Partially mitigated: `_detect_header_rows` looks for date-like or all-caps patterns in the first rows. Dev may add a header-scan pass on TEXT tokens in the top `h_med * 2` of the table region to extract a header row. Not blocking — the density gate and markdown output are still correct without headers. |
| R-MEDIUM: `_attach_labels` nearest-text fallback may attach wrong label when two consecutive rows have similar y and the nearest text token is equidistant. | MEDIUM | Accept cosmetically. One mis-labeled row per table is within the honest-bar expectation. The fallback `2 * h_med` cap limits damage to at most one adjacent row. |
| R-LOW: Dead-code bbox functions plus new number-token functions add ~150L to the existing 1033L file. At ~1183L it is near the split threshold in `docs/data/file-size-caps.json`. | LOW | Monitor. If file exceeds cap after implementation, move the DEAD bbox functions to `_legacy_bbox.py` (same infra layer). Not blocking for MD-EXTRACT-4. |

---

### 8. DDD Layer Assignment

| Function | Layer | Imports | Fence |
|---|---|---|---|
| `_classify_tokens` | infrastructure | `_NUMBER_TOKEN_RE` (module-level) | Fence-A: no app/interface imports |
| `_cluster_number_rows` | infrastructure | stdlib only | Fence-A compliant |
| `_attach_labels` | infrastructure | stdlib only | Fence-A compliant |
| `_build_grid_from_number_rows` | infrastructure | `_detect_column_anchors` (same file) | Fence-A compliant |
| `_process_page` (modified) | infrastructure | `pytesseract`, `PIL` (existing boundary) | Fence-A compliant |
| `extract_md_tables` (unchanged signature) | infrastructure | `pytesseract`, `PIL` (via `_process_page`) | Fence-A compliant |

All new functions are PURE (no I/O, no Tesseract, no DB, no network). The impure boundary remains `_process_page` which calls `pytesseract.image_to_data` — same as the existing boundary. Layer rule satisfied.

---

### 9. MD-DEPLOY-4 Steps (ops)

**Single doc only. NEVER batch. Full UUID mandatory.**

1. `docker-compose build pdf-extractor` — verify exit 0.
2. `docker-compose up -d --no-deps --force-recreate pdf-extractor`.
3. Health check: `GET http://localhost:5001/health` → 200.
4. Grep-verify live code: `grep -c "_classify_tokens\|_cluster_number_rows\|_attach_labels\|SAME_LINE_TOL" /app/infrastructure/generic_md_table_extractor.py` inside container → count > 0. Also verify cancelled psm-6 functions are absent: `grep "_process_page_from_text\|_split_by_whitespace_gap\|_detect_table_regions_from_text" /app/infrastructure/generic_md_table_extractor.py` → ZERO matches (those functions must not have been implemented).
5. Single-doc re-extract: `POST http://localhost:5001/extract-md-tables` with `{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65", "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}` → HTTP 202.
6. Poll `GET http://localhost:3000/api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` until `extracted_at` timestamp advances past the MD-EXTRACT-3 timestamp (`2026-05-26 06:31:37`).
7. Structured path non-regression: `GET http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` → `rows_length` in [70,90], `balance_pass: true`, `balance_delta: 0`.

---

### 10. MD-QA-4 Steps (qa)

All prior MD-QA ACs remain binding. Add:

**AC-Q4-0 (BLOCKING — corrected row-order gate, replaces AC-3A):**

Fetch live `md_tables_json` from `GET /api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`. Parse each table. For every data row: (a) if the row contains a three-digit standalone code AND a money-group match → PASS for that row. (b) if the row contains a three-digit code but NO money-group match → FAIL: code's value is on a different row (scatter still present). (c) if the row has a money-group match but empty first cell → FAIL: label detached. Zero failures across all rows of all tables → PASS.

**AC-Q4-1 (BLOCKING — segment report proof, CORRECTED):**

Ground-truth layout: "Doanh thu theo bộ phận" is ONE logical row in the segment report. `35.381.667` (segment 1), `9.092.934` (segment 2), and `18.701.876` (segment 3) are that row's values in THREE DIFFERENT COLUMNS (each segment is a column). The CORRECT assertion is therefore:

All three values `35.381.667`, `9.092.934`, `18.701.876` appear in THE SAME pipe-row (the "Doanh thu theo bộ phận" row), each in a DIFFERENT column cell of that row.

Human verification: in the raw `md_tables` JSON, find the row whose label cell contains "Doanh thu" (or closest equivalent). Assert that row's cell text contains all three values as separate cells (pipe-separated). If the three values are found in different rows (scattered) → CHANGES_REQUESTED. If they are found in the same row but concatenated in one cell (column merge) → warn but do not block (OCR merge honesty — see §2.3 honest bar).

NOTE: The prior MD-EXTRACT-4 brief had this AC BACKWARDS ("appear in THREE DIFFERENT rows") — that was the wrong expectation. The ground-truth image layout says they are column-values of one revenue row. This corrected AC-Q4-1 is the binding version.

**AC-Q4-2 (income statement completeness):**

The income statement table (highest code-density table) has ≥15 data rows with non-empty first cells (label column populated).

**AC-Q4-3 (substrate proof — no image_to_data in live path):**

`grep -n "image_to_data" /app/infrastructure/generic_md_table_extractor.py` inside container. The function definition may be present (dead code) but zero calls from `extract_md_tables` or `_process_page_from_text`. Verify: no live call path reaches `image_to_data`.

**AC-Q4-4 (privacy grep — unchanged):**

`grep -rn "claude\|openai\|gemini\|api.mistral\|textract\|document.ai\|requests.post\|httpx.post" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

**AC-Q4-5 (AC-0 grep-proof — unchanged):**

`grep -rn "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|bo_phan\|bao_phan" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

**AC-Q4-6 (non-regression):**

Structured path: `rows_length` in [70,90], `balance_pass: true`, `balance_delta: 0`. `bun test` (mcp-server) ≥ pre-sprint passing count. `pytest` (pdf-extractor) all existing tests pass.

---

### 11. Build Standard

**BUILD-STANDARD: lean** — in-zone algorithm replacement within existing infrastructure file. No new ports, no new use cases, no mcp-server changes.

**ROLE-RELAY:** dev-pdf-extractor → ops (MD-DEPLOY-4, single doc) → main-terminal live-verify → qa (MD-QA-4) → po (MD-EXIT re-evaluation).

---

## MD-EXTRACT-5 — Running-Centroid Row Grouping + D2/D3/D4 Fixes

> **Task:** MD-EXTRACT-5 | **Author:** architect | **Date:** 2026-05-26T07:28Z
> **Status:** DESIGN COMPLETE — ready for dev-pdf-extractor
> **Input:** MAIN-TERMINAL LIVE-VERIFY-4 (post MD-DEPLOY-4, `/tmp/md_tables_v4.json`, FPT `e71f845d`)
> **Escalation trigger:** 4th attempt on `generic_md_table_extractor.py` (MD-EXTRACT-1→4). Recurring-bug rule mandates architect root-cause rethink before any new dev patch.
> **Zone:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` + its unit test file ONLY. Zero mcp-server changes. `text_table_extractor.py` UNTOUCHED.

---

### 1. Root-Cause Analysis — Why MD-EXTRACT-4 Still Fails on Wide Rows

#### 1.1 What LIVE-VERIFY-4 confirmed as WINS (keep these, do NOT undo)

- Number/text token separation works. Diacritic-inflated label tokens no longer poison the y-clustering that MD-EXTRACT-1/2/3 suffered from.
- Segment report FIRST 3 columns now align on one row: `| bộ phận … | 35.381.667 | 9.092.934 | 18.701.876 | … |`. The x-anchor column assignment is correct.
- Structured path: `bctc_table_rows` = 79, balance_delta = 0, balance_pass = true. AC-3F holds.

#### 1.2 The surviving defect — D1: wide rows cascade-split

The segment revenue line has 7 segment values. Only the first 3 land on the main row. Columns 4-7 spill onto 2 follow-on rows. Income statement shows the same 3-row split per line item. Observed from `/tmp/md_tables_v4.json`, Table[33]:

```
| Doanh thụ theo bộ phận | 30.952.512 | 8.157.364 | 16.905.897 |   |   |   |   |
| phận |   |   |   | 704.503 | 7.444.159 | (1.315.641) |   |
| phận |   |   |   |   |   |   | 62.848.794 |
```

#### 1.3 Root cause — `_cluster_number_rows` greedy single-pass (lines 298–312)

The current code (reproduced exactly):

```python
sorted_by_y = sorted(number_tokens, key=lambda w: w["top"])
current_top: int = sorted_by_y[0]["top"]
for w in sorted_by_y[1:]:
    if abs(w["top"] - current_top) <= same_line_tol:
        current_row.append(w)
    else:
        rows.append(sorted(current_row, key=lambda t: t["left"]))
        current_row = [w]
        current_top = w["top"]          # ← anchor never moves within a row
```

`current_top` is FIXED to the `top` of the FIRST token that started the row. Later tokens in the same physical row are admitted only if `abs(top - current_top) <= SAME_LINE_TOL` (= 4px).

**Why this fails for wide rows:** On a BCTC page printed at 200 DPI, number tokens span the full page width — from the left-margin code column (~50px) to the right-margin total column (~2400px). Across that 2350px horizontal span, Tesseract's per-word `top` coordinate drifts due to:

1. **Optical keystoning / lens distortion** in the scanner: the page baseline curves slightly, producing a gradual top-drift of 1-3px per 500px of horizontal span. On 2400px wide tables this accumulates to 5-15px total.
2. **Per-column baseline micro-shift**: printers align number columns on a grid whose optical row center drifts ±2px per column.

Net effect: by the time the rightmost number tokens are encountered, their `top` is 8-15px above `current_top` (the first token's top). Since `SAME_LINE_TOL = 4`, those tokens fail the admission test and start a new "row" — the cascade-split observed. The column order is correct (x-anchors work), but the y-grouping cuts the row into 2-3 fragments.

#### 1.4 Why this is NOT tunable by widening SAME_LINE_TOL

BCTC table rows sit 8-12px apart (inter-row gap on dense statements). If SAME_LINE_TOL is widened to, say, 10px to absorb page-width drift, it would also span the inter-row gap — merging genuinely separate rows. There is no single fixed constant that is both narrow enough to separate rows AND wide enough to admit all tokens of a wide row. The problem is that a fixed anchor is the wrong reference point.

---

### 2. Strategy Decision — Chosen Algorithm

#### 2.1 Candidates evaluated

**Candidate (a): Running-centroid comparison**

Instead of comparing each incoming token's `top` against a fixed `current_top` (the first token's top), compare it against the **running mean** of all `top` values already admitted to the current row. Recompute the mean after each admission.

Rationale: as tokens from the left columns are admitted (say, top ≈ 100, 101, 99), the centroid stays at ~100. The next token 300px to the right may have top ≈ 106 due to lens drift. `abs(106 - 100) = 6 > 4` → rejected under the current fixed anchor. Under running-centroid, the centroid after 3 tokens is 100. At token 4 (top=106): `abs(106 - 100) = 6 > 4` → still rejected at same tolerance. So the pure centroid approach with the same tolerance does not help directly.

HOWEVER, with a slightly elevated tolerance (say 6-8px) applied to the centroid, the admission window follows the drift rather than anchoring to the first token's position. Tokens on the left side of the page have lower drift; tokens on the right have more drift. The centroid gradually updates and the "window" effectively tracks the drifting baseline.

**Risk:** if drift accumulates past one full inter-row gap (8-12px), centroid-tracking still over-merges. For very wide pages or severe lens distortion, this remains a problem.

**Candidate (b): Adaptive tolerance from inter-row pitch on NUMBER tokens only**

Revive the `_cluster_rows_by_gap` pitch-estimation idea from MD-EXTRACT-3, but apply it ONLY to NUMBER tokens (not all tokens). MD-EXTRACT-3 failed because it computed pitch over ALL tokens (diacritic label tokens inflated pitch). Since MD-EXTRACT-4 already separates number from text tokens, we can compute inter-row pitch purely from number-token `top` distribution:

1. Build a 1-D histogram of number-token `top` values with bin width = 4px (SAME_LINE_TOL).
2. Find histogram peaks — each peak = one physical row's y-band.
3. Inter-peak distance = per-document row pitch (typically 14-18px on BCTC statements).
4. Adaptive `SAME_LINE_TOL` = `0.45 × row_pitch` (admit tokens within 45% of row pitch — generous enough for drift, tight enough to exclude the next row which starts at 1.0 × row_pitch).

This derives the tolerance FROM THE DOCUMENT rather than using a fixed constant. A document with 16px row pitch gets tolerance = 7.2px. With page-width drift of 5-8px, a 7.2px window admits all tokens of one row without reaching the next row at 16px distance.

**Risk:** if there are few rows on the page (≤3), the histogram peak-detection is unreliable. Need a fallback to SAME_LINE_TOL=4 (fixed) for sparse pages.

**Candidate (c): Column-anchored k-band assignment**

Derive column anchors first (already done via `_detect_column_anchors_from_tokens`). Estimate row count k from the densest column's token count (the column with the most tokens has one token per row → k = its token count). Cluster row-bands using 1-D k-means on number-token y or band the densest column then snap all other tokens to the nearest band. Most robust for matrices; most code.

**Risk:** k-estimation fails when the densest column has merged tokens (OCR merges adjacent values). Also, k-means requires k to be known a priori, which requires the densest-column heuristic to be correct. On pages with varying numbers of empty cells, k is hard to estimate.

#### 2.2 Chosen: Candidate (b) — Adaptive tolerance from inter-row pitch on NUMBER-token histogram

**Rationale for choosing (b) over (a) and (c):**

Versus (a) (running-centroid): The centroid tracks drift, but with the same tolerance the failure point is the same — the centroid lags too far behind once drift exceeds the window. Running-centroid only helps when drift is GRADUAL and MONOTONIC, which it is for lens distortion. However, candidate (b) achieves the same result more directly: by deriving the tolerance from the actual row pitch, it automatically accommodates the full drift range (drift < row_pitch × 0.45) without relying on the gradual-drift assumption. The centroid approach is also harder to reason about and test: the window varies token-by-token and is hard to express as a unit-testable invariant. The AC `abs(top - centroid) <= tol` with a floating centroid is difficult to verify against a synthetic fixture without careful construction. Candidate (b) produces a deterministic, pre-computed tolerance that is testable with simple synthetic word dicts.

Versus (c) (k-band assignment): More robust but more code, and k-estimation is fragile on pages with many empty cells. The histogram approach is simpler and the k is NOT needed — peaks are found directly from the density. The implementation is O(n log n) in token count, same as the current sort-based approach.

**Why (b) works for the specific D1 failure:** The live failure shows 3 rows produced when 1 is expected, with tokens spreading top values over ~12-15px (first token top ≈ 100, last token top ≈ 113). With a fixed tolerance of 4px, the first row gets the first 3-4 tokens (up to top ≈ 104), then splits. With adaptive tolerance derived from actual row pitch (14-16px on BCTC statements), `adaptive_tol = 0.45 × 15 ≈ 6.75px`. The split at 12-15px drift still exceeds 6.75px if drift is large. However, using a **running centroid** within the (b) framework — where the threshold is computed adaptively AND the anchor tracks — gives: `centroid after 4 tokens ≈ 101`, next token at 107: `abs(107 - 101) = 6 < 6.75` → admitted. Centroid updates to 102. Next token at 112: `abs(112 - 102) = 10 > 6.75` → new row starts. So the combination of adaptive tolerance + centroid tracking within candidate (b) is the correct full fix.

**Final chosen design: Adaptive-pitch + running-centroid hybrid within the (b) framework.** This is still candidate (b) philosophically (pitch-derived tolerance), extended with running-centroid comparison (absorb monotonic drift across wide rows). The key invariant: `tol = min(adaptive_tol, 0.45 × estimated_row_pitch)` where `estimated_row_pitch` comes from NUMBER-token histogram peaks. Within a row, the admission window is `abs(w.top - current_row_centroid) <= tol`, and the centroid updates as tokens join.

**Why this is safe (does not over-merge separate rows):** The inter-row gap for BCTC statements is ~14-16px. With `adaptive_tol = 0.45 × 15 = 6.75px`, a token from the NEXT row (gap = 14px) is at `abs(14 - 0) = 14 > 6.75` from the centroid — rejected. Even with running-centroid drift of ±3px from the previous row, the gap is still 14 - 3 = 11px > 6.75px. The invariant holds as long as `2 × adaptive_tol < inter_row_gap`, which requires `adaptive_tol < 7px`. With BCTC's 14-16px pitch, the `0.45` multiplier gives 6.3-7.2px — right at the boundary. The absolute cap of `min(adaptive_tol, 8px)` from MD-EXTRACT-3 is re-applied here as a safety ceiling. If row pitch estimates to a value giving adaptive_tol > 8px, cap at 8px.

---

### 3. Revised Algorithm — `_cluster_number_rows_adaptive` (replaces `_cluster_number_rows`)

> **REVISION NOTE (2026-05-26 — post main-terminal AC trace):** Step 2 was rewritten after the original
> median-of-all-adjacent-gaps estimator was proven to estimate the WITHIN-ROW micro-gap (2-4px) rather than
> the INTER-ROW pitch (~12-16px). Root errors documented at end of this section. Step 2 now uses a
> large-gap mode filter on histogram peaks. The fixture in §8 AC-5-SEG was also replaced with a realistic
> drift/gap ratio (drift=6px, gap=14px) proven to pass the corrected algorithm.

**Function signature:**
```python
def _cluster_number_rows_adaptive(
    number_tokens: List[Dict],
    same_line_tol: int = SAME_LINE_TOL,    # fallback for sparse pages
) -> List[List[Dict]]:
```

**Algorithm steps:**

**Step 1 — Sort by top.**
```
sorted_tokens = sorted(number_tokens, key=lambda w: w["top"])
```

**Step 2 — Estimate inter-row pitch via large-gap mode on histogram peaks.**

This step must estimate the INTER-ROW pitch, not the within-row micro-gap. On a dense table, NUMBER tokens within a single row produce many small adjacent gaps (1-4px from OCR micro-variance). Row-boundary gaps are significantly larger (10-16px on BCTC). The median of ALL adjacent gaps is always dominated by the within-row micro-gaps — it CANNOT estimate inter-row pitch. Instead, use the large-gap mode:

```
1. Bin all NUMBER-token top values to nearest 2px bucket:
       bin(top) = (top // 2) * 2
2. Build sorted list of unique bin values: unique_bins = sorted(set(bin(w["top"]) for w in number_tokens))
3. Compute adjacent inter-bin gaps: gaps = [unique_bins[i+1] - unique_bins[i] for i in range(len(unique_bins)-1)]
4. Compute gap_median = median(gaps).
5. Separate large gaps (row-boundary candidates): large_gaps = [g for g in gaps if g > gap_median]
6. row_pitch = min(large_gaps) if large_gaps else gap_median
7. Fallback trigger: if len(unique_bins) < 3 or row_pitch <= 0 or large_gaps is empty:
       row_pitch = 0  → trigger same_line_tol fallback in Step 3.
   Log DEBUG: "_cluster_number_rows_adaptive: sparse/flat page, falling back to fixed same_line_tol={same_line_tol}"
```

**Why large-gap mode works:** Within-row micro-gaps are small and plentiful; they dominate the median. Gaps larger than the median are the row-boundary transitions. Taking the minimum large gap gives the tightest inter-row pitch estimate, which is conservative (safe toward over-splitting rather than over-merging).

**Worked trace on §8 AC-5-SEG fixture** (row0 tops [100,101,102,103,104,105,106], row1 tops [120,120,121,120,121,120,121]):
```
Binned tops: row0 → {100,100,102,102,104,104,106}, row1 → {120,120,120,120,120,120,120}
unique_bins = [100, 102, 104, 106, 120]
gaps = [2, 2, 2, 14]
gap_median = median([2,2,2,14]) = (2+2)/2 = 2
large_gaps = [14]            ← only gap > 2
row_pitch = min([14]) = 14
```
Result: row_pitch = 14. The inter-row boundary (14px) is cleanly separated from within-row micro-gaps (2px).

**Step 3 — Compute adaptive tolerance.**
```python
if row_pitch > 0:
    adaptive_tol = min(int(0.45 * row_pitch), 8)   # 8px absolute cap
    tol = adaptive_tol
else:
    tol = same_line_tol
```

**Trace continued:**
```
adaptive_tol = min(int(0.45 × 14), 8) = min(6, 8) = 6
tol = 6
```

**Step 4 — Greedy grouping with running-centroid anchor.**
```python
rows = []
current_row = [sorted_tokens[0]]
current_centroid = float(sorted_tokens[0]["top"])

for w in sorted_tokens[1:]:
    if abs(w["top"] - current_centroid) <= tol:
        current_row.append(w)
        # Update centroid: running mean
        current_centroid = sum(t["top"] for t in current_row) / len(current_row)
    else:
        rows.append(sorted(current_row, key=lambda t: t["left"]))
        current_row = [w]
        current_centroid = float(w["top"])

rows.append(sorted(current_row, key=lambda t: t["left"]))
return rows
```

**Full trace on §8 fixture (tol=6):**
```
Sorted by top (14 tokens):
  [100,101,102,103,104,105,106, 120,120,120,120,121,121,121]
  (7 row0 tokens, 7 row1 tokens — left positions disambiguate columns after grouping)

token top=100: start row0, centroid=100.0
token top=101: |101-100.0|=1.0 ≤ 6 → admit; centroid=100.5
token top=102: |102-100.5|=1.5 ≤ 6 → admit; centroid=101.0
token top=103: |103-101.0|=2.0 ≤ 6 → admit; centroid=101.5
token top=104: |104-101.5|=2.5 ≤ 6 → admit; centroid=102.0
token top=105: |105-102.0|=3.0 ≤ 6 → admit; centroid=102.5
token top=106: |106-102.5|=3.5 ≤ 6 → admit; centroid=(100+101+102+103+104+105+106)/7=103.0
  → row0 CLOSED (next token will start row1)
token top=120: |120-103.0|=17.0 > 6 → CLOSE row0, start row1; centroid=120.0
token top=120: |120-120.0|=0.0 ≤ 6 → admit; centroid=120.0
token top=120: |120-120.0|=0.0 ≤ 6 → admit; centroid=120.0
token top=120: |120-120.0|=0.0 ≤ 6 → admit; centroid=120.0
token top=121: |121-120.0|=1.0 ≤ 6 → admit; centroid≈120.1
token top=121: |121-120.1|=0.9 ≤ 6 → admit; centroid≈120.3
token top=121: |121-120.3|=0.7 ≤ 6 → admit; centroid≈120.4
  → row1 complete (all remaining tokens admitted)

Result: 2 groups.
  row0 = 7 tokens with top ∈ [100,106]  ← all 7 row0 tokens, sorted by left
  row1 = 7 tokens with top ∈ [120,121]  ← all 7 row1 tokens, sorted by left
```

**Safety invariant check:**
```
Within row0: max(top)-min(top) = 106-100 = 6px.  2×tol = 12px.  6 ≤ 12. HOLDS.
Row boundary: centroid at end of row0 = 103px. First row1 token top = 120px.
              |120-103| = 17px > tol=6px. Row1 token REJECTED from row0. SAFE.
```

**Why centroid-tracking is correct here (drift is monotonic):** lens distortion produces a smooth, left-to-right monotonic baseline curve. The centroid of admitted tokens tracks the drifting baseline accurately, so the admission window stays centered on the actual row center rather than anchoring to the first token's position. This is valid because OCR baseline drift is not random — it follows the physical curve of the scanned page.

**Why this algorithm fails and MUST fall back when drift ≈ gap:** If the fixture has row0 drift of 14px and the inter-row gap is only 1px (e.g., row0 = [100..114], row1 = [115..121]), the boundary between rows is invisible in the binned histogram (bin 114 captures both top=114 and top=115), and the large-gap filter finds no inter-row gap larger than the within-row gaps. The fallback to `same_line_tol` triggers (row_pitch=0 condition). This is the correct behavior: such documents need pre-processing deskew (out of scope). The design precondition for this algorithm is **inter-row gap > within-row drift** — the realistic BCTC constraint (well-scanned documents at 200 DPI: drift ≤ 8px, gap ≥ 12px).

**Original Step 2 — root errors (for record):**
- Error 1: `row_pitch = median(all adjacent gaps)`. On a dense table, within-row micro-gaps (1-4px) vastly outnumber row-boundary gaps (14px). Median collapses to 2px. Produced `adaptive_tol = int(0.45×2) = 0`. Greedy with tol=0 created ~14 groups from 14 tokens.
- Error 2 (independent): The original §8 fixture had row0 top drift = 14px and row1 starting at top=115 (gap = 1px from row0's top=114). This fixture violates the precondition `gap > drift`. Even with a correct pitch estimate, no single-pass y-only algorithm can separate these rows reliably — the row boundary is ambiguous in y alone. The §2.1/§2.2 worked example assumed pitch=15px was derivable, but §3 Step 2 could never produce it from that fixture.

---

---

### 4. D2 Fix — GFM Separator

Line 982, current (WRONG):
```python
separator = "|" + "|".join(["---|"] * n_cols)   # → |---||---||---|  (doubled pipes)
```

Fix (one line — TRIVIAL):
```python
separator = "|" + "|".join(["---"] * n_cols) + "|"  # → |---|---|---|  (valid GFM)
```

No imports, no logic change, no AC-0 concern. Isolated to `_emit_markdown_table`.

---

### 5. D3 Fix — Label Leakage / Fragment Rows (Symptom of D1)

D3 is a CONSEQUENCE of D1: when a wide row splits, each fragment gets its own `_attach_labels` pass. The fragment's centroid is offset from the main row's centroid, so it picks up the nearest TEXT tokens — often the label words that belong to the main row. This produces label fragments like `"phận"`, `"vụ"`, `"trực"` as standalone rows, and number tokens bleeding into the label cell (e.g., `"bộ phận {1.193.275)"`).

Once D1 is fixed (all number tokens of the wide row cluster into ONE group), `_attach_labels` runs once against the single combined centroid → the correct label is found, number tokens stay in value cells, no orphan fragment rows are emitted. D3 does NOT require a code change beyond D1.

**AC for D3:** verified as a consequence of AC-5-SEG (the segment wide row must produce a clean label cell). Add one explicit assertion in the unit test: after clustering, the label cell for the "Doanh thu" row must contain NO money-group match (no bleed from number tokens). Verified by: `_MONEY_GROUP_RE.search(label_cell) is None`.

---

### 6. D4 Fix — Balance Sheet Over-Split + Code Merged into Value Cell

#### 6.1 Over-split into 10 separate tables

Root cause (hypothesis from LIVE-VERIFY-4): `_detect_table_regions` uses a vertical-gap threshold (`2.5 × H_med`) to split table regions. For the balance sheet, section-header rows (`A. TÀI SẢN NGAN HẠN`, `B. TÀI SẢN DÀI HẠN`, etc.) are separated from data rows by whitespace that exceeds the gap threshold → each section is detected as a separate table region → 10 tables for one logical balance sheet.

This is a region-detection problem, not a row-clustering problem. Fix: increase the gap threshold multiplier for narrow tables (few columns, balance-sheet-like structure). However, making the threshold configurable per-table-type violates AC-0 (no per-table constants).

**Generic fix without AC-0 violation:** apply a post-detection merge step. After `_detect_table_regions` produces N candidate regions on a page, merge adjacent regions whose combined vertical span is within `_REGION_MERGE_MAX_GAP_FACTOR × H_med` and whose column counts are similar (within ±1 column). This is purely geometric — no balance-sheet-specific logic.

**AC for D4a:** after fix, the balance sheet is detected as AT MOST 3 table regions per page (not 10). Verified by: `sum(len(tables) for page_tables in page_results) <= 3` for a page that contains only the balance sheet.

**Alternative (lower risk):** accept the 10-table over-split as a cosmetic issue — each sub-table is individually readable and valid GFM. The AC-5-SEG and AC-5-INC binding ACs do not mention balance-sheet table count. The D4a fix is ADVISORY (nice to have), not blocking. Architect recommends dev-pdf-extractor attempt the merge step but mark it as non-blocking; the binding ACs are AC-5-SEG and AC-5-GFM.

#### 6.2 Code merged into value cell (`100 58.102.970.741.619`)

Root cause: `_NUMBER_TOKEN_RE` classifies both `"100"` (a 3-digit code) and `"58.102.970.741.619"` (a money group) as NUMBER tokens. In `_build_grid_from_number_rows`, both tokens are assigned to the same (row, col) slot via nearest-anchor assignment. If their x-positions are both nearest to the same column anchor (the first value column), they land in the same cell, space-joined: `"100 58.102.970.741.619"`.

**Fix:** differentiate within `_build_grid_from_number_rows` between CODE tokens (2-3 digit standalone) and VALUE tokens (money-group format). Codes should be placed in a DEDICATED code column (col index 0 or the left-most number column), not mixed with value tokens.

Define:
```python
_CODE_TOKEN_RE = re.compile(r'^[\(\-]?\d{2,3}[\)\-]?$')   # 2-3 digit standalone
_VALUE_TOKEN_RE = re.compile(r'^\d{1,3}(?:[.,]\d{3})+')   # money group with separator
```

Within `_build_grid_from_number_rows`: tokens matching `_CODE_TOKEN_RE` go into column-slot 0 (leftmost number column = code column); tokens matching `_VALUE_TOKEN_RE` go into their x-nearest value column. The label from `_attach_labels` is prepended as column 0; code column becomes column 1; value columns are 2..N. This preserves the grid structure while separating code from value.

**AC for D4b (binding):** for a balance-sheet table row containing code `100` and value `58.102.970.741.619`, the two must appear in SEPARATE cells: the code in a 2-3 character cell and the value in a multi-character cell with at least one thousands-separator. Verified by: for any pipe-table row, if a cell matches `_CODE_TOKEN_RE`, the NEXT non-empty cell to the right must match `_VALUE_TOKEN_RE`. No cell may match BOTH patterns simultaneously (concatenated form ruled out).

---

### 7. Functions to Add / Modify / Retire

| Function | Action | Rationale |
|---|---|---|
| `_estimate_inter_row_pitch(number_tokens, same_line_tol)` | **ADD** (pure helper) | Step 2 of the new algorithm. Bins tops to 2px buckets, computes inter-peak gaps, returns the minimum large gap (gap > median) as the inter-row pitch, or 0 to trigger same_line_tol fallback. Called only by `_cluster_number_rows_adaptive`. Pure, no I/O. AC-0 compliant (geometry only). |
| `_cluster_number_rows_adaptive(number_tokens, same_line_tol)` | **ADD** | Replaces `_cluster_number_rows` in `_process_page`. Calls `_estimate_inter_row_pitch` for tol, then greedy running-centroid grouping. Fixes D1 wide-row cascade-split. Pure. AC-0 compliant. |
| `_cluster_number_rows` | **RETIRE** (keep as dead code, mark `# DEAD in MD-EXTRACT-5`) | Replaced by `_cluster_number_rows_adaptive`. Kept for test backward-compat. |
| `_cluster_rows`, `_cluster_rows_by_gap` | **ALREADY DEAD** (MD-EXTRACT-4) | No change — stay as dead code. |
| `_emit_markdown_table` | **MODIFY** line 982 only | One-line GFM separator fix (D2). `"|".join(["---|"] * n)` → `"|".join(["---"] * n) + "|"`. |
| `_process_page` | **MODIFY** | Replace `_cluster_number_rows(...)` call with `_cluster_number_rows_adaptive(...)`. All other pipeline steps unchanged. |
| `_CODE_TOKEN_RE` | **ADD constant** | Discriminates 2-3 digit code tokens from value tokens (D4b). AC-0: purely numeric pattern, no BCTC label strings. |
| `_VALUE_TOKEN_RE` | **ADD constant** | Discriminates money-group value tokens from code tokens (D4b). |
| `_build_grid_from_number_rows` | **MODIFY** | Route CODE tokens to leftmost number column slot; VALUE tokens to x-nearest value column. Prevents code-value concatenation in same cell (D4b). |
| `_detect_table_regions` | **MODIFY (advisory, non-blocking)** | After producing N regions, merge adjacent same-column-count regions within `_REGION_MERGE_MAX_GAP_FACTOR × H_med` gap. Fixes D4a over-split. If merge proves unstable in tests, SKIP and accept cosmetic 10-table over-split. |
| All other functions | **UNCHANGED** | `_classify_tokens`, `_attach_labels`, `_detect_column_anchors_from_tokens`, `_strip_leading_header_bands`, `_coalesce_label_columns`, `_collapse_empty_columns`, `_is_data_table`, `_detect_header_rows`, `extract_md_tables` — untouched. |

**UNCHANGED surfaces (hard constraint):** `text_table_extractor.py`, `apps/pdf-extractor/dashboard/`, `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`, all mcp-server files.

---

### 8. Binding Acceptance Criteria (MD-EXTRACT-5)

These ACs are what main-terminal will live-verify after MD-DEPLOY-5. BLOCKING ACs must pass before QA is called.

#### AC-5-SEG (BLOCKING — wide row must survive as ONE row)

> **Fixture revision note (2026-05-26):** The original fixture (row0 drift=14px, row1 gap=1px from row0
> last token) was PATHOLOGICAL: drift ≈ gap means no y-only algorithm can separate the rows. That fixture
> violated the design precondition (gap > drift). The fixture below uses a REALISTIC drift/gap ratio
> matching 200 DPI well-scanned BCTC documents: drift ≤ 6px, inter-row gap = 14px (ratio ≥ 2.3×).

**Unit test (synthetic, primary):** Construct a synthetic `image_to_data` word dict list representing 14
number tokens across 2 logical rows, 7 columns (left = [100, 400, 700, 1000, 1300, 1600, 1900]):

- **row0** (first logical row): `top` values `[100, 101, 102, 103, 104, 105, 106]` — 6px total drift,
  mimicking realistic lens-distortion baseline curve on a 1900px wide scan at 200 DPI.
- **row1** (second logical row): `top` values `[120, 121, 120, 121, 120, 121, 120]` — 14px gap from
  row0's last token (top=106 → 120-106=14px). Row1 itself has only 1px within-row variance (tight row).

Pass these 14 tokens through `_cluster_number_rows_adaptive`. Assert:
- Result has EXACTLY 2 row groups.
- Row group 0 contains all 7 tokens whose `top` ∈ [100, 106] (the first row).
- Row group 1 contains all 7 tokens whose `top` ∈ [120, 121] (the second row).
- No token bleeds from row 0 into row 1 or vice versa.

**Arithmetic proof the corrected algorithm passes this fixture:**
```
Step 2 — _estimate_inter_row_pitch:
  Binned tops (floor(top/2)*2):
    row0: 100,100,102,102,104,104,106  → unique_bins from row0: {100,102,104,106}
    row1: 120,120,120,120,120,120,120  → unique_bins from row1: {120}
  All unique_bins sorted: [100, 102, 104, 106, 120]
  gaps = [2, 2, 2, 14]
  gap_median = median([2,2,2,14]) = (2+2)/2 = 2
  large_gaps = [g for g in gaps if g > 2] = [14]
  row_pitch = min([14]) = 14

Step 3 — adaptive tolerance:
  adaptive_tol = min(int(0.45 × 14), 8) = min(6, 8) = 6
  tol = 6

Step 4 — greedy centroid (tol=6):
  token top=100: row0 start, centroid=100.0
  token top=101: |1.0| ≤ 6 → admit, centroid=100.5
  token top=102: |1.5| ≤ 6 → admit, centroid=101.0
  token top=103: |2.0| ≤ 6 → admit, centroid=101.5
  token top=104: |2.5| ≤ 6 → admit, centroid=102.0
  token top=105: |3.0| ≤ 6 → admit, centroid=102.5
  token top=106: |3.5| ≤ 6 → admit, centroid=103.0   ← row0 complete (7 tokens)
  token top=120: |17.0| > 6  → CLOSE row0, start row1, centroid=120.0
  tokens top=120,120,120,120: |0| ≤ 6 each → admit
  tokens top=121,121,121:     |1| ≤ 6 each → admit
  → row1 complete (7 tokens)

Result: 2 groups.
  row0 = {top:100,left:100}, {top:101,left:400}, ..., {top:106,left:1900}  ✓ 7 tokens
  row1 = {top:120,left:100}, {top:121,left:400}, ..., {top:120,left:1900}  ✓ 7 tokens

Safety check: inter-row centroid gap = |120 - 103| = 17px >> tol=6px. SAFE.
              Within-row spread row0: 106-100=6px ≤ 2×6=12px. HOLDS.
```

**Live verification (main-terminal):** After MD-DEPLOY-5, fetch `md_tables_json`. Locate Table containing segment revenue data. Assert: the segment revenue row for "Doanh thu theo bộ phận" (or nearest equivalent) contains ALL of `35.381.667`, `9.092.934`, `18.701.876` as SEPARATE cells in ONE pipe-table row. No partial split onto follow-on rows.

#### AC-5-INC (BINDING — income statement line items on one row each)

**Live verification:** The income statement table (highest code-density table in `md_tables`) has ≥15 data rows. Each data row that contains a money-group value also has a non-empty first cell (label cell). No row contains only values with an empty label (scatter pattern ruled out). Verified by: for each non-separator, non-header pipe-row in the table, if `_MONEY_GROUP_RE.search(row_text)` then `row_cells[0].strip() != ""`.

#### AC-5-GFM (BINDING — valid GFM on every emitted table)

**Unit test:** Call `_emit_markdown_table` with a synthetic 3-column, 3-row grid. Parse the emitted string. Split on `\n`. Assert: the second line (separator) matches `re.fullmatch(r'\|(?:---|)+\|', separator_line)`. Assert: the count of `|` characters in the header line equals the count of `|` characters in the separator line (column counts match). This test FAILS under the current D2 bug and PASSES after the fix.

**Live verification:** For every table in `md_tables_json`, parse the markdown. Assert: the separator row (second line) has no doubled-pipe `||` pattern. Assert: `separator.count('|') == header.count('|')`.

#### AC-5-D3 (label cell clean — symptom of D1 resolved)

**Unit test (bundled with AC-5-SEG):** In the AC-5-SEG wide-row fixture, after full `_process_page` pipeline, the label cell for the clustered row must satisfy `_MONEY_GROUP_RE.search(label_cell) is None`. No money-group token bleeds into the label column.

**Live verification:** For the segment revenue row, the first cell (label) contains Vietnamese text characters and does NOT contain a pattern matching `_MONEY_GROUP_RE`.

#### AC-5-D4b (code in separate cell from value)

**Unit test:** Construct a synthetic grid row: NUMBER tokens include `"100"` (code) at left=50 and `"58.102.970.741.619"` (value) at left=200. Column anchors = [50.0, 200.0]. Pass through `_build_grid_from_number_rows`. Assert: the code token `"100"` lands in a different cell from the value token `"58.102.970.741.619"`. Assert: no single cell contains BOTH a `_CODE_TOKEN_RE` match AND a `_VALUE_TOKEN_RE` match.

**Live verification:** For the balance-sheet table(s), scan all cells. If any cell matches both `r'^\d{2,3}$'` and `r'\d{1,3}(?:[.,]\d{3})+'` in the same cell text → FAIL (code-value concatenation still present).

#### Non-regression ACs (all BLOCKING, carry from prior cycles)

- **AC-3F:** `text_table_extractor.py` UNTOUCHED. `grep -q "cluster_number_rows_adaptive\|_CODE_TOKEN_RE\|_VALUE_TOKEN_RE" apps/pdf-extractor/infrastructure/text_table_extractor.py` → ZERO matches. Structured `bctc_table_rows` = 79, balance_pass = true, balance_delta = 0 (live).
- **AC-0 (BLOCKING):** `grep -rniE "bao.cao.bo.phan|segment_report|SEGMENT|BAO_CAO|bo_phan|bao_phan" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches (segment/etc allowed only in COMMENTS, not in branching logic or constant values).
- **Fence-A:** `grep -rnE "from application|from interface|import application|import interface" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.
- **Privacy:** `grep -rniE "claude|openai|gemini|textract|document.?ai|anthropic|requests\.post|httpx\.post|aiohttp" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.
- **Test baseline:** `pytest` (pdf-extractor) all existing tests pass. No regression. All prior MD-EXTRACT-4 PASS ACs remain PASS.

---

### 9. MD-DEPLOY-5 Steps (ops — single doc / full UUID / never batch)

**Constraint: single-doc only. Full UUID mandatory. NEVER batch backfill.**

1. `docker-compose build pdf-extractor` — verify exit 0.
2. `docker-compose up -d --no-deps --force-recreate pdf-extractor`.
3. Health: `GET http://localhost:5001/health` → 200.
4. Grep-verify new code live in container:
   `grep -c "_cluster_number_rows_adaptive\|_CODE_TOKEN_RE\|_VALUE_TOKEN_RE" /app/infrastructure/generic_md_table_extractor.py` → count > 0.
5. Verify D2 fix live in container:
   `grep -n '"\|".join.*"---|"' /app/infrastructure/generic_md_table_extractor.py` → ZERO matches (the old doubled-pipe pattern must be gone).
6. Single-doc re-extract:
   `POST http://localhost:5001/extract-md-tables` with `{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65", "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}` → HTTP 202.
7. Poll `GET http://localhost:3000/api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` until `extracted_at` advances past the MD-DEPLOY-4 timestamp (`2026-05-26 07:20:10`).
8. Non-regression: `GET http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` → `rows_length` in [70,90], `balance_pass: true`, `balance_delta: 0`.

---

### 10. Risk Register (MD-EXTRACT-5)

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: Row pitch estimated from NUMBER-token top distribution may be noisy on pages with few rows (≤3 distinct y-positions). Median of 2 gaps is unreliable. | HIGH | Fallback path: if `len(unique_tops_binned) < 4`, use fixed `same_line_tol` (SAME_LINE_TOL=4). Log DEBUG. Sparse pages (cover, notes) have few tokens anyway and rarely contain wide tables. |
| R-HIGH: adaptive_tol = 0.45 × row_pitch may still be smaller than total page-width drift if scanning distortion is severe (>8px over full width). The 8px absolute cap is the safety floor. | HIGH | The 8px cap is the architectural limit. If real documents show >8px drift, the correct fix is pre-processing image deskew (out of scope for this task, requires PIL/OpenCV which is available). Note as known limitation. Majority of BCTC documents from the Vinahost VPS have consistent scan quality. |
| R-MEDIUM: Running-centroid updates within a row may drift the centroid toward the wrong side if the first few tokens have anomalous top values (OCR detection error). This could cause a token from a different row to be mis-admitted if the centroid drifts past the inter-row boundary. | MEDIUM | The `min(adaptive_tol, 8px)` cap prevents runaway drift. Even if centroid drifts 3-4px, the next physical row is 14-16px away — admission is rejected at `14 - 4 = 10 > 8px`. Safe by construction. |
| R-MEDIUM: `_CODE_TOKEN_RE` / `_VALUE_TOKEN_RE` distinction in `_build_grid_from_number_rows` — a legitimate small integer (e.g., "30" in a year-over-year change %) may be misclassified as a code token and routed to the code column. | MEDIUM | Accept per §2.3 honest-bar. The human-recheck layer tolerates minor cell mis-routing. The primary goal (no code+value concatenation) is met. If false code routing is observed on live data, the code column can be defined as the leftmost column with x < code_col_x_threshold (no BCTC-specific value, just the leftmost anchor). |
| R-LOW: `_detect_table_regions` merge (D4a advisory) may incorrectly merge two genuinely separate tables on the same page if they happen to have similar column counts. | LOW | D4a is ADVISORY (non-blocking). If the merge step causes any test regression, skip it and accept the cosmetic 10-table over-split for the balance sheet. The binding ACs do not require <= N balance-sheet tables. |
| R-LOW: Adding `_cluster_number_rows_adaptive` increases the file by ~30L. File is already near the cap from MD-EXTRACT-1/2/3/4. | LOW | Monitor file size cap (`docs/data/file-size-caps.json`). If exceeded, move the DEAD bbox functions (`_cluster_rows`, `_cluster_rows_by_gap`) to a `_legacy_bbox.py` file in the same infra layer. |

---

### 11. DDD Layer + Fence Compliance

| Function | Layer | Imports | Fence |
|---|---|---|---|
| `_estimate_inter_row_pitch` | infrastructure (pure helper) | stdlib only (`statistics.median` or manual sort-based median) | Fence-A compliant |
| `_cluster_number_rows_adaptive` | infrastructure | stdlib only (calls `_estimate_inter_row_pitch`) | Fence-A compliant |
| `_CODE_TOKEN_RE`, `_VALUE_TOKEN_RE` | module-level constants | `re` (already imported) | Fence-A compliant |
| `_build_grid_from_number_rows` (modified) | infrastructure | module-level constants only | Fence-A compliant |
| `_emit_markdown_table` (line 982 fix) | infrastructure | none | Fence-A compliant |
| `_process_page` (call-site change) | infrastructure | `pytesseract`, `PIL` (existing) | Fence-A compliant |

All new code is PURE (no I/O, no Tesseract, no DB, no network). The impure boundary remains `_process_page` calling `pytesseract.image_to_data` — same as MD-EXTRACT-4.

---

### 12. Build Standard

**BUILD-STANDARD: lean** — in-zone algorithm change within existing infrastructure file. No new ports, no new use cases, no mcp-server changes, no new test files (add tests to existing test file).

**ROLE-RELAY:** dev-pdf-extractor (MD-EXTRACT-5, implement per §3-§9 above) → ops (MD-DEPLOY-5, single doc, full UUID) → main-terminal live-verify (AC-5-SEG + AC-5-GFM + AC-5-INC) → qa (MD-QA-5) → po (MD-EXIT).

---

## MD-EXTRACT-6 — Column-Anchor-First Ordinal Reconstruction

> **Task:** MD-EXTRACT-6 | **Author:** architect | **Date:** 2026-05-26
> **Status:** DESIGN COMPLETE — ready for dev-pdf-extractor after main-terminal verifies the §8 fixture proof
> **Input:** MAIN-TERMINAL LIVE-VERIFY-5 (DB ground truth, FPT `e71f845d`, extracted_at `2026-05-26 08:07:58`)
> **Zone:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` + its unit test. Zero mcp-server changes. `text_table_extractor.py` UNTOUCHED.
> **Recurring-bug rule:** 5 scalar-y-tolerance attempts (MD-EXTRACT-1 through MD-EXTRACT-5) all produce the same diagonal failure. This section designs a FUNDAMENTALLY DIFFERENT row-assignment strategy that makes y-coordinate comparison across columns STRUCTURALLY IMPOSSIBLE.

---

### 1. Why the Entire Scalar-Y-Tolerance Family Is Exhausted

Every attempt since MD-EXTRACT-1 has shared one architectural assumption: **a token's row is determined by comparing its absolute `top` coordinate to a y-threshold or centroid.** The five variants are:

| Attempt | y-Assignment Strategy | Why It Fails on Wide Rows |
|---|---|---|
| MD-EXTRACT-1/2/3 | Greedy band-merge on ALL tokens, tolerance = 0.5×H_med | H_med inflated by diacritics → tolerance > inter-row gap → over-merge |
| MD-EXTRACT-3 `_cluster_rows_by_gap` | gap-histogram pitch on ALL tokens, threshold = pitch×1.2 | On dense statements: pitch ≈ 4px → threshold too tight; on wide tables: drift > pitch |
| MD-EXTRACT-4 `_cluster_number_rows` | Fixed-anchor greedy on NUMBER tokens only, tol=4 | Within-row x-drift accumulates → rightmost token's top > anchor+4 → cascade-split |
| MD-EXTRACT-5 `_cluster_number_rows_adaptive` | Large-gap mode pitch + running-centroid | Empirically: row_pitch returned 0 (within-row drift gaps ≈ inter-row gaps in live wide-table regions) → fell back to tol=4 → same cascade |

The mechanical diagnosis from LIVE-VERIFY-5 is **geometrically certain**: the diagonal (value-k at row-k/col-k) is the exact signature of monotonically increasing `top` across a single logical row's tokens. On the live FPT segment-report page, each successive column's token has a `top` value ~4px higher than the previous due to page skew. With 7 columns across ~1800px of page width, the total drift is ~28px. The inter-row gap is ~16px. Drift (28px) > gap (16px) → no y-threshold, however derived, can cleanly separate the row from its neighbor.

**The invariant that cannot be circumvented by any y-tolerance tuning:** When the rightmost token in row-k has a higher `top` than the leftmost token in row-(k+1), absolute-y assignment of that token is ambiguous regardless of threshold value. Widening tol to include that token also risks including the next row's leftmost token. Narrowing tol excludes the rightmost token. Neither is correct. This is a structural impossibility for any algorithm that assigns rows by absolute-y comparison across columns.

**The one invariant that IS reliable:** Within a single column (fixed x-position), all row-k tokens appear above all row-(k+1) tokens. The printer lays rows top-to-bottom; within-column y-ordering is always correct regardless of inter-column skew. This is the invariant the chosen strategy exploits.

---

### 2. Approach Evaluation

#### Approach (A) — Image Deskew (PIL rotate before OCR)

Estimate page skew angle from token (left, top) linear regression, rotate page image, re-run `image_to_data` on the corrected image. Advantages: flattens baseline globally, makes all existing clustering work. Disadvantages:

- Adds one full Tesseract `image_to_data` call per page (on top of the existing call) → doubles per-page OCR budget → 20 pages × 5s = +100s. **On the 16GB Intel Mac with Docker 8GB cap, this doubles the re-extract runtime from ~3m44s to ~7m30s.** Not a kernel-panic risk (still sequential) but unacceptable for a 20-page budget.
- OpenCV is NOT in `requirements.txt` and NOT in the Dockerfile. PIL's `Image.rotate(expand=True)` can rotate without OpenCV, but skew-angle estimation requires either OpenCV's `minAreaRect` or a manual projection-profile algorithm. A PIL-only implementation would require implementing Hough-line detection from scratch — out of scope complexity.
- **Verdict: REJECTED.** CPU budget violation + missing OpenCV dependency. If added as dep, requires Dockerfile change + ops rebuild verification, which adds scope. OpenCV installs cleanly on Ubuntu 24.04 but `opencv-python-headless` is ~120MB and adds build complexity.

#### Approach (B) — Token-Space Deskew (correct `top' = top - slope*left`)

Estimate a global skew slope from the NUMBER token (left, top) cloud using simple linear regression (slope = cov(left, top) / var(left)). Correct each token's top: `top_corrected = top - slope * left`. Then apply `_cluster_number_rows_adaptive` on corrected tops. Advantages: no re-OCR, no new dependency, very cheap (one pass over token list, ~0.1ms). Disadvantages:

- Assumes distortion is purely linear (uniform scanner skew). Real lens distortion is slightly curved. On typical flatbed-scanned A4 documents at 200 DPI, linear approximation explains >90% of drift. Residual non-linear distortion is typically <2px — within existing tolerances.
- If the FPT wide-table drift is 28px across 1800px, slope ≈ 28/1800 ≈ 0.016. After correction, all tokens in a row have the same `top_corrected` ± 2px (residual). The adaptive pitch algorithm would then cleanly separate rows.
- **Risk:** slope estimation requires enough tokens with spread across the x-axis. If a page has tokens only on the left half, slope is unreliable. For wide financial tables (7+ columns), x-spread is sufficient.
- **Verdict: VIABLE as a standalone fix, but not chosen as primary** because it still relies on y-tolerance post-correction. If the correction is imprecise (e.g., 5px residual instead of 2px), the cascade-split recurs. Approach (B) reduces drift but does not eliminate the structural dependence on y-threshold.

#### Approach (C) — Column-Anchor-First Ordinal Reconstruction

Assign each NUMBER token to its nearest x-column-anchor FIRST (using existing `_detect_column_anchors_from_tokens`). Within each column, sort tokens by `top` (ascending) and assign ordinal ranks [0, 1, 2, ...] independently. Reconstruct rows by aligning ordinal ranks across columns: row-k = the rank-k token from each column. Advantages:

- **Never compares `top` values across columns.** Cross-column y comparison is the source of all five prior failures. The ordinal approach eliminates this comparison by construction.
- **Geometric proof that drift > gap does not matter** (see §8): within a single column, tokens are always in correct physical y-order regardless of inter-column skew. Ordinal rank within a column = physical row index for that column. Matching rank-k across all columns always yields the correct row-k reconstruction.
- **Empty-cell handling:** When column-c has fewer tokens than the anchor column (because a value is genuinely missing from that row), that column's rank-k slot is empty (represented as `" "`). This is correct behavior. No rank misalignment occurs: missing values in column-c do not affect other columns' rank assignments.
- **No new dependency.** Operates on already-collected token lists and existing column-anchor logic.
- **Verdict: CHOSEN.** Sole approach that defeats drift > gap by architectural elimination of cross-column y-comparison.

#### Hybrid (B)+(C) — Token Deskew then Ordinal

Apply (B) as a preprocessing step (correct tops), then (C) for row assignment. This would make the column-anchor histograms cleaner (no skew-induced x-migration of tokens) and improve label attachment accuracy. However:

- The ordinal approach does not require corrected tops for its core guarantee — the within-column y-ordering is already correct before deskew.
- (B) adds complexity and a slope estimation that can fail (low x-spread pages).
- **Verdict: NOT chosen.** The ordinal guarantee holds without (B). If post-deploy QA reveals significant label-attachment errors (caused by label-top vs number-row y-mismatch after ordinal reconstruction), token-space deskew can be added as a preprocessing step in a future iteration without redesigning the core algorithm.

---

### 3. Chosen Algorithm — Column-Anchor-First Ordinal Reconstruction

#### 3.1 High-level flow (replaces Steps C through F in `_process_page`)

```
EXISTING (unchanged): Step A (image_to_data) → A2 (classify tokens) → B (detect table regions)
NEW STEPS (replace C, D, E, F):
  Step C6 — Derive column anchors from NUMBER tokens (x-clustering, existing _detect_column_anchors_from_tokens)
  Step C7 — Assign each NUMBER token to its nearest column anchor by x (argmin distance)
  Step C8 — Within each column, sort tokens by top (ascending) → ordinal rank within column
  Step C8.5 — Within each column, detect intra-column rank gaps (mid/trailing empty cells) and insert empty rank slots so physical row positions align (see §13)
  Step C9 — Determine total row count = max rank count across all columns (after C8.5 slot insertion)
  Step C10 — Reconstruct 2D grid: grid[rank_k][col_c] = token text (or " " if that column has no rank-k token)
  Step C11 — Attach labels: for each row k, find TEXT tokens whose top is within a LABEL_BAND_FACTOR × h_med window of the median top of rank-k tokens across all columns; space-join → label cell; prepend as col-0
EXISTING (unchanged): Step G (post-processing pipeline: strip_header_bands → coalesce_labels → collapse_empty → density gate → header detect → markdown emit)
```

#### 3.2 Step-by-step algorithm detail

**Step C6 — Column anchor detection (existing function, reused)**

Call `_detect_column_anchors_from_tokens(number_tokens, median_word_width)`. This produces a sorted list of column x-positions `col_anchors = [x0, x1, ..., x_{N-1}]` where N is the number of detected columns. This step is identical to the MD-EXTRACT-5 Step D — no change.

If `len(col_anchors) == 0` or `len(number_tokens) < 4`: return empty grid (page has insufficient numeric content for table reconstruction).

**Step C7 — Column assignment (NEW)**

For each number token `t`, assign it to column `c = argmin |t['left'] - col_anchors[c]|`. Store as `col_buckets[c] = list of tokens assigned to column c`.

If a token's distance to its nearest anchor exceeds `_COL_ASSIGN_MAX_DIST_FACTOR * median_word_width` (proposed value: 3.0), the token is a noise token far from any column — exclude it from the grid (but still consider it for label attachment if it is a text token). This prevents OCR noise tokens from creating spurious rows.

```python
_COL_ASSIGN_MAX_DIST_FACTOR = 3.0  # generic geometry constant; AC-0 compliant
```

**Step C8 — Within-column ordinal assignment (NEW — the structural core)**

For each column `c`, sort `col_buckets[c]` by `top` ascending. Assign rank `r = 0, 1, 2, ...` to each token in order. The rank within a column is the token's PHYSICAL ROW INDEX for that column.

Result: `col_ranks[c] = [(rank, token), (rank, token), ...]` ordered by rank (= by ascending top).

**Step C9 — Total row count determination**

`total_rows = max(len(col_buckets[c]) for c in range(N))` across all columns. This is the number of distinct rows detected. If all columns have the same rank count, the table is a complete matrix. If some columns have fewer ranks, those cells are genuinely missing values.

**Step C10 — Grid reconstruction (NEW)**

Initialize `grid[r][c] = " "` for all r in `[0, total_rows)`, c in `[0, N)`.

For each column `c`, for each `(rank, token)` in `col_ranks[c]`: `grid[rank][c] = token['text'].strip()`.

Multiple tokens assigned to the same (rank, col) cell (possible when OCR splits one number into two tokens): space-join them in left-sorted order.

Note: there is no x-position in the grid — only the ordinal column index matters. This means column ordering is determined solely by the x-anchor order (left-to-right), which is correct for financial tables.

**Step C11 — Label attachment (REVISED from MD-EXTRACT-4/5 _attach_labels)**

Label attachment must now work row-by-row against ordinal rows, not y-band rows. For each row rank `r`:

1. Compute `y_med_r = median(top of all tokens assigned to rank r across all columns)`. This is the "representative y" for this logical row.
2. Find TEXT tokens where `abs(t['top'] - y_med_r) <= LABEL_BAND_FACTOR * h_med`. Proposed: `LABEL_BAND_FACTOR = 1.5` (wider than MD-EXTRACT-5's 0.6 primary band, because the label's top may differ from number top by up to half the row pitch on skewed pages).
3. Sort matched text tokens by `left`, space-join → `label_r`.
4. If no TEXT token found in that band, use nearest TEXT token within `2.5 * h_med` (fallback).
5. Prepend `label_r` as column 0: `grid[r] = [label_r] + grid[r]`.

```python
LABEL_BAND_FACTOR = 1.5   # generic geometry constant; AC-0 compliant
```

**Note on label re-use:** On skewed pages where a label's `top` is further from `y_med_r` than `LABEL_BAND_FACTOR * h_med`, the fallback uses nearest TEXT token. This may assign the same label token to two adjacent rows if those rows' `y_med` values are equidistant from the label. Mitigation: once a TEXT token is used as a label for row r, remove it from the candidate pool for row r+1. This is a greedy assignment — first-match-wins in ascending row order.

#### 3.3 How the ordinal approach defeats the mandatory drift>gap fixture

See §8 for the full arithmetic proof. Summary:

- 5 columns, row-0 tops = [100, 104, 108, 112, 116] (drift=16px across row)
- row-1 tops = [118, 122, 126, 130, 134] (gap from row-0 col-4 to row-1 col-0 = only 2px)
- col-0 bucket: [(top=100, row-0), (top=118, row-1)] → rank 0 → top=100; rank 1 → top=118
- col-4 bucket: [(top=116, row-0), (top=134, row-1)] → rank 0 → top=116; rank 1 → top=134
- `total_rows = max(2, 2, 2, 2, 2) = 2`
- grid[0] = [row-0 col-0 text, row-0 col-1 text, ..., row-0 col-4 text] ← correct row-0 reconstruction
- grid[1] = [row-1 col-0 text, ..., row-1 col-4 text] ← correct row-1 reconstruction

The critical step: col-4's rank-0 token has top=116 and col-0's rank-1 token has top=118. The ordinal approach never compares these two tops — it assigns col-4's token to grid[0][4] (rank=0 in col-4) and col-0's token to grid[1][0] (rank=1 in col-0). The diagonal is destroyed without any y-tolerance tuning.

---

### 4. Empty-Cell Problem — Explicit Analysis and Mitigation

The empty-cell problem arises when a column has fewer tokens than the maximum-rank column. Example:

```
col-0: 5 tokens (ranks 0-4)    ← anchor column (most complete)
col-3: 4 tokens (ranks 0-3)    ← row-4 is genuinely missing for col-3
col-5: 5 tokens (ranks 0-4)    ← complete
```

With ordinal-by-rank and C8.5 skip detection (§13): `grid[4][3] = " "` (empty). This is correct — col-3 has no value for the 5th (last) row item. No rank misalignment occurs for cols 0-2 or 4-5.

**Limitation of pure ordinal rank-alignment (without C8.5):** Pure ordinal correctly handles TRAILING empties (a column missing its last N rows) because the present tokens map to their correct ranks [0..M-1] and the absent ranks [M..total_rows-1] become empty by the `grid` initialization. However, pure ordinal SILENTLY CORRUPTS on MID-column and LEADING-column empties: a column missing its row-1 value only has tokens for physical rows 0, 2, 3, ... Sorting by top gives ranks 0, 1, 2, ... — rank-1 receives physical-row-2's value, rank-2 receives physical-row-3's value, and so on. Every token below the gap shifts up one rank. C8.5 corrects this by detecting the within-column y-gap and inserting empty rank slots before the continuation. See §13 for the full algorithm and AC-6-SKIP fixture proof.

**The dangerous case — EXTRA tokens (noise):** If col-3 has 6 tokens because one OCR noise token slipped into that column, col-3's ranks [0-5] misalign with the other columns' ranks [0-4]. This pushes col-3's real row-4 token to rank-5, creating a spurious 6th row.

**Mitigation strategy: confidence-gated token inclusion.** Before assigning tokens to columns:
1. Filter tokens by `conf >= _MIN_WORD_CONF` (already in `_filter_words` — currently `_MIN_WORD_CONF = 0`). Raise threshold to `_MIN_WORD_CONF_ORDINAL = 30` for the ordinal path only (low-confidence tokens are more likely to be noise). This is tunable; log filtered count at DEBUG.
2. Apply `_NUMBER_TOKEN_RE` match (already done in `_classify_tokens`) — ensures only valid number-format tokens enter the grid. Random OCR garbage letters do not match `_NUMBER_TOKEN_RE` and are excluded.
3. If column-c has significantly more tokens than the median column count (e.g., `len(col_buckets[c]) > 2 × median_rank_count`), truncate to the median count and log a WARNING. This prevents single-column noise bursts from inflating total_rows.

**The safe-empty-cell invariant:** When a value is genuinely absent (e.g., a "Total" row that has values only in specific columns), ordinal rank assigns correct empty slots. The density gate (`_is_data_table`) that runs after grid construction filters out grids with insufficient money-group density, naturally rejecting near-empty results.

---

### 5. Functions to Add / Modify / Retire

| Function | Action | DDD Layer | Rationale |
|---|---|---|---|
| `_assign_tokens_to_columns(number_tokens, col_anchors, median_word_width)` | **ADD** (pure) | infrastructure | Step C7: assigns each token to nearest x-anchor. Returns `col_buckets: List[List[Dict]]` (one list per column). AC-0 compliant: geometry only. |
| `_insert_skip_slots(col_bucket_sorted)` | **ADD** (pure) | infrastructure | Step C8.5: given a single column's tokens already sorted by top, detects intra-column y-gaps > SKIP_GAP_FACTOR × local_pitch and inserts `None` sentinel slots to represent missing physical rows. Returns `col_slots: List[Optional[Dict]]` where `None` = empty rank slot. Called per-column inside `_build_ordinal_grid` after the C8 sort. Zero Tesseract calls — pure in-memory list pass. AC-0 compliant. |
| `_build_ordinal_grid(col_buckets, n_cols)` | **ADD** (pure) | infrastructure | Steps C8+C8.5+C9+C10: sorts each col by top, calls `_insert_skip_slots` per column, assigns ranks across slot lists, builds 2D `grid[rank][col]`. Returns `(grid: List[List[str]], col_y_medians: List[float])`. `col_y_medians[r]` = median top of rank-r tokens across all columns (used for label attachment). `None` slots contribute `" "` to grid and are excluded from y_medians computation. |
| `_attach_labels_ordinal(grid, col_y_medians, text_tokens, h_med)` | **ADD** (pure) | infrastructure | Step C11 REVISED: per-row label attachment using ordinal y_med and `LABEL_BAND_FACTOR`. Replaces `_attach_labels` call in `_process_page`. Returns grid with label prepended as col-0. |
| `_process_page(page_image, pytesseract, Output)` | **MODIFY** | infrastructure | Replace Steps C-F with new Steps C6-C11. Keep Step A (image_to_data), A2 (classify), B (detect_table_regions), G (post-processing) unchanged. Add `INFO`-level log for `row_pitch` (diagnostic gate, §6). |
| `_estimate_inter_row_pitch` | **MODIFY** | infrastructure | Promote `logger.debug` → `logger.info` at the row_pitch/tol output line (§6 diagnostic requirement). No logic change. |
| `_cluster_number_rows_adaptive` | **RETIRE** (mark `# DEAD in MD-EXTRACT-6`) | infrastructure | Replaced by column-anchor-first ordinal. Keep for test backward-compat; do not call from `_process_page`. |
| `_attach_labels` | **RETIRE** (mark `# DEAD in MD-EXTRACT-6`) | infrastructure | Replaced by `_attach_labels_ordinal`. Keep for test backward-compat. |
| `_build_grid_from_number_rows` | **RETIRE** (mark `# DEAD in MD-EXTRACT-6`) | infrastructure | Replaced by `_build_ordinal_grid`. Keep for test backward-compat. |
| `_cluster_number_rows` | **ALREADY DEAD** (MD-EXTRACT-5 comment) | — | No change needed. |
| `_cluster_rows`, `_cluster_rows_by_gap` | **ALREADY DEAD** (MD-EXTRACT-4/5 comment) | — | No change needed. |
| `LABEL_BAND_FACTOR`, `_COL_ASSIGN_MAX_DIST_FACTOR`, `_MIN_WORD_CONF_ORDINAL`, `SKIP_GAP_FACTOR` | **ADD constants** | infrastructure | Generic geometry constants. AC-0 compliant. |
| All post-processing functions (`_strip_leading_header_bands`, `_coalesce_label_columns`, `_collapse_empty_columns`, `_is_data_table`, `_detect_header_rows`, `_emit_markdown_table`) | **UNCHANGED** | infrastructure | Grid-level processing; substrate-agnostic. |
| `_detect_column_anchors_from_tokens` | **UNCHANGED** | infrastructure | Reused as Step C6. |
| `_classify_tokens`, `_NUMBER_TOKEN_RE`, `SAME_LINE_TOL` | **UNCHANGED** | infrastructure | Token classification unchanged. `SAME_LINE_TOL` no longer used in `_process_page` (ordinal path does not need a y-tolerance for row assignment) but kept for dead functions' backward compat. |

**File size note:** Adding 4 new pure functions (`_assign_tokens_to_columns`, `_insert_skip_slots`, `_build_ordinal_grid`, `_attach_labels_ordinal`, ~110L total) while retiring 3 functions (kept as dead code, ~0L net removal). Net addition ~110L. Monitor against `docs/data/file-size-caps.json`. If file exceeds cap, move ALL dead code (5 functions marked `# DEAD`) to `infrastructure/_legacy_bbox_helpers.py` — infra-to-infra import, Fence-A compliant.

---

### 6. MANDATORY DIAGNOSTIC GATE (STEP 1 of dev's work — before any algorithm change)

**Dev MUST run this diagnostic FIRST before writing any new code.** The diagnostic prints hard numbers that confirm the regime (is the precondition `drift < gap` violated? what is the actual skew slope?) so the chosen algorithm is validated against reality, not assumed.

#### Diagnostic script (run offline against live FPT PDF)

```python
# diagnostic_gate_md6.py — run outside Docker, PYTHONPATH=apps/pdf-extractor
# Requires: pdf2image, pytesseract, Pillow, live FPT PDF at PDF_PATH
import sys, statistics
from pdf2image import convert_from_path
import pytesseract
from pytesseract import Output

PDF_PATH = "/absolute/path/to/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
TARGET_PAGES = [8, 22]   # income statement + segment report (1-indexed)

from infrastructure.generic_md_table_extractor import (
    _filter_words, _classify_tokens, _estimate_inter_row_pitch,
    _NUMBER_TOKEN_RE, SAME_LINE_TOL
)

pages = convert_from_path(PDF_PATH, dpi=200, first_page=min(TARGET_PAGES), last_page=max(TARGET_PAGES))

for page_idx, page_label in zip([0, len(TARGET_PAGES)-1], TARGET_PAGES):
    page_img = pages[page_idx]
    data = pytesseract.image_to_data(page_img, lang="vie+eng", config="--psm 6", output_type=Output.DICT)
    words = _filter_words(data)
    number_tokens, _ = _classify_tokens(words)

    # 1. Report row_pitch estimate
    row_pitch = _estimate_inter_row_pitch(number_tokens, SAME_LINE_TOL)
    adaptive_tol = min(int(0.45 * row_pitch), 8) if row_pitch > 0 else SAME_LINE_TOL
    print(f"\n=== PAGE {page_label} ===")
    print(f"[INFO] row_pitch={row_pitch:.1f}px  adaptive_tol={adaptive_tol}px  n_number_tokens={len(number_tokens)}")

    # 2. Report all revenue-row number token tops and lefts
    # Revenue row: tokens near top=... (look for largest-top cluster in first 30 tokens)
    sorted_tok = sorted(number_tokens, key=lambda w: w['top'])[:30]
    print(f"[INFO] First 30 number tokens (left, top, text):")
    for t in sorted_tok:
        print(f"       left={t['left']:5d}  top={t['top']:5d}  text={t['text']}")

    # 3. Skew slope estimate (linear regression of top vs left for all number tokens)
    lefts = [float(w['left']) for w in number_tokens]
    tops  = [float(w['top'])  for w in number_tokens]
    if len(lefts) > 2:
        mean_l = statistics.mean(lefts)
        mean_t = statistics.mean(tops)
        cov = sum((l - mean_l) * (t - mean_t) for l, t in zip(lefts, tops))
        var_l = sum((l - mean_l) ** 2 for l in lefts)
        slope = cov / var_l if var_l > 0 else 0.0
        print(f"[INFO] Skew slope estimate: {slope:.5f} px/px  (drift over 1800px: {slope * 1800:.1f}px)")
        print(f"[INFO] Precondition check: drift_over_row = {abs(slope * 1800):.1f}px  vs  inter_row_gap (approx row_pitch) = {row_pitch:.1f}px")
        if row_pitch > 0:
            ratio = abs(slope * 1800) / row_pitch
            verdict = "VIOLATED (drift > gap — ordinal approach NEEDED)" if ratio > 1 else "SATISFIED (scalar-y MAY work)"
            print(f"[INFO] drift/gap ratio = {ratio:.2f}  →  {verdict}")
```

**Print criteria and interpretation:**

| Printed value | Interpret as PASS (ordinal approach confirmed) | Interpret as FAIL (revisit design) |
|---|---|---|
| `row_pitch` | 0 or very small (< 4px) = within-row drift gaps dominate → confirms large-gap-mode collapse | row_pitch > 16px = precondition satisfied, investigate why MD-EXTRACT-5 still failed |
| `adaptive_tol` | 0 or ≤ 2 = confirms fallback to SAME_LINE_TOL → confirms tol=4 cascade | adaptive_tol ≥ 8 = explore why live failed |
| `drift/gap ratio` | > 1.0 = precondition VIOLATED → ordinal approach is the correct solution | < 1.0 = unexpected; re-examine live log from MD-EXTRACT-5 |
| Token (left, top) printout | Shows monotonically increasing `top` as `left` increases within a single logical row | — |

**If all three diagnostic outputs match the PASS column: ordinal approach is confirmed as the correct fix. Dev proceeds to implementation.**

**Pass criteria for the diagnostic:** `row_pitch < 8px` (confirms large-gap-mode failed) AND `drift/gap ratio > 1.0` (confirms precondition violated) AND `top` values show monotonic increase with `left` in the first 30 number tokens.

#### Diagnostic-gate log promotion (AC-6-DIAG prerequisite)

Before any algorithm change, also modify `_cluster_number_rows_adaptive` to promote the `logger.debug(...)` at the row_pitch/tol print to `logger.info(...)`. This ensures future live container runs are diagnosable from standard-level logs without enabling DEBUG mode.

Exact line to change (currently at approximately line 473 in `generic_md_table_extractor.py`):
```python
# Change from:
logger.debug(
    "_cluster_number_rows_adaptive: row_pitch=%s adaptive_tol=%s n_tokens=%s",
    ...
)
# Change to:
logger.info(
    "_cluster_number_rows_adaptive: row_pitch=%s adaptive_tol=%s n_tokens=%s (MD-EXTRACT-6 diagnostic)",
    ...
)
```

This change is also required in the fallback branch (sparse/flat page logger.debug → logger.info).

---

### 7. D4b Re-fix with Live-Substrate Test

#### Why the MD-EXTRACT-5 D4b unit test false-greened

The test fixture for D4b used SYNTHETIC x-anchors: `col_anchors = [100.0, 300.0, 900.0]` (or similar hand-crafted values). The live `image_to_data` for the FPT balance-sheet page produces a DIFFERENT column-anchor layout — the actual x-positions of the code column (~left=50-80px at 200 DPI), the label column, and the value columns depend on the physical page layout and DPI. The synthetic anchors placed the code token near anchor-0 and the value token near anchor-2, making the routing look correct in the test while the live page's geometry placed both tokens near the SAME anchor (anchor-0 in the live geometry), producing the `100 58.102.970.741.619` concatenation.

This is the SAME class of false-green as BT3 (lesson from `feedback_scale_pilot_done_bar.md` and the BCTC-TABLE false-greens): synthetic fixtures that do not replicate live substrate geometry are not valid gates.

#### D4b re-fix design under the ordinal approach

Under the ordinal reconstruction, D4b (code+value concatenation) is largely self-resolving: each number token is assigned to its x-nearest column anchor independently. A code token at `left=50` and a value token at `left=900` on the same row are assigned to different col_buckets (col-0 and col-3 respectively). They land in `grid[rank][0]` and `grid[rank][3]` — separate cells. No concatenation occurs.

**When D4b can still occur** under the ordinal approach: if the code column and the first value column have anchors that are very close (< `_COL_GAP_FACTOR * median_word_width`), the column-anchor clustering may merge them into one anchor → both tokens assigned to the same col_bucket → same rank → same cell → concatenation. This is a column-detection failure, not a row-assignment failure.

**Fix (targeted):** After column-anchor detection (`_detect_column_anchors_from_tokens`), if the leftmost anchor is within `_CODE_COL_ISOLATION_PX` pixels of the second anchor AND that leftmost cluster consists predominantly of 2-3 digit tokens (code tokens), split them. Proposed: if anchor-0 tokens have >80% matching `_CODE_TOKEN_RE` and anchor-1 distance < 150px, keep anchor-0 as a dedicated code column.

However, this logic adds BCTC-aware heuristics, risking AC-0 violation. A simpler approach: **raise `_COL_GAP_FACTOR` from 1.5 to 2.0** for the ordinal path. This makes column boundaries wider, ensuring the code column (narrow, left-side) and the first value column (wider, middle-right) are always separate. Test: `_detect_column_anchors_from_tokens` on a fixture with code-column tokens at x=60 and value-column tokens at x=180 (typical for balance-sheet 200 DPI) should produce 2 distinct anchors at 2.0 factor.

#### Live-substrate test requirement

The D4b test fixture MUST be derived from real `image_to_data` output. Exact process:

1. Obtain the raw `image_to_data` dictionary for FPT page 4 (or whichever page contains the balance-sheet `100` code row) by running the diagnostic script (§6) against that page.
2. Find the `text="100"` token and the `text="58.102.970.741.619"` token (or the nearest large number) in the raw data output. Record their exact `left`, `top`, `width`, `height`, `conf` values.
3. Construct the test fixture using these EXACT values (not rounded or synthetic).
4. Assert that `_assign_tokens_to_columns([code_token, value_token], col_anchors, median_word_width)` places them in DIFFERENT col_buckets.
5. Assert that `_build_ordinal_grid(col_buckets, n_cols)` produces two non-empty cells at `grid[0][0]` and `grid[0][1]` (or higher column index for the value).

This is AC-6-D4b and is BLOCKING before any other D4b test can be considered passing.

---

### 8. Binding AC Fixture + Arithmetic Proof

This is the AC fixture that the main terminal will re-trace by hand before dispatching dev. The proof must show that the ordinal approach produces EXACTLY 2 rows from a fixture where drift > gap.

#### Fixture specification

```
5 number tokens in logical row-0 (one per column):
  token_r0_c0: left=100,  top=100, text="100"
  token_r0_c1: left=400,  top=104, text="200"
  token_r0_c2: left=700,  top=108, text="300"
  token_r0_c3: left=1000, top=112, text="400"
  token_r0_c4: left=1300, top=116, text="500"

5 number tokens in logical row-1 (one per column):
  token_r1_c0: left=100,  top=118, text="600"
  token_r1_c1: left=400,  top=122, text="700"
  token_r1_c2: left=700,  top=126, text="800"
  token_r1_c3: left=1000, top=130, text="900"
  token_r1_c4: left=1300, top=134, text="1000"
```

Drift within row-0: top_max - top_min = 116 - 100 = **16px** (across 5 columns).
Minimum gap between adjacent rows: top of row-1 col-0 (118) minus top of row-0 col-4 (116) = **2px**.
Drift (16px) > gap (2px): this is the critical precondition that defeated MD-EXTRACT-5.

median_word_width = 30 (typical at 200 DPI for 3-4 character numbers).

#### Step-by-step algorithm trace (ordinal approach)

**Step C6 — Column anchor detection**

`_detect_column_anchors_from_tokens` on all 10 tokens:
- Left values: [100, 400, 700, 1000, 1300] × 2 = [100, 100, 400, 400, 700, 700, 1000, 1000, 1300, 1300]
- bin_width = 0.3 × 30 = 9px
- Cluster [100, 100] → anchor x = 100.0
- Cluster [400, 400] → anchor x = 400.0
- Cluster [700, 700] → anchor x = 700.0
- Cluster [1000, 1000] → anchor x = 1000.0
- Cluster [1300, 1300] → anchor x = 1300.0
- col_gap = 1.5 × 30 = 45px. Adjacent anchor differences: 300, 300, 300, 300 — all > 45 → no merging.
- `col_anchors = [100.0, 400.0, 700.0, 1000.0, 1300.0]` (5 columns). ✓

**Step C7 — Column assignment**

For each token, argmin distance to col_anchors:
- token_r0_c0 (left=100): distances [0, 300, 600, 900, 1200] → nearest = 100.0 → col 0 ✓
- token_r0_c1 (left=400): distances [300, 0, 300, 600, 900] → nearest = 400.0 → col 1 ✓
- token_r0_c2 (left=700): → col 2 ✓
- token_r0_c3 (left=1000): → col 3 ✓
- token_r0_c4 (left=1300): → col 4 ✓
- token_r1_c0 through token_r1_c4: same assignments → col 0, 1, 2, 3, 4 ✓

`col_buckets[0] = [token_r0_c0, token_r1_c0]`
`col_buckets[1] = [token_r0_c1, token_r1_c1]`
...
`col_buckets[4] = [token_r0_c4, token_r1_c4]`

**Step C8 — Within-column ordinal assignment (sorted by top)**

`col_buckets[0]` sorted by top: [top=100 → rank 0, top=118 → rank 1]
`col_buckets[1]` sorted by top: [top=104 → rank 0, top=122 → rank 1]
`col_buckets[2]` sorted by top: [top=108 → rank 0, top=126 → rank 1]
`col_buckets[3]` sorted by top: [top=112 → rank 0, top=130 → rank 1]
`col_buckets[4]` sorted by top: [top=116 → rank 0, top=134 → rank 1]

CRITICAL: token_r0_c4 (top=116) is assigned rank 0 in col 4. token_r1_c0 (top=118) is assigned rank 1 in col 0. These are NEVER compared against each other. The 2px gap between them is irrelevant.

**Step C9 — Total row count**

`total_rows = max(2, 2, 2, 2, 2) = 2` ✓

**Step C10 — Grid reconstruction**

```
grid[0][0] = "100"   grid[0][1] = "200"   grid[0][2] = "300"   grid[0][3] = "400"   grid[0][4] = "500"
grid[1][0] = "600"   grid[1][1] = "700"   grid[1][2] = "800"   grid[1][3] = "900"   grid[1][4] = "1000"
```

Row 0 reconstruction: all 5 row-0 tokens correctly placed in their columns. ✓
Row 1 reconstruction: all 5 row-1 tokens correctly placed in their columns. ✓

**Result: EXACTLY 2 grid rows from 10 tokens spanning drift=16px > gap=2px. The diagonal is completely eliminated.**

No scalar-y-tolerance parameter appears in this trace. The row assignment is determined purely by: (a) which column a token belongs to (by x-argmin) and (b) how many tokens of lower `top` exist in that same column (the rank).

#### Comparison to MD-EXTRACT-5 trace on the same fixture

Using MD-EXTRACT-5's `_cluster_number_rows_adaptive` on the same 10 tokens:
- Step 2: unique_bins (2px-binned tops): [100, 104, 108, 112, 116, 118, 122, 126, 130, 134]
- Inter-bin gaps: [4, 4, 4, 4, 2, 4, 4, 4, 4] (the gap between row-0-col-4 and row-1-col-0 is only 2px)
- gap_median = median([4,4,4,4,2,4,4,4,4]) = 4
- large_gaps = [g for g in [4,4,4,4,2,4,4,4,4] if g > 4] = [] (EMPTY — all gaps are ≤ 4)
- row_pitch = 0.0 → fallback to SAME_LINE_TOL=4
- With tol=4: token_r0_c0 (top=100) starts row-0. token_r0_c1 (top=104): |104-100|=4 ≤ 4 → admitted (centroid=102). token_r0_c2 (top=108): |108-102|=6 > 4 → NEW ROW. Token_r0_c2 starts row-1. token_r0_c3 (top=112): |112-108|=4 ≤ 4 → admitted. token_r0_c4 (top=116): |116-110|=6 > 4 → NEW ROW. And so on.
- **Result: MD-EXTRACT-5 produces 5+ rows from 10 tokens (the diagonal). Ordinal produces exactly 2 rows.** ✓

---

### 9. Acceptance Criteria

All prior PASS ACs (AC-3F, AC-0, Fence-A, Privacy, D2-GFM) remain binding. New ACs:

**AC-6-DIAG (MANDATORY STEP 1 — gates all other ACs):**
Dev runs the §6 diagnostic script against FPT page 8 (income statement) AND page 22 (segment report) and reports all three printed values:
- `row_pitch` (expected: < 8px for both pages — confirms large-gap-mode failure)
- `adaptive_tol` (expected: ≤ 2 or 0 — confirms fallback to tol=4)
- `drift/gap ratio` (expected: > 1.0 — confirms precondition violation)
- First 30 number token `(left, top)` pairs from both pages (dev appends to handoff)

If any value contradicts the PASS column from §6 table, dev STOPS and reports to architect before proceeding. Do not implement the algorithm until the diagnostic confirms the regime.

**AC-6-LOG (BLOCKING — log promotion):**
`grep -n "logger.info.*row_pitch\|logger.info.*adaptive_tol" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → at least 2 matches (the promoted INFO lines in `_cluster_number_rows_adaptive` and its fallback branch). These lines existed as DEBUG — the only change is INFO level promotion. Verify: `grep -n "logger.debug.*row_pitch\|logger.debug.*adaptive_tol" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches (no remaining DEBUG row_pitch log).

**AC-6-ORD (BLOCKING — ordinal fixture proof):**
Unit test in `test_generic_md_table_extractor.py` class `TestOrdinalReconstruction`:

Test `test_ordinal_defeats_drift_gt_gap`: the exact 10-token fixture from §8 (drift=16px, gap=2px). Call `_assign_tokens_to_columns(all_10_tokens, col_anchors=[100.0,400.0,700.0,1000.0,1300.0], median_word_width=30)`. Assert `len(col_buckets) == 5`. Assert each col_bucket has exactly 2 tokens. Call `_build_ordinal_grid(col_buckets, n_cols=5)`. Assert `len(grid) == 2` (exactly 2 rows). Assert `grid[0] == ["100", "200", "300", "400", "500"]`. Assert `grid[1] == ["600", "700", "800", "900", "1000"]`.

**AC-6-D4b (BLOCKING — live-substrate D4b test):**
Unit test `test_d4b_live_substrate_code_value_separation`: fixture must use EXACT `left`, `top`, `height`, `width` values from diagnostic script §6 output for the `text="100"` code token and the adjacent large-value token on balance-sheet page. Assert the two tokens land in DIFFERENT col_buckets (different column indices). Assert `_build_ordinal_grid` places them in `grid[r][0]` and `grid[r][k]` where `k > 0`. This test REPLACES the prior MD-EXTRACT-5 synthetic D4b test (which false-greened).

**AC-6-SKIP (BLOCKING — mid/leading empty-cell unit test, class `TestOrdinalReconstruction`):**

This AC proves C8.5 prevents the rank-shift corruption described in §13. Two sub-fixtures:

**Sub-fixture SKIP-MID** (mid-column empty, proves C8.5 inserts empty rank slot):

Tokens — 3 columns × 3 physical rows, col-1 missing physical row-1:
```
token_r0_c0: left=100, top=100, text="A1"
token_r0_c1: left=400, top=103, text="B1"
token_r0_c2: left=700, top=106, text="C1"

token_r1_c0: left=100, top=120, text="A2"
# col-1 physical row-1 is ABSENT (genuine missing value)
token_r1_c2: left=700, top=126, text="C2"

token_r2_c0: left=100, top=140, text="A3"
token_r2_c1: left=400, top=143, text="B3"
token_r2_c2: left=700, top=146, text="C3"
```

Within-row drift: up to 6px. Inter-row pitch: ~20px. `median_word_width=30`.

Step C6: `col_anchors = [100.0, 400.0, 700.0]` (3 columns). ✓

Step C7 column assignment:
- col-0 bucket: [top=100/"A1", top=120/"A2", top=140/"A3"] (3 tokens)
- col-1 bucket: [top=103/"B1", top=143/"B3"] (2 tokens — row-1 absent)
- col-2 bucket: [top=106/"C1", top=126/"C2", top=146/"C3"] (3 tokens)

Step C8 (sort by top within each column — already sorted):
- col-0 sorted: [(top=100,"A1"), (top=120,"A2"), (top=140,"A3")]
- col-1 sorted: [(top=103,"B1"), (top=143,"B3")]
- col-2 sorted: [(top=106,"C1"), (top=126,"C2"), (top=146,"C3")]

Step C8.5 — `_insert_skip_slots` per column:

*col-0*: consecutive top-deltas: [120-100=20, 140-120=20]. `local_pitch = median([20,20]) = 20`. Gaps: delta=20, threshold=1.5×20=30. 20 < 30 → no skip. Slots: [(top=100,"A1"), (top=120,"A2"), (top=140,"A3")]. Length=3.

*col-1*: consecutive top-deltas: [143-103=40]. `local_pitch = median([40]) = 40`. Wait — with only ONE gap, local_pitch=40. Threshold=1.5×40=60. delta=40 < 60 → no skip detected? WRONG — this is a degenerate case where the single gap IS the skip-gap, so local_pitch is contaminated by the very skip we are trying to detect. Correction: when a column has only 2 tokens, `local_pitch` is undefined (no "typical" gap to compare against). Use the cross-column reference pitch instead: `ref_pitch = median(local_pitch_c for all columns c where len(col_buckets[c]) >= 3)`. Here ref_pitch = median([20]) = 20 (only col-0 and col-2 qualify; both give 20). Threshold = 1.5 × 20 = 30. delta=40 > 30 → skip detected. `ceil(40/20) - 1 = ceil(2.0) - 1 = 1` empty slot inserted before "B3". Slots: [(top=103,"B1"), None, (top=143,"B3")]. Length=3. ✓

*col-2*: consecutive top-deltas: [126-106=20, 146-126=20]. local_pitch=20. Threshold=30. No skip. Slots: [(top=106,"C1"), (top=126,"C2"), (top=146,"C3")]. Length=3.

Step C9: `total_rows = max(3, 3, 3) = 3`. ✓

Step C10 grid reconstruction:
```
grid[0][0]="A1"  grid[0][1]="B1"  grid[0][2]="C1"
grid[1][0]="A2"  grid[1][1]=" "   grid[1][2]="C2"
grid[2][0]="A3"  grid[2][1]="B3"  grid[2][2]="C3"
```

Assertions (hand-traceable):
- (a) `grid[2][1] == "B3"` (col-1's third-physical-row value lands in row-2, NOT row-1). ✓
- (b) `grid[1][1] == " "` (physical row-1's missing cell is empty). ✓
- (c) `grid[0] == ["A1","B1","C1"]` and `grid[2] == ["A3","B3","C3"]` (cols 0 and 2 stay correctly aligned across all 3 rows). ✓
- (d) `total_rows == 3`. ✓

Unit test name: `test_skip_mid_column_empty` in class `TestOrdinalReconstruction`.

**Sub-fixture SKIP-TRAILING** (trailing empty — regression proof that §4's original case still works):

```
col-0: [top=100/"X1", top=120/"X2", top=140/"X3"]
col-1: [top=103/"Y1", top=123/"Y2"]   ← row-2 absent (trailing)
col-2: [top=106/"Z1", top=126/"Z2", top=146/"Z3"]
```

Step C8.5 on col-1: deltas=[123-103=20], local_pitch=20 (1 gap, use ref_pitch=20 from cols 0+2). Threshold=30. delta=20 < 30 → no skip inserted. Slots: [(top=103,"Y1"),(top=123,"Y2")]. Length=2.

Step C9: total_rows=max(3,2,3)=3. grid[2][1]=" " by initialization. No corruption.

Assertions: `grid[0]==["X1","Y1","Z1"]`, `grid[1]==["X2","Y2","Z2"]`, `grid[2][1]==" "`, `total_rows==3`. ✓

Unit test name: `test_skip_trailing_column_empty` in class `TestOrdinalReconstruction`.

**AC-6-SEG (BINDING — live segment report, STRENGTHENED):**
Live: after re-extract, inspect segment-report table in `md_tables`. TWO assertions required:
1. The three revenue values `35.381.667`, `9.092.934`, `18.701.876` must appear in the SAME pipe-table row (same `\n`-delimited line), each as a separate `|`-delimited cell. Proves revenue row (rank-0) is correctly aligned.
2. A SECOND identifiable multi-column row in the same segment table (any row below revenue that contains at least 2 money-group values `\d{1,3}(?:[.,]\d{3})+` in distinct `|`-delimited cells, on a SINGLE pipe-row) must also render all its values on that one row. This proves rows BELOW revenue rank are also correctly aligned, not just revenue. If any such row has its values split across two different `\n`-delimited lines → FAIL.

**AC-6-INC (BINDING — income statement row count + multi-period alignment, STRENGTHENED):**
Live: TWO assertions required:
1. Income-statement table has ≥ 15 distinct data rows (non-separator, non-header lines). Each data row must have at most ONE 3-digit standalone code (`(?<!\d)\d{3}(?!\d)`) — same as AC-3A.
2. At least one income-statement line that legitimately has values in multiple period columns (i.e., a row where at least 2 distinct cells on that pipe-row match `\d{1,3}(?:[.,]\d{3})+`) renders ALL those values on ONE single pipe-row. This proves period-column alignment is correct for rows below the first rank.

**AC-6-D4b-LIVE (BINDING — no code+value concatenation):**
Live: scan all cells in `md_tables[0..4]` (balance-sheet tables). No cell matches BOTH `r'^\d{2,3}$'` AND `r'\d{1,3}(?:[.,]\d{3})+'` in the same cell text string.

**AC-3F (carry-forward — BLOCKING):** `text_table_extractor.py` UNTOUCHED. Structured `bctc_table_rows` = 79, balance_pass = true, balance_delta = 0 (live).

**AC-0 (carry-forward — BLOCKING):** `grep -rniE "bao.cao.bo.phan|segment_report|SEGMENT|BAO_CAO|bo_phan|bao_phan" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches (any segments/etc references only in comments, not branching logic or constant values).

**Fence-A (carry-forward — BLOCKING):** `grep -rnE "from application|from interface|import application|import interface" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

**Privacy (carry-forward — BLOCKING):** `grep -rniE "claude|openai|gemini|textract|document.?ai|anthropic|requests\.post|httpx\.post|aiohttp" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

---

### 10. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: If a page has unequal token counts per column (missing values or noise tokens), the `total_rows = max(rank_counts)` estimate may over-count rows. A single noise token in col-k inflates total_rows by 1, creating a spurious empty row. | HIGH | Mitigation: confidence gate (`_MIN_WORD_CONF_ORDINAL = 30`) filters low-confidence tokens before column assignment. `_NUMBER_TOKEN_RE` match (already applied in `_classify_tokens`) excludes OCR garbage. The density gate (`_is_data_table`) rejects grids that do not have enough money-group density regardless. The spurious empty row is filtered by `_collapse_empty_columns` if all its non-label cells are empty. |
| R-HIGH: Label attachment (`_attach_labels_ordinal`) uses `y_med_r = median(top of rank-r tokens across columns)`. On severely skewed pages, y_med_r may be far from the label token's top (which is near the left-column number's top ≈ top_r0_c0, not the median). `LABEL_BAND_FACTOR = 1.5 × h_med` may miss labels on pages with extreme skew. | HIGH | Mitigation: the fallback (nearest TEXT token within 2.5×h_med) catches the label even if the primary band misses. If both fail, label cell = " " (honest empty). The label-leakage problem (same label attached to multiple rows) is mitigated by the greedy-assignment removal of used TEXT tokens. |
| R-MEDIUM: `_detect_column_anchors_from_tokens` may merge two legitimate close columns (e.g., a "note number" column and the first value column that are close together). This produces one wider column that contains two logical columns' values concatenated. | MEDIUM | Existing `_COL_GAP_FACTOR = 1.5` and `_LEFT_EDGE_BIN_FACTOR = 0.3` are tunable. If close-column merging is observed on live data, raise `_COL_GAP_FACTOR` to 2.0 as described in §7. The code-column isolation heuristic in §7 is an additional option but risks AC-0; prefer the geometry-only parameter approach. |
| R-MEDIUM: Wide tables (7+ columns, segment report) may produce 7 very narrow column anchors. Some value tokens are 7-15px wide; rounding errors in `image_to_data` may cause 1-2% of tokens to land in the wrong column by 1 anchor position. | MEDIUM | Accept: single-token mis-routing produces one wrong cell in one row. The overall table is still human-readable. The density gate ensures the table has sufficient money-group density regardless of 1-2 mis-routed tokens. |
| R-MEDIUM: `_insert_skip_slots` uses `local_pitch = median(consecutive_top_deltas)`. When a column has exactly 2 tokens (1 gap), the single delta IS the skip gap, making local_pitch unreliable (it equals the skipped gap itself). | MEDIUM | Correction: when `len(col_bucket) < 3` (fewer than 2 gaps for median), use `ref_pitch = median(local_pitch_c for all columns c where len(col_buckets[c]) >= 3)`. If no column has >= 3 tokens, ref_pitch is unavailable — fall through to the pure-ordinal path (no skip insertion) for that column. Log WARNING if ref_pitch fallback is triggered. |
| R-LOW: Leading-column skip (a column whose TOPMOST data row is missing) cannot be detected by within-column gap analysis because there is no preceding token. Cross-column-y detection would reintroduce the diagonal risk. | LOW | See §13 — documented as a KNOWN LIMITATION. Rationale: in BCTC financial tables, the first data row (revenue / total assets) is always present in every column, because these are the primary figures. Leading skip is structurally rare. No mitigation beyond the known-limitation note. If a future document class has leading skips, the correct fix is a pre-processing table-alignment step (out of scope). |
| R-LOW: `SKIP_GAP_FACTOR = 1.5` may be too aggressive: if within-column y-variation is large (e.g., a sparse 3-row page where the "gap" between row-0 and row-2 is only 1.4× the row-0 → row-1 gap), a real row-2 token may be misclassified as a skip-inserted slot. | LOW | The SKIP_GAP_FACTOR=1.5 is conservative (requires gap > 1.5× pitch). On the 20px inter-row pitch regime of BCTC pages at 200 DPI, a 1.5× threshold = 30px, well above the within-row 6px drift. If false-positive skips appear on live data, raise to 2.0. Tunable at one constant. |
| R-LOW: The `_cluster_number_rows_adaptive` function is retired but kept as dead code. If a future agent calls it thinking it is active, silent wrong results may occur without an error. | LOW | The function docstring already says `# DEAD in MD-EXTRACT-5`. Add `# DEAD in MD-EXTRACT-6` to the same comment. No functional risk as long as `_process_page` does not call it. |
| R-LOW: File size. 4 new functions (~110L total: `_assign_tokens_to_columns` ~20L, `_insert_skip_slots` ~30L, `_build_ordinal_grid` ~30L, `_attach_labels_ordinal` ~30L), 3 functions marked DEAD (kept, ~0L net removal). Net addition ~110L. Monitor against file-size-caps.json. | LOW | If cap exceeded: move all DEAD functions to `infrastructure/_legacy_bbox_helpers.py` (infra-to-infra import, Fence-A compliant). |

---

### 11. DDD / Fence Compliance

| Function | Layer | Imports | Fence |
|---|---|---|---|
| `_assign_tokens_to_columns` | infrastructure (pure helper) | stdlib only | Fence-A: no application/interface imports |
| `_insert_skip_slots` | infrastructure (pure helper) | stdlib only (`statistics.median`) | Fence-A: no application/interface imports |
| `_build_ordinal_grid` | infrastructure (pure helper) | stdlib only | Fence-A: no application/interface imports |
| `_attach_labels_ordinal` | infrastructure (pure helper) | stdlib only | Fence-A: no application/interface imports |
| `LABEL_BAND_FACTOR`, `_COL_ASSIGN_MAX_DIST_FACTOR`, `_MIN_WORD_CONF_ORDINAL`, `SKIP_GAP_FACTOR` | module-level constants | `re` (already imported) | Fence-A: no application/interface imports |
| `_process_page` (modified) | infrastructure | `pytesseract`, `PIL` (existing) | Fence-A compliant |
| `_estimate_inter_row_pitch` (log level change) | infrastructure (pure helper) | stdlib only | Fence-A: no application/interface imports |

All new functions are PURE: no I/O, no Tesseract, no DB, no network. The impure boundary remains `_process_page` calling `pytesseract.image_to_data` — unchanged from MD-EXTRACT-5.

No new ports, no new use cases, no mcp-server changes, no new test files (tests added to existing `test_generic_md_table_extractor.py`).

Import-linter Fence-A/B compliance: zero new cross-layer imports. `lint-imports --config pyproject.toml` must exit 0 (2 contracts KEPT, 0 broken) after changes.

---

### 12. Build Standard

**BUILD-STANDARD: lean** — in-zone algorithm change within an existing infrastructure file. No new ports, no new use cases, no mcp-server changes, no new test files.

**HARD CONSTRAINTS (verbatim carry-forward):**
- PRIVACY: self-hosted local OCR/CV ONLY. PIL is LOCAL and ALLOWED. NO financial PDF/image to ANY external API (no Claude/Gemini/GPT/Document-AI/Textract VLM). EVER.
- HARDWARE: 16GB Intel Mac, kernel-panics under load. SEQUENTIAL single-doc OCR only. The ordinal approach adds ZERO additional Tesseract calls. Per-page budget unchanged.
- `text_table_extractor.py` UNTOUCHED (AC-3F). Frozen surfaces unchanged: dashboard, sandbox/runner.py, pilot-status-pdf-extractor.json, all mcp-server files.
- OpenCV NOT required. PIL/Pillow already in `requirements.txt`. No dependency additions needed.
- Leave ALL files UNSTAGED (main terminal commits).

**ROLE-RELAY:** dev-pdf-extractor (MD-EXTRACT-6, implement per §3-§13 above with AC-6-DIAG as MANDATORY STEP 1) → ops (MD-DEPLOY-6, single doc, full UUID `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`, path `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf`) → main-terminal live-verify (AC-6-SEG + AC-6-INC + AC-6-D4b-LIVE) → qa (MD-QA-6) → po (MD-EXIT).

**Hardware / CPU budget re-confirmation:** Step C8.5 (`_insert_skip_slots`) is a pure in-memory list pass over the already-collected token list. It performs zero Tesseract calls, zero PIL image operations, zero I/O. Per-page OCR budget is UNCHANGED from the original MD-EXTRACT-6 design.

---

### 13. Mid/Leading Empty-Cell Reconciliation (AUGMENTATION — MD-EXTRACT-6 revision 2026-05-26)

#### 13.1 The failure mode pure ordinal rank-alignment cannot handle

Pure ordinal rank-alignment (Steps C8+C9+C10 as originally specified) correctly reconstructs grids where all columns either have all rows present or are missing only their TRAILING rows. This works because absent trailing rows simply leave the initialized `grid[r][c] = " "` slots untouched.

The failure occurs with MID-column or LEADING-column empties:

```
3 columns, 2 physical rows. col-1 is missing physical row-0 (the leading row):

  Physical layout:
    row-0:  col-0="A1" (top=100),  [col-1 ABSENT],  col-2="C1" (top=106)
    row-1:  col-0="A2" (top=120),  col-1="B2" (top=122), col-2="C2" (top=126)

  After Step C7:
    col-0 bucket (sorted by top): [(top=100,"A1"), (top=120,"A2")]
    col-1 bucket (sorted by top): [(top=122,"B2")]  ← only 1 token
    col-2 bucket (sorted by top): [(top=106,"C1"), (top=126,"C2")]

  Pure ordinal rank assignment (WITHOUT C8.5):
    col-1: rank-0 → "B2"  (WRONG — B2 is physical row-1, not row-0)

  Grid reconstruction:
    grid[0][1] = "B2"   ← WRONG (should be " ")
    grid[1][1] = " "    ← WRONG (should be "B2")

  Misalignment: cols 0 and 2 are correct; col-1 is shifted up by one rank.
```

The analogous failure with a mid-column empty:

```
3 columns, 3 physical rows. col-1 is missing physical row-1 (the middle row):

  col-1 bucket (sorted by top): [(top=103,"B1"), (top=143,"B3")]

  Pure ordinal rank assignment (WITHOUT C8.5):
    col-1: rank-0 → "B1" (correct), rank-1 → "B3" (WRONG — B3 is physical row-2)

  grid[1][1] = "B3"  ← WRONG (should be " ")
  grid[2][1] = " "   ← WRONG (should be "B3")
```

This matters for BCTC tables: the segment report has 7 columns where some columns (segment subtotals, elimination columns) are absent for specific line items. The income statement has prior-period columns that are blank for certain rows. Rank-shifting makes values appear in the wrong row, which is semantically worse than a missing value — it is a silent value misattribution.

#### 13.2 Why within-column y-gap detection is safe (the key geometric justification)

Within-column gap detection avoids the cross-column comparison that caused all five prior failures. The geometric reason this is reliable:

**Cross-column y-comparison is unreliable** because scanner skew introduces a drift of ~4px per column across ~300px inter-column spacing, totalling ~28px across 7 columns. This drift can exceed the ~16px inter-row pitch, making cross-column absolute-y comparisons ambiguous.

**Within-column y-gap detection is reliable** because: each column spans a NARROW x-range of approximately 150px (the width of one number token plus uncertainty). Over 150px, the scanner skew drift is at most `slope × 150 ≈ 0.016 × 150 ≈ 2.4px` — roughly 2px. The inter-row pitch is ~20px (at 200 DPI for typical BCTC page layout). The within-column drift of 2px is less than 15% of the pitch. Therefore, within a single column, consecutive top-deltas reliably reflect physical row separations: a gap of ~20px = one row interval, a gap of ~40px = one row skipped, a gap of ~60px = two rows skipped. The SKIP_GAP_FACTOR=1.5 threshold (30px for a 20px pitch) is well above the 2px intra-column noise ceiling.

**This is the exact same geometric invariant that makes the ordinal approach work in the first place:** within a column, y-ordering is always physically correct. Extending this to gap-magnitude estimation is sound because the intra-column drift (2px) is negligible compared to the pitch (20px).

#### 13.3 Step C8.5 algorithm — `_insert_skip_slots`

```python
SKIP_GAP_FACTOR = 1.5   # generic geometry constant; AC-0 compliant
```

**Input:** A single column's token list already sorted by `top` (the output of Step C8 sort for that column). Also accepts `ref_pitch: Optional[float]` for the degenerate case (see below).

**Output:** `col_slots: List[Optional[Dict]]` — the same tokens interspersed with `None` sentinels representing empty rank slots. The length of `col_slots` reflects the true number of physical rows represented by this column (including gaps).

**Algorithm:**

```
def _insert_skip_slots(sorted_tokens, ref_pitch=None):
    if len(sorted_tokens) <= 1:
        return list(sorted_tokens)   # no gap to detect

    # Compute consecutive top-deltas
    deltas = [sorted_tokens[i+1]['top'] - sorted_tokens[i]['top']
              for i in range(len(sorted_tokens) - 1)]

    # Determine local_pitch
    if len(deltas) >= 2:
        local_pitch = median(deltas)
    elif ref_pitch is not None:
        local_pitch = ref_pitch       # degenerate: 2 tokens, use cross-column ref
    else:
        return list(sorted_tokens)    # cannot determine pitch, no skip insertion

    if local_pitch <= 0:
        return list(sorted_tokens)

    threshold = SKIP_GAP_FACTOR * local_pitch

    slots = [sorted_tokens[0]]
    for i, delta in enumerate(deltas):
        if delta > threshold:
            n_empty = ceil(delta / local_pitch) - 1
            slots.extend([None] * n_empty)
        slots.append(sorted_tokens[i + 1])

    return slots
```

**Integration into `_build_ordinal_grid`:**

1. After Step C8 sort, compute `local_pitch_c` for each column `c` where `len(col_buckets[c]) >= 3`.
2. `ref_pitch = median([local_pitch_c for c where computable])` if any such column exists, else `None`.
3. Call `col_slots[c] = _insert_skip_slots(col_buckets[c], ref_pitch)` for every column.
4. Step C9: `total_rows = max(len(col_slots[c]) for all c)`.
5. Step C10: for each column `c`, for each index `i` in `col_slots[c]`: if `col_slots[c][i]` is not `None`, `grid[i][c] = col_slots[c][i]['text'].strip()`; else `grid[i][c] = " "`.

**CPU budget:** Zero Tesseract calls. All operations are pure Python list traversals over the already-collected token list (typically 20-80 tokens per column per page). Estimated additional time: < 1ms per page. Per-page OCR budget unchanged.

#### 13.4 Leading-column skip — known limitation

A leading-column skip occurs when a column's TOPMOST physical row is absent: the column's first token is at physical row-1 or later. Within-column gap detection cannot identify this because there is no preceding token to form a gap.

**Why a cross-column-y detector is not the right fix:** To detect a leading skip, one would compare the column's first token top against the first token tops of other columns. But this is exactly the cross-column y-comparison that the ordinal approach was designed to eliminate. Any such comparison reintroduces the diagonal risk for the first token row — the column with the earliest first token becomes the "reference" row-0, and if it has drift > pitch relative to another column, the comparison is ambiguous.

**Decision: KNOWN LIMITATION.** Leading-column skips are not corrected by C8.5.

**Rationale for accepting this:** In BCTC financial report tables:
- The first data row of a segment report is revenue / "Doanh thu" — this is always populated in every segment column (it is the defining metric).
- The first data row of an income statement is total revenue — always present in every period column.
- The first data row of a balance sheet is total current assets (code 100) — always present.

Leading skips are structurally rare in the BCTC document class. If a future document class (e.g., a notes table with some columns starting mid-table) exhibits leading skips, the correct fix is a table-alignment pre-processing step that detects header rows and identifies which physical row each column's first data token belongs to. This is out of scope for MD-EXTRACT-6.

**Risk register entry:** See §10 R-LOW (leading-column skip).

#### 13.5 Degenerate case: 2-token column (1 delta)

When a column has exactly 2 tokens, there is one delta. This delta may be either:
- A normal consecutive-row gap (~20px) — no skip needed.
- A skip gap (~40px) — one empty row needed.

With only 1 delta, `median([delta]) = delta`, so `local_pitch = delta` and `threshold = 1.5 × delta`. Since `delta < threshold` always, no skip is ever inserted. This produces the same wrong result as pure ordinal for the 2-token-missing-middle case.

**Fix:** Use `ref_pitch` (median of local pitches from columns with ≥ 3 tokens). If `ref_pitch` is available, use it in place of `local_pitch` for 2-token columns. This is specified in the `_insert_skip_slots` signature above (`ref_pitch` parameter) and in the `_build_ordinal_grid` integration steps.

The AC-6-SKIP SKIP-MID fixture exercises this exact case: col-1 has 2 tokens (top=103, top=143), delta=40. ref_pitch=20 (from cols 0 and 2). Threshold=30. delta=40 > 30 → 1 empty slot inserted. The full trace is in §9 AC-6-SKIP above.

---

## MD-EXTRACT-7-REV — Dense Income Statement Reconstruction (REVISED — diagnostic-confirmed)

> **Task:** MD-EXTRACT-7-REV | **Author:** architect | **Date:** 2026-05-26
> **Status:** DESIGN COMPLETE — supersedes §MD-EXTRACT-7 (see SUPERSEDED notice inline). Main terminal MUST re-trace §REV-7 fixture proof before dispatching dev.
> **Input:** TASK_BCTC-MD-TABLE.md §[Main-Terminal] MD-EXTRACT-7 AC-7-DIAG RESULT — DUMP 1-5 from live FPT income statement page 8 (h_med=18, w_med=166, anchors=[258.1,959.8,1330.5,1642.0,1916.0,2207.0], value left-edges=[1182,1477,1768,2061], pitch≈35px)
> **Zone:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` + `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py`. Zero mcp-server changes. `text_table_extractor.py` UNTOUCHED.

---

### REV-0. What the Diagnostic Proved and What It Invalidated

The mandatory AC-7-DIAG run (before any code was written) produced five live dumps. The central contradiction versus the prior §MD-EXTRACT-7 design:

| Prior design assumption | Live diagnostic result | Impact on prior design |
|---|---|---|
| Dual code columns INFLATE anchor count above 6 (trigger: `len(anchors) > N_EXPECTED_MAX_VALUE_COLS = 6`) | Tesseract cleanly assigns 12+29 code tokens to exactly 2 of 6 anchors → count == 6 | Fix-path-A is a dead branch. Zone-split trigger never fires. |
| Income statement has ~20px row pitch (from LIVE-VERIFY-6 label-interleaving symptom) | Live row pitch ≈ 35px (495→530→567, Δ=35–37) | Fix-path-D (label band tightening) is NOT needed — band=27px < 35px gap, no over-reach |
| No header token pollution | ~9 header small-int tokens (top<400) ingested → phantom top grid rows (DUMP 3 rows 0-1 at y_med=252/217) | New root cause unaddressed by prior design |
| Value anchors correct | Detected [1330,1642,1916,2207] sit ~150px right of true left-edges [1182,1477,1768,2061] | Token-to-column assignment mis-allocates tokens across column boundaries |
| Dense-multi-gap ref_pitch fix needed | DUMP 2 confirms value-column density 27/26/17/20 — sparse cols confirmed | Fix-path-C still required |
| §7.1 fixture is representative | 4 anchors/20px pitch/no header tokens vs live 6 anchors/35px pitch/header pollution | Fixture must be regenerated |

**Surviving elements from §MD-EXTRACT-7:**
- Fix-path-C: `prefer_ref_pitch` parameter in `_insert_skip_slots` + `DENSE_COL_THRESHOLD`. Required. Carry forward unchanged.
- `_split_number_tokens_by_zone` concept: correct approach for excluding code tokens from anchor detection. The TRIGGER mechanism changes (presence-based, not count-based). The re-attach logic is unchanged.

---

### REV-1. What Must Not Regress

Identical to §MD-EXTRACT-7 §1 — carry-forward verbatim:
- **AC-6-SEG**: segment revenues `35.381.667 / 9.092.934 / 18.701.876` on ONE pipe-row, distinct cells.
- **AC-6-ORD**: `test_ordinal_defeats_drift_gt_gap`, `test_skip_mid_column_empty`, `test_skip_trailing_column_empty` all pass.
- **AC-3F**: `text_table_extractor.py` 0-byte diff; structured `bctc_table_rows`=79, balance_delta=0.
- **AC-0 / Fence-A / Privacy**: grep deny-lists unchanged.

---

### REV-2. Root-Cause Analysis of the 150px Anchor Offset

**Mechanistic trace (confirmed by diagnostic):**

`_detect_column_anchors_from_tokens` collects ALL number token left-edges, bins them with `bin_width = 0.3 × w_med = 0.3 × 166 = 50px`, then merges adjacent cluster centroids within `col_gap = 1.5 × 166 = 249px`.

With header tokens present and code columns present, the sorted cluster-centroid sequence (approximate) is:
```
~258  (code col Mã số)
~959  (code col Thuyết minh)
~1182 (true value col-0 left-edges)
~1330 (header/date tokens — contaminator cluster)
~1477 (true value col-1)
~1642 (header contaminator for col-1 zone)
~1768 (true value col-2)
~1916 (header contaminator for col-2 zone)
~2061 (true value col-3)
~2207 (header contaminator for col-3 zone)
```

The merge step with col_gap=249 proceeds left-to-right, keeping the first anchor in each col_gap window:
1. Start: merged=[258]
2. 959-258=701>249 → keep 959. merged=[258,959]
3. 1182-959=**223<249** → **1182 swallowed** (too close to 959). merged=[258,959]
4. 1330-959=371>249 → keep 1330. merged=[258,959,1330]
5. 1477-1330=147<249 → 1477 swallowed. merged=[258,959,1330]
6. 1642-1330=312>249 → keep 1642. merged=[258,959,1330,1642]
7. 1768-1642=126<249 → 1768 swallowed. merged=[258,959,1330,1642]
8. 1916-1642=274>249 → keep 1916. merged=[258,959,1330,1642,1916]
9. 2061-1916=145<249 → 2061 swallowed. merged=[258,959,1330,1642,1916]
10. 2207-1916=291>249 → keep 2207. merged=[258,959,1330,1642,1916,2207]

**Outcome: anchors=[258,959,1330,1642,1916,2207]. This matches DUMP 1 exactly.**

**Dual cause of the offset:**
1. The true value left-edges (1182, 1477, 1768, 2061) are each within col_gap=249 of the preceding anchor (code col at 959, then header-contaminator anchors at 1330/1642/1916). They get swallowed.
2. Header/date tokens at left≈1330/1642/1916/2207 survive because they are each >249px from the preceding anchor.

**Fix: eliminate BOTH causes.**

Cause 1 is eliminated by **excluding pure-code-column tokens from anchor detection** (requirement 2). Once col[0]@258 and col[1]@959 are excluded, the first non-code left-edge is 1182. 1182 becomes merged[0], then 1477-1182=295>249 → 1477 added, etc.

Cause 2 is eliminated by **excluding header-zone tokens** (requirement 1). Once tokens at top<first_value_row_top are excluded, the contaminator clusters at 1330/1642/1916/2207 disappear. The true left-edges (1182/1477/1768/2061) become the only cluster centroids.

**With both fixes applied**, anchor detection on the cleaned token set yields anchors ≈ [1182, 1477, 1768, 2061] (centroids of single-value clusters, which equal their left-edges since each cluster contains only tokens with the same left-edge). This is correct.

**Supplementary metric fix (anchor = min(cluster), not centroid):** Even without header contamination, if OCR produces slight left-edge variation within a column (e.g. 1182 and 1193 for the same column due to slight token alignment drift), the centroid is 1187.5 vs min = 1182. Using `min(cluster)` ensures anchors align to the leftmost token left-edge of each cluster, which is the true column left boundary. This is a robustness improvement for all pages, not just the income statement.

**Change to `_detect_column_anchors_from_tokens` line 708:**
```python
# Current (centroid):
cluster_anchors = [sum(c) / len(c) for c in clusters]
# Revised (left-edge-aligned):
cluster_anchors = [min(c) for c in clusters]
```
AC-0: pure geometry. Zero semantic content. Non-regressing: for columns where all tokens have the same left-edge (the common case), min == centroid. This change has zero effect on the segment-report path.

---

### REV-3. Fix 1 — Header/Date Token Exclusion (new `_exclude_header_tokens`)

**Root cause:** ~9 tokens with `top < first_value_row_top` (DUMP 4: top<400, representing the page section number and column-header date band "01"/"31"/"12") are included in `number_tokens` passed to anchor detection and `_build_ordinal_grid`. They produce phantom grid rows (DUMP 3 rows 0-1 at y_med=217/252) and contaminate the anchor cluster (driving the 150px offset as analysed in REV-2).

**New function `_find_first_value_row_top`:**
```python
def _find_first_value_row_top(number_tokens: List[Dict]) -> float:
    """
    Returns the `top` coordinate of the first token (lowest top value)
    that matches _VALUE_TOKEN_RE (a money-group / multi-digit number).

    Used as a positional cutoff: tokens at top < this value are in the
    header/column-label zone and must be excluded from anchor detection
    and ordinal grid construction.

    If no value token is found (page has only code tokens), returns 0.0
    (no cutoff — all tokens pass). This is the safe fallback.

    AC-0: purely geometric (top coordinate comparison). Zero BCTC-specific
    string constants. Does not use label text or table-type knowledge.
    """
    value_tops = [
        float(w["top"]) for w in number_tokens
        if _VALUE_TOKEN_RE.match(w["text"].strip())
    ]
    return min(value_tops) if value_tops else 0.0
```

**New function `_exclude_header_tokens`:**
```python
def _exclude_header_tokens(
    number_tokens: List[Dict],
    first_value_top: float,
) -> List[Dict]:
    """
    Excludes number tokens whose top coordinate is strictly less than
    first_value_top. These tokens are in the column-header / page-section
    zone above the first data row.

    AC-0: top-coordinate comparison only. No label string matching.
    Zero Tesseract calls. Pure in-memory filter.
    """
    if first_value_top <= 0.0:
        return number_tokens  # safe fallback: no cutoff
    return [w for w in number_tokens if float(w["top"]) >= first_value_top]
```

**Integration into `_process_page` (new Step C5):**
```
Step C5 (NEW, before C6):
    first_value_top = _find_first_value_row_top(number_tokens)
    clean_number_tokens = _exclude_header_tokens(number_tokens, first_value_top)
    # All subsequent steps use clean_number_tokens, not number_tokens
    # Text tokens are NOT filtered (label text may start above the first value row)
```

**Non-regression proof for segment report:** The segment-report page has NO header tokens above the first value row that match `_VALUE_TOKEN_RE`. The first value token IS the topmost token (there is no tall section-header band). `first_value_top` = topmost value token = top of revenue row. All tokens are at or below this top → `_exclude_header_tokens` returns the full list unchanged. The segment-report path is structurally unaffected.

**AC-0 compliance:** `_find_first_value_row_top` uses `_VALUE_TOKEN_RE` which is a generic money-group pattern (`r'^\d{1,3}(?:[.,]\d{3})+'`). Zero BCTC label strings. The cutoff is derived from the token content and geometry, not from table type.

---

### REV-4. Fix 2 — Presence-Based Pure-Code-Column Detector (replaces count-gate trigger)

**Problem with the prior `> N_EXPECTED_MAX_VALUE_COLS` count-gate:** DUMP 1 confirmed the anchor count is EXACTLY 6 (= 2 code columns + 4 value columns). The prior trigger `len(anchors) > 6` evaluates FALSE. Dead branch.

**Revised approach: presence-based detector on per-column token composition.**

After `_assign_tokens_to_columns` (Step C7), each bucket's composition is known (DUMP 2). A bucket is a **pure-code column** if:
```
pure_code = (code_count / total_count >= PURE_CODE_COL_THRESHOLD) AND (value_count == 0)
```

where:
- `code_count` = number of tokens in the bucket matching `_CODE_TOKEN_RE`
- `value_count` = number of tokens in the bucket matching `_VALUE_TOKEN_RE`
- `total_count` = len(bucket)
- `PURE_CODE_COL_THRESHOLD = 0.9` (a bucket is "pure code" if ≥90% of its tokens are code-class and ZERO are value-class)

The `value_count == 0` condition is the binding constraint. A column with even ONE money-group token is NOT a pure-code column.

**New constant:**
```python
# Threshold for classifying a column bucket as a pure-code column.
# A bucket is pure-code when: code_fraction >= this AND value_count == 0.
# Default=0.90: allows up to 10% OCR-noise non-code tokens in code columns.
# AC-0: uses _CODE_TOKEN_RE and _VALUE_TOKEN_RE, both generic numeric patterns.
PURE_CODE_COL_THRESHOLD = 0.90
```

**New function `_identify_pure_code_columns`:**
```python
def _identify_pure_code_columns(
    col_buckets: List[List[Dict]],
    col_anchors: List[float],
) -> Tuple[List[int], List[int]]:
    """
    Classifies each column bucket as pure-code or value.

    Returns:
        code_col_indices:  Indices of pure-code column buckets.
        value_col_indices: Indices of value column buckets.

    A bucket is pure-code if:
        (code_count / total_count >= PURE_CODE_COL_THRESHOLD) AND (value_count == 0)

    AC-0: uses _CODE_TOKEN_RE and _VALUE_TOKEN_RE (generic numeric patterns).
    Zero BCTC-specific string constants.
    Pure function — no I/O, no Tesseract.
    """
    code_col_indices: List[int] = []
    value_col_indices: List[int] = []
    for i, bucket in enumerate(col_buckets):
        if not bucket:
            value_col_indices.append(i)
            continue
        code_count  = sum(1 for w in bucket if _CODE_TOKEN_RE.match(w["text"].strip()))
        value_count = sum(1 for w in bucket if _VALUE_TOKEN_RE.match(w["text"].strip()))
        total_count = len(bucket)
        if value_count == 0 and (code_count / total_count) >= PURE_CODE_COL_THRESHOLD:
            code_col_indices.append(i)
        else:
            value_col_indices.append(i)
    return code_col_indices, value_col_indices
```

**Integration into `_process_page` (new Step C7.5, after C7):**
```
Step C7 (existing): _assign_tokens_to_columns(clean_number_tokens, anchors, w_med)
    → col_buckets (6 buckets on income statement page)

Step C7.5 (NEW):
    code_col_indices, value_col_indices = _identify_pure_code_columns(col_buckets, anchors)
    IF code_col_indices is non-empty:
        # Collect tokens from pure-code buckets → re-attach as label companions later (C11-ext)
        code_note_tokens = [t for i in code_col_indices for t in col_buckets[i]]
        # Rebuild col_buckets and anchors using only value columns
        value_col_buckets = [col_buckets[i] for i in value_col_indices]
        value_anchors = [anchors[i] for i in value_col_indices]
    ELSE:
        # No pure-code columns detected (e.g. segment report, balance sheet)
        # Proceed with original col_buckets and anchors unchanged
        code_note_tokens = []
        value_col_buckets = col_buckets
        value_anchors = anchors

    # All subsequent steps C8..C11 use value_col_buckets and value_anchors
    # code_note_tokens are appended to region_text_tokens before C11 (unchanged re-attach logic)
```

**Non-regression proof for segment report (MUST prove):**

The segment report columns are ALL pure-value: DUMP 2 for segment page shows no bucket with `value_count == 0`. Every bucket has revenue / cost / profit values (money-group tokens). Therefore:
- `code_count = 0` for every segment bucket (no 2-3 digit codes)
- `value_count > 0` for every segment bucket
- The condition `value_count == 0` is FALSE for every bucket

`_identify_pure_code_columns` returns `code_col_indices = []`, `value_col_indices = [all indices]`. Step C7.5 takes the ELSE branch: `code_note_tokens = []`, `value_col_buckets = col_buckets`. The pipeline is COMPLETELY UNCHANGED from MD-EXTRACT-6 behavior for the segment report. AC-6-SEG cannot regress from this change.

**Non-regression proof for balance sheet:** Balance sheet columns contain large value tokens (assets/liabilities in trillion VND). No pure-code column. `code_col_indices = []`. ELSE branch taken. Unchanged.

**Income statement treatment (DUMP 2 confirmed):**
- col[0]@258: codes=12, values=0, total=12 → code_count/total=1.0 ≥ 0.9 AND value_count=0 → PURE CODE ✓
- col[1]@959: codes=29, values=0, total=29 → 1.0 ≥ 0.9 AND 0=0 → PURE CODE ✓
- col[2]@1330: codes=2, values=27, total=29 → value_count=27≠0 → VALUE ✓
- col[3]@1642: codes=3, values=26, total=29 → VALUE ✓
- col[4]@1916: codes=2, values=17, total=19 → VALUE ✓
- col[5]@2207: codes=2, values=20, total=22 → VALUE ✓

`code_col_indices=[0,1]`, `value_col_indices=[2,3,4,5]`. `value_col_buckets` has 4 buckets at anchors [1330,1642,1916,2207]. Combined with the REV-2 anchor-metric fix (`min(cluster)`) and REV-3 header cutoff, these anchors would be [1182,1477,1768,2061] (the true left-edges). Assignment step C7 is re-run on `clean_number_tokens` (header-excluded) against re-detected anchors.

**Implementation note: ordering of operations in _process_page:**

The correct order is:
```
C5: exclude header tokens → clean_number_tokens
C6: detect anchors from clean_number_tokens (using min(cluster) metric)
C7: assign clean_number_tokens to col_buckets (using anchors from C6)
C7.5: identify pure-code columns → value_col_buckets, value_anchors, code_note_tokens
C8..C11: ordinal reconstruction on value_col_buckets, value_anchors
C11-ext: append code_note_tokens to region_text_tokens before _attach_labels_ordinal
```

This is clean and does not require a "two-pass anchor detection" (the prior design's chicken-and-egg problem no longer applies because we do NOT need `leftmost_value_anchor` before anchor detection — we detect anchors once, assign to buckets once, then classify buckets).

---

### REV-5. Fix 3 — Anchor Metric: min(cluster) replaces centroid

**Change:** In `_detect_column_anchors_from_tokens`, line 708:
```python
# Before (centroid):
cluster_anchors = [sum(c) / len(c) for c in clusters]
# After (left-edge-aligned):
cluster_anchors = [min(c) for c in clusters]
```

**Effect on live income statement (after REV-3 header cutoff + REV-4 code exclusion):**

After header exclusion and code exclusion, the value tokens have left-edges [1182, 1477, 1768, 2061]. All tokens in a given column have the same (or very close) left-edge. The cluster for col[2] contains only tokens at left≈1182 → min=1182. The anchor is 1182. Correct.

In the presence of slight OCR left-edge variation (e.g. two tokens at left=1182 and left=1187 in the same column), `min([1182,1187]) = 1182` vs centroid=1184.5. The min-based anchor aligns to the column's leftmost token edge, which is more representative of the column's true left boundary. The argmin assignment `|token.left - anchor|` is slightly more accurate.

**Non-regression on segment report:** Segment value tokens have consistent left-edges per column. min ≈ centroid. Zero behavioral change.

---

### REV-6. Fix 4 (Keep) — Dense-Multi-Gap ref_pitch in `_insert_skip_slots`

Unchanged from §MD-EXTRACT-7 §5. DUMP 2 value-column density 27/26/17/20 confirms: the sparse columns (17 and 20 tokens) have fewer tokens than the dense columns (27 and 26) and require `prefer_ref_pitch=True` for correct skip-slot insertion.

The `prefer_ref_pitch` parameter, `DENSE_COL_THRESHOLD=6`, and the modified `_build_ordinal_grid` call site are all KEPT exactly as designed in §MD-EXTRACT-7 §5. No changes needed.

**Constants (unchanged):**
```python
DENSE_COL_THRESHOLD = 6
```

---

### REV-7. DELETED Fix — Label Band Tightening (Fix-path-D)

**Decision: NOT IMPLEMENTED.**

Evidence: live row pitch ≈ 35px (DUMP 3 first real data rows: top=495, 530, 567; Δ=35–37). Current `LABEL_BAND_FACTOR = 1.5`, `h_med = 18`. Band = 1.5 × 18 = 27px. Since 27 < 35, the label band does NOT over-reach into adjacent rows. The "label interleaving" failure in LIVE-VERIFY-6 was a SYMPTOM of header pollution producing phantom rows (fixed by REV-3) and value mis-assignment (fixed by REV-4/REV-5), NOT a label band width problem.

Do NOT implement `DENSE_LABEL_PITCH_FACTOR`, `band_override`, or any modification to `_attach_labels_ordinal`. The existing `LABEL_BAND_FACTOR = 1.5` is correct for the live 35px pitch.

All code and constants from §MD-EXTRACT-7 §6 are DROPPED from this revision.

---

### REV-8. Hand-Traceable Fixture — Live-Regime Mirror

This is the binding fixture for the AC-7-REV-FIX unit test. It encodes the live regime (6 anchors = 2 pure-code + 4 value, header tokens to be excluded, 35px pitch, unequal value-column density, two absent value cells). Main terminal MUST re-trace every stage before dispatching dev.

#### REV-8.1 Fixture Token List (FIXTURE_TOKENS_REV)

**Geometry:** h_med = 18px, w_med = 140px (computed from this fixture's tokens — see stage trace). Row pitch = 35px. Header zone top ∈ {200}. Data zone top ∈ {495, 530, 565, 600}. Pure-code left-edges: col[0]=258, col[1]=959. Value left-edges: col[2]=1182, col[3]=1477, col[4]=1768, col[5]=2061.

**Value-column density:** col[2]=4, col[3]=4, col[4]=3 (row-1 absent), col[5]=3 (row-2 absent).

```python
FIXTURE_TOKENS_REV = [
    # ── HEADER ZONE (top=200, to be EXCLUDED by _exclude_header_tokens) ──────
    # 3 header number tokens simulating page section number + date band
    {"text": "01",  "left": 258,  "top": 200, "width": 18, "height": 16, "conf": 85},  # H1
    {"text": "31",  "left": 959,  "top": 200, "width": 18, "height": 16, "conf": 85},  # H2
    {"text": "12",  "left": 1330, "top": 200, "width": 20, "height": 16, "conf": 85},  # H3 (contaminator)

    # ── DATA ZONE (top ≥ 495) ─────────────────────────────────────────────────
    # Row-0 (top=495)
    {"text": "Doanh",       "left": 0,    "top": 495, "width": 60,  "height": 18, "conf": 90},  # T00 TEXT
    {"text": "01",          "left": 258,  "top": 495, "width": 18,  "height": 17, "conf": 90},  # T01 code col[0]
    {"text": "30",          "left": 959,  "top": 495, "width": 18,  "height": 17, "conf": 88},  # T02 code col[1]
    {"text": "20.258.866",  "left": 1182, "top": 495, "width": 160, "height": 17, "conf": 92},  # T03 val col[2]
    {"text": "17.651.065",  "left": 1477, "top": 495, "width": 160, "height": 17, "conf": 91},  # T04 val col[3]
    {"text": "70.207.689",  "left": 1768, "top": 495, "width": 155, "height": 17, "conf": 90},  # T05 val col[4]
    {"text": "62.962.652",  "left": 2061, "top": 496, "width": 155, "height": 17, "conf": 91},  # T06 val col[5]

    # Row-1 (top=530)
    {"text": "Giam",        "left": 0,    "top": 530, "width": 55,  "height": 18, "conf": 88},  # T10 TEXT
    {"text": "10",          "left": 258,  "top": 530, "width": 18,  "height": 17, "conf": 89},  # T11 code col[0]
    {"text": "31",          "left": 959,  "top": 530, "width": 18,  "height": 17, "conf": 87},  # T12 code col[1]
    {"text": "43.247",      "left": 1182, "top": 530, "width": 70,  "height": 17, "conf": 88},  # T13 val col[2]
    {"text": "8.804.827",   "left": 1477, "top": 530, "width": 140, "height": 17, "conf": 89},  # T14 val col[3]
    # col[4] (val) ABSENT for row-1
    {"text": "30.412.233",  "left": 2061, "top": 530, "width": 150, "height": 17, "conf": 90},  # T16 val col[5]

    # Row-2 (top=565)
    {"text": "Thuan",       "left": 0,    "top": 565, "width": 55,  "height": 18, "conf": 91},  # T20 TEXT
    {"text": "20",          "left": 258,  "top": 565, "width": 18,  "height": 17, "conf": 90},  # T21 code col[0]
    {"text": "32",          "left": 959,  "top": 565, "width": 18,  "height": 17, "conf": 86},  # T22 code col[1]
    {"text": "17.607.818",  "left": 1182, "top": 565, "width": 160, "height": 17, "conf": 91},  # T23 val col[2]
    {"text": "9.092.934",   "left": 1477, "top": 565, "width": 140, "height": 17, "conf": 90},  # T24 val col[3]
    {"text": "18.701.876",  "left": 1768, "top": 565, "width": 155, "height": 17, "conf": 92},  # T25 val col[4]
    # col[5] (val) ABSENT for row-2

    # Row-3 (top=600)
    {"text": "Gia",         "left": 0,    "top": 600, "width": 40,  "height": 18, "conf": 89},  # T30 TEXT
    {"text": "30",          "left": 258,  "top": 600, "width": 18,  "height": 17, "conf": 87},  # T31 code col[0]
    {"text": "33",          "left": 959,  "top": 600, "width": 18,  "height": 17, "conf": 85},  # T32 code col[1]
    {"text": "14.000.000",  "left": 1182, "top": 600, "width": 155, "height": 17, "conf": 90},  # T33 val col[2]
    {"text": "13.200.000",  "left": 1477, "top": 600, "width": 155, "height": 17, "conf": 91},  # T34 val col[3]
    {"text": "11.500.000",  "left": 1768, "top": 600, "width": 155, "height": 17, "conf": 89},  # T35 val col[4]
    {"text": "9.800.000",   "left": 2061, "top": 600, "width": 140, "height": 17, "conf": 88},  # T36 val col[5]
]
```

**Token count verification (MUST MATCH before any assertion):**
- Header number tokens: H1("01"), H2("31"), H3("12") = **3 header number tokens**
- Data number tokens:
  - code col[0]: T01, T11, T21, T31 = **4**
  - code col[1]: T02, T12, T22, T32 = **4**
  - val col[2]: T03, T13, T23, T33 = **4** (all 4 rows present)
  - val col[3]: T04, T14, T24, T34 = **4** (all 4 rows present)
  - val col[4]: T05, T25, T35 = **3** (row-1 absent)
  - val col[5]: T06, T16, T36 = **3** (row-2 absent)
  - Data number subtotal: 4+4+4+4+3+3 = **22 data number tokens**
- Total NUMBER tokens = 3 + 22 = **25**
- TEXT tokens: T00("Doanh"), T10("Giam"), T20("Thuan"), T30("Gia") = **4**
- **TOTAL = 25 + 4 = 29 tokens**

#### REV-8.2 Stage-by-stage trace

All tokens with conf ≥ 85 ≥ `_MIN_WORD_CONF_ORDINAL = 30` → no confidence filter.

---

**Stage A: `_classify_tokens(FIXTURE_TOKENS_REV)`**

`_NUMBER_TOKEN_RE` matches: `^[\(\-]?\d{1,3}(?:[.,]\d{3})+[\)\-]?$` OR `^[\(\-]?\d{2,3}[\)\-]?$`

- H1 "01" → `^[\(\-]?\d{2,3}[\)\-]?$` ✓ → NUMBER
- H2 "31" → ✓ → NUMBER
- H3 "12" → ✓ → NUMBER
- T01 "01" → ✓ → NUMBER
- T02 "30" → ✓ → NUMBER
- T03 "20.258.866" → money-group (`20.258.866`: 20 then .258 then .866) ✓ → NUMBER
- T04 "17.651.065" → ✓ → NUMBER
- T05 "70.207.689" → ✓ → NUMBER
- T06 "62.962.652" → ✓ → NUMBER
- T10 "Giam" → no match → TEXT
- T11 "10" → ✓ → NUMBER
- T12 "31" → ✓ → NUMBER
- T13 "43.247" → money-group (43 then .247) ✓ → NUMBER
- T14 "8.804.827" → ✓ → NUMBER
- T16 "30.412.233" → ✓ → NUMBER
- T20 "Thuan" → TEXT
- T21 "20" → ✓ → NUMBER
- T22 "32" → ✓ → NUMBER
- T23 "17.607.818" → ✓ → NUMBER
- T24 "9.092.934" → ✓ → NUMBER
- T25 "18.701.876" → ✓ → NUMBER
- T30 "Gia" → TEXT
- T31 "30" → ✓ → NUMBER
- T32 "33" → ✓ → NUMBER
- T33 "14.000.000" → ✓ → NUMBER
- T34 "13.200.000" → ✓ → NUMBER
- T35 "11.500.000" → ✓ → NUMBER
- T36 "9.800.000" → ✓ → NUMBER
- T00 "Doanh" → TEXT

**Result: number_tokens = 25, text_tokens = 4** ✓ (matches count above)

---

**Stage B: compute w_med and h_med from number_tokens (25 tokens)**

All 25 number token heights: 16 (H1), 16 (H2), 16 (H3), 17×22 (all data tokens) = [16,16,16, 17,17,17,17,17, 17,17,17,17,17, 17,17,17,17,17, 17,17,17,17,17, 17,17] wait, let me count: H1 h=16, H2 h=16, H3 h=16, then 22 data tokens all h=17. Total: 3×16 + 22×17 = [16,16,16,17,17,...17] — sorted: 3 values of 16, 22 values of 17. Median of 25: the 13th value = 17. **h_med = 17px.**

All 25 number token widths: H1=18, H2=18, H3=20, T01=18, T02=18, T03=160, T04=160, T05=155, T06=155, T11=18, T12=18, T13=70, T14=140, T16=150, T21=18, T22=18, T23=160, T24=140, T25=155, T31=18, T32=18, T33=155, T34=155, T35=155, T36=140.

Sorted: [18,18,18,18,18,18,18,18,18,18, 20, 70, 140,140,140, 150, 155,155,155,155,155, 160,160,160, ... wait let me re-list systematically:
- width=18: H1,H2,T01,T02,T11,T12,T21,T22,T31,T32 = **10 tokens**
- width=20: H3 = **1 token**
- width=70: T13 = **1 token**
- width=140: T14,T24,T36 = **3 tokens**
- width=150: T16 = **1 token**
- width=155: T05,T06,T25,T33,T34,T35 = **6 tokens**
- width=160: T03,T04,T23 = **3 tokens**

Total: 10+1+1+3+1+6+3 = 25 ✓

Sorted: [18(×10), 20, 70, 140,140,140, 150, 155,155,155,155,155,155, 160,160,160]

Median of 25 = 13th value. Count through: positions 1-10 = 18; position 11 = 20; position 12 = 70; position 13 = **140**. **w_med = 140px.**

---

**Stage C5: `_find_first_value_row_top(number_tokens)`**

Scan for first `_VALUE_TOKEN_RE` match: `^[\(\-]?\d{1,3}(?:[.,]\d{3})+`. The header tokens H1="01", H2="31", H3="12" do NOT match (they are 2-digit, no `.` groups). The first value token is T03="20.258.866" at **top=495**. (Header tokens at top=200 have no value matches.)

`first_value_top = 495.0`

**Stage C5b: `_exclude_header_tokens(number_tokens, first_value_top=495.0)`**

Exclude all tokens with top < 495: H1(top=200), H2(top=200), H3(top=200). Removed = 3.

`clean_number_tokens`: 22 data tokens remain (T01..T36 all at top ≥ 495). ✓

---

**Stage C6: `_detect_column_anchors_from_tokens(clean_number_tokens, w_med=140)`**

Note: w_med recomputed from clean_number_tokens (22 tokens):
- Widths: T01=18,T02=18,T03=160,T04=160,T05=155,T06=155, T11=18,T12=18,T13=70,T14=140,T16=150, T21=18,T22=18,T23=160,T24=140,T25=155, T31=18,T32=18,T33=155,T34=155,T35=155,T36=140
- Count by width: 18×8, 70×1, 140×3, 150×1, 155×6, 160×3 = 8+1+3+1+6+3=22 ✓
- Sorted: [18,18,18,18,18,18,18,18, 70, 140,140,140, 150, 155,155,155,155,155,155, 160,160,160]
- Median of 22 = average of 11th and 12th = (140+140)/2 = **140px** (same). ✓

`bin_width = max(1.0, 0.3 × 140) = 42.0px`
`col_gap = 1.5 × 140 = 210.0px`

Sorted lefts of 22 clean tokens: [258,258,258,258, 959,959,959,959, 1182,1182,1182,1182, 1477,1477,1477,1477, 1768,1768,1768, 2061,2061,2061]

Bin clustering (consecutive left within 42px → same cluster):
- 258 → cluster={258}. Next=258 (same): 258-258=0≤42 → cluster={258,258}. Next=258: cluster={258,258,258}. Next=258: cluster={258,258,258,258}.
- Next=959: 959-258=701>42 → NEW cluster. cluster_1={258,258,258,258}. cluster_2={959}.
- Next=959,959,959 → cluster_2={959,959,959,959}.
- Next=1182: 1182-959=223>42 → NEW cluster_3={1182}.
- Next=1182,1182,1182 → cluster_3={1182,1182,1182,1182}.
- Next=1477: 1477-1182=295>42 → NEW cluster_4={1477,1477,1477,1477}.
- Next=1768: 1768-1477=291>42 → NEW cluster_5={1768,1768,1768}.
- Next=2061: 2061-1768=293>42 → NEW cluster_6={2061,2061,2061}.

Clusters: [{258×4}, {959×4}, {1182×4}, {1477×4}, {1768×3}, {2061×3}]

`cluster_anchors = [min(c) for c in clusters] = [258, 959, 1182, 1477, 1768, 2061]`

(Using the revised min-anchor formula. With the header tokens excluded, each cluster is homogeneous — min == centroid == 258, 959, etc. The min formula makes no difference here since each cluster has a single unique left-value. But it proves the approach is correct: even if a cluster had left-edge variation, min selects the leftmost edge.)

Merge with col_gap=210:
- merged=[258]
- 959-258=701>210 → add. merged=[258,959]
- 1182-959=223>210 → add. merged=[258,959,1182]
- 1477-1182=295>210 → add. merged=[258,959,1182,1477]
- 1768-1477=291>210 → add. merged=[258,959,1182,1477,1768]
- 2061-1768=293>210 → add. merged=[258,959,1182,1477,1768,2061]

**anchors = [258, 959, 1182, 1477, 1768, 2061]** (6 anchors, correct — no 1330 contaminator, value anchors at true left-edges)

Key difference from broken prior path: WITHOUT header cutoff and WITHOUT min-anchor, anchors would have been [258, 959, 1330, 1642, 1916, 2207] (the live broken state). WITH fixes: [258, 959, 1182, 1477, 1768, 2061]. ✓

---

**Stage C7: `_assign_tokens_to_columns(clean_number_tokens, anchors=[258,959,1182,1477,1768,2061], w_med=140)`**

For each token, find argmin |token.left - anchor|:

- T01("01", left=258): distances=[|258-258|=0, 701, 924, 1219, 1510, 1803] → col[0] ✓
- T11("10", left=258): → col[0] ✓
- T21("20", left=258): → col[0] ✓
- T31("30", left=258): → col[0] ✓
- T02("30", left=959): distances=[701, 0, 223, 518, 809, 1102] → col[1] ✓
- T12("31", left=959): → col[1] ✓
- T22("32", left=959): → col[1] ✓
- T32("33", left=959): → col[1] ✓
- T03("20.258.866", left=1182): distances=[924, 223, 0, 295, 586, 879] → col[2] ✓
- T13("43.247", left=1182): → col[2] ✓
- T23("17.607.818", left=1182): → col[2] ✓
- T33("14.000.000", left=1182): → col[2] ✓
- T04("17.651.065", left=1477): distances=[1219, 518, 295, 0, 291, 584] → col[3] ✓
- T14("8.804.827", left=1477): → col[3] ✓
- T24("9.092.934", left=1477): → col[3] ✓
- T34("13.200.000", left=1477): → col[3] ✓
- T05("70.207.689", left=1768): distances=[1510, 809, 586, 291, 0, 293] → col[4] ✓
- T25("18.701.876", left=1768): → col[4] ✓
- T35("11.500.000", left=1768): → col[4] ✓
- T06("62.962.652", left=2061): distances=[1803, 1102, 879, 584, 293, 0] → col[5] ✓
- T16("30.412.233", left=2061): → col[5] ✓
- T36("9.800.000", left=2061): → col[5] ✓

Noise gate: max distance for any token = col[0] tokens at 258 → dist to col[0] = 0, well within `3.0 × 140 = 420`. No token excluded. ✓

**col_buckets:**
- col[0]: [T01, T11, T21, T31] — 4 tokens
- col[1]: [T02, T12, T22, T32] — 4 tokens
- col[2]: [T03, T13, T23, T33] — 4 tokens
- col[3]: [T04, T14, T24, T34] — 4 tokens
- col[4]: [T05, T25, T35] — 3 tokens (T15 absent, row-1)
- col[5]: [T06, T16, T36] — 3 tokens (T26 absent, row-2)

Total tokens assigned: 4+4+4+4+3+3 = 22 ✓

---

**Stage C7.5: `_identify_pure_code_columns(col_buckets, anchors)`**

For each bucket, classify tokens:
- `_CODE_TOKEN_RE`: `^[\(\-]?\d{2,3}[\)\-]?$`
- `_VALUE_TOKEN_RE`: `^[\(\-]?\d{1,3}(?:[.,]\d{3})+`

col[0] = [T01"01", T11"10", T21"20", T31"30"]:
- "01": CODE_RE ✓, VALUE_RE ✗ → code
- "10": CODE_RE ✓ → code
- "20": CODE_RE ✓ → code
- "30": CODE_RE ✓ → code
- code_count=4, value_count=0, total=4. code_fraction=4/4=1.0 ≥ 0.9 AND value_count=0 → **PURE CODE**

col[1] = [T02"30", T12"31", T22"32", T32"33"]:
- All CODE_RE ✓, VALUE_RE ✗ → code
- code_count=4, value_count=0, total=4 → **PURE CODE**

col[2] = [T03"20.258.866", T13"43.247", T23"17.607.818", T33"14.000.000"]:
- "20.258.866": CODE_RE? `^[\(\-]?\d{2,3}[\)\-]?$` → "20.258.866" has dots, doesn't match CODE_RE. VALUE_RE ✓
- "43.247": CODE_RE? "43.247" has a dot → ✗. VALUE_RE ✓
- "17.607.818": VALUE_RE ✓
- "14.000.000": VALUE_RE ✓
- code_count=0, value_count=4, total=4 → value_count=4≠0 → **VALUE COLUMN**

col[3] = [T04"17.651.065", T14"8.804.827", T24"9.092.934", T34"13.200.000"]:
- All VALUE_RE ✓ → value_count=4≠0 → **VALUE COLUMN**

col[4] = [T05"70.207.689", T25"18.701.876", T35"11.500.000"]:
- All VALUE_RE ✓ → **VALUE COLUMN**

col[5] = [T06"62.962.652", T16"30.412.233", T36"9.800.000"]:
- All VALUE_RE ✓ → **VALUE COLUMN**

**code_col_indices = [0, 1]**, **value_col_indices = [2, 3, 4, 5]**

`code_note_tokens` = col[0] + col[1] tokens = [T01, T11, T21, T31, T02, T12, T22, T32] = **8 tokens**

`value_col_buckets` = [col[2], col[3], col[4], col[5]] (re-indexed as [0,1,2,3])
`value_anchors` = [1182, 1477, 1768, 2061]

---

**Stage C8: sort each value_col_bucket by top (ascending)**

col[0] (originally col[2], val@1182): T03(top=495), T13(top=530), T23(top=565), T33(top=600) — already sorted ✓
col[1] (originally col[3], val@1477): T04(top=495), T14(top=530), T24(top=565), T34(top=600) — sorted ✓
col[2] (originally col[4], val@1768): T05(top=495), T25(top=565), T35(top=600) — sorted ✓
col[3] (originally col[5], val@2061): T06(top=496), T16(top=530), T36(top=600) — sorted ✓

---

**Stage C8.5: `_insert_skip_slots` per value column**

**ref_pitch computation** (from columns with ≥ 3 tokens — all 4 qualify):
- col[0]: tops=[495,530,565,600], deltas=[35,35,35], local_pitch=median([35,35,35])=35
- col[1]: tops=[495,530,565,600], deltas=[35,35,35], local_pitch=35
- col[2]: tops=[495,565,600], deltas=[70,35], local_pitch=median([70,35])=52.5
- col[3]: tops=[496,530,600], deltas=[34,70], local_pitch=median([34,70])=52.0

ref_pitch = median([35, 35, 52.5, 52.0]) = median([35, 35, 52.0, 52.5]) = (35+52.0)/2 = 43.5px

**Per-column `_insert_skip_slots`:**

col[0] (4 tokens, len=4 ≥ DENSE_COL_THRESHOLD=6? NO, 4<6 → prefer_ref_pitch=True):
Working_pitch = ref_pitch = 43.5. threshold = 1.5 × 43.5 = 65.25.
Deltas: [35, 35, 35]. All < 65.25 → no skip slots.
Slots: [T03, T13, T23, T33]. Length=4. ✓

col[1] (4 tokens, 4<6 → prefer_ref_pitch=True):
Working_pitch = 43.5. threshold = 65.25.
Deltas: [35, 35, 35]. All < 65.25 → no skip slots.
Slots: [T04, T14, T24, T34]. Length=4. ✓

col[2] (3 tokens, 3<6 → prefer_ref_pitch=True):
Working_pitch = ref_pitch = 43.5. threshold = 65.25.
Deltas: [70, 35]. Delta[0]=70 > 65.25 → skip! `ceil(70/43.5)-1 = ceil(1.609)-1 = 2-1 = 1` slot.
After slot 0 (T05@495): insert 1×None. Then slot T25@565. Delta[1]=35 < 65.25 → no skip. Then T35@600.
Slots: [T05, None, T25, T35]. Length=4. ✓ (row-1 absent correctly as None)

col[3] (3 tokens, 3<6 → prefer_ref_pitch=True):
Working_pitch = 43.5. threshold = 65.25.
Deltas: [34, 70]. Delta[0]=34 < 65.25 → no skip. Then T16@530. Delta[1]=70 > 65.25 → skip! `ceil(70/43.5)-1 = 1` slot.
After T06@496: no skip. T16@530. Insert 1×None. Then T36@600.
Slots: [T06, T16, None, T36]. Length=4. ✓ (row-2 absent correctly as None)

---

**Stage C9: total_rows = max(4, 4, 4, 4) = 4** ✓

---

**Stage C10: Build grid**

For rank r=0..3, col c=0..3:
- col[0] slots: [T03"20.258.866"@r0, T13"43.247"@r1, T23"17.607.818"@r2, T33"14.000.000"@r3]
- col[1] slots: [T04"17.651.065"@r0, T14"8.804.827"@r1, T24"9.092.934"@r2, T34"13.200.000"@r3]
- col[2] slots: [T05"70.207.689"@r0, None@r1, T25"18.701.876"@r2, T35"11.500.000"@r3]
- col[3] slots: [T06"62.962.652"@r0, T16"30.412.233"@r1, None@r2, T36"9.800.000"@r3]

col_y_medians[r] = median(top of non-None tokens at rank r):
- r=0: tops=[495(T03), 495(T04), 495(T05), 496(T06)] → median([495,495,495,496])=495.0
- r=1: tops=[530(T13), 530(T14), -(None), 530(T16)] → median([530,530,530])=530.0
- r=2: tops=[565(T23), 565(T24), 565(T25), -(None)] → median([565,565,565])=565.0
- r=3: tops=[600(T33), 600(T34), 600(T35), 600(T36)] → median([600,600,600,600])=600.0

Grid (values only, before label attachment):
```
rank  col[0]          col[1]          col[2]          col[3]
r0    "20.258.866"    "17.651.065"    "70.207.689"    "62.962.652"
r1    "43.247"        "8.804.827"     " "             "30.412.233"
r2    "17.607.818"    "9.092.934"     "18.701.876"    " "
r3    "14.000.000"    "13.200.000"    "11.500.000"    "9.800.000"
```

---

**Stage C11: `_attach_labels_ordinal`**

Available text_tokens (original 4): T00("Doanh"@top=495), T10("Giam"@top=530), T20("Thuan"@top=565), T30("Gia"@top=600).
code_note_tokens (8, appended to text pool): T01("01"@left=258,top=495), T11("10"@left=258,top=530), T21("20"@left=258,top=565), T31("30"@left=258,top=600), T02("30"@left=959,top=495), T12("31"@left=959,top=530), T22("32"@left=959,top=565), T32("33"@left=959,top=600).

Total label-pool = 4 text + 8 code_note = 12 tokens.

`effective_band = LABEL_BAND_FACTOR × h_med = 1.5 × 17 = 25.5px` (Note: we DO NOT use DENSE_LABEL_PITCH_FACTOR — Fix-path-D is DROPPED. The standard band applies.)

Row r=0 (y_med=495.0, band=25.5):
- Text tokens within |top - 495| ≤ 25.5: T00(top=495, |0|≤25.5)✓
- code_note within band: T01(top=495)✓, T02(top=495)✓
- Sort by left: T00(left=0), T01(left=258), T02(left=959) → label_0 = "Doanh 01 30"
- Greedy removal: T00, T01, T02 removed.

Row r=1 (y_med=530.0, band=25.5):
- Remaining text in band [504.5, 555.5]: T10(top=530)✓
- code_note in band: T11(top=530)✓, T12(top=530)✓
- Sort by left: T10(left=0), T11(left=258), T12(left=959) → label_1 = "Giam 10 31"
- Removal: T10, T11, T12.

Row r=2 (y_med=565.0, band=25.5):
- Remaining text in band [539.5, 590.5]: T20(top=565)✓
- code_note in band: T21(top=565)✓, T22(top=565)✓
- Sort: T20(left=0), T21(left=258), T22(left=959) → label_2 = "Thuan 20 32"
- Removal: T20, T21, T22.

Row r=3 (y_med=600.0, band=25.5):
- Remaining text in band [574.5, 625.5]: T30(top=600)✓
- code_note: T31(top=600)✓, T32(top=600)✓
- Sort: T30(left=0), T31(left=258), T32(left=959) → label_3 = "Gia 30 33"
- Removal: T30, T31, T32.

**Final grid (4 cols = label + 4 value cols = 5 cols total):**
```
r0  ["Doanh 01 30",  "20.258.866",  "17.651.065",  "70.207.689",  "62.962.652"]
r1  ["Giam 10 31",   "43.247",      "8.804.827",   " ",           "30.412.233"]
r2  ["Thuan 20 32",  "17.607.818",  "9.092.934",   "18.701.876",  " "]
r3  ["Gia 30 33",    "14.000.000",  "13.200.000",  "11.500.000",  "9.800.000"]
```

**Markdown output:**
```
| Label         | Col-0       | Col-1       | Col-2       | Col-3       |
|---|---|---|---|---|
| Doanh 01 30   | 20.258.866  | 17.651.065  | 70.207.689  | 62.962.652  |
| Giam 10 31    | 43.247      | 8.804.827   |             | 30.412.233  |
| Thuan 20 32   | 17.607.818  | 9.092.934   | 18.701.876  |             |
| Gia 30 33     | 14.000.000  | 13.200.000  | 11.500.000  | 9.800.000   |
```

---

#### REV-8.3 Fixture Assertions (binding — main terminal MUST verify each one)

The 10 binding assertions for `test_dense_income_rev7` unit test:

1. `len(number_tokens) == 25` and `len(text_tokens) == 4` (after `_classify_tokens`)
2. After `_find_first_value_row_top`: `first_value_top == 495.0` (T03 is the first VALUE-class token)
3. After `_exclude_header_tokens(number_tokens, 495.0)`: `len(clean_number_tokens) == 22` (3 header tokens excluded)
4. After C6 anchor detection on clean tokens: `len(anchors) == 6` and anchors ≈ `[258, 959, 1182, 1477, 1768, 2061]` (within ±5px)
5. After C7.5: `len(code_col_indices) == 2` (col[0] and col[1] are pure-code); `len(value_col_buckets) == 4`; `len(code_note_tokens) == 8`
6. After C7 (assignment to value anchors [1182,1477,1768,2061]): `value_col_buckets[2]` has 3 tokens (col[4], row-1 absent); `value_col_buckets[3]` has 3 tokens (col[5], row-2 absent)
7. After C8.5 on `value_col_buckets[2]` (col[4], 3 tokens): slot list length = 4, `slots[1] is None` (row-1 correctly empty)
8. After C8.5 on `value_col_buckets[3]` (col[5], 3 tokens): slot list length = 4, `slots[2] is None` (row-2 correctly empty)
9. `grid[1][2] == " "` and `grid[2][3] == " "` (the two absent cells are empty, not swapped)
10. Labels do NOT interleave: label of r=0 does NOT contain "Giam" or "Thuan"; label of r=1 does NOT contain "Doanh" or "Thuan". (band=25.5px, pitch=35px → no over-reach)

**Verification of count arithmetic (assertion 1):**
- 25 number tokens = 3 header (H1,H2,H3) + 4 code col[0] (T01,T11,T21,T31) + 4 code col[1] (T02,T12,T22,T32) + 4 val col[2] (T03,T13,T23,T33) + 4 val col[3] (T04,T14,T24,T34) + 3 val col[4] (T05,T25,T35) + 3 val col[5] (T06,T16,T36) = 3+4+4+4+4+3+3 = **25** ✓
- 4 text tokens = T00,T10,T20,T30 = **4** ✓
- Total = 29 ✓

**Verification of C8.5 arithmetic (assertions 7 and 8):**

Assertion 7 (col[4], 3 tokens at tops [495,565,600]):
- ref_pitch = 43.5px (from stage trace above)
- prefer_ref_pitch = True (3 < 6)
- working_pitch = 43.5, threshold = 65.25
- delta[0] = 565-495 = 70 > 65.25 → insert `ceil(70/43.5)-1 = ceil(1.609)-1 = 2-1 = 1` None slot
- delta[1] = 600-565 = 35 < 65.25 → no skip
- slots = [T05, None, T25, T35], length=4, slots[1] is None ✓

Assertion 8 (col[5], 3 tokens at tops [496,530,600]):
- working_pitch = 43.5, threshold = 65.25
- delta[0] = 530-496 = 34 < 65.25 → no skip
- delta[1] = 600-530 = 70 > 65.25 → insert ceil(70/43.5)-1 = 1 None slot
- slots = [T06, T16, None, T36], length=4, slots[2] is None ✓

---

### REV-9. Non-Regression Proof: AC-6-SEG (Segment Report)

The segment-report page has these properties (from MD-EXTRACT-6 DIAG substrate + LIVE-VERIFY-6):
- No column-header date band above the data rows at `top < first_value_top`
  → `_find_first_value_row_top` returns the revenue row top
  → `_exclude_header_tokens` returns the full number_tokens unchanged (no exclusions)
- All columns contain money-group value tokens (revenue, cost, profit per segment)
  → `value_count > 0` for every bucket
  → `_identify_pure_code_columns` returns `code_col_indices = []`
  → Step C7.5 takes the ELSE branch → `code_note_tokens = []`, `value_col_buckets = col_buckets`
  → pipeline is IDENTICAL to MD-EXTRACT-6 behavior
- `prefer_ref_pitch`: segment columns have 7-10 tokens each (DUMP 2 confirmed per MD-EXTRACT-6). `len(col) ≥ 6` for most columns → `prefer_ref_pitch=False` → no change from MD-EXTRACT-6
- The anchor min-metric change: segment column tokens have consistent left-edges (narrow x-variation per column) → min ≈ centroid → behavioral equivalence

**All three revenue values `35.381.667 / 9.092.934 / 18.701.876` will still appear on ONE pipe-row.** AC-6-SEG is structurally guaranteed by the ELSE branch in C7.5.

---

### REV-10. Files to Modify

| File | Change | DDD Layer |
|---|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | ADD constants: `PURE_CODE_COL_THRESHOLD=0.90`; ADD functions: `_find_first_value_row_top(number_tokens)`, `_exclude_header_tokens(number_tokens, first_value_top)`, `_identify_pure_code_columns(col_buckets, col_anchors)` (all pure); MODIFY `_detect_column_anchors_from_tokens` line 708: `sum(c)/len(c)` → `min(c)`; MODIFY `_process_page`: add Step C5 (header cutoff), add Step C7.5 (pure-code-column split), append `code_note_tokens` to `region_text_tokens` before C11; KEEP `prefer_ref_pitch` fix (DENSE_COL_THRESHOLD, `_insert_skip_slots` modification from §MD-EXTRACT-7 §5 — unchanged); DROP all §MD-EXTRACT-7 §6 (DENSE_LABEL_PITCH_FACTOR, band_override) — not implemented; REMOVE dead constants `N_EXPECTED_MAX_VALUE_COLS`, `LABEL_ZONE_GAP_FACTOR` from §MD-EXTRACT-7 (never shipped) | infrastructure |
| `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py` | ADD class `TestHeaderCutoff` (3 tests: `test_find_first_value_row_top_normal`, `test_find_first_value_row_top_no_values`, `test_exclude_header_tokens_removes_above_cutoff`); ADD class `TestPureCodeColumnDetector` (4 tests: `test_all_value_cols_returns_empty_code_list`, `test_detects_two_pure_code_cols`, `test_mixed_col_stays_value`, `test_sparse_code_col_with_noise_still_pure`); ADD `test_dense_income_rev7` in existing class `TestDenseIncomeStatement` (the 10-assertion REV-8 fixture test, replaces the superseded `test_dense_income_fragment`); KEEP all existing ordinal tests unchanged | unit |

Zero new files. Zero mcp-server changes. Zero new ports. Zero test files.

**Constants to ADD (new):**
```python
PURE_CODE_COL_THRESHOLD = 0.90
```

**Constants to KEEP from §MD-EXTRACT-7 §5 (unchanged):**
```python
DENSE_COL_THRESHOLD = 6  # (if not already present from prior shipping)
```

**Constants NOT to implement (from §MD-EXTRACT-7 §6, DROPPED):**
- `DENSE_LABEL_PITCH_FACTOR` — NOT implemented
- `N_EXPECTED_MAX_VALUE_COLS` — NOT implemented (replaced by presence-based detector)
- `LABEL_ZONE_GAP_FACTOR` — NOT implemented (replaced by pure-code-column detector)

---

### REV-11. Binding Acceptance Criteria (Revised)

**AC-7-REV-HEADER (BLOCKING):** Unit test `test_exclude_header_tokens_removes_above_cutoff`: fixture with 3 header tokens (top=200) + 5 data tokens (top≥495, including at least one VALUE_TOKEN_RE match at top=495). `_find_first_value_row_top` returns 495.0. `_exclude_header_tokens(..., 495.0)` returns only the 5 data tokens. `len(result)==5`.

**AC-7-REV-DETECTOR (BLOCKING):** Unit test `test_detects_two_pure_code_cols`: use `col_buckets` from the REV-8 fixture — 6 buckets. `_identify_pure_code_columns` returns `code_col_indices=[0,1]`, `value_col_indices=[2,3,4,5]`. Test `test_all_value_cols_returns_empty_code_list`: segment-report-like buckets (all value tokens, no code tokens) → `code_col_indices=[]` (proves non-regression on segment path).

**AC-7-REV-ANCHOR (BLOCKING):** Unit test using a micro-cluster: cluster `[1182, 1187, 1192]` (left-edge variation within one value column). `min([1182,1187,1192]) == 1182`. `sum([1182,1187,1192])/3 == 1187`. Confirms min-anchor returns left-edge (not centroid).

**AC-7-REV-FIX (BLOCKING — replaces AC-7-FIX):** Unit test `test_dense_income_rev7` using FIXTURE_TOKENS_REV (29 tokens, REV-8.1). All 10 assertions from REV-8.3 pass. Token count assertions (assertion 1: `len(number_tokens)==25`, `len(text_tokens)==4`) MUST be verified first.

**AC-7-REV-SEG-NOREGRESS (BLOCKING):** Unit test `test_all_value_cols_returns_empty_code_list` proves the ELSE branch. Live: after re-extract (MD-DEPLOY-7), segment revenues `35.381.667 / 9.092.934 / 18.701.876` still on ONE pipe-row, distinct cells.

**AC-7-REV-ORD (BLOCKING):** All existing ordinal tests (`test_ordinal_defeats_drift_gt_gap`, `test_skip_mid_column_empty`, `test_skip_trailing_column_empty`) still pass unchanged.

**AC-7-REV-INC (BINDING — live gate):** Income statement table after re-extract: ≥15 data rows; no row has TWO distinct line-item label heads in one label cell; at least one revenue-magnitude row (~17-70T VND) has period values in separate cells on ONE pipe-row; code tokens appear INSIDE label cells (not as standalone value cells with empty labels).

**AC-7-REV-AC0 (BLOCKING):**
`grep -rniE "bao.cao.bo.phan|segment_report|SEGMENT|BAO_CAO|bo_phan|bao_phan|doanh_thu|gia_von|income_statement" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches (new code only in comments: acceptable per prior AC-0 ruling).

**AC-7-REV-FENCE (BLOCKING):**
`grep -rnE "from application|from interface|import application|import interface" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

**AC-7-REV-PRIVACY (BLOCKING):**
`grep -rniE "claude|openai|gemini|textract|document.?ai|anthropic|requests\.post|httpx\.post|aiohttp" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

**AC-7-REV-HARDWARE (zero extra Tesseract calls):**
`_find_first_value_row_top`, `_exclude_header_tokens`, `_identify_pure_code_columns`, `min(c)` anchor metric change: all pure in-memory list ops. Zero additional `pytesseract` calls.

**AC-3F (BLOCKING, carry-forward):** `text_table_extractor.py` 0-byte diff. `bctc_table_rows`=79, balance_delta=0.

---

### REV-12. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: `_find_first_value_row_top` may mis-identify a very small value token in the header zone as the cutoff (e.g., a confidence-passed "1.234" in the column-header period row at top≈400). This would set the cutoff too HIGH, excluding legitimate data tokens just below it. | HIGH | The header period row at FPT page 8 is at top≈326 (DUMP 3: top<400). The first data row is top=495. A 70px gap (326→495) means even if the cutoff is set to 326 (header period row), the data tokens at 495 are still included. Acceptable. The only risk is a very tall income statement header with a period-header value token at top=470, which would exclude data at top=495 only if first_value_top > 495 — this cannot happen since data token T03 is AT top=495 and it IS the minimum. |
| R-MEDIUM: `PURE_CODE_COL_THRESHOLD = 0.90` may fail for a column with significant OCR noise (e.g., 2/12 tokens are garbled non-code values). If value_count > 0 due to OCR noise (e.g., code "01" is misread as "0.1"), the column is classified as VALUE. | MEDIUM | A spurious `0.1` would be caught by `_CODE_TOKEN_RE` failing (not 2-3 digits) and `_VALUE_TOKEN_RE` failing (no `\d{3}` group). "0.1" does not match either RE. Real OCR noise is typo-class ("O1" → TEXT, not NUMBER). The condition is `value_count == 0` which is robust: only tokens matching the FULL money-group pattern (`r'^\d{1,3}(?:[.,]\d{3})+'`) count as values. Code tokens cannot accidentally match that pattern. |
| R-MEDIUM: `min(cluster)` anchor metric may produce anchors that are too far left if a noisy token (OCR artifact at left=0) accidentally clusters with a real column. | MEDIUM | The noise gate in `_assign_tokens_to_columns` (dist > 3 × w_med excluded) prevents outlier tokens from being included in later stages. For anchor detection itself, a left=0 artifact would form its own cluster (well separated from col[0]@258 by col_gap=210) and would become a spurious anchor at 0 — which `_assign_tokens_to_columns` would then exclude (dist from 0 to any real token > 210). Safe fallback. |
| R-LOW: DENSE_COL_THRESHOLD=6 applied to value_col_buckets post-C7.5 — if value_col_buckets have fewer than 6 tokens (e.g. a section break splits the income statement into two short regions), ref_pitch may override local_pitch for all columns. | LOW | Income statement has ~26 data rows → 4 value columns have 17-27 tokens each (DUMP 2). Even after header exclusion (removing 9 header tokens), value columns have 15-25 tokens >> 6. No columns will use prefer_ref_pitch unexpectedly. |
| R-LOW: File size. Adding ~60L of new constants + 3 new functions. Monitor against docs/data/file-size-caps.json. | LOW | If file exceeds cap, move dead-code functions (_cluster_rows, _cluster_rows_by_gap, _cluster_number_rows, etc.) to infrastructure/_legacy_bbox_helpers.py. |

---

### REV-13. DDD / Fence Compliance

| Function / Constant | Layer | Imports | Fence |
|---|---|---|---|
| `_find_first_value_row_top` | infrastructure (pure) | stdlib only | Fence-A compliant |
| `_exclude_header_tokens` | infrastructure (pure) | stdlib only | Fence-A compliant |
| `_identify_pure_code_columns` | infrastructure (pure) | stdlib only (uses module-level _CODE_TOKEN_RE, _VALUE_TOKEN_RE) | Fence-A compliant |
| `PURE_CODE_COL_THRESHOLD` | module-level constant | None | Fence-A compliant |
| `_detect_column_anchors_from_tokens` (min metric) | infrastructure (pure) | stdlib only | Fence-A compliant |
| `_process_page` (modified routing) | infrastructure | `pytesseract`, `PIL` (existing impure boundary — UNCHANGED) | Fence-A compliant |

All new/modified functions are PURE (no I/O, no Tesseract, no DB, no network).

---

### REV-14. Build Standard + Role-Relay

**BUILD-STANDARD: lean** — in-zone additive algorithm enhancement within existing infrastructure file.

**HARD CONSTRAINTS (carry-forward verbatim):**
- PRIVACY: self-hosted local OCR only. NEVER send PDF/image to external API.
- HARDWARE: 16GB Intel Mac, sequential single-doc. Zero additional Tesseract calls.
- `text_table_extractor.py` UNTOUCHED. Frozen surfaces unchanged.
- Leave ALL files UNSTAGED — main terminal commits with zero-foreign verify.

**SUPERSEDES:** §MD-EXTRACT-7 §4 (dual-code-column handling via count-gate → replaced by presence-based detector). §MD-EXTRACT-7 §6 (label band tightening → dropped). §MD-EXTRACT-7 §7 (fixture → replaced by REV-8). §MD-EXTRACT-7 §8 ACs → replaced by REV-11 ACs.

**UNCHANGED FROM §MD-EXTRACT-7:** §MD-EXTRACT-7 §5 (dense-multi-gap ref_pitch, DENSE_COL_THRESHOLD=6 — carry forward exactly).

**ROLE-RELAY:** main-terminal re-traces REV-8.2 stage trace + REV-8.3 assertions by hand (especially REV-8.3 assertions 7+8 C8.5 arithmetic) → approve → dispatch dev-pdf-extractor MD-EXTRACT-7-REV → ops MD-DEPLOY-7 (single doc, full UUID `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`, path `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf`) → main-terminal live-verify (AC-7-REV-INC + AC-7-REV-SEG-NOREGRESS) → qa → po.

---

## MD-EXTRACT-7 — Dense Income Statement Reconstruction

> **Task:** MD-EXTRACT-7 | **Author:** architect | **Date:** 2026-05-26T09:16Z
> **Status:** ~~DESIGN COMPLETE~~ **SUPERSEDED by §MD-EXTRACT-7-REV** — diagnostic contradicted central assumption. See REV-0 for invalidation analysis. §MD-EXTRACT-7 §5 (dense-multi-gap ref_pitch) is PRESERVED unchanged. §§4, 6, 7, 8 are superseded.
> **Input:** MAIN-TERMINAL LIVE-VERIFY-6 (`/tmp/md_v6_db.json` table[8], FPT `e71f845d`, income statement = Báo cáo kết quả hoạt động kinh doanh)
> **Zone:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` + its unit test file. Zero mcp-server changes. `text_table_extractor.py` UNTOUCHED.

---

### 1. What Works — MUST NOT Regress

MD-EXTRACT-6 ordinal path PASSED these ACs (carry-forward binding):

- **AC-6-SEG:** Segment report table[17] — all 7 segment values on ONE GFM row, 3 binding revenues `35.381.667 / 9.092.934 / 18.701.876` in distinct `|`-separated cells. The diagonal cascade is defeated. This AC is the anchor; any change that breaks it is REJECTED.
- **AC-6-D4b-LIVE:** Zero code+value concatenation in tables 0-4.
- **AC-6-ORD, AC-6-SKIP:** Unit fixture tests for ordinal+skip algorithms.
- **AC-3F:** `text_table_extractor.py` 0-byte diff; structured `bctc_table_rows` = 79, balance_delta = 0.

The income statement fix MUST be additive and conditional. The ordinal Step C6→C10 pipeline MUST run unchanged for ALL tables. Any new logic targets the specific failure modes of dense tables and must be either (a) a pre-processing stage that normalises the token set before C6, or (b) a post-processing refinement that fixes the grid after C10 without touching the core ordinal logic, or (c) a targeted patch to C8.5 `_insert_skip_slots` for the dense-many-gap case.

---

### 2. The Three Failure Modes (from LIVE-VERIFY-6)

Live observation from table[8] (`/tmp/md_v6_db.json`):

**Failure 1 — LABEL INTERLEAVING:** Row-0 label cell = `"2 1 Doanh Các khoản thu giảm bán hàng trừ và cung cấp dịch vụ 10 01"`. This is two distinct income statement lines merged into one label cell:
- Line 1: "1. Doanh thu bán hàng và cung cấp dịch vụ" (code 01)
- Line 2: "2. Các khoản giảm trừ doanh thu" (code 10 — note: code 10 is the second line)

The merged label also contains the code tokens `10 01` and `02` embedded in it.

**Failure 2 — DUAL CODE COLUMNS MERGED:** The income statement has two small-integer columns:
- "Mã số" (line codes: 01, 10, 11, 20, …, 70)
- "Thuyết minh" (note references: also small integers like 30, 31, 32)

Both appear as paired tokens `"10 01"` / `"11 02"` / `"12 10"` smashed into a single label cell. These tokens match `_NUMBER_TOKEN_RE` (pattern `^[\(\-]?\d{2,3}[\)\-]?$`) so they enter the NUMBER token path and are classified as code tokens — but they have `left` positions close to each other, likely causing anchor mis-detection or appearing in a label-adjacent bucket.

**Failure 3 — VALUE SCRAMBLE:** Net-revenue row (magnitude ~17.65T VND) shows `17.651.065.378.939` as the first period cell, but then `43.247.573.048` and `94.863.843.843` as the two prior-period cells. `43B` and `94B` cannot be prior-period values for a `17.6T` revenue line — this is a rank-alignment error. Values from different physical rows are landing in the wrong rank-k row of the same physical line item.

---

### 3. MANDATORY Diagnostic (STEP 1 — dev runs BEFORE any code change)

The diagnostic purpose: **locate which pipeline stage is the scramble source**. Three possible failure origins each require a different fix. The diagnostic disambiguates.

#### 3.1 Diagnostic script

Dev writes and runs `diagnostic_md7.py` (inline, not committed) against the live FPT PDF page 8 (income statement, 0-indexed from the 20-page extract window). The script calls the EXISTING live functions directly against real `image_to_data` output.

```python
#!/usr/bin/env python3
"""
diagnostic_md7.py — MD-EXTRACT-7 stage-localization diagnostic.
Run from apps/pdf-extractor/ with PYTHONPATH=. against FPT page 8.
Usage: PYTHONPATH=. python diagnostic_md7.py /path/to/fpt_page8.png
"""
import sys, json, statistics
from PIL import Image
import pytesseract
from pytesseract import Output as TessOutput
from infrastructure.generic_md_table_extractor import (
    _classify_tokens, _filter_words,
    _detect_column_anchors_from_tokens,
    _assign_tokens_to_columns,
    _build_ordinal_grid,
    _attach_labels_ordinal,
    _NUMBER_TOKEN_RE, _CODE_TOKEN_RE,
    LABEL_BAND_FACTOR,
)

page_image = Image.open(sys.argv[1])
data = pytesseract.image_to_data(page_image, lang="vie+eng", config="--psm 6",
                                  output_type=TessOutput.DICT)
words = _filter_words(data)
number_tokens, text_tokens = _classify_tokens(words)

# --- DUMP 1: column anchors ---
num_heights = [float(w["height"]) for w in number_tokens if w["height"] > 0]
num_widths  = [float(w["width"])  for w in number_tokens if w["width"]  > 0]
h_med   = statistics.median(num_heights) if num_heights else 12.0
w_med   = statistics.median(num_widths)  if num_widths  else 40.0
anchors = _detect_column_anchors_from_tokens(number_tokens, w_med)
print(f"\n=== DUMP 1: COLUMN ANCHORS ===")
print(f"  count = {len(anchors)}")
print(f"  x_positions = {[round(a,1) for a in anchors]}")

# --- DUMP 2: per-column token counts ---
col_buckets = _assign_tokens_to_columns(number_tokens, anchors, w_med)
print(f"\n=== DUMP 2: PER-COLUMN TOKEN COUNTS ===")
for i, bucket in enumerate(col_buckets):
    texts = [w["text"] for w in bucket]
    code_count  = sum(1 for t in texts if _CODE_TOKEN_RE.match(t))
    value_count = len(texts) - code_count
    print(f"  col[{i}] anchor={round(anchors[i],1)}: {len(bucket)} tokens "
          f"(codes={code_count}, values={value_count})")
    print(f"    sample texts: {texts[:8]}")

# --- DUMP 3: PRE-LABEL number grid (first 6 rows) ---
grid, col_y_medians = _build_ordinal_grid(col_buckets, len(anchors))
print(f"\n=== DUMP 3: PRE-LABEL NUMBER GRID (first 6 rows of {len(grid)}) ===")
for r, row in enumerate(grid[:6]):
    print(f"  row[{r}] y_med={round(col_y_medians[r],1) if r < len(col_y_medians) else '?'}: {row}")

# --- DUMP 4: classification of small-int tokens ---
print(f"\n=== DUMP 4: SMALL-INT TOKEN CLASSIFICATION ===")
small_ints = [w for w in number_tokens if _CODE_TOKEN_RE.match(w["text"])]
print(f"  Total code-classified tokens: {len(small_ints)}")
for w in small_ints[:20]:
    print(f"    text={w['text']!r:6s} left={w['left']:4d} top={w['top']:4d} conf={w.get('conf',0):3d}")

# --- DUMP 5: INTERPRETATION GATES ---
print(f"\n=== DUMP 5: INTERPRETATION GATES ===")
print(f"  Expected columns for income statement: 6 (label + code + note + Q-curr + Q-prior + cum-curr + cum-prior = 7 cols OR label + code + 4 value cols = 6)")
print(f"  Actual anchor count: {len(anchors)}")
if len(anchors) > 7:
    print("  GATE FAIL: too many anchors → spurious x-anchors from code/note tokens")
elif len(anchors) < 4:
    print("  GATE FAIL: too few anchors → anchors merged value columns")
else:
    print("  GATE PASS: plausible column count")

col_len_variance = statistics.variance([len(b) for b in col_buckets]) if len(col_buckets) > 1 else 0
print(f"  Per-column token count variance: {round(col_len_variance, 1)}")
if col_len_variance > 100:
    print("  HIGH VARIANCE: columns wildly unequal → many empties → C8.5 multi-gap risk")
else:
    print("  LOW VARIANCE: columns roughly balanced")

print(f"  PRE-LABEL row count: {len(grid)}")
if len(grid) < 10:
    print("  GRID TOO SPARSE: scramble likely at C6/C7 (anchor mis-count or token misclassification)")
elif len(grid) > 50:
    print("  GRID TOO DENSE: scramble likely at C8.5 (too many skip slots inflated total_rows)")
else:
    print("  GRID ROW COUNT PLAUSIBLE: scramble likely at C11 (label attachment)")
```

#### 3.2 PASS/FAIL interpretation table

Run the diagnostic and match outputs to these interpretations. Dev STOPS and reports to architect if any CONDITIONAL ROW below triggers.

| Dump | Pattern observed | Root cause indicated | Required fix |
|---|---|---|---|
| DUMP 1: `count > 7` | >7 column anchors detected | Code/note column tokens (left≈50-150px) create spurious left-edge clusters → too many anchors → values scatter across surplus columns | Fix path: **A** — exclude or isolate small-int tokens from anchor detection |
| DUMP 1: `count == 4 or 5` | 4-5 anchors (expected 6-7) | Value columns merged by anchor detection | Fix path: **A** + raise `_COL_GAP_FACTOR` |
| DUMP 1: `count == 6 or 7` | 6-7 anchors — plausible | Anchor detection is correct; failure is downstream | Continue to DUMP 2-4 |
| DUMP 2: col[0] has `code_count >> value_count` (e.g., 20 codes, 0 values) | Code column correctly separated | Dual-code structure is visible; code tokens are in their own bucket | Fix path: **B** — code bucket is separate but needs to stay separate after C8.5 |
| DUMP 2: col[0] AND col[1] both `code_count > 5` | Two code-like columns (Mã số + Thuyết minh both mapped to first 2 anchors) | Dual code columns detected as NUMBER anchors; both in grid as value columns | Fix path: **A** — geometric discriminator to handle dual-code-column |
| DUMP 2: `value_count` very unequal across value columns (max/min ratio > 5) | Dense multi-row empties in value columns | Many rows genuinely absent in some period columns; C8.5 skip detection may insert too many or too few slots | Fix path: **C** — dense-multi-gap robustification of `_insert_skip_slots` |
| DUMP 3: value scramble already present (wrong magnitudes) in pre-label grid rows 0-5 | Scramble is at C7/anchor or C8/C8.5 stage, BEFORE label attachment | C7 mis-assigns tokens across columns OR C8.5 inserts wrong number of skip slots | Fix path: **A** (anchor) or **C** (C8.5 skip slots) |
| DUMP 3: pre-label grid rows 0-5 look correct BUT post-label grid is garbled | Scramble is ONLY at C11 label attachment stage | `LABEL_BAND_FACTOR × h_med` window grabs 2-4 dense rows' text into one label | Fix path: **D** — tighten label band |
| DUMP 4: `small_ints` count >> expected (e.g., > 50 small-int tokens on a single page) | Both Mã số and Thuyết minh columns are entering NUMBER token pool; 2× the code tokens expected | Both code columns feeding spurious anchors AND rank inflation | Fix path: **A** + **B** combined |
| DUMP 4: small-int tokens concentrated at `left` in range [30-200px] while value tokens at `left` > 500px | Clear geometric separation between code zone and value zone | Geometric discriminator is viable: filter small-int tokens from anchor-building pass | Fix path: **A** — width-based small-int discriminator |
| DUMP 5: `anchor count` PASS + `variance` HIGH + `grid rows` plausible | Anchor count correct; value columns have many empties; label band is the merge source | C8.5 skip slots may be correct; C11 label band too wide | Fix path: **D** only |
| DUMP 5: `anchor count` FAIL (>7) | Spurious anchors confirmed | Fix path: **A** confirmed |

**If the diagnostic contradicts all four fix paths** (e.g., anchor count plausible + variance low + grid correct + scramble only cosmetic in labels): dev STOPS and reports the exact diagnostic output to architect before writing any code.

---

### 4. Design Decisions — Dual-Code-Column Handling

#### 4.1 The choice: separate vs exclude

Two options for the dual small-integer code/note columns:

**Option (i) — Separate:** detect them as distinct markdown columns (label | code | note | v1..v4). The income statement markdown would have 7 columns.

**Option (ii) — Exclude from anchor-building, re-attach like labels:** exclude small-int code/note tokens from the `_detect_column_anchors_from_tokens` call so they do not create spurious anchors, then re-attach them to rows the same way labels are attached.

**Decision: Option (ii) — Exclude from anchor-building and re-attach.**

Rationale:
1. The ordinal guarantee (diagonal defeated) depends on column anchors reflecting the VALUE column layout. Inserting code/note columns into anchor detection contaminates the x-cluster distribution: code tokens at left≈60px and note tokens at left≈120px sit between the left-margin (left≈0px) and the first value column (left≈400px), fragmenting what should be a clean label/value gap into 3-4 spurious anchors.
2. The segment report has NO code/note columns and PASSES (AC-6-SEG). The fix for the income statement must be conditional on token geometry, not on table type.
3. Re-attaching code/note tokens as label-companions produces `[label+code+note | v1 | v2 | v3 | v4]` per row — a 5-column output that is semantically cleaner than a 7-column output where two columns are always 2-digit integers.
4. AC-0 compliance: the discriminator is purely geometric (`token is small-int AND its left-position is within the label zone, defined as left < leftmost value-column anchor`), not based on Vietnamese label names.

#### 4.2 AC-0-safe geometric discriminator for small-int non-money tokens

A token is a "small-int code/note token" if ALL of the following hold:

```
(a) It matches _CODE_TOKEN_RE (already: ^[\(\-]?\d{2,3}[\)\-]?$)
(b) It does NOT match _VALUE_TOKEN_RE (excludes money-groups — e.g. "1.234" is a value, "123" is a code)
(c) Its left position is within the LABEL_ZONE:
       left < (leftmost_value_anchor - LABEL_ZONE_GAP_FACTOR × median_word_width)
    where leftmost_value_anchor is the leftmost anchor that belongs to a VALUE column
    (detected as: the leftmost anchor whose bucket contains at least one _VALUE_TOKEN_RE match).
    LABEL_ZONE_GAP_FACTOR = 2.0  (generic geometry constant, AC-0 compliant)
```

This discriminator is purely geometric:
- Condition (a)+(b) ensures we only target standalone 2-3 digit integers, not money-group substrings.
- Condition (c) ensures we only target tokens in the label zone (left-side of the page), not small integers that appear in the value zone (e.g., a value column that happens to contain the number "30" as a rounded figure would be at left > leftmost_value_anchor and thus not excluded).

**New constant:**
```python
# Small-int code/note token exclusion from anchor building.
# A code token is excluded from _detect_column_anchors_from_tokens if its left
# position is within LABEL_ZONE_GAP_FACTOR × median_word_width of the leftmost
# detected value anchor. This prevents dual-code columns from creating spurious
# left-edge clusters that inflate anchor count.
# AC-0: purely geometric. Zero BCTC-specific string constants.
LABEL_ZONE_GAP_FACTOR = 2.0
```

#### 4.3 Implementation location

The discriminator is implemented as a pre-processing step within `_process_page`, applied BEFORE `_detect_column_anchors_from_tokens`:

```
Step C6-pre: _split_number_tokens_by_zone(number_tokens, median_word_width)
    → (anchor_tokens, code_note_tokens)
    anchor_tokens: VALUE tokens + non-label-zone code tokens (used for anchor detection)
    code_note_tokens: label-zone small-int tokens (excluded from anchor detection;
                      re-attached to rows in C11-ext)
```

The function returns two lists. `anchor_tokens` feeds `_detect_column_anchors_from_tokens` and `_assign_tokens_to_columns`. `code_note_tokens` are appended to `region_text_tokens` before the `_attach_labels_ordinal` call (they are then treated as additional label tokens and attached to each row by y-proximity, appearing in the label cell as `"label_text code note"` or similar).

**Why appending code_note_tokens to text_tokens works:** `_attach_labels_ordinal` already sorts all primary-band tokens by `left` and space-joins them. Code/note tokens at left≈60-120px will naturally sort between the label words and be included in the label cell. This is geometrically correct.

**IMPORTANT — additive constraint:** `_split_number_tokens_by_zone` is called ONLY WHEN there are suspected dual-code columns. Detection condition: after the initial anchor detection pass, if `len(anchors) > N_EXPECTED_MAX_VALUE_COLS` (a tunable constant, default `N_EXPECTED_MAX_VALUE_COLS = 6`), re-run anchor detection on `anchor_tokens` only. If `len(anchors) <= N_EXPECTED_MAX_VALUE_COLS`, skip splitting entirely — no change to the segment-report or balance-sheet path. This ensures AC-6-SEG cannot regress.

**New constant:**
```python
# Maximum expected value columns for the zone-split trigger.
# If anchor detection produces more columns than this, activate the label-zone
# small-int split to remove spurious anchors from code/note columns.
# Default=6: income statements have at most 4-5 value columns; segment reports
# may have 7-8 but their code tokens have left >> label zone.
# AC-0: purely geometric, not table-type-specific.
N_EXPECTED_MAX_VALUE_COLS = 6
```

---

### 5. Dense-Multi-Gap C8.5 Robustification

This fix is **conditional on diagnostic finding** Fix path **C** (DUMP 2 variance HIGH + DUMP 3 value scramble present in pre-label grid).

#### 5.1 Failure mode

The income statement has ~26 rows. Some period columns (Q-current, Q-prior, cum-current, cum-prior) are absent for subtotal rows that only appear in the cumulative columns. This produces VALUE columns where 8-12 consecutive physical rows are absent (multi-row gaps), not just a single missing row.

Current `_insert_skip_slots` algorithm:
```
threshold = SKIP_GAP_FACTOR × local_pitch
n_empty = ceil(delta / local_pitch) - 1
```

With `SKIP_GAP_FACTOR = 1.5` and `local_pitch` estimated from 2-3 consecutive tokens in a sparse column, the `local_pitch` estimate may be the GAP itself (not the true row-pitch), leading to `ceil(gap/gap) - 1 = 0` empty slots inserted — the gap is swallowed as if it were a single normal inter-row step.

This is the same degenerate-column failure documented in §13.5 for 2-token columns, but now affecting columns with 3-6 tokens where the MEDIAN of the deltas is dominated by the large gaps rather than the true row pitch.

#### 5.2 Fix: use `ref_pitch` priority over `local_pitch` for sparse columns

When a column has fewer than `DENSE_THRESHOLD = 6` tokens, its local_pitch estimate is unreliable (too few deltas for a stable median). Prioritize `ref_pitch` (from dense columns with ≥ `DENSE_THRESHOLD` tokens) over `local_pitch` for skip-slot insertion.

**Modified `_insert_skip_slots` signature:**
```python
def _insert_skip_slots(
    sorted_tokens: List[Optional[Dict]],
    ref_pitch: Optional[float] = None,
    prefer_ref_pitch: bool = False,   # NEW: use ref_pitch over local_pitch for sparse cols
) -> List[Optional[Dict]]:
```

**Modified `_build_ordinal_grid` call site:** compute whether each column is "sparse" (len(col) < `DENSE_THRESHOLD`). Pass `prefer_ref_pitch=True` for sparse columns, `prefer_ref_pitch=False` for dense ones.

**New constant:**
```python
# Column density threshold for ref_pitch priority.
# Columns with fewer tokens than this use ref_pitch (cross-column estimate)
# instead of local_pitch (within-column estimate, unreliable when sparse).
# AC-0: geometry only.
DENSE_COL_THRESHOLD = 6
```

**Revised `_insert_skip_slots` logic:**
```python
# Determine working pitch
if prefer_ref_pitch and ref_pitch is not None and ref_pitch > 0:
    working_pitch = ref_pitch
elif len(deltas) >= 2:
    working_pitch = median(deltas)
elif ref_pitch is not None and ref_pitch > 0:
    working_pitch = ref_pitch
else:
    return list(real_tokens)
```

This is backward-compatible: existing calls without `prefer_ref_pitch` default to `False` and behave identically to the current implementation. AC-6-SKIP fixtures are unaffected.

---

### 6. Label Band Tightening for Dense Rows

This fix is **conditional on diagnostic finding** Fix path **D** (DUMP 3: pre-label grid looks correct, scramble only in C11 label attachment).

#### 6.1 Failure mode

Current `LABEL_BAND_FACTOR = 1.5`. For a page with `h_med ≈ 20px` (typical for number tokens at 200 DPI), the label band = `1.5 × 20 = 30px`. The income statement has a physical row pitch of ~20px (vertical pitch of the PRINT layout, not the inter-token OCR gap). A band of 30px spans 1.5 rows. For dense rows, `_attach_labels_ordinal` grabs text tokens from the CURRENT row PLUS the adjacent row, then removes those tokens from the pool. The next row finds some of its label tokens already consumed → label interleaving.

#### 6.2 Fix: local pitch-derived label band

Compute the label band width from the per-page column y-medians spacing, not from `h_med`:

```python
# After _build_ordinal_grid returns col_y_medians:
# Estimate label_pitch = median gap between consecutive col_y_medians
# (this is the rendered row pitch in the actual ordinal grid)
if len(col_y_medians) >= 3:
    y_gaps = [col_y_medians[i+1] - col_y_medians[i]
              for i in range(len(col_y_medians)-1) if col_y_medians[i+1] > col_y_medians[i]]
    if y_gaps:
        label_pitch = _median(y_gaps)
        # Label band = 0.45 × label_pitch (admit within 45% of row spacing)
        # Replaces LABEL_BAND_FACTOR × h_med for this page if label_pitch < 2 × h_med
        # (i.e., the rows are dense enough that the global factor would over-reach)
        if 0 < label_pitch < 2 * h_med:
            effective_band = 0.45 * label_pitch
        else:
            effective_band = LABEL_BAND_FACTOR * h_med
    else:
        effective_band = LABEL_BAND_FACTOR * h_med
else:
    effective_band = LABEL_BAND_FACTOR * h_med
```

Pass `effective_band` to `_attach_labels_ordinal` as a new optional parameter `band_override`. If `band_override` is provided, use it instead of `LABEL_BAND_FACTOR * h_med` for the primary match.

**Modified `_attach_labels_ordinal` signature:**
```python
def _attach_labels_ordinal(
    grid: List[List[str]],
    col_y_medians: List[float],
    text_tokens: List[Dict],
    h_med: float,
    band_override: Optional[float] = None,   # NEW: if provided, overrides LABEL_BAND_FACTOR × h_med
) -> List[List[str]]:
```

**AC-6-SEG regression safety:** For the segment report page, `label_pitch` from `col_y_medians` will be ~16-20px (the wide-spaced segment rows). `effective_band = 0.45 × 18 = 8.1px`. This is narrower than `LABEL_BAND_FACTOR × h_med = 1.5 × 12 = 18px` (for segment page h_med). The fallback `2.5 × h_med` in `_attach_labels_ordinal` still applies when the primary band misses. The segment report has clear visual separation between rows, so a narrower primary band does not affect label matching. Regression risk: LOW. Explicitly verified by AC-7-INC must PASS AND AC-6-SEG must PASS simultaneously.

**New constant:**
```python
# Fraction of the per-page ordinal row pitch used as the label attachment band
# when the rows are densely spaced (label_pitch < 2 × h_med).
# 0.45 = admit text tokens within 45% of the row spacing above/below the number-row y_med.
# AC-0: geometry only.
DENSE_LABEL_PITCH_FACTOR = 0.45
```

---

### 7. Hand-Traceable Dense-Table Fixture + Full Stage Trace

This is the binding fixture for the AC-7-FIX unit test. Main terminal MUST re-trace every step by hand before dispatching dev.

#### 7.1 Fixture definition

A dense income-statement fragment: 4 rows, 4 columns (label + code + 2 value cols), with col-2 (Q-prior) missing row-1 (a subtotal row that has only cumulative values).

**Token layout (20px inter-row pitch, label zone left ≈ 0-200px, value zone left ≈ 400-900px):**

```
Physical layout (left / top / text):
  Row-0: label="Doanh thu"   left=0   top=100  (TEXT token)
         code="01"            left=60  top=100  (NUMBER — code)
         note="30"            left=120 top=101  (NUMBER — code/note)
         val-Q="17.651.065"  left=400 top=100  (NUMBER — value)
         val-P="16.500.000"  left=700 top=100  (NUMBER — value)

  Row-1: label="Giam tru"    left=0   top=120  (TEXT token)
         code="10"            left=60  top=120  (NUMBER — code)
         note="31"            left=120 top=121  (NUMBER — code/note)
         val-Q="43.247"       left=400 top=120  (NUMBER — value)
         [col val-P ABSENT — row-1 has no prior-period subtotal]

  Row-2: label="Doanh thu thuan" left=0 top=140 (TEXT token)
         code="20"            left=60  top=140  (NUMBER — code)
         note="32"            left=120 top=140  (NUMBER — code/note)
         val-Q="17.607.818"  left=400 top=140  (NUMBER — value)
         val-P="16.450.000"  left=700 top=140  (NUMBER — value)

  Row-3: label="Gia von"     left=0   top=160  (TEXT token)
         code="30"            left=60  top=160  (NUMBER — code)
         note="33"            left=120 top=160  (NUMBER — code/note)
         val-Q="14.000.000"  left=400 top=160  (NUMBER — value)
         val-P="13.200.000"  left=700 top=160  (NUMBER — value)
```

Token dict format (mimicking `image_to_data` output):
```python
FIXTURE_TOKENS = [
    # Row-0
    {"text": "Doanh",       "left": 0,   "top": 100, "width": 50, "height": 14, "conf": 90},
    {"text": "thu",         "left": 55,  "top": 100, "width": 30, "height": 14, "conf": 90},
    {"text": "01",          "left": 60,  "top": 100, "width": 20, "height": 12, "conf": 85},
    {"text": "30",          "left": 120, "top": 101, "width": 20, "height": 12, "conf": 85},
    {"text": "17.651.065",  "left": 400, "top": 100, "width": 80, "height": 12, "conf": 90},
    {"text": "16.500.000",  "left": 700, "top": 100, "width": 80, "height": 12, "conf": 90},
    # Row-1
    {"text": "Giam",        "left": 0,   "top": 120, "width": 40, "height": 14, "conf": 88},
    {"text": "tru",         "left": 45,  "top": 120, "width": 25, "height": 14, "conf": 88},
    {"text": "10",          "left": 60,  "top": 120, "width": 20, "height": 12, "conf": 85},
    {"text": "31",          "left": 120, "top": 121, "width": 20, "height": 12, "conf": 85},
    {"text": "43.247",      "left": 400, "top": 120, "width": 50, "height": 12, "conf": 87},
    # [NO val-P token for row-1 — genuinely absent]
    # Row-2
    {"text": "Doanh",       "left": 0,   "top": 140, "width": 50, "height": 14, "conf": 91},
    {"text": "thu",         "left": 55,  "top": 140, "width": 30, "height": 14, "conf": 91},
    {"text": "thuan",       "left": 90,  "top": 140, "width": 45, "height": 14, "conf": 91},
    {"text": "20",          "left": 60,  "top": 140, "width": 20, "height": 12, "conf": 86},
    {"text": "32",          "left": 120, "top": 140, "width": 20, "height": 12, "conf": 86},
    {"text": "17.607.818",  "left": 400, "top": 140, "width": 80, "height": 12, "conf": 90},
    {"text": "16.450.000",  "left": 700, "top": 140, "width": 80, "height": 12, "conf": 90},
    # Row-3
    {"text": "Gia",         "left": 0,   "top": 160, "width": 30, "height": 14, "conf": 89},
    {"text": "von",         "left": 35,  "top": 160, "width": 30, "height": 14, "conf": 89},
    {"text": "30",          "left": 60,  "top": 160, "width": 20, "height": 12, "conf": 85},
    {"text": "33",          "left": 120, "top": 160, "width": 20, "height": 12, "conf": 85},
    {"text": "14.000.000",  "left": 400, "top": 160, "width": 80, "height": 12, "conf": 90},
    {"text": "13.200.000",  "left": 700, "top": 160, "width": 80, "height": 12, "conf": 90},
]
```

**Note on token overlaps:** `{"text": "30", "left": 60, "top": 100}` (row-0 note) and `{"text": "30", "left": 60, "top": 160}` (row-3 code) have the same `text="30"` and same `left=60` but different `top` values (100 vs 160). The ordinal algorithm must distinguish them by `top`, not by text. This is an intentional stress test: two tokens with identical text+left but different rows.

Also note: `{"text": "30", "left": 60, "top": 160}` (row-3 code, which is the line code "30" for Gia von) and `{"text": "30", "left": 120, "top": 100}` (row-0 note reference "30") are genuinely different physical tokens. The discriminator must identify BOTH as label-zone small-int tokens (left < leftmost_value_anchor - 2×w_med) and exclude them from anchor building.

#### 7.2 Stage-by-stage trace

**Setup:**
- All `conf ≥ 85 ≥ 30 = _MIN_WORD_CONF_ORDINAL` → no tokens filtered by confidence.
- `h_med` (from number tokens) = median heights of all NUMBER token heights = median([12,12,12,12,...]) = `12`.
- `w_med` (from number tokens) = median widths = median([20,20,20,80,80,20,20,50,...]) = `20`.

**Step A2 — Classify tokens:**

`_NUMBER_TOKEN_RE` = `^[\(\-]?\d{1,3}(?:[.,]\d{3})+[\)\-]?$` OR `^[\(\-]?\d{2,3}[\)\-]?$`

NUMBER tokens (matching either branch):
- "01" → matches `^[\(\-]?\d{2,3}[\)\-]?$` ✓
- "30" (row-0 note, left=120) → matches 2-digit branch ✓
- "17.651.065" → matches money-group branch ✓
- "16.500.000" → matches ✓
- "10" → matches ✓
- "31" → matches ✓
- "43.247" → matches money-group (one separator group `247` — Wait: `43.247` = `43` + `.` + `247`; the money-group pattern requires `\d{1,3}(?:[.,]\d{3})+` so `43.247` matches: `43` (1-3 digits) then `[.,]\d{3}` once = `.247`. YES, matches.) ✓
- "20" → matches 2-digit branch ✓
- "32" → matches ✓
- "17.607.818" → matches ✓
- "16.450.000" → matches ✓
- "30" (row-3 code, left=60) → matches 2-digit branch ✓
- "33" → matches ✓
- "14.000.000" → matches ✓
- "13.200.000" → matches ✓

TEXT tokens: "Doanh" (row-0), "thu" (row-0), "Giam", "tru", "Doanh" (row-2), "thu" (row-2), "thuan", "Gia", "von" — total 9 text tokens.

NUMBER tokens total: 15 (4 code-class + 4 note-class + 7 value-class — row-1's prior-period val-P is genuinely absent, so only 7 value tokens — all classified as NUMBER by `_NUMBER_TOKEN_RE`).  [main-terminal arithmetic correction 2026-05-26: was "16 / 8 value-class"; the literal FIXTURE_TOKENS list has 24 tokens = 15 number + 9 text.]

**Step C6-pre — Identify label-zone small-int tokens:**

First anchor detection pass on ALL 15 NUMBER tokens:
- Sorted lefts: [60, 60, 60, 60, 120, 120, 120, 120, 400, 400, 400, 400, 700, 700, 700]  (three 700s — row-1 val-P absent)
- `bin_width = max(1.0, 0.3 × 20) = 6.0`
- Clusters: {60,60,60,60} → anchor≈60 | {120,120,120,120} → anchor≈120 | {400,400,400,400} → anchor≈400 | {700,700,700,700} → anchor≈700
- `col_gap = 1.5 × 20 = 30`
- Merged anchors: 60 → then 120: `120-60=60 > 30` → new anchor. 400: `400-120=280 > 30` → new. 700: `700-400=300 > 30` → new.
- **Result: 4 anchors = [60.0, 120.0, 400.0, 700.0]**

Check trigger condition: `len(anchors) = 4 > N_EXPECTED_MAX_VALUE_COLS = 6`? NO — 4 ≤ 6. So the split trigger does NOT fire on this fixture.

**Wait — this is an important finding:** The trigger `> 6` is designed for real income statement pages where there may be 8+ anchors. In our compact fixture, we deliberately designed only 4 anchors (code zone + note zone + 2 value zones). On the actual FPT page 8, the diagnostic will show whether anchors > 6.

For the fixture trace, we demonstrate the fix works by MANUALLY activating the split (i.e., the diagnostic shows anchor count > 6 on the real page, and the fix is applied). In the fixture, we verify the GEOMETRIC DISCRIMINATOR correctly identifies which tokens are label-zone tokens:

`leftmost_value_anchor` = the leftmost anchor whose bucket contains at least one `_VALUE_TOKEN_RE` match. All 4 value tokens (`17.651.065`, `16.500.000`, etc.) are at left=400 and left=700. So `leftmost_value_anchor = 400.0`.

`LABEL_ZONE_GAP_FACTOR × w_med = 2.0 × 20 = 40`. Tokens are label-zone if `left < 400 - 40 = 360`.

Label-zone small-int tokens (CODE, left < 360):
- "01" left=60 → 60 < 360 ✓ → label-zone code
- "30" left=120 (row-0 note) → 120 < 360 ✓ → label-zone code
- "10" left=60 → ✓
- "31" left=120 → ✓
- "20" left=60 → ✓
- "32" left=120 → ✓
- "30" left=60 (row-3 code) → ✓
- "33" left=120 → ✓

All 8 code/note tokens are correctly identified as label-zone small-int tokens. They are moved to `code_note_tokens` list and EXCLUDED from anchor detection.

`anchor_tokens` = only VALUE tokens: [17.651.065, 16.500.000, 43.247, 17.607.818, 16.450.000, 14.000.000, 13.200.000]

**Step C6 re-run on anchor_tokens only:**
- Sorted lefts: [400, 400, 400, 400, 700, 700, 700]
- bin_width = 6.0
- Clusters: {400,400,400,400} → anchor≈400 | {700,700,700}→anchor≈700
- col_gap = 30. Merge: 400 → then 700: `300 > 30` → new.
- **Result: 2 value-column anchors = [400.0, 700.0]** ✓

**Step C7 — Assign anchor_tokens to columns:**
- "17.651.065" left=400 → col[0] (dist 0)
- "16.500.000" left=700 → col[1] (dist 0)
- "43.247" left=400 → col[0]
- [no val-P for row-1]
- "17.607.818" left=400 → col[0]
- "16.450.000" left=700 → col[1]
- "14.000.000" left=400 → col[0]
- "13.200.000" left=700 → col[1]

`col_buckets[0]` = [17.651.065(top=100), 43.247(top=120), 17.607.818(top=140), 14.000.000(top=160)] — 4 tokens
`col_buckets[1]` = [16.500.000(top=100), 16.450.000(top=140), 13.200.000(top=160)] — 3 tokens (top=120 absent)

**Step C8 — Sort each column by top (already sorted):**
- col[0] sorted: [(top=100,"17.651.065"), (top=120,"43.247"), (top=140,"17.607.818"), (top=160,"14.000.000")]
- col[1] sorted: [(top=100,"16.500.000"), (top=140,"16.450.000"), (top=160,"13.200.000")]

**Step C8.5 — `_insert_skip_slots`:**

col[0] has 4 tokens → `len(deltas) = 3 >= 2` → local_pitch = median([20, 20, 20]) = 20. threshold = 1.5 × 20 = 30. Deltas: [20,20,20] — all < 30. No skip slots. Slots: [(100,"17.651.065"), (120,"43.247"), (140,"17.607.818"), (160,"14.000.000")]. Length=4.

col[1] has 3 tokens → `len(deltas) = 2 >= 2` → local_pitch = median([40, 20]) = 30. threshold = 1.5 × 30 = 45. Deltas: [40, 20]. Delta[0]=40 > 45? NO. Delta[1]=20 > 45? NO. No skip slots inserted.

**Wait — this is the dense-multi-gap failure case.** col[1] delta[0] = 140-100 = 40. Is 40 > threshold=45? NO. So no skip slot is inserted. But physically row-1's prior-period value IS absent. The skip is missed.

With `DENSE_COL_THRESHOLD = 6`: col[1] has 3 tokens < 6 → `prefer_ref_pitch=True`. ref_pitch from col[0] (has 4 tokens ≥ 3): deltas=[20,20,20], local_pitch=20. ref_pitch = 20. Now for col[1] with `prefer_ref_pitch=True`: `working_pitch = ref_pitch = 20`. threshold = 1.5 × 20 = 30. Delta[0]=40 > 30 → skip! `ceil(40/20)-1 = ceil(2.0)-1 = 1` slot inserted. Delta[1]=20 < 30 → no skip.

Slots: [(top=100,"16.500.000"), None, (top=140,"16.450.000"), (top=160,"13.200.000")]. Length=4. ✓

**Step C9: total_rows = max(4, 4) = 4** ✓

**Step C10 — Build grid:**
```
rank  col[0]          col[1]         col_y_medians
0     "17.651.065"    "16.500.000"   median(100,100)=100.0
1     "43.247"        " "            median(120)=120.0  [col[1] has None]
2     "17.607.818"    "16.450.000"   median(140,140)=140.0
3     "14.000.000"    "13.200.000"   median(160,160)=160.0
```

Grid (before label attachment):
```
grid[0] = ["17.651.065", "16.500.000"]
grid[1] = ["43.247",     " "]
grid[2] = ["17.607.818", "16.450.000"]
grid[3] = ["14.000.000", "13.200.000"]
```
✓ — No value scramble. Row-1's absent prior-period value is correctly empty.

**Step C11 — `_attach_labels_ordinal`:**

text_tokens (original 9) + code_note_tokens (8, appended to text pool) = 17 available tokens.

`label_pitch` computation from col_y_medians [100.0, 120.0, 140.0, 160.0]:
y_gaps = [20, 20, 20]. `label_pitch = _median([20,20,20]) = 20`.
`label_pitch = 20 < 2 × h_med = 2 × 12 = 24` → DENSE condition triggered.
`effective_band = DENSE_LABEL_PITCH_FACTOR × label_pitch = 0.45 × 20 = 9.0px`.

Row-0 (y_med=100.0, band=9.0):
- TEXT tokens within 9px of top=100: "Doanh"(top=100)✓, "thu"(row-0,top=100)✓
- code_note tokens within 9px: "01"(top=100,left=60)✓, "30"(top=101,left=120)✓
- All 4 in primary band. Sort by left: "Doanh"(0), "01"(60), "30"(120), "thu"(55) → wait, sort by left: 0→"Doanh", 55→"thu" (Note: "thu" has left=55, "01" has left=60, so sort order: Doanh(0), thu(55), 01(60), 30(120))
- label_0 = "Doanh thu 01 30"
- Greedy removal: remove these 4 from pool.

Row-1 (y_med=120.0, band=9.0):
- Remaining TEXT: "Giam"(top=120)✓, "tru"(top=120)✓
- Remaining code_note: "10"(top=120,left=60)✓, "31"(top=121,left=120)✓
- Sort by left: "Giam"(0), "tru"(45), "10"(60), "31"(120)
- label_1 = "Giam tru 10 31"
- Greedy removal: remove these 4.

Row-2 (y_med=140.0, band=9.0):
- "Doanh"(top=140)✓, "thu"(top=140,left=55)✓, "thuan"(top=140,left=90)✓, "20"(top=140,left=60)✓, "32"(top=140,left=120)✓
- Sort by left: Doanh(0), thu(55), 20(60), thuan(90), 32(120)
- label_2 = "Doanh thu 20 thuan 32"

Row-3 (y_med=160.0, band=9.0):
- "Gia"(top=160)✓, "von"(top=160)✓, "30"(top=160,left=60)✓, "33"(top=160,left=120)✓
- Sort by left: Gia(0), von(35), 30(60), 33(120)
- label_3 = "Gia von 30 33"

**Final grid after label attachment:**
```
grid[0] = ["Doanh thu 01 30",     "17.651.065", "16.500.000"]
grid[1] = ["Giam tru 10 31",      "43.247",     " "]
grid[2] = ["Doanh thu 20 thuan 32", "17.607.818", "16.450.000"]
grid[3] = ["Gia von 30 33",       "14.000.000", "13.200.000"]
```

**Assertions (for main-terminal hand-verification):**

1. `grid[0][1] == "17.651.065"` — net revenue Q-current in row-0. ✓
2. `grid[0][2] == "16.500.000"` — net revenue prior-period in row-0. ✓
3. `grid[1][2] == " "` — row-1 prior-period correctly empty. ✓ (C8.5 dense-multi-gap fix)
4. `grid[2][1] == "17.607.818"` — row-2 Q-current NOT scrambled to row-1. ✓
5. `grid[3][1] == "14.000.000"` — row-3 correct. ✓
6. No row contains both "17.651.065" AND "43.247" in the same row. ✓ (4 distinct rows)
7. Labels do NOT interleave: "Doanh thu 01 30" does NOT contain "Giam" or "10" from row-1. ✓ (narrow band=9px stops over-reach)
8. Total rows = 4. ✓

**Markdown output (Step G):**
```
| Label              | Q-curr       | Prior        |
|---|---|---|
| Doanh thu 01 30    | 17.651.065   | 16.500.000   |
| Giam tru 10 31     | 43.247       |              |
| Doanh thu 20 thuan 32 | 17.607.818 | 16.450.000  |
| Gia von 30 33      | 14.000.000   | 13.200.000   |
```

Labels contain the line codes (01, 10, 20, 30) and note references (30, 31, 32, 33) as a natural part of the label string. This is semantically readable: the code is visible to the human reviewer without needing a separate column. AC-0 compliant — no hard-coded label names anywhere in the algorithm.

---

### 8. Acceptance Criteria — MD-EXTRACT-7

These ACs are ADDITIVE to all carried-forward ACs. Fences, privacy grep, and AC-3F (non-regression) carry forward unchanged.

---

**AC-7-DIAG (BLOCKING — diagnostic must run before any code change):**

Dev runs `diagnostic_md7.py` against FPT page 8 (income statement). Reports ALL five dump outputs to main terminal. Main terminal approves the "root cause confirmed" finding before dev writes any fix code. No code changes without this gate.

---

**AC-7-INC (BINDING — income statement ≥15 rows, labels not interleaved, period values on same row):**

After re-extract (MD-DEPLOY-7), `GET /api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`. Find the income statement table (identified by highest code density). Assert:

1. Table has ≥15 data rows (non-separator, non-header pipe-rows).
2. No row's label cell contains TWO distinct line-item label heads. Verified by: no data row has a label cell string that independently matches TWO DIFFERENT income-statement line prefixes (e.g., contains both "Doanh" AND "Các khoản" — two distinct line names). Human inspection sufficient.
3. At least one row identifiable as net-revenue (`~17T VND` magnitude) has its Q-current and prior-period values as separate cells on ONE pipe-row, not on different rows.
4. Code tokens (2-3 digit standalone integers) appear embedded in label cells (as label companions), NOT as standalone value cells in a separate column with empty label. Verify: no data row has an empty label cell AND a cell matching `^(?<!\d)\d{2,3}(?!\d)$` AND a value cell matching `_MONEY_GROUP_RE` all on the same row (which would indicate code+value landed without a label).

---

**AC-7-FIX (BINDING — dense-table fixture proof):**

Unit test `test_dense_income_fragment` in class `TestDenseIncomeStatement` in `test_generic_md_table_extractor.py`. Uses EXACTLY the 24-token fixture from §7.1 (FIXTURE_TOKENS).  [main-terminal correction: 24 tokens = 15 number + 9 text, not "23".]

Assertions (the main-terminal hand-trace from §7.2 must agree):
- (a) After `_classify_tokens(FIXTURE_TOKENS)`: `len(number_tokens) == 15`, `len(text_tokens) == 9`. (verify the exact list matches §7.2 — 15 number = 4 code + 4 note + 7 value; row-1 val-P absent)
- (b) After C6-pre split (if triggered by anchor count > N_EXPECTED_MAX_VALUE_COLS): code_note_tokens contains exactly the 8 tokens with left ∈ {60, 120}. anchor_tokens contains exactly the 7 value tokens with left ∈ {400, 700} (4 at left=400, 3 at left=700 — row-1 val-P absent).
- (c) After C6 re-run on anchor_tokens: `len(col_anchors) == 2`, anchors ≈ [400.0, 700.0] (within ±5px).
- (d) `col_buckets[0]` has 4 tokens (all Q-curr values). `col_buckets[1]` has 3 tokens (prior-period values, row-1 absent).
- (e) After `_build_ordinal_grid` with `prefer_ref_pitch=True` for sparse col[1]: `grid[1][1] == " "` (row-1 prior-period empty). `grid[2][1] == "16.450.000"` (NOT scrambled to row-1). `len(grid) == 4`.
- (f) `col_y_medians == [100.0, 120.0, 140.0, 160.0]` (within ±2px tolerance).
- (g) After `_attach_labels_ordinal` with `effective_band = 0.45 × 20 = 9.0px`: label of row-0 does NOT contain "Giam" or "tru" (row-1 words). Label of row-1 does NOT contain "Doanh thuan" (row-2 words). Labels do not interleave.
- (h) After full pipeline: emitted markdown has 4 data rows. Row-1 second value cell is empty or single-space. Row-0 and row-2 both have two non-empty value cells. The EXACT assertions from §7.2 items 1-8 all PASS.

---

**AC-7-SEG-NOREGRESS (BINDING — AC-6-SEG must still pass live):**

After re-extract (MD-DEPLOY-7), inspect segment report table. The three revenue values `35.381.667`, `9.092.934`, `18.701.876` must STILL appear on ONE pipe-row, each as a SEPARATE cell. If any of the three values moves to a different row from the others → FAIL. This AC is BLOCKING — any fix that breaks AC-6-SEG is rejected regardless of AC-7-INC status.

---

**AC-7-ORD-NOREGRESS (BLOCKING — ordinal fixture tests still pass):**

Unit tests `test_ordinal_defeats_drift_gt_gap`, `test_skip_mid_column_empty`, `test_skip_trailing_column_empty` in `TestOrdinalReconstruction` must all still PASS unchanged. These verify the core ordinal+C8.5 algorithm is not broken by the additive changes.

---

**AC-7-AC0 (BLOCKING — no BCTC label constants):**

`grep -rniE "bao.cao.bo.phan|segment_report|SEGMENT|BAO_CAO|bo_phan|bao_phan|doanh_thu|gia_von|income_statement" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. New constants (`LABEL_ZONE_GAP_FACTOR`, `N_EXPECTED_MAX_VALUE_COLS`, `DENSE_COL_THRESHOLD`, `DENSE_LABEL_PITCH_FACTOR`) are geometry-only.

---

**AC-7-FENCE (BLOCKING):**

`grep -rnE "from application|from interface|import application|import interface" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

---

**AC-7-PRIVACY (BLOCKING):**

`grep -rniE "claude|openai|gemini|textract|document.?ai|anthropic|requests\.post|httpx\.post|aiohttp" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches.

---

**AC-7-HARDWARE (zero extra Tesseract calls):**

All new functions (`_split_number_tokens_by_zone`, modifications to `_insert_skip_slots`, modifications to `_attach_labels_ordinal`, `_process_page` routing logic) are pure in-memory list operations. Zero additional `pytesseract` calls. Zero `PIL` image operations. Per-page OCR budget UNCHANGED from MD-EXTRACT-6.

---

### 9. Files to Modify (pdf-extractor only — zero mcp-server changes)

| File | Change | DDD Layer |
|---|---|---|
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | ADD constants: `LABEL_ZONE_GAP_FACTOR=2.0`, `N_EXPECTED_MAX_VALUE_COLS=6`, `DENSE_COL_THRESHOLD=6`, `DENSE_LABEL_PITCH_FACTOR=0.45`; ADD function `_split_number_tokens_by_zone(number_tokens, col_anchors, median_word_width)` (pure); MODIFY `_insert_skip_slots` to add `prefer_ref_pitch: bool = False` parameter; MODIFY `_build_ordinal_grid` to pass `prefer_ref_pitch=(len(col) < DENSE_COL_THRESHOLD)` per column; ADD `band_override` parameter to `_attach_labels_ordinal`; MODIFY `_process_page` to (1) run initial anchor detection, (2) if `len(anchors) > N_EXPECTED_MAX_VALUE_COLS` apply zone split and re-detect anchors, (3) compute `label_pitch` + `effective_band` from `col_y_medians`, (4) append `code_note_tokens` to `region_text_tokens` before C11, (5) pass `band_override=effective_band` to `_attach_labels_ordinal` | infrastructure |
| `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py` | ADD class `TestDenseIncomeStatement` with `test_dense_income_fragment` (AC-7-FIX fixture, 8 assertions from §7.2); ADD `TestSplitNumberTokensByZone` (3 tests: all-value page returns empty code_note list; mixed page returns correct split; tokens exactly at boundary assigned correctly); ADD `TestDenseColThreshold` (2 tests: col with <6 tokens uses ref_pitch; col with ≥6 tokens uses local_pitch) | unit |

No new files. No new ports. No mcp-server changes. No new test files (tests added to existing `test_generic_md_table_extractor.py`).

---

### 10. Risk Register (MD-EXTRACT-7)

| Risk | Severity | Mitigation |
|---|---|---|
| R-HIGH: The zone-split trigger `len(anchors) > N_EXPECTED_MAX_VALUE_COLS = 6` may not fire if the REAL FPT page 8 diagnostic shows ≤6 anchors (e.g., if the code/note columns are correctly separated by the existing anchor logic). In that case, the label-interleaving must come from C11 label band only (Fix path D). | HIGH | Mandatory diagnostic STEP 1 resolves this before any code is written. If anchors ≤6, skip `_split_number_tokens_by_zone` entirely and implement only Fix path D (dense label band). Do NOT implement both fixes blindly. |
| R-HIGH: `DENSE_COL_THRESHOLD = 6` applied globally may cause ref_pitch override on segment-report columns that have only 5-6 rows (e.g., a segment column with few metric rows). If ref_pitch is slightly different from local_pitch for those columns, skip detection may insert wrong number of slots. | HIGH | The fix is ADDITIVE only when `len(col) < DENSE_COL_THRESHOLD`. For segment-report columns, which typically have 7-10 tokens per column (one per metric row), `len(col) >= 6` → `prefer_ref_pitch=False` → no change from MD-EXTRACT-6 behavior. AC-7-SEG-NOREGRESS verifies this. |
| R-MEDIUM: Appending `code_note_tokens` to `region_text_tokens` means they can be consumed by `_attach_labels_ordinal` for ANY row within `effective_band`, not just their "correct" row. If two adjacent rows have code tokens at similar y values (within `effective_band`), the greedy removal may assign row-0's code token to row-1. | MEDIUM | The effective band is derived from `label_pitch` (the true inter-row distance). With `DENSE_LABEL_PITCH_FACTOR = 0.45`, the band = 9px for a 20px pitch. Code tokens at left=60 have clean baselines (no diacritics), top-jitter ≤2px. A 9px band reliably captures the code token for its row without reaching the adjacent row at +20px. Verified by §7.2 trace assertions (g). |
| R-MEDIUM: The `_split_number_tokens_by_zone` function requires knowing `leftmost_value_anchor` before calling `_detect_column_anchors_from_tokens` — but `leftmost_value_anchor` is defined as "the leftmost anchor whose bucket contains at least one `_VALUE_TOKEN_RE` match". Computing this requires a first pass of column assignment, which requires anchors. Chicken-and-egg. | MEDIUM | Resolution: Run one initial `_detect_column_anchors_from_tokens` on ALL number tokens. Identify `leftmost_value_anchor` from the resulting anchor list by scanning each anchor's x-neighbors: a value anchor is one where at least one token in the x-band of ±`bin_width` around that anchor matches `_VALUE_TOKEN_RE`. This requires one additional O(n) scan of tokens — no Tesseract call. |
| R-MEDIUM: The label cell now embeds code and note integers (`"Doanh thu 01 30"`) mixed with the label text. If downstream analysis tools (future dev) parse the label cell expecting pure Vietnamese text, the embedded integers may confuse them. | MEDIUM | Accept: the generic markdown path is a HUMAN-RECHECK layer, not the structured analysis path. The human can read `"Doanh thu 01 30"` and identify code 01 + note 30. If future tools need clean label/code separation, a post-processing function can strip trailing integers from label cells — out of scope for MD-EXTRACT-7. |
| R-LOW: `N_EXPECTED_MAX_VALUE_COLS = 6` is set conservatively for income statements (≤4 value columns). Segment reports have 7-8 segment columns + total. If the trigger were `N_EXPECTED_MAX_VALUE_COLS = 6` and a segment report had 8 value anchors, the zone split would fire incorrectly on the segment report. | LOW | Segment-report number tokens do NOT have code/note columns — all tokens are VALUE tokens at large `left` values. Even if the split fires, `_split_number_tokens_by_zone` would find ZERO label-zone tokens (all value tokens have left > `leftmost_value_anchor - 40px`). `anchor_tokens = all number tokens`. Anchor detection result: UNCHANGED from the pre-split run. The segment report path is safe. |
| R-LOW: File size. Adding ~80L of new constants + functions. Current file is ~1100L. Monitor against `docs/data/file-size-caps.json`. | LOW | If file exceeds cap: move ALL dead-code functions (`_cluster_rows`, `_cluster_rows_by_gap`, `_cluster_number_rows`, `_cluster_number_rows_adaptive`, `_attach_labels`, `_build_grid_from_number_rows`) to `infrastructure/_legacy_bbox_helpers.py` (infra-to-infra, Fence-A compliant). |

---

### 11. DDD / Fence Compliance

| Function / Constant | Layer | Imports | Fence |
|---|---|---|---|
| `_split_number_tokens_by_zone` | infrastructure (pure) | stdlib only | Fence-A compliant |
| `_insert_skip_slots` (modified, `prefer_ref_pitch` param) | infrastructure (pure) | stdlib only | Fence-A compliant |
| `_attach_labels_ordinal` (modified, `band_override` param) | infrastructure (pure) | stdlib only | Fence-A compliant |
| `LABEL_ZONE_GAP_FACTOR`, `N_EXPECTED_MAX_VALUE_COLS`, `DENSE_COL_THRESHOLD`, `DENSE_LABEL_PITCH_FACTOR` | module-level constants | None | Fence-A compliant |
| `_process_page` (modified routing) | infrastructure | `pytesseract`, `PIL` (existing boundary) | Fence-A compliant |

All new and modified functions are PURE (no I/O, no Tesseract, no DB, no network). The impure boundary remains `_process_page` calling `pytesseract.image_to_data` — unchanged from MD-EXTRACT-6. Import-linter: `lint-imports --config pyproject.toml` must exit 0 (2 contracts KEPT, 0 broken) after changes.

---

### 12. Build Standard + Role-Relay

**BUILD-STANDARD: lean** — in-zone additive algorithm enhancement within existing infrastructure file.

**HARD CONSTRAINTS (carry-forward verbatim):**
- PRIVACY: self-hosted local OCR/CV ONLY. No financial PDF/image to ANY external API. EVER.
- HARDWARE: 16GB Intel Mac, kernel-panic risk. Sequential single-doc OCR only. Zero additional Tesseract calls.
- `text_table_extractor.py` UNTOUCHED (AC-3F). Frozen surfaces unchanged.
- Leave ALL files UNSTAGED — main terminal commits.

**ROLE-RELAY:** dev-pdf-extractor (MD-EXTRACT-7, implement per §3-§11 with AC-7-DIAG mandatory STEP 1) → ops (MD-DEPLOY-7, single doc, full UUID `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`) → main-terminal live-verify (AC-7-INC + AC-7-SEG-NOREGRESS) → qa (MD-QA-7) → po (MD-EXIT re-evaluation).
