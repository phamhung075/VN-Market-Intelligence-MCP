# AR-PDF — PDF Rasterizer + OCR Text Port (dev-pdf-extractor)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** dev-pdf-extractor | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** AR-OPS-PRE | **Blocks:** AR-AGENT-A (indirectly, for integration)

---

## Summary

Implement page rasterization (PNG render via PyMuPDF) and expose the swappable OCR text retrieval interface. Remove YOLO geometry grouping, `bctc_page_grouper.py` state machine, and orphaned tests.

**Scope:** FR-1, FR-2, FR-14 (requirements). PDF-Extract-Kit subtree remains pristine.  
**DDD layers:** infrastructure (`page_rasterizer.py`, `ocr_text_source.py`, `ocr_text_source_factory.py`) + domain (`OcrTextSourcePort` Protocol).

---

## Acceptance Criteria

### AC-FR1: Page Rasterizer

**New file:** `apps/pdf-extractor/infrastructure/page_rasterizer.py`

- [ ] Public API: `rasterize_page(pdf_path: str, report_id: str, page_number: int, dpi: int) -> Path`
- [ ] Public API: `rasterize_report(pdf_path: str, report_id: str, dpi: int | None = None) -> list[Path]`
- [ ] Renders page N (1-indexed) to PNG at specified DPI.
- [ ] Output path: `/data/bctc-page-images/{report_id}/page_{N:04d}.png` (N zero-padded 4 digits).
- [ ] Directory created automatically via `mkdir -p`.
- [ ] Idempotent: `Path.exists()` check; re-render overwrites. Running rasterize twice produces identical files.
- [ ] `BCTC_RASTER_DPI` env var (default 150): `int(os.getenv("BCTC_RASTER_DPI", "150"))`.
- [ ] Uses PyMuPDF (`import fitz`). Add `pymupdf` to `requirements.txt` if not present.
- [ ] No network calls. Zero model weights.
- [ ] Unit test: `apps/pdf-extractor/__tests__/unit/test_page_rasterizer.py`
  - AC-FR1-1: DPI from env var (default 150).
  - AC-FR1-2: Output path correct.
  - AC-FR1-3: Idempotency: second call produces identical file.
  - AC-FR1-4: PDF-Extract-Kit subtree untouched.

### AC-FR2: OCR Text Source Port

**New files:** 
- `apps/pdf-extractor/domain/repositories.py` — add Protocol (DOMAIN layer)
- `apps/pdf-extractor/infrastructure/ocr_text_source.py` — implementations
- `apps/pdf-extractor/infrastructure/ocr_text_source_factory.py` — factory with env var

**Domain port addition:**
```python
class OcrTextSourcePort(Protocol):
    """Retrieve OCR text for a page, already stored in pdf_extracted_text table."""
    def get_page_text(self, filename: str, page_number: int) -> str:
        """Return OCR text for (filename, page_number). Empty string if not found."""
```

**Implementations:**
- [ ] `SqliteOcrTextSource`: queries `market.db` → `pdf_extracted_text` by `(filename, page_number)` → returns `text_content` (empty string if no row).
  - Uses `sqlite3` stdlib (Python, NOT `bun:sqlite`).
  - DDD: infrastructure.
- [ ] `MistralOcrSource`: stub. Raises `NotImplementedError("Mistral OCR not yet wired")`.

**Factory:**
- [ ] `select_ocr_text_source(db_path: str) -> OcrTextSourcePort`
- [ ] Env var: `BCTC_PAGE_TEXT_BACKEND` (values: `sqlite` default, `mistral` for future).
- [ ] Returns correct implementation based on env var.

**Unit test:** `apps/pdf-extractor/__tests__/unit/test_ocr_text_source.py`
- AC-FR2-1: Port defined.
- AC-FR2-2: `SqliteOcrTextSource` reads correct row.
- AC-FR2-3: `MistralOcrSource` stub raises `NotImplementedError`.

### AC-FR1.3: HTTP Endpoints (pdf-extractor FastAPI)

**File to modify:** `apps/pdf-extractor/interface/handlers.py`

Two new route handlers:

- [ ] `POST /api/rasterize` (on-demand rasterization for missing pages)
  - Input: `{ "report_id": str, "filename": str, "pages": list[int] }`
  - Response: `{ "rasterized": list[int], "paths": list[str] }`
  - Resolves `filename` → PDF path in `data/pdfs/`.
  - Calls `rasterize_page()` for each page only if missing (idempotent).
  - Returns list of rasterized page numbers (no error on already-present).
  - Auth: none (internal service).

- [ ] `GET /api/page-text` (supporting `get_bctc_page_text` MCP tool)
  - Query: `?filename=<str>&page_number=<int>`
  - Response: `{ "text": str, "source": "sqlite_ocr" | "mistral_ocr" }`
  - Uses `SqliteOcrTextSource` to read `pdf_extracted_text`.
  - Returns `{ "text": "" }` (NOT 404) when no text found.

### AC-FR14: Replace-Outright Deletions

- [ ] Delete `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` (5-state machine, root cause of over-merge).
- [ ] Delete `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` (42-test machine, orphaned).
- [ ] Delete `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py` (orphaned).
- [ ] Delete `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py` (orphaned).
- [ ] Remove import of `bctc_page_grouper` from `pek_engine_adapter.py` + calling code.
- [ ] Remove YOLO bbox grouping section from `pek_engine_adapter.py._run_extraction()`.
  - Replacement: minimal pass-through OCR only; no bbox grouping.
