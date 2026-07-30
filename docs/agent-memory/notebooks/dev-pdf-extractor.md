# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Cycle 2026-07-29 — FACTORY-PDF-split-handlers

**Sprint:** n/a (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** L | P2

### Refactor
`interface/handlers.py` (750L; `register_routes()` alone ~460L across 8 route
closures — far past the audit's 2026-06-15 line estimate) split into
`domain/constants.py` (`STATEMENT_SECTIONS` allow-set, replaces the
`valid_sections` property), `interface/schemas.py` (5 request schemas), and
8 `register_*_routes()` modules (health/extract/extract-tables/md-tables/
layout-first/pek/rasterizer/page-text). `handlers.py` now 65L pure
delegation. Every new/changed file ≤120L (max 103L, `schemas.py`).

### Hidden coupling found before moving anything
Grepped the test suite for string-path references into `interface.handlers`
before splitting — found 2 beyond route paths/status/shapes:
`scenarios/pek_single_doc_extraction.py` patches
`"interface.handlers.is_vn_market_open_utc"` (4x — only works if the check
resolves via that SAME module's globals at call time); `test_pek_engine_
adapter.py` asserts on `logging.getLogger("interface.handlers")` (2x, tied
to `_run_pek_extract`'s `__name__`). Moved `/pek-extract` + `_run_pek_extract`
to their own files (`interface/routes_pek.py`, `interface/pek_run_helper.py`)
and retargeted the 3 test files' import/patch/logger strings — mechanical
only, verified via before/after full-suite diff.

### Tests
`python -m pytest -q`: 10 failed/1032 passed/3 skipped BEFORE and AFTER,
identical test IDs both runs (pre-existing env-only: missing
`/app/data/pdfs/*.pdf`, local tesseract gaps — `git stash`/pop A/B confirmed).
mypy: same pre-existing "not a valid Python package name" env error as
baseline. Live `register_routes()` smoke: same 8 routes pre/post.

### Commit
`b3853e817` (code split), `a6e59881b` (decision journal).

Zone health: recurring G12 sandbox-gate doc-drift (flagged 2026-07-09/07-24)
still unresolved by PO/architect — unchanged this cycle, no new drift found.

### Status
REVIEW → next_agent=ops (rebuild_required: true — Docker Microservice
Code-Change Close Gate chain: ops rebuild+swap → qa live-verify → po Step 6,
same precedent as sibling FACTORY-PDF-delete-deprecated-inspect)

---

## Cycle 2026-07-29 — FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK

**Sprint:** n/a (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** S | P-medium

### Root cause
`test_low_text_density_ocr_rasterize.py` already had a correct conditional
stub helper (`_ensure_stub()` — stubs only if the real package is absent)
sitting right next to 4 unconditional overrides: lines 91/102/110/123-124
called `_ensure_stub(name)` as a no-op decoy, then unconditionally did
`sys.modules[name] = <custom stub>` for pdfplumber/fitz/paddleocr/PIL+
PIL.Image regardless of whether the real package was already loaded. No
conftest, single pytest process, no restore — leaked into every test file
collected afterward in the same run.

### Fix (AC option c — uniform conditional-check pattern)
Added `try: import PIL` / `try: import PIL.Image` (mirrors the file's
existing real-import-first attempts for pdf2image/pytesseract/pdfplumber/
fitz/paddleocr), then wrapped all 4 raw `sys.modules[name] = stub`
assignments in `if name not in sys.modules:` guards — same idea `_ensure_
stub()` already uses next to them. Real packages win whenever present
(confirmed genuinely installed both in container and host: PIL, fitz,
pdfplumber, paddleocr); stub only used when truly absent — order-independent.

### Verify
Container has no bind mount for `apps/pdf-extractor` (baked into image) —
`docker cp` used to push the fix in for authentic docker-exec verification
without a full rebuild. BEFORE (matches recorded evidence exactly):
file+ocr_backends 1 failed/46 passed; file+page_rasterizer 4 failed/28
passed. AFTER (both orderings, docker-exec): file+ocr_backends 47 passed
both orders; file+page_rasterizer 32 passed both orders; file+tesseract_
retry 26 passed both orders. Full non-slow suite (docker-exec): 1033
passed/5 skipped/7 deselected, 0 failed. mypy on changed file: same 4
pre-existing "Module has no attribute" false positives before/after
(git-stash A/B, 0 new) — dynamic `types.ModuleType` attr assignment, out
of scope for this fix.

### Commit
`<pending>` — fix(pdf-extractor): FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK
guard sys.modules stub overrides

Zone health: PDF-TEST-01-FIX (task_board.review, BLOCKED) named this row as
its blocker — unblockable once QA re-verifies. Rebuild deferred to ops per
standard gate (docker cp was for my verification only, not a substitute).

### Status
REVIEW → next_agent=qa (rebuild_required: true — ops rebuild+swap → qa
live-verify, standard Microservice Code-Change Close Gate)

---

## Cycle 2026-07-30 — FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW

**Sprint:** n/a (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** S | P2

### Bug
Follow-up flagged in FIX-PDFX-TESSERACT-CONCURRENCY §10.3: `_ocr_page()`'s
`except Exception: return ""` swallowed ANY OCR failure (tesseract crash,
corrupt raster) as if extraction succeeded. Combined with the quality gate
(services.py:71 `ocr_conf<0.5 AND not tables` => reject), a doc with any
table + zero OCR text passed the gate and was persisted as a hollow
"success" — indistinguishable from a genuine blank scanned page.

### Fix
New `OcrPageFailedError(PDFProcessingError)` (domain/errors.py). `_ocr_page`'s
generic except now raises it (`from exc`) instead of `return ""`.
`_extract_text_ocr_sync`'s propagation tuple extended alongside the
pre-existing `OcrCapacityExceededError`/`OcrDeadlineExceededError` (already
propagated correctly — this closed the one remaining gap). Zero changes
needed to services.py/usecases.py/HTTP layer — process_pdf()'s existing
`except PDFProcessingError` branch already marks doc failed, never reaches
store_extraction(). Negative control (blank page: OCR succeeds returning
"") unaffected. Prior-art checked: FIX-ERRAUDIT-W3-PEK-P2 targets a
different method in the same file (`_extract_tables_sync` bare-except,
services.py `validate_or_unknown`) — zero overlap, grep-confirmed.

### Verify
New `test_extraction_engine_ocr_failure_swallow.py` (12 tests, both
directions at `_ocr_page` + `_extract_text_ocr_sync` levels) + 2 new tests
in `test_extract_pdf_service.py`. Falsification: reverting the 2 source
files makes the new test module fail COLLECTION (ImportError:
OcrPageFailedError undefined) — confirms load-bearing. Full suite: 1056
passed + 3 pre-existing env-only failures (missing pandas, missing
container-only PDF fixture) unchanged before/after. import-linter: 3/3
kept. mypy: same pre-existing baseline noise, 0 new errors.

### Commit
`200eabcf3` fix(pdf-extractor/fix-pdfx-extraction-engine-empty-string-swallow)

### Status
REVIEW → next_agent=qa

Zone health: flow/main.md's G12 sandbox gate (`sandbox_runner.py`) still
references a script absent from the repo — pilot-status shows the SCALE
pilot closed DONE 2026-05-24; stale doc-drift, not a new finding this cycle.
