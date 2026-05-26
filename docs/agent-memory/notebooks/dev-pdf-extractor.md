# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

### 2026-05-26 — MD-EXTRACT-9 DONE (Label-Row Ordinal Reconstruction)

**Task:** MD-EXTRACT-9 | Sprint: BCTC-MD-TABLE | Status: DONE, ALL FILES UNSTAGED

**Root cause fixed:** `_attach_labels_ordinal` band (27px = 1.5×h_med=18) spanned 1.5× the label pitch (36px). Two adjacent label lines' tokens fell inside the same band → merged into one cell → ordinal drift cascade. Zero count mismatch (24 label lines = 24 value ranks).

**Fix (FLAG-A binding):** Added NEW `_attach_labels_by_rank(grid, data_label_lines, code_note_tokens, h_med)` — no y-comparison at all. Left `_attach_labels_ordinal` 100% untouched (12 TestOrdinalReconstruction tests still pass).

**New constants:** `_LABEL_LINE_GAP_PX=15` (200-DPI intra-line gap), `_LABEL_HEADER_MARGIN_PX=20` (200-DPI header-zone margin). Both AC-0 compliant: zero BCTC string semantics.

**New pure functions:**
- `_cluster_text_into_label_lines(text_tokens, label_line_gap_px)` — Step C10.5: greedy sort-by-(top,left) + running-min-top anchor (FLAG-D robustness), returns List[List[Dict]].
- `_exclude_pre_data_label_lines(label_lines, ymeds, first_value_top, margin_px)` — Step C10.6: drops lines with y_med < first_value_top - 20px.
- `_attach_labels_by_rank(grid, data_label_lines, code_note_tokens, h_med)` — Step C10.7: direct index pairing, code_note_tokens re-attached per-rank within 30px.

**`_process_page` C11 call site:** Replaced `label_pool + _attach_labels_ordinal` with C10.5→C10.6→`_attach_labels_by_rank`. `first_value_top` (already in scope from C5) passed to C10.6.

**Fixture (FLAG-B live-substrate, verbatim):** 15 tokens from FPT e71f845d income page (brief §9.7/§9.8). Line-1: 10 tokens tops 488-496. Line-2: 5 tokens tops 522-524. Boundary gap 26px > 15px → split.

**pytest results:** 466 passed / 0 failed (full unit/ suite) | 149 passed (target file) | 12 TestOrdinalReconstruction PASS (FLAG-A intact) | 8 TestLabelLineClustering + 5 TestExcludePreDataLabelLines + 9 TestAttachLabelsByRank = 22 new tests.

**AC fences:** AC-0 PASS (all BCTC matches in comments only) | Fence-A PASS (zero from application/interface) | Privacy PASS (zero creds) | AC-3F PASS (text_table_extractor.py 0-byte diff) | Sandbox primitive 29/29 PASS (6 known_bad by design) | Module tier 1/1 PASS.

**Files modified (UNSTAGED):**
- `infrastructure/generic_md_table_extractor.py` — +2 constants, +3 pure functions, modified `_process_page` (C11 site → C10.5+C10.6+C10.7), docstring updated.
- `__tests__/unit/test_generic_md_table_extractor.py` — +5 MD-EXTRACT-9 imports, +3 test classes (TestLabelLineClustering, TestExcludePreDataLabelLines, TestAttachLabelsByRank) + live fixture module-level constants.

**NEXT:** ops MD-DEPLOY-9 (rebuild pdf-extractor container, single doc e71f845d re-extract, NEVER batch) → main-terminal live-verify AC-9-LABEL + AC-9-PAIR via direct market.db query.

---

### 2026-05-26 — MD-EXTRACT-7-REV DONE (Dense Income Statement Reconstruction)

**Task:** MD-EXTRACT-7-REV | Sprint: BCTC-MD-TABLE | Status: DONE, ALL FILES UNSTAGED

**Three root causes fixed (income statement still broken after MD-EXTRACT-6):**
1. REV-3: Header/date tokens at top=200 contaminated anchor detection. `_find_first_value_row_top` + `_exclude_header_tokens` (Step C5) strips them before anchor detection.
2. REV-4: Presence-based pure-code-column detector (`_identify_pure_code_columns`, Step C7.5) separates code columns [0,1] from value columns [2,3,4,5] after C7 assignment. Replaces the dead count-gate `> N_EXPECTED_MAX_VALUE_COLS`.
3. REV-5: `min(cluster)` replaces centroid in `_detect_column_anchors_from_tokens` — anchors align to true left-edge of each column cluster.

**New constants:** `PURE_CODE_COL_THRESHOLD=0.90` (also `DENSE_COL_THRESHOLD=6` from §MD-EXTRACT-7 §5 — kept)

**New pure functions:** `_find_first_value_row_top`, `_exclude_header_tokens`, `_identify_pure_code_columns`

**Fixture (FIXTURE_TOKENS_REV):** 29 tokens (25 number + 4 text) — 6 anchors (2 pure-code + 4 value), 3 header tokens, 35px pitch, unequal density 4/4/3/3, 2 absent cells.