- [ ] Remove geometry table-stitching section from `generic_md_table_extractor.py` (if any).
- [ ] Verify `text_table_extractor.py` is 0-byte-diff (not touched).

---

## Files to Create / Modify / Delete

| File | Action | Reason |
|---|---|---|
| `apps/pdf-extractor/infrastructure/page_rasterizer.py` | Create | FR-1: page PNG render |
| `apps/pdf-extractor/infrastructure/ocr_text_source.py` | Create | FR-2: OCR text implementations |
| `apps/pdf-extractor/infrastructure/ocr_text_source_factory.py` | Create | FR-2: factory with env var selection |
| `apps/pdf-extractor/domain/repositories.py` | Modify | FR-2: add `OcrTextSourcePort` Protocol |
| `apps/pdf-extractor/interface/handlers.py` | Modify | FR-1/2: add `/api/rasterize` + `/api/page-text` routes |
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | Modify | FR-14: remove YOLO grouping import + call |
| `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` | Modify | FR-14: remove geometry stitching (if present) |
| `apps/pdf-extractor/requirements.txt` | Modify | Add `pymupdf` if absent |
| `apps/pdf-extractor/__tests__/unit/test_page_rasterizer.py` | Create | FR-1 unit tests |
| `apps/pdf-extractor/__tests__/unit/test_ocr_text_source.py` | Create | FR-2 unit tests |
| `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` | Delete | FR-14: root cause of over-merge |
| `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` | Delete | FR-14: orphaned on grouper removal |
| `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py` | Delete | FR-14: orphaned |
| `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py` | Delete | FR-14: orphaned |

---

## Implementation Notes

### page_rasterizer.py Design

```python
from pathlib import Path
import fitz
import os

def rasterize_page(pdf_path: str, report_id: str, page_number: int, dpi: int) -> Path:
    """Render page N (1-indexed) to PNG. Returns output path. Idempotent."""
    output_dir = Path(f"/data/bctc-page-images/{report_id}")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = output_dir / f"page_{page_number:04d}.png"
    if output_path.exists():
        return output_path  # Idempotent
    
    doc = fitz.open(pdf_path)
    page = doc[page_number - 1]  # 0-indexed internally
    pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
    pix.save(str(output_path))
    doc.close()
    
    return output_path

def rasterize_report(pdf_path: str, report_id: str, dpi: int | None = None) -> list[Path]:
    """Rasterize all pages."""
    if dpi is None:
        dpi = int(os.getenv("BCTC_RASTER_DPI", "150"))
    
    doc = fitz.open(pdf_path)
    pages_count = doc.page_count
    doc.close()
    
    return [rasterize_page(pdf_path, report_id, i+1, dpi) for i in range(pages_count)]
```

### OcrTextSourcePort Design

```python
# repositories.py addition
class OcrTextSourcePort(Protocol):
    def get_page_text(self, filename: str, page_number: int) -> str:
        ...

# ocr_text_source.py
class SqliteOcrTextSource:
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    def get_page_text(self, filename: str, page_number: int) -> str:
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT text_content FROM pdf_extracted_text WHERE filename=? AND page_number=?",
            (filename, page_number)
        )
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else ""

# ocr_text_source_factory.py
def select_ocr_text_source(db_path: str) -> OcrTextSourcePort:
    backend = os.getenv("BCTC_PAGE_TEXT_BACKEND", "sqlite")
    if backend == "sqlite":
        return SqliteOcrTextSource(db_path)
    if backend == "mistral":
        return MistralOcrSource()
    raise ValueError(f"Unknown BCTC_PAGE_TEXT_BACKEND: {backend}")
```

---

## Exit Criteria

- [x] AC-FR1: `page_rasterizer.py` complete + idempotent.
- [x] AC-FR2: `OcrTextSourcePort` + implementations + factory.
- [x] AC-FR1.3: `/api/rasterize` + `/api/page-text` routes registered.
- [x] AC-FR14: Deletions complete; no import of `bctc_page_grouper` in live code.
- [x] AC-FR14: PDF-Extract-Kit pristine (`git -C apps/pdf-extractor/PDF-Extract-Kit diff` = empty).
- [x] All unit tests pass (FR-1 + FR-2 unit tests).
- [x] `text_table_extractor.py` confirmed 0-byte-diff.

---

## Non-Negotiables

- **main branch only.** No feature branches.
- **PDF-Extract-Kit subtree PRISTINE.** Verify before exit: `git -C apps/pdf-extractor/PDF-Extract-Kit diff | wc -l` = 0.
- **Explicit `git add <file>`** per file — never `-A`. Many unrelated uncommitted files in tree.
- **DV test files** (test_page_rasterizer.py, test_ocr_text_source.py) land in SAME commit as production code (architect mandate).
- **NO YOLO imports left.** Grep proof: `grep -r "bctc_page_grouper" apps/pdf-extractor/` = empty.

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§3.1)
- Requirements: `docs/REQ_BCTC-AGENTIC-REFINE.md` (FR-1, FR-2, FR-14)
- Prior sprint context: `docs/SPRINT_GOAL.md` § BCTC-AGENTIC-REFINE

---

## RETURN

```
TASK: AR-PDF
STATUS: READY FOR ASSIGNMENT
OWNER: dev-pdf-extractor
BLOCKER: AR-OPS-PRE (volume mount)
BLOCKS: None (AR-AGENT-A will integrate once complete)
ESTIMATED: 4–5 hours
NEXT: AR-MCP (parallel, both depend on AR-OPS-PRE)
```
