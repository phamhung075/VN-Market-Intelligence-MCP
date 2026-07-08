# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Session: 2026-06-28 (TASK_330 — FR-5 same-section dedup)

**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · FR-5 · P1 · S

- Added `_dedup_rows_within_section(rows)` module-level function in `text_table_extractor.py` (after `_apply_positional_cutoff`, ~55L). Key = (code, value_current); exact match → drop + WARNING; different value → emit both + WARNING; code=None → always pass.
- Wired into `TextTableExtractor.assemble()` BEFORE `_apply_positional_cutoff()` per architect blueprint.
- 7 new tests in `TestFR5DedupRowsWithinSection`: exact dup collapse, OCR variant passthrough, code=None passthrough, FM-HPG-2 dual-code pattern, cross-section scope isolation, None==None edge case.
- Unit suite: 927 pass / 6 pre-existing env fail (PIL ABI + page_rasterizer). +7 new green. Zero regressions.
- Sandbox G12: primitive tier all pass (known_bad correctly false); module 1/1 GREEN.
- NFR-4: zero per-issuer branches — (code, value_current) equality only.
- **Commit:** `0ae36a0e`

Zone health: no drift detected — test count growing (920→927), all new tests target-specific, no orphan fixtures.

### Status
REVIEW → next_agent=qa

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
