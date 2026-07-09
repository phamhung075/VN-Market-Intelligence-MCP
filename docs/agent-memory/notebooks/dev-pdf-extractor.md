# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## TASK_331 — FR-4 Section-boundary content-signal detection (2026-06-28)

**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT | **Zone:** apps/pdf-extractor/ | **Size:** M

### Implementation
- Added `_INCOME_STMT_START_KEYWORDS` (7 keywords) and `_CASH_FLOW_START_KEYWORDS` (4 keywords) as module-level constants in `extract_tables_usecase.py`.
- `_detect_section_start(page_text)` — pure fn, returns "income_statement" / "cash_flow" / None.
- `_filter_pages_to_section(pages, section)` — pure fn; BS: calls `select_balance_sheet_section()` then excludes IS/CF pages; IS/CF: contiguous run from first detected page.
- Path A in `execute()` calls `_filter_pages_to_section()` (replaces if/else around `select_balance_sheet_section()`).
- DDD: TextTableExtractor (infrastructure) untouched. Application imports domain primitive (allowed).

### Test results
- 14 new tests in `test_extract_tables_usecase.py` covering AC-2/AC-3/AC-7. All GREEN.
- Unit suite: 6 pre-existing env fail / 941 pass (+14 new). Zero regressions.
- Full suite: 11 pre-existing fail / 1080 pass. Zero regressions.
- Sandbox G12: primitive 29 PASS + 6 intentional-fail; module 1 PASS.
- NFR-4: zero per-issuer branches.
- **Commit:** `892c9efb`

### Status
REVIEW → next_agent=qa

---

## Cycle 2026-07-08 — FACTORY-PDF-paddleocr-score-07-mask

**Sprint:** SYSTEMIC-REMAKE-P1 | **Zone:** apps/pdf-extractor/ | **Size:** S | P1

### Fix
`_cells_to_row_bands()` (pek_engine_adapter.py:569) defaulted `row_density = float(cell.get("score", 0.7))` — fabricated a 0.7 confidence whenever a PaddleOCR cell omitted 'score', indistinguishable from a real 0.7 measurement in the LF-OVERLAY row_bands contract. Fixed: present score (incl. real 0.0) passes through unchanged; absent score now emits named `_MISSING_CELL_SCORE_SENTINEL` (None → JSON null).

### Why sentinel, not ink-density proxy
Sibling `_detect_row_bands` (generic_md_table_extractor.py) computes density from a per-row pixel-darkness array sourced from the rasterized page image — that data isn't plumbed into `_cells_to_row_bands` at this call depth (only clamped y0..y1 ints + cell dicts). Threading image data through 3 call layers was out of scope for Effort:S/Risk:low, for a value confirmed unconsumed downstream beyond visual overlay. Sentinel matches the audit's either/or option.

### Tests
3 new in `TestCellsToRowBandsScoreHandling`: present score unchanged (incl. explicit 0.0 preserved), missing score → sentinel not 0.7, mixed cells independent. Confirmed RED against prior code first (`assert 0.7 is None` failure). Full suite: 1089 pass / 11 pre-existing env fail (PIL/Tesseract/poppler — confirmed via git stash, unrelated to this change).

### RAW-verify
Direct invocation of `_map_bboxes_to_zones()` with a real missing-score cell: emitted `row_density: null` (not 0.7); present-score cell unchanged at 0.88.

### Commit
`fdb424178` — fix(pdf-extractor): stop fabricating 0.7 confidence for missing PaddleOCR cell score

Zone health: no drift detected.

### Status
REVIEW → next_agent=ops (rebuild_required: true; ops rebuild+swap, then qa live-verify)

---

## Cycle 2026-07-09 — FACTORY-PDF-split-extractLayoutFirst-execute

**Sprint:** SYSTEMIC-REMAKE-P1 | **Zone:** apps/pdf-extractor/ | **Size:** L | P1 | epic: FACTORY-MAINTAINABILITY-2026-06

### Refactor
`ExtractLayoutFirstUseCase.execute()` (~480L, Tier0→3 inline) split into 4 private
Tier methods per backlog approach: `_tier0_document_map` (46L), `_tier1_zone_pages`
(45L), `_tier2_ocr_and_stitch` (52L), `_tier3_invariant_gate` (68L). execute() is now
a 147L linear pipeline threading results, eval-push calls (stage1/2/3) kept at the
same logical points. Signature unchanged (report_id, pdf_path) → callers/handlers
untouched. Two per-unit sub-helpers added (`_zone_unit_pages` 110L, `_gate_check_unit`
117L) — required to keep the 4 Tier methods under the DoD's 120L cap without
touching gate/zoning logic (simplicity-gate Q2 exception: DoD-mandated, not
speculative). Dropped 2 pre-existing dead locals while relocating code (unused
`import os`, unused `unit_page_type`) — zero behavior change.

### RAW-verify (extraction output unchanged)
Built a fully-injected-fake harness (build_document_map_fn/zone_page_fn/ocr_unit_fn
+ mocked `pdf2image.convert_from_path`) exercising 3 branches: Tier0-abort,
Tier1-abort, happy-path (3 units → 1 pass, 1 quarantined via invariant-gate fail
[monotonic+orphan], 1 quarantined via ocr_error, 2 vision-verify markers via
whitelist gate). Captured JSON fingerprint of execute() return + push_layout call
args + all 3 eval_push_stage calls BEFORE the refactor, re-ran AFTER — `diff` empty
(byte-identical). Determinism of the harness itself confirmed via 2x repeat-run diff
pre-refactor.

### Tests
`pytest -q`: 1088 passed / 12 failed / 1 skipped — identical before and after
(confirmed via `git stash` that all 12 failures are pre-existing env issues
[PIL/Tesseract/poppler ABI] in files that do not import extract_layout_first_usecase).
mypy: pre-existing "pdf-extractor is not a valid Python package name" env error,
confirmed present on `git stash` (unrelated to this change).

### Commit
`c3f30df24` — refactor(pdf-extractor): split ExtractLayoutFirstUseCase.execute() into per-Tier methods

Zone health: G12 sandbox gate in `docs/agents/dev-pdf-extractor/flow/main.md` §Pilot
Hard Rule references a stale path (`sandbox_runner.py` at service root, `--scenario=all`)
— actual runner is `sandbox/runner.py` with a single-scenario `--scenario PATH` CLI.
Pilot status is DONE (closed 2026-05-24), so G12 is likely non-operative post-closure;
doc drift not fixed here (out of scope for this task) — flagging for PO/architect.

### Status
REVIEW → next_agent=ops (rebuild_required: true; ops rebuild+swap, then qa live-verify)
