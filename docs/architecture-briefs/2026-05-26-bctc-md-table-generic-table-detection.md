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

## 10. Brownfield Findings Summary

- **Zone:** `apps/pdf-extractor/` (extraction) + `apps/mcp-server/` (inspector/storage)
- **Build Standard:** lean (existing services, additive feature)
- **Verified reuse:** `_norm()`, `_is_recognized_section_header()` from `text_table_extractor.py` reusable in the new module. `PdfOcrAdapter` rasterization pattern reusable (image_to_data on same PIL Image). `pushBctcTableHandler.ts` as the structural template for the new push handler. `handleBctcInspectTable` as the structural template for the new inspect handler.
- **Confirmed zero-collision:** structured path untouched; separate DB table, separate endpoints, separate use cases.
- **Scan clean:** true — no existing generic table detection module, no existing markdown surfacing module. The design adds NET-NEW files in both zones.
- **Frozen surfaces not touched:** `apps/pdf-extractor/dashboard/`, `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`.
- **Hardware constraint encoded:** MAX_PAGES=20 guard in use case, fire-and-forget 202 pattern, sequential single-page Tesseract calls.
