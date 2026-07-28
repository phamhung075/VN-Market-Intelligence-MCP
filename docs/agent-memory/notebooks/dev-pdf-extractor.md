# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Cycle 2026-07-09 — FIX-BCTC-FPT-BT5-BALANCE-GATE

**Sprint:** n/a (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** M | P1

### Bug
FPT B01-DN corporate-form real-OCR extraction: `balance_sheet_equation` delta =
43,707,714,826,297.41 VND (43T imbalance), BT-5 gate blocked push (`rows_stored=0`).

### Root cause
`domain/primitives/vn_number_normalize/primitive.py`: Tesseract OCR misread the
LAST thousands-separator dot as a comma on FPT code 400 (Total Equity), producing
raw OCR text `"43.751.466.292,590"` (should be `"43.751.466.292.590"`). The
existing Pattern-B VN-decimal regex legitimately matched this as a genuine VN
decimal (comma-suffix = fraction), normalizing to `43751466292.590` →
43,751,466,292.59 — 1000x too small. Fully-scanned PDF (`pdfplumber.extract_text()`
= "" every page), so 100% OCR-sourced, no embedded text layer to cross-check.

### Fix
New `_VN_OCR_MISREAD_LAST_SEP_RE` (`^\d{1,3}(?:\.\d{3})+,\d{3}$` — requires >=1
existing thousands-dot group AND exactly 3 digits after comma), checked BEFORE
Pattern B. On match, strips both separators (comma treated as mis-scanned dot,
not decimal). Generic — no ticker/date special-case; applies to every VN-number
string in the pipeline (all statement types, all form codes).

### Verified
Balance identity now EXACT: delta 43,707,714,826,297.41 → 0.0 (codes
270/300/400 match golden anchors to the dong). Unit: `test_vn_number_normalize.py`
22/22 pass (4 new). Full suite `-m "not slow"`: 1019 pass/7 fail(pre-existing
PIL.Image test-pollution, A/B via git-stash identical)/7 deselected. Targeted
corporate-form+balance+decimal suite (11 files incl. `test_b02_tctd_parser.py`
bank-form non-regression): 213 pass/0 fail/1 deselected.

### Known remaining gap (NOT fixed, out of scope, documented)
Named test `test_extract_tables_bt3d_real_ocr.py::test_extract_tables_usecase_real_ocr_path`
(`-m slow`) still fails — but now at a DIFFERENT assertion: `rows_stored=79 < 80`
(not `balance_pass`, which is now True — gate no longer fires). Traced: page 8 of
the auto-located BS OCR range contains income-statement EPS lines (codes 70/71,
4-value-column layout) that spuriously yield a fake code `"868"`; FR-5 dedup
(`0ae36a0eb`, 2026-06-28) correctly drops 1 exact duplicate, 80→79. Test's `>=80`
threshold predates FR-5 (set 2026-05-28) and was never updated. Separate bug
class (page-boundary detection + EPS multi-column false-positive) — did not
touch dedup/threshold/rows to force a match. Follow-up ticket recommended.

### Commit
`<pending>` — fix(pdf-extractor): FIX-BCTC-FPT-BT5-BALANCE-GATE OCR-misread-last-separator

Zone health: no drift detected.

### Status
REVIEW (not self-closed — named test still red on unrelated pre-existing
assertion, see Decision Journal
`docs/agent-memory/decisions/dev-pdf-extractor-2026-07-09T2300Z-FIX-BCTC-FPT-BT5-BALANCE-GATE.md`)

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
