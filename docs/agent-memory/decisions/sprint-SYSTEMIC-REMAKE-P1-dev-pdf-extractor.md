# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-pdf-extractor

**Sprint goal:** Phase-1 containment-now: idle-loop gates, detector fix drain + READ->RESOLVED closure, narrative-drift quarantine. Bounded, no redesign, ships on main today.
**Agent:** dev-pdf-extractor
**Started:** 2026-07-08T00:00:00Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-08T00:00:00Z
**task-id:** FACTORY-PDF-paddleocr-score-07-mask
**what-done:** Replaced `float(cell.get("score", 0.7))` in `_cells_to_row_bands` (pek_engine_adapter.py:569) with a direct read of the raw score: present score (incl. real 0.0) passes through unchanged; absent score emits named `_MISSING_CELL_SCORE_SENTINEL` (None -> JSON null) instead of a fabricated 0.7.
**what-considered:**
- (a) compute a real ink-density proxy mirroring `_detect_row_bands` in generic_md_table_extractor.py — rejected: that sibling reads a `row_dark` per-row pixel-darkness array from the rasterized page image; `_cells_to_row_bands` only receives clamped `y0..y1` ints + PaddleOCR cell dicts, no image data plumbed in at this call depth. Threading the image through `_run_table_extraction` -> `_map_bboxes_to_zones` -> `_cells_to_row_bands` would be a much larger refactor than Effort:S/Risk:low warrants, for a value (row_density) confirmed unconsumed downstream beyond visual overlay + tests.
- (b) named sentinel (None) — chosen: cheap, greppable, JSON-safe (null), zero behavior change on the present-score path, matches audit's explicit fallback option.
**why-decision:** Both PaddleOCR cell-construction call sites in `_run_table_extraction` already always set `score` explicitly (incl. `0.0` when OCR returns no text_conf) — the missing-key branch only guards a generic/defensive `cells: List[Dict]` contract for callers this helper doesn't control (tests, future cell sources). Sentinel is the correct fix at that boundary; ink-density proxy would be solving a problem (no image data) that doesn't exist at this call site today.
**why-change:** no change from plan — task brief explicitly offered (a)/(b) as either/or; picked (b) per scope/effort match.

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-07-09T00:00:00Z
**task-id:** FACTORY-PDF-split-extractLayoutFirst-execute
**what-done:** Extracted `ExtractLayoutFirstUseCase.execute()` (~480L, Tier0-3 inline) into `_tier0_document_map`, `_tier1_zone_pages`, `_tier2_ocr_and_stitch`, `_tier3_invariant_gate` (46/45/52/68L); execute() is now a 147L linear pipeline threading results, eval-push calls kept at same logical points. Signature/quarantine semantics unchanged.
**what-considered:**
- Tier1's per-unit page-zoning loop (~115L) and Tier3's per-unit gate loop (~150L) each alone exceeded the DoD's 120L/method cap even after extraction — added `_zone_unit_pages` (110L) and `_gate_check_unit` (117L) as per-unit sub-helpers, called once each from a `for unit in ...` loop.
- Dropped 2 pre-existing dead locals while relocating code (unused `import os` in old Step-2 scope; unused `unit_page_type` local in old Step-3 scope) — zero behavior change, confirmed via RAW-verify.
**why-decision:** Sub-helpers were the only way to satisfy the explicit <=120L-per-method DoD without changing gate/zoning logic; simplicity-gate Q2 exception applies (required by task DoD, not speculative).
**why-change:** no change from plan — approach matches backlog-detail exactly; sub-helpers are an implementation detail within the 4 named Tier methods.
**verify:** RAW-verify harness (3 injected-fake scenarios: Tier0-abort, Tier1-abort, happy-path w/ pass+quarantine+ocr_error+vision_verify) — execute() return dict + push_layout call args + all 3 eval_push_stage calls byte-identical before/after (JSON diff empty). `pytest -q`: 1088 passed/12 failed/1 skipped both before and after (12 pre-existing failures confirmed unrelated to this file — no import of it).