**pytest results:** 122 passed / 0 failed (target file) | 439 passed (unit/ suite)

**Non-regression proof:** Segment report → all buckets value_count>0 → `code_col_indices=[]` → ELSE branch → pipeline identical to MD-EXTRACT-6. Covered by `test_all_value_cols_returns_empty_code_list`.

**Files modified (UNSTAGED):**
- `infrastructure/generic_md_table_extractor.py` — +1 constant, +3 pure functions, modified _process_page (Step C5 + C7.5), min(cluster) metric
- `__tests__/unit/test_generic_md_table_extractor.py` — +imports (5 new symbols), +TestHeaderCutoff (3 tests), +TestPureCodeColumnDetector (4 tests), +TestDenseIncomeStatement (1 test / 10 assertions), +TestMinClusterAnchor (1 test)

**NEXT:** ops MD-DEPLOY-7 (rebuild pdf-extractor, single-doc re-extract FPT e71f845d). Main-terminal live-verify AC-7-REV-INC + AC-7-REV-SEG-NOREGRESS via direct DB query.

---

### 2026-05-26 — MD-EXTRACT-6 DONE (Column-Anchor-First Ordinal Reconstruction)

**Task:** MD-EXTRACT-6 | Sprint: BCTC-MD-TABLE | Status: DONE, ALL FILES UNSTAGED

**Root cause fixed (scalar-y-tolerance family EXHAUSTED — 5 prior attempts):**
All MD-EXTRACT-1/2/3/4/5 compared token top-values across columns to assign rows.
On wide BCTC tables, OCR skew causes baseline drift ~4px/column → ~28px across 7 columns.
Inter-row pitch is ~16px. Drift (28px) > gap (16px) → diagonal cascade structurally inevitable.
No y-threshold can fix this — eliminated the comparison entirely.

**AC-6-DIAG hard numbers (run before implementation):**
- Page 8 (income statement): row_pitch=4.0px, drift/gap=15.11 → VIOLATED
- Page 22 (segment report): row_pitch=8.0px, drift/gap=1.61 → VIOLATED
- Both pages: tops monotonically increase with lefts → confirms ordinal approach correct

**D4b live-substrate fixture (FPT page 4):**
- code "100": left=793, top=504, width=34, height=15, conf=96
- value "58.102.970.741.619": left=1015, top=503, width=202, height=16, conf=91

**Algorithm (replaces Steps C-F in `_process_page`):**
- C6: `_detect_column_anchors_from_tokens` (unchanged)
- C7: `_assign_tokens_to_columns` — each token → nearest x-anchor by argmin, NO y-comparison
- C8+C8.5+C9+C10: `_build_ordinal_grid` — sort per-col by top, insert skip slots for mid/trailing empties, rank-align across columns
- C11: `_attach_labels_ordinal` — per-row label via y_median band (LABEL_BAND_FACTOR=1.5×h_med), greedy removal

**New constants:** `_COL_ASSIGN_MAX_DIST_FACTOR=3.0`, `SKIP_GAP_FACTOR=1.5`, `_MIN_WORD_CONF_ORDINAL=30`, `LABEL_BAND_FACTOR=1.5`

**New pure functions:** `_assign_tokens_to_columns`, `_insert_skip_slots`, `_build_ordinal_grid`, `_attach_labels_ordinal`

**Retired (DEAD in MD-EXTRACT-6, kept for test compat):** `_cluster_number_rows_adaptive`, `_attach_labels`, `_build_grid_from_number_rows`

**AC-6-LOG:** `logger.debug` → `logger.info` for row_pitch/adaptive_tol in `_cluster_number_rows_adaptive` (2 lines, single-line format for grep)

**Files modified (UNSTAGED):**
- `infrastructure/generic_md_table_extractor.py` — +math import, +constants, +4 pure functions, modified _process_page, retired 3 functions, promoted 2 logger.debug→info
- `__tests__/unit/test_generic_md_table_extractor.py` — +imports, +class TestOrdinalReconstruction (12 new tests)

**Suite evidence:** 430 passed (unit-only), 12 new tests in TestOrdinalReconstruction
**All AC fences:** PASS (AC-0, AC-6-LOG, Fence-A, Privacy, AC-3F, import-linter, sandbox)

**NEXT:** ops MD-DEPLOY-6 (rebuild pdf-extractor, single-doc re-extract FPT e71f845d-ffa5-48f9-8f09-30ac2cd09c65). Then main-terminal live-verify AC-6-SEG/AC-6-INC/AC-6-D4b-LIVE.

---

### History pointer

Prior entries (MD-EXTRACT-1..5, MD-EXTRACT-2, MD-EXTRACT-3, BT3-FIX4, etc.) were in the previous notebook cycle. Truncated at 200L per notebook cap. See `docs/handoffs/TASK_BCTC-MD-TABLE.md` for full history of all implementation cycles.
