# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Cycle 2026-07-24 — FACTORY-PDF-extract-tesseract-config

**Sprint:** n/a (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** M | P2

### Refactor
Extracted the Tesseract lang/psm/DPI config (copy-pasted across 5 named call
sites, each with its own "DO NOT remove --psm 6" warning) into new
`infrastructure/tesseract_config.py` (`TESSERACT_LANG="vie+eng"`,
`TESSERACT_PSM6_CONFIG="--psm 6"`, `OCR_RASTER_DPI=200`). `generic_md_table_
extractor.py`'s conceptual call site actually resolved to 2 real files behind
its FACTORY-PDF-split-generic-md-table shim: `generic_md_table/extractor.py`
+ `unit_ocr.py` — 6 real call sites total, all rewired incrementally
(1 file → tests green → next file). Warning consolidated to 1 authoritative
copy + 6 one-line pointers (verified via grep).

### Equivalence
`git show HEAD:<path> | grep` confirmed all 6 pre-refactor literals byte-
identical (`lang="vie+eng"`, `config="--psm 6"`, `dpi=200`/`resolution=200`).
Post-refactor: 0 literal matches remain in call-site files; constants
assert-equal via standalone import. `test_ocr_adapter_psm6_guard.py` (the
existing runtime regression guard) 3/3 pass.

### Tests
Full suite `-m "not slow"`: baseline 1022 pass/8 fail; post-change 1022-1023
pass/7-8 fail — 7 failures identical A/B via `git stash` (PIL.Image test-
pollution, page_rasterizer, ocr_unit_tesseract_retry order-dependence); 8th
(`test_pek_engine_adapter.py` timeout) is a pre-existing flake in an
untouched file (0 diff). mypy: repo-wide pre-existing "not a valid Python
package name" env bug (reproduces on untouched files); workaround
`--explicit-package-bases` shows 141 errors both before/after (0 new);
`tesseract_config.py` alone: 0 errors.

### G12 sandbox gate — N/A (repeat drift)
`sandbox_runner.py` still does not exist in this repo — same stale-gate
drift flagged in the 2026-07-09 FACTORY-PDF-split-generic-md-table cycle
above (2 cycles now). pytest is the live DoD gate.

### Commit
`<pending>` — refactor(pdf-extractor): FACTORY-PDF-extract-tesseract-config shared OCR config

Zone health: G12 pilot-gate doc drift flagged a 3rd time (2026-07-09 ×2,
2026-07-24) — needs PO/architect to retire the stale flow-doc section.

### Status
REVIEW → next_agent=qa (rebuild_required: true — DEFERRED user-gated, no
rebuild performed this cycle per explicit task scope bound; ops rebuild+swap
+ qa live-verify batches onto a future rebuild)

---

## Cycle 2026-07-28 — FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT

**Sprint:** n/a (router direct dispatch, supervised) | P0 | size M

### Bug
`/extract` (100% of live OCR traffic) reached tesseract via `asyncio.to_thread`
bound to the asyncio DEFAULT executor (`min(32,cpu+4)`=10 in prod) — an
accident, not a guard; NEITHER declared guard (ProcessPoolExecutor(1),
PekEngineAdapter Semaphore(1)) was ever on that path. No `timeout=` meant an
abandoned request (mcp-server's 120s abort) permanently ratcheted a slot.

### Fix
New `infrastructure/ocr_gateway.py`: process-global `BoundedSemaphore(N)`
(`PDFX_OCR_MAX_CONCURRENCY`, default 1) + dedicated `ThreadPoolExecutor`,
bounded deadline (`PDFX_OCR_PAGE_TIMEOUT_S`, default 600s) passed to
pytesseract's own `timeout=` (breaks the ratchet — bounded hold, not
permanent). Queue-wait overflow → `OcrCapacityExceededError` → HTTP 429 +
Retry-After. `/health` gains `ocr` block (semaphore/os_children via /proc).
Rewired: extraction_engine.py (the live defect), ocr_backends.py, ocr_adapter.py,
generic_md_table/unit_ocr.py. `extract_tables_usecase.py`'s ProcessPoolExecutor
path composes via `ocr_gateway.slot_async()` in the parent. NOT rewired
(documented, not silent): ocr_worker.py (subprocess child, can't see this
process's semaphore) and generic_md_table/extractor.py (40-test direct seam —
follow-up recommended). extraction_engine.py:177-178 empty-string-on-failure
swallow left OPEN (flagged separately, per task instruction).

### Verify
New `test_ocr_concurrency_invariant.py` (8 tests): T1 drives 15 concurrent
POST /extract via the REAL route (ASGITransport), asserts peak<=1 — RED-
verified on unfixed main first via throwaway worktree (peak=15, pasted in
close-out) before GREEN. Fence test (AST-based, not regex) + deadline-
backstop (proves slot releases, not held forever) + /health observability +
portable /proc-parsing unit tests. Full suite: same 11 pre-existing failures
byte-identical before/after (confirmed via worktree diff) — 0 regressions.
import-linter: 3/3 contracts kept. Rebuilt single service: image ID changed
(`c9f3d366`→`a75ddd73`), live tesseract 10→1, MemPerc ~95%→~9-11%,
`ocr.semaphore==ocr.os_children` across samples.

### Status
REVIEW → next_agent=qa (supervised:true — not self-certified)

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
